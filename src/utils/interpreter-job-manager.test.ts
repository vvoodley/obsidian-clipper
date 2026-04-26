import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPromptResponsesToSnapshot, replacePromptVariablesInText } from './interpreter';
import {
	buildInterpreterJobKey,
	buildInterpreterSessionKey,
	DEFAULT_JOB_TIMEOUT_MS,
	isJobStale,
	JOB_TIMEOUT_ERROR_MESSAGE,
	getInterpreterJob,
	startInterpreterJob,
	validateInterpreterJobSnapshot
} from './interpreter-job-manager';
import browser from './browser-polyfill';
import { InterpreterJob, InterpreterJobSnapshot } from '../types/types';

let localStorageMock: Record<string, any>;

function createSnapshot(overrides: Partial<InterpreterJobSnapshot> = {}): InterpreterJobSnapshot {
	return {
		tabId: 1,
		url: 'https://example.com',
		templateId: 'template-a',
		templateName: 'Template A',
		modelId: 'model-a',
		vault: 'Vault',
		path: 'Inbox',
		noteName: 'Example',
		noteContent: 'Summarize {{"summary"}}',
		properties: [],
		behavior: 'create',
		promptContext: 'Captured page text',
		variables: { content: 'Captured page text' },
		createdAt: '2026-04-26T00:00:00.000Z',
		...overrides
	};
}

beforeEach(() => {
	vi.restoreAllMocks();
	localStorageMock = {};
	vi.spyOn(browser.storage.local, 'get').mockImplementation(async (key?: string | string[] | Record<string, unknown> | null) => {
		if (typeof key === 'string') return { [key]: localStorageMock[key] };
		return localStorageMock;
	});
	vi.spyOn(browser.storage.local, 'set').mockImplementation(async (value: Record<string, any>) => {
		localStorageMock = { ...localStorageMock, ...value };
	});
	vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({});
});

describe('replacePromptVariablesInText', () => {
	it('replaces prompt variables and applies filters', () => {
		const result = replacePromptVariablesInText(
			'Summary: {{"summarize"|upper}}',
			[{ key: 'prompt_1', prompt: 'summarize', filters: '|upper' }],
			[{ key: 'prompt_1', user_response: 'done' }]
		);

		expect(result).toBe('Summary: DONE');
	});

	it('leaves unmatched prompts intact', () => {
		expect(replacePromptVariablesInText('Keep {{"unknown"}}', [], [])).toBe('Keep {{"unknown"}}');
	});
});

describe('applyPromptResponsesToSnapshot', () => {
	it('applies responses to note fields and properties', () => {
		const interpreted = applyPromptResponsesToSnapshot(
			{
				noteName: 'Note {{"title"}}',
				path: 'Path/{{"folder"}}',
				noteContent: 'Body {{"body"}}',
				properties: [{ name: 'summary', value: '{{"summary"}}' }]
			},
			[
				{ key: 'prompt_1', prompt: 'title' },
				{ key: 'prompt_2', prompt: 'folder' },
				{ key: 'prompt_3', prompt: 'body' },
				{ key: 'prompt_4', prompt: 'summary' }
			],
			[
				{ key: 'prompt_1', user_response: 'A' },
				{ key: 'prompt_2', user_response: 'B' },
				{ key: 'prompt_3', user_response: 'C' },
				{ key: 'prompt_4', user_response: 'D' }
			]
		);

		expect(interpreted).toEqual({
			noteName: 'Note A',
			path: 'Path/B',
			noteContent: 'Body C',
			properties: [{ name: 'summary', value: 'D' }]
		});
	});
});

describe('buildInterpreterJobKey', () => {
	it('is deterministic for the same context and differs by template or model', () => {
		const base = { tabId: 1, url: 'https://example.com', templateId: 'template-a', modelId: 'model-a' };

		expect(buildInterpreterSessionKey(base)).toBe(buildInterpreterJobKey(base));
		expect(buildInterpreterJobKey(base)).toBe(buildInterpreterJobKey({ ...base }));
		expect(buildInterpreterJobKey(base)).not.toBe(buildInterpreterJobKey({ ...base, templateId: 'template-b' }));
		expect(buildInterpreterJobKey(base)).not.toBe(buildInterpreterJobKey({ ...base, modelId: 'model-b' }));
	});
});

