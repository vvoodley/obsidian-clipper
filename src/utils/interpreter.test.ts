import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import { generalSettings } from './storage-utils';
import { DEFAULT_LLM_TIMEOUT_MS, LLM_TIMEOUT_ERROR_MESSAGE, normalizeVisionBatchResults, sendToLLM, sendVisionBatchDescriptionToLLM } from './interpreter';

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
		vi.spyOn(Math, 'random').mockReturnValue(0);
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
		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(DEFAULT_LLM_TIMEOUT_MS);
		await vi.advanceTimersByTimeAsync(2000);
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

	it('retries provider requests through the background fetch proxy after a CORS-like network error', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => {
			throw new TypeError('NetworkError when attempting to fetch resource.');
		}));
		const sendMessage = vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({
			ok: true,
			status: 200,
			text: JSON.stringify({
				choices: [{
					message: {
						content: JSON.stringify({ prompts_responses: { prompt_1: 'summary result' } })
					}
				}]
			})
		});

		const result = await sendToLLM('context', 'content', [{ key: 'prompt_1', prompt: 'summary' }], {
			id: 'model-a',
			providerId: 'provider-a',
			providerModelId: 'model-a',
			name: 'Model A',
			enabled: true
		});

		expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
			action: 'fetchProxy',
			url: 'https://api.example.com/chat/completions'
		}));
		expect(result.promptResponses[0].user_response).toBe('summary result');
	});

	it('retries final interpretation when the provider returns malformed JSON first', async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const fetchMock = vi.fn()
			.mockResolvedValueOnce({
				ok: true,
				text: async () => '{not json'
			})
			.mockResolvedValueOnce({
				ok: true,
				text: async () => JSON.stringify({
					choices: [{
						message: {
							content: JSON.stringify({ prompts_responses: { prompt_1: 'summary after retry' } })
						}
					}]
				})
			});
		vi.stubGlobal('fetch', fetchMock);

		const promise = sendToLLM('context', 'content', [{ key: 'prompt_1', prompt: 'summary' }], {
			id: 'model-a',
			providerId: 'provider-a',
			providerModelId: 'model-a',
			name: 'Model A',
			enabled: true
		});

		await vi.advanceTimersByTimeAsync(1000);
		const result = await promise;

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result.promptResponses[0].user_response).toBe('summary after retry');
		expect(result.attempts).toBe(2);
		vi.useRealTimers();
	});

	it('marks omitted vision batch image results as failed', () => {
		const results = normalizeVisionBatchResults([], [
			{ source: 'post_gallery', index: 1, sourceUrl: 'https://i.redd.it/1.jpg', remoteUrl: 'https://i.redd.it/1.jpg' }
		]);

		expect(results[0]).toMatchObject({
			inspected: false,
			status: 'failed',
			error: 'Provider response did not include a result for this image.'
		});
	});

	it('does not mark empty vision batch image results as described', () => {
		const results = normalizeVisionBatchResults([{ status: 'described', description: '', visibleText: '', uncertainty: '' }], [
			{ source: 'post_gallery', index: 1, sourceUrl: 'https://i.redd.it/1.jpg', remoteUrl: 'https://i.redd.it/1.jpg' }
		]);

		expect(results[0].inspected).toBe(false);
		expect(results[0].status).toBe('failed');
	});

	it('retries vision batch descriptions when assistant JSON is malformed first', async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const fetchMock = vi.fn()
			.mockResolvedValueOnce({
				ok: true,
				text: async () => JSON.stringify({
					choices: [{ message: { content: '{"images": [' } }]
				})
			})
			.mockResolvedValueOnce({
				ok: true,
				text: async () => JSON.stringify({
					choices: [{
						message: {
							content: JSON.stringify({
								images: [{
									status: 'described',
									description: 'A gallery image.',
									visibleText: '',
									uncertainty: 'low'
								}]
							})
						}
					}]
				})
			});
		vi.stubGlobal('fetch', fetchMock);

		const promise = sendVisionBatchDescriptionToLLM('context', [
			{ source: 'post_gallery', index: 1, sourceUrl: 'https://i.redd.it/1.jpg', remoteUrl: 'https://i.redd.it/1.jpg' }
		], {
			id: 'model-a',
			providerId: 'provider-a',
			providerModelId: 'model-a',
			name: 'Model A',
			enabled: true,
			visionEnabled: true,
			visionImageMode: 'url'
		}, {
			batchIndex: 1,
			totalBatches: 1,
			candidateCount: 1
		});

		await vi.advanceTimersByTimeAsync(1000);
		const result = await promise;

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result.attempts).toBe(2);
		expect(result.images[0]).toMatchObject({ status: 'described', inspected: true });
		vi.useRealTimers();
	});

	it('retries vision batch descriptions when provider envelope JSON is malformed first', async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const fetchMock = vi.fn()
			.mockResolvedValueOnce({
				ok: true,
				text: async () => '{not json'
			})
			.mockResolvedValueOnce({
				ok: true,
				text: async () => JSON.stringify({
					choices: [{
						message: {
							content: JSON.stringify({
								images: [{
									status: 'described',
									description: 'A recovered gallery image.',
									visibleText: '',
									uncertainty: 'low'
								}]
							})
						}
					}]
				})
			});
		vi.stubGlobal('fetch', fetchMock);

		const promise = sendVisionBatchDescriptionToLLM('context', [
			{ source: 'post_gallery', index: 1, sourceUrl: 'https://i.redd.it/1.jpg', remoteUrl: 'https://i.redd.it/1.jpg' }
		], {
			id: 'model-a',
			providerId: 'provider-a',
			providerModelId: 'model-a',
			name: 'Model A',
			enabled: true,
			visionEnabled: true,
			visionImageMode: 'url'
		}, {
			batchIndex: 1,
			totalBatches: 1,
			candidateCount: 1
		});

		await vi.advanceTimersByTimeAsync(1000);
		const result = await promise;

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result.attempts).toBe(2);
		expect(result.images[0]).toMatchObject({ status: 'described', inspected: true });
		vi.useRealTimers();
	});
});
