import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generalSettings } from './storage-utils';
import { DEFAULT_LLM_TIMEOUT_MS, LLM_TIMEOUT_ERROR_MESSAGE, sendToLLM } from './interpreter';

describe('sendToLLM timeout and parsing', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
		generalSettings.providers = [{
			id: 'provider-a',
			name: 'OpenAI Compatible',
			baseUrl: 'https://api.example.com/chat/completions',
			apiKey: 'test-key',
			apiKeyRequired: true
		}];
		generalSettings.models = [];
	});

	it('aborts provider requests after the timeout', async () => {
		vi.useFakeTimers();
		let signal: AbortSignal | undefined;
		vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
			signal = init?.signal as AbortSignal;
			return new Promise((_resolve, reject) => {
				signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
			});
		}));

		const promise = sendToLLM('context', 'content', [{ key: 'prompt_1', prompt: 'summary' }], {
			id: 'model-a',
			providerId: 'provider-a',
			providerModelId: 'model-a',
			name: 'Model A',
			enabled: true
		});
		const expectation = expect(promise).rejects.toThrow(LLM_TIMEOUT_ERROR_MESSAGE);

		await vi.advanceTimersByTimeAsync(DEFAULT_LLM_TIMEOUT_MS);

		await expectation;
		expect(signal?.aborted).toBe(true);
		vi.useRealTimers();
	});

	it('throws when prompt variables exist but response cannot be parsed into prompt responses', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => ({
			ok: true,
			text: async () => JSON.stringify({ choices: [{ message: { content: 'not json' } }] })
		})));

		await expect(sendToLLM('context', 'content', [{ key: 'prompt_1', prompt: 'summary' }], {
			id: 'model-a',
			providerId: 'provider-a',
			providerModelId: 'model-a',
			name: 'Model A',
			enabled: true
		})).rejects.toThrow('AI provider returned a response, but Web Clipper could not parse the prompt responses.');
	});
});