describe('validateInterpreterJobSnapshot', () => {
	it('allows prompt variables and rejects unresolved template syntax', () => {
		expect(validateInterpreterJobSnapshot(createSnapshot()).valid).toBe(true);
		expect(validateInterpreterJobSnapshot(createSnapshot({ noteContent: 'Title {{title}}' }))).toMatchObject({ valid: false });
		expect(validateInterpreterJobSnapshot(createSnapshot({ noteContent: '{% if title %}Hi{% endif %}' }))).toMatchObject({ valid: false });
	});

	it('rejects empty required capture fields', () => {
		expect(validateInterpreterJobSnapshot(createSnapshot({ noteName: '' }))).toMatchObject({ valid: false });
		expect(validateInterpreterJobSnapshot(createSnapshot({ promptContext: '' }))).toMatchObject({ valid: false });
	});
});

describe('startInterpreterJob', () => {
	it('returns a saved job unless forceNew is requested', async () => {
		const snapshot = createSnapshot();
		const sessionKey = buildInterpreterSessionKey(snapshot);
		const savedJob: InterpreterJob = {
			id: 'old-run',
			runId: 'old-run',
			sessionKey,
			key: sessionKey,
			status: 'saved',
			snapshot,
			addToObsidianWhenDone: true,
			savedAt: '2026-04-26T00:00:00.000Z'
		};
		localStorageMock.interpreter_jobs = { [sessionKey]: savedJob };

		const existing = await startInterpreterJob(snapshot, true);
		expect(existing.runId).toBe('old-run');

		const fresh = await startInterpreterJob(snapshot, true, { forceNew: true });
		expect(fresh.sessionKey).toBe(sessionKey);
		expect(fresh.runId).not.toBe('old-run');
	});

	it('does not duplicate a running job when forceNew is requested', async () => {
		const snapshot = createSnapshot();
		const sessionKey = buildInterpreterSessionKey(snapshot);
		const runningJob: InterpreterJob = {
			id: 'running-run',
			runId: 'running-run',
			sessionKey,
			key: sessionKey,
			status: 'running',
			snapshot,
			addToObsidianWhenDone: true,
			startedAt: new Date().toISOString()
		};
		localStorageMock.interpreter_jobs = { [sessionKey]: runningJob };

		const result = await startInterpreterJob(snapshot, true, { forceNew: true });
		expect(result.runId).toBe('running-run');
	});

	it('stores the close-tab-after-save option on new jobs', async () => {
		const snapshot = createSnapshot({ templateId: 'template-close-tab' });

		const result = await startInterpreterJob(snapshot, true, { forceNew: true, closeTabAfterSave: true });

		expect(result.closeTabAfterSave).toBe(true);
	});

	it('persists capture validation failures as error jobs', async () => {
		const snapshot = createSnapshot({ noteContent: 'Unresolved {{title}}' });
		const result = await startInterpreterJob(snapshot, true, { closeTabAfterSave: true });

		expect(result.status).toBe('error');
		expect(result.error).toContain('Could not fully capture the page');
		expect(result.closeTabAfterSave).toBe(true);
	});

	it('marks stale running jobs as timed out and allows forceNew rerun', async () => {
		const snapshot = createSnapshot({ templateId: 'template-stale' });
		const sessionKey = buildInterpreterSessionKey(snapshot);
		const staleStartedAt = new Date(Date.now() - DEFAULT_JOB_TIMEOUT_MS - 1000).toISOString();
		const staleJob: InterpreterJob = {
			id: 'stale-run',
			runId: 'stale-run',
			sessionKey,
			key: sessionKey,
			status: 'running',
			phase: 'waiting_for_provider',
			snapshot,
			addToObsidianWhenDone: true,
			startedAt: staleStartedAt
		};
		localStorageMock.interpreter_jobs = { [sessionKey]: staleJob };

		expect(isJobStale(staleJob)).toBe(true);
		const timedOut = await getInterpreterJob(sessionKey);
		expect(timedOut).toMatchObject({
			status: 'error',
			phase: 'error',
			error: JOB_TIMEOUT_ERROR_MESSAGE
		});

		const existing = await startInterpreterJob(snapshot, true);
		expect(existing.runId).toBe('stale-run');

		const fresh = await startInterpreterJob(snapshot, true, { forceNew: true });
		expect(fresh.runId).not.toBe('stale-run');
		expect(fresh.phase).toBe('queued');
	});
});
