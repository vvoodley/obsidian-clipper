import { describe, expect, it, vi } from 'vitest';
import { mergeExtraRequestBody, validateExtraRequestBodyJson } from './extra-request-body';

describe('validateExtraRequestBodyJson', () => {
	it('accepts blank JSON as no extra params', () => {
		expect(validateExtraRequestBodyJson('   ')).toEqual({});
	});

	it('accepts a JSON object with nested values', () => {
		expect(validateExtraRequestBodyJson('{"thinking":{"type":"disabled"},"temperature":0.2}')).toEqual({
			value: {
				thinking: { type: 'disabled' },
				temperature: 0.2
			}
		});
	});

	it('rejects invalid JSON and non-object top-level values', () => {
		expect(validateExtraRequestBodyJson('{').error).toBeTruthy();
		expect(validateExtraRequestBodyJson('[]').error).toBeTruthy();
		expect(validateExtraRequestBodyJson('"text"').error).toBeTruthy();
		expect(validateExtraRequestBodyJson('1').error).toBeTruthy();
		expect(validateExtraRequestBodyJson('true').error).toBeTruthy();
		expect(validateExtraRequestBodyJson('null').error).toBeTruthy();
	});

	it('rejects blocked top-level keys', () => {
		expect(validateExtraRequestBodyJson('{"messages":[],"model":"other"}').error).toContain('messages, model');
	});
});

describe('mergeExtraRequestBody', () => {
	it('preserves the original request body when extra params are blank', () => {
		const requestBody = { model: 'model-id', messages: [{ role: 'user', content: 'hello' }] };

		expect(mergeExtraRequestBody(requestBody)).toBe(requestBody);
	});

	it('shallow merges valid extra params', () => {
		const requestBody = { model: 'model-id', messages: [{ role: 'user', content: 'hello' }] };

		expect(mergeExtraRequestBody(requestBody, { reasoning_effort: 'low', max_tokens: 2000 })).toEqual({
			model: 'model-id',
			messages: [{ role: 'user', content: 'hello' }],
			reasoning_effort: 'low',
			max_tokens: 2000
		});
	});

	it('does not allow extra params to override model or messages', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const requestBody = { model: 'model-id', messages: [{ role: 'user', content: 'hello' }] };

		expect(mergeExtraRequestBody(requestBody, {
			model: 'other-model',
			messages: [],
			temperature: 0.2
		})).toEqual({
			model: 'model-id',
			messages: [{ role: 'user', content: 'hello' }],
			temperature: 0.2
		});
		expect(warnSpy).toHaveBeenCalledTimes(2);
		warnSpy.mockRestore();
	});
});
