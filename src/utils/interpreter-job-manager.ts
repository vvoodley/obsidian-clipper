import browser from './browser-polyfill';
import { InterpreterJob, InterpreterJobSnapshot, VisionBatchResult } from '../types/types';
import { loadSettings, generalSettings, incrementStat } from './storage-utils';
import { sendToLLM, collectPromptVariablesFromTemplate, applyPromptResponsesToSnapshot, sendVisionBatchDescriptionToLLM } from './interpreter';
import { generateFrontmatter, buildObsidianUrl } from './obsidian-note-creator';
import { Template } from '../types/types';
import type { InterpreterJobPhase } from '../types/types';
import { prepareVisionProcessingPlan } from './media/vision-plan';
import { appendVisionBatchResultsToPromptContext } from './media/vision-batch-summary';
import { addDeterministicMediaTagsToNoteContent, buildMediaDiagnostics } from './media/media-diagnostics';

const STORAGE_KEY = 'interpreter_jobs';
const runningJobs = new Map<string, Promise<InterpreterJob>>();
export const DEFAULT_JOB_TIMEOUT_MS = 420_000;
export const JOB_TIMEOUT_ERROR_MESSAGE = 'Interpreter job timed out after 420 seconds.';

export interface StartInterpreterJobOptions {
	forceNew?: boolean;
	closeTabAfterSave?: boolean;
}

export interface InterpreterJobSnapshotValidationResult {
	valid: boolean;
	error?: string;
	warnings?: string[];
}

function nowIso(): string {
	return new Date().toISOString();
}

function mergeJobUpdate(job: InterpreterJob, updates: Partial<InterpreterJob>): InterpreterJob {
	const timestamp = nowIso();
	return {
		...job,
		...updates,
		updatedAt: timestamp,
		lastHeartbeatAt: ['queued', 'running'].includes(updates.status || job.status) ? timestamp : job.lastHeartbeatAt
	};
}

export function buildInterpreterSessionKey(snapshot: Pick<InterpreterJobSnapshot, 'tabId' | 'url' | 'templateId' | 'modelId'>): string {
	return `interpreter-job:${snapshot.tabId}:${snapshot.url}:${snapshot.templateId}:${snapshot.modelId}`;
}

export function buildInterpreterJobKey(snapshot: Pick<InterpreterJobSnapshot, 'tabId' | 'url' | 'templateId' | 'modelId'>): string {
	return buildInterpreterSessionKey(snapshot);
}

function createRunId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeJob(job: InterpreterJob): InterpreterJob {
	const sessionKey = job.sessionKey || job.key;
	const runId = job.runId || job.id;
	return {
		...job,
		id: job.id || runId,
		runId,
		sessionKey,
		key: job.key || sessionKey
	};
}

async function getJobs(): Promise<Record<string, InterpreterJob>> {
	const result = await browser.storage.local.get(STORAGE_KEY) as Record<string, Record<string, InterpreterJob> | undefined>;
	return result[STORAGE_KEY] || {};
}

async function saveJob(job: InterpreterJob): Promise<InterpreterJob> {
	const jobs = await getJobs();
	job = normalizeJob({ ...job, updatedAt: job.updatedAt || nowIso() });
	jobs[job.sessionKey] = job;
	await browser.storage.local.set({ [STORAGE_KEY]: jobs });
	try {
		await browser.runtime.sendMessage({ action: 'interpreterJobUpdated', job });
	} catch {
		// No popup may be open.
	}
	return job;
}

async function saveJobPhase(job: InterpreterJob, phase: InterpreterJobPhase, updates: Partial<InterpreterJob> = {}): Promise<InterpreterJob> {
	return saveJob(mergeJobUpdate(job, { ...updates, phase }));
}

export function isJobStale(job: InterpreterJob, now = Date.now()): boolean {
	if (!['queued', 'running'].includes(job.status) || !job.startedAt) return false;
	const batchCount = job.metrics?.visionBatchCount ?? 0;
	const timeoutMs = batchCount > 0
		? Math.max(DEFAULT_JOB_TIMEOUT_MS, (batchCount + 1) * 300_000 + 60_000)
		: DEFAULT_JOB_TIMEOUT_MS;
	return now - new Date(job.startedAt).getTime() > timeoutMs;
}

async function markJobTimedOut(job: InterpreterJob): Promise<InterpreterJob> {
	return saveJob(mergeJobUpdate(job, {
		status: 'error',
		phase: 'error',
		error: JOB_TIMEOUT_ERROR_MESSAGE,
		completedAt: nowIso()
	}));
}

export async function getInterpreterJob(key: string): Promise<InterpreterJob | undefined> {
	const jobs = await getJobs();
	const job = jobs[key];
	if (!job) return undefined;
	const normalized = normalizeJob(job);
	return isJobStale(normalized) ? markJobTimedOut(normalized) : normalized;
}

