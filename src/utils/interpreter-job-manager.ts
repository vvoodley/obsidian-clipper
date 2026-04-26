import browser from './browser-polyfill';
import { InterpreterJob, InterpreterJobSnapshot } from '../types/types';
import { loadSettings, generalSettings, incrementStat } from './storage-utils';
import { sendToLLM, collectPromptVariablesFromTemplate, applyPromptResponsesToSnapshot } from './interpreter';
import { generateFrontmatter, buildObsidianUrl } from './obsidian-note-creator';
import { Template } from '../types/types';

const STORAGE_KEY = 'interpreter_jobs';
const runningJobs = new Map<string, Promise<InterpreterJob>>();

function nowIso(): string {
	return new Date().toISOString();
}

export function buildInterpreterJobKey(snapshot: Pick<InterpreterJobSnapshot, 'tabId' | 'url' | 'templateId' | 'modelId'>): string {
	return `interpreter-job:${snapshot.tabId}:${snapshot.url}:${snapshot.templateId}:${snapshot.modelId}`;
}

async function getJobs(): Promise<Record<string, InterpreterJob>> {
	const result = await browser.storage.local.get(STORAGE_KEY) as Record<string, Record<string, InterpreterJob> | undefined>;
	return result[STORAGE_KEY] || {};
}

async function saveJob(job: InterpreterJob): Promise<InterpreterJob> {
	const jobs = await getJobs();
	jobs[job.key] = job;
	await browser.storage.local.set({ [STORAGE_KEY]: jobs });
	try {
		await browser.runtime.sendMessage({ action: 'interpreterJobUpdated', job });
	} catch {
		// No popup may be open.
	}
	return job;
}

export async function getInterpreterJob(key: string): Promise<InterpreterJob | undefined> {
	const jobs = await getJobs();
	return jobs[key];
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

async function runInterpreterJob(job: InterpreterJob): Promise<InterpreterJob> {
	job = await saveJob({ ...job, status: 'running', startedAt: job.startedAt || nowIso(), error: undefined });

	try {
		await loadSettings();
		const model = generalSettings.models.find(model => model.id === job.snapshot.modelId);
		if (!model) {
			throw new Error(`Model configuration not found for ${job.snapshot.modelId}`);
		}

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
		const { promptResponses } = await sendToLLM(
			job.snapshot.promptContext,
			job.snapshot.variables.content || '',
			promptVariables,
			model
		);
		const interpreted = applyPromptResponsesToSnapshot(job.snapshot, promptVariables, promptResponses);
		const frontmatter = await generateFrontmatter(interpreted.properties);
		const fileContent = frontmatter + interpreted.noteContent;

		job = await saveJob({
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
			await saveToObsidianFromBackground(job, fileContent);
			await incrementStat('addToObsidian', job.snapshot.vault, interpreted.path, job.snapshot.url, job.snapshot.title);
			job = await saveJob({ ...job, status: 'saved', savedAt: nowIso() });
		}

		return job;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return saveJob({
			...job,
			status: 'error',
			error: errorMessage,
			completedAt: nowIso()
		});
	} finally {
		runningJobs.delete(job.key);
	}
}

export async function startInterpreterJob(
	snapshot: InterpreterJobSnapshot,
	addToObsidianWhenDone: boolean
): Promise<InterpreterJob> {
	const key = buildInterpreterJobKey(snapshot);
	const existing = await getInterpreterJob(key);
	if (existing && ['queued', 'running', 'completed', 'saved'].includes(existing.status)) {
		if (['queued', 'running'].includes(existing.status) && !runningJobs.has(key)) {
			runningJobs.set(key, runInterpreterJob(existing));
		}
		return existing;
	}

	const job: InterpreterJob = {
		id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		key,
		status: 'queued',
		snapshot: { ...snapshot, createdAt: snapshot.createdAt || nowIso() },
		addToObsidianWhenDone
	};

	await saveJob(job);
	runningJobs.set(key, runInterpreterJob(job));
	return job;
}
