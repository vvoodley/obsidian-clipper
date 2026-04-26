import { describe, expect, it } from 'vitest';
import { applyPromptResponsesToSnapshot, replacePromptVariablesInText } from './interpreter';
import { buildInterpreterJobKey } from './interpreter-job-manager';

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

		expect(buildInterpreterJobKey(base)).toBe(buildInterpreterJobKey({ ...base }));
		expect(buildInterpreterJobKey(base)).not.toBe(buildInterpreterJobKey({ ...base, templateId: 'template-b' }));
		expect(buildInterpreterJobKey(base)).not.toBe(buildInterpreterJobKey({ ...base, modelId: 'model-b' }));
	});
});