export async function clearInterpreterJob(key: string): Promise<void> {
	const jobs = await getJobs();
	delete jobs[key];
	await browser.storage.local.set({ [STORAGE_KEY]: jobs });
}

async function openObsidianUrlFromBackground(url: string, tabId: number): Promise<void> {
	try {
		await browser.tabs.update(tabId, { url });
	} catch {
		const tabs = await browser.tabs.query({ active: true, currentWindow: true });
		const tab = tabs[0];
		if (tab?.id) {
			await browser.tabs.update(tab.id, { url });
		} else {
			await browser.tabs.create({ url });
		}
	}
}

async function copyToSourceTabClipboard(tabId: number, text: string): Promise<boolean> {
	try {
		const response = await browser.tabs.sendMessage(tabId, {
			action: 'copy-text-to-clipboard',
			text
		}) as { success?: boolean } | undefined;
		return response?.success === true;
	} catch {
		return false;
	}
}

async function saveToObsidianFromBackground(job: InterpreterJob, fileContent: string): Promise<void> {
	let obsidianUrl = buildObsidianUrl(
		job.interpreted?.noteName || job.snapshot.noteName,
		job.interpreted?.path || job.snapshot.path,
		job.snapshot.vault,
		job.snapshot.behavior
	);

	if (generalSettings.legacyMode) {
		obsidianUrl += `&content=${encodeURIComponent(fileContent)}`;
		await openObsidianUrlFromBackground(obsidianUrl, job.snapshot.tabId);
		return;
	}

	const copied = await copyToSourceTabClipboard(job.snapshot.tabId, fileContent);
	if (copied) {
		obsidianUrl += `&clipboard&content=${encodeURIComponent('Unable to read clipboard content. Reopen Web Clipper to save the completed note manually.')}`;
		await openObsidianUrlFromBackground(obsidianUrl, job.snapshot.tabId);
		return;
	}

	const uriWithContent = `${obsidianUrl}&content=${encodeURIComponent(fileContent)}`;
	if (uriWithContent.length > 18000) {
		throw new Error('Interpretation completed, but browser clipboard access failed and the note is too large for a safe Obsidian URI fallback. Reopen Web Clipper to save manually.');
	}

	await openObsidianUrlFromBackground(uriWithContent, job.snapshot.tabId);
}

async function closeSourceTabAfterSave(tabId: number): Promise<string | undefined> {
	try {
		await browser.tabs.remove(tabId);
		return undefined;
	} catch {
		// The user may have already closed the tab. The note was saved, so this is not a job failure.
		return 'Added to Obsidian, but could not close tab.';
	}
}

function containsPromptVariables(text: string): boolean {
	return /{{(?:prompt:)?"[\s\S]*?"(?:\|[\s\S]*?)?}}/.test(text);
}

function stripAllowedPromptVariables(text: string): string {
	return text.replace(/{{(?:prompt:)?"[\s\S]*?"(?:\|[\s\S]*?)?}}/g, '');
}

export function validateInterpreterJobSnapshot(snapshot: InterpreterJobSnapshot): InterpreterJobSnapshotValidationResult {
	if (!snapshot.url) {
		return { valid: false, error: 'Could not fully capture the page. Stay on the source tab and retry.' };
	}
	if (!snapshot.noteName.trim()) {
		return { valid: false, error: 'Could not fully capture the page. The note name is empty.' };
	}

	const fields = [
		snapshot.noteName,
		snapshot.path,
		snapshot.noteContent,
		snapshot.promptContext,
		...snapshot.properties.map(property => property.value)
	];
	const combined = fields.join('\n');
	const withoutPromptVariables = stripAllowedPromptVariables(combined);

	if (/{{[\s\S]*?}}/.test(withoutPromptVariables) || /{%\s*[\s\S]*?%}/.test(combined)) {
		return { valid: false, error: 'Could not fully capture the page. Stay on the source tab and retry.' };
	}

	if (!snapshot.noteContent.trim() && snapshot.properties.every(property => !String(property.value || '').trim())) {
		return { valid: false, error: 'Could not fully capture the page. The note content is empty.' };
	}

	if (fields.some(containsPromptVariables) && !snapshot.promptContext.trim()) {
		return { valid: false, error: 'Could not fully capture the page. Interpreter context is empty.' };
	}

	return { valid: true };
}

async function runInterpreterJob(job: InterpreterJob): Promise<InterpreterJob> {
	job = normalizeJob(job);
	job = await saveJobPhase(job, 'validating', { status: 'running', startedAt: job.startedAt || nowIso(), error: undefined });

	try {
		await loadSettings();
		const model = generalSettings.models.find(model => model.id === job.snapshot.modelId);
		if (!model) {
			throw new Error(`Model configuration not found for ${job.snapshot.modelId}`);
		}
		const provider = generalSettings.providers.find(provider => provider.id === model.providerId);

		const template: Template = {
			id: job.snapshot.templateId,
			name: job.snapshot.templateName,
			behavior: job.snapshot.behavior,
			noteNameFormat: job.snapshot.noteName,
			path: job.snapshot.path,
			noteContentFormat: job.snapshot.noteContent,
			properties: job.snapshot.properties,
			context: job.snapshot.promptContext
		};
		const promptVariables = collectPromptVariablesFromTemplate(template);
		job = await saveJobPhase(job, 'planning_vision');
		const visionPlan = prepareVisionProcessingPlan(job.snapshot.promptContext, model);
		let mediaDiagnostics = buildMediaDiagnostics(job.snapshot.promptContext, visionPlan);
		let visionBatchResults: VisionBatchResult[] = [];
		const singleShotImages = visionPlan.selectedForSingleShot;
		const visionImageCountBySource = singleShotImages.reduce((acc, image) => {
			acc[image.source] = (acc[image.source] || 0) + 1;
			return acc;
		}, {} as Record<string, number>);

		if (visionPlan.shouldBatch) {
			job = await saveJobPhase(job, 'describing_vision_batches', {
				metrics: {
					...job.metrics,
					providerName: provider?.name,
					modelName: model.name,
					promptContextChars: job.snapshot.promptContext.length,
					contentChars: (job.snapshot.variables.content || '').length,
					promptVariableCount: promptVariables.length,
					visionEnabled: model.visionEnabled === true,
					visionCandidateCount: visionPlan.candidateCount,
					visionAttachedCount: visionPlan.plannedImageCount,
					visionImageMode: model.visionImageMode || 'url',
					visionBatchingEnabled: true,
					visionBatchCount: visionPlan.batches.length,
					visionBatchSize: visionPlan.batchSize,
					providerRequestCount: 0,
					visionWarnings: visionPlan.warnings
				},
				mediaDiagnostics
			});

			for (let index = 0; index < visionPlan.batches.length; index++) {
				const batch = visionPlan.batches[index];
				const startedAt = nowIso();
				try {
					const result = await sendVisionBatchDescriptionToLLM(job.snapshot.promptContext, batch, model, {
						batchIndex: index + 1,
						totalBatches: visionPlan.batches.length,
						candidateCount: visionPlan.candidateCount
					});
					visionBatchResults.push({
						batchIndex: index + 1,
						totalBatches: visionPlan.batches.length,
						attempts: result.attempts ?? 1,
						startedAt,
						completedAt: nowIso(),
						images: result.images
					});
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					visionBatchResults.push({
						batchIndex: index + 1,
						totalBatches: visionPlan.batches.length,
						attempts: 3,
						startedAt,
						completedAt: nowIso(),
						error: errorMessage,
						images: batch.map(image => ({
							source: image.source,
							index: image.index,
							url: image.remoteUrl || image.sourceUrl,
							inspected: false,
							status: 'failed',
							error: errorMessage
						}))
					});
				}
				mediaDiagnostics = buildMediaDiagnostics(job.snapshot.promptContext, visionPlan, visionBatchResults);
				const failures = visionBatchResults.filter(result => result.error || result.images.some(image => image.status === 'failed')).length;
				const retries = visionBatchResults.reduce((sum, result) => sum + Math.max(0, result.attempts - 1), 0);
				job = await saveJobPhase(job, 'describing_vision_batches', {
					visionBatchResults,
					mediaDiagnostics,
					metrics: {
						...job.metrics,
						providerRequestCount: visionBatchResults.length,
						visionBatchFailures: failures,
						visionBatchRetries: retries
					}
				});
			}
		}

		const finalPromptContext = visionPlan.shouldBatch
			? appendVisionBatchResultsToPromptContext(job.snapshot.promptContext, visionBatchResults, mediaDiagnostics)
			: job.snapshot.promptContext;

		const finalVisionImages = visionPlan.shouldBatch ? [] : singleShotImages;
		const finalVisionWarnings = visionPlan.warnings;
		if (visionPlan.shouldBatch) {
			job = await saveJobPhase(job, 'synthesizing_note');
		}
		job = await saveJobPhase(job, 'sending_to_provider', {
			metrics: {
				...job.metrics,
				providerName: provider?.name,
				modelName: model.name,
				promptContextChars: finalPromptContext.length,
				contentChars: (job.snapshot.variables.content || '').length,
				promptVariableCount: promptVariables.length,
				requestStartedAt: nowIso(),
				visionEnabled: model.visionEnabled === true,
				visionCandidateCount: visionPlan.candidateCount,
				visionAttachedCount: finalVisionImages.length,
				visionImageMode: model.visionImageMode || 'url',
				visionSources: finalVisionImages.map(image => image.source),
				visionImageCountBySource,
				visionWarnings: finalVisionWarnings,
				visionBatchingEnabled: visionPlan.batchingEnabled,
				visionBatchCount: visionPlan.shouldBatch ? visionPlan.batches.length : 0,
				visionBatchSize: visionPlan.batchSize,
				providerRequestCount: (job.metrics?.providerRequestCount ?? 0) + 1
			},
			visionBatchResults,
			mediaDiagnostics
		});
		job = await saveJobPhase(job, 'waiting_for_provider');
		const { promptResponses, responseChars } = await sendToLLM(
			finalPromptContext,
			job.snapshot.variables.content || '',
			promptVariables,
			model,
			{
				visionImages: finalVisionImages,
				visionCandidateCount: visionPlan.candidateCount,
				visionWarnings: finalVisionWarnings
			}
		);
		job = await saveJobPhase(job, 'building_note', {
			metrics: {
				...job.metrics,
				responseReceivedAt: nowIso(),
				responseChars,
				finalSynthesisResponseChars: responseChars
			}
		});
		const interpreted = applyPromptResponsesToSnapshot(job.snapshot, promptVariables, promptResponses);
		interpreted.noteContent = addDeterministicMediaTagsToNoteContent(interpreted.noteContent, mediaDiagnostics);
		const frontmatter = await generateFrontmatter(interpreted.properties);
		const fileContent = frontmatter + interpreted.noteContent;

		job = await saveJobPhase(job, job.addToObsidianWhenDone ? 'saving_to_obsidian' : 'done', {
			...job,
			status: 'completed',
			completedAt: nowIso(),
			promptResponses,
			interpreted: {
				...interpreted,
				fileContent
			}
		});

		if (job.addToObsidianWhenDone) {
			job = await saveJobPhase(job, 'saving_to_obsidian', {
				metrics: {
					...job.metrics,
					saveStartedAt: nowIso()
				}
			});
			await saveToObsidianFromBackground(job, fileContent);
			await incrementStat('addToObsidian', job.snapshot.vault, interpreted.path, job.snapshot.url, job.snapshot.title);
			const savedAt = nowIso();
			job = await saveJobPhase(job, 'done', {
				...job,
				status: 'saved',
				savedAt,
				metrics: {
					...job.metrics,
					savedAt
				}
			});
			if (job.closeTabAfterSave) {
				job = await saveJobPhase(job, 'closing_tab');
				const closeTabError = await closeSourceTabAfterSave(job.snapshot.tabId);
				job = await saveJobPhase(job, 'done', { status: 'saved', closeTabError });
			}
		}

		return job;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return saveJob({
			...job,
			status: 'error',
			phase: 'error',
			error: errorMessage,
			completedAt: nowIso(),
			updatedAt: nowIso()
		});
	} finally {
		runningJobs.delete(job.sessionKey);
	}
}

export async function startInterpreterJob(
	snapshot: InterpreterJobSnapshot,
	addToObsidianWhenDone: boolean,
	options: StartInterpreterJobOptions = {}
): Promise<InterpreterJob> {
	const sessionKey = buildInterpreterSessionKey(snapshot);
	const existing = await getInterpreterJob(sessionKey);
	if (existing) {
		if (['queued', 'running'].includes(existing.status)) {
			if (!runningJobs.has(sessionKey)) {
				runningJobs.set(sessionKey, runInterpreterJob(existing));
			}
			return existing;
		}

		if (!options.forceNew) {
			return existing;
		}
	}

	const validation = validateInterpreterJobSnapshot(snapshot);
	const runId = createRunId();
	if (!validation.valid) {
		return saveJob({
			id: runId,
			runId,
			sessionKey,
			key: sessionKey,
			status: 'error',
			phase: 'error',
			snapshot: { ...snapshot, createdAt: snapshot.createdAt || nowIso() },
			addToObsidianWhenDone,
			closeTabAfterSave: options.closeTabAfterSave === true,
			error: validation.error || 'Could not fully capture the page. Stay on the source tab and retry.',
			completedAt: nowIso(),
			updatedAt: nowIso()
		});
	}

	const job: InterpreterJob = {
		id: runId,
		runId,
		sessionKey,
		key: sessionKey,
		status: 'queued',
		phase: 'queued',
		snapshot: { ...snapshot, createdAt: snapshot.createdAt || nowIso() },
		addToObsidianWhenDone,
		closeTabAfterSave: options.closeTabAfterSave === true,
		startedAt: nowIso(),
		updatedAt: nowIso()
	};

	await saveJob(job);
	runningJobs.set(sessionKey, runInterpreterJob(job));
	return job;
}
