import { describe, expect, it } from 'vitest';
import { buildProviderRequest, buildVisionBatchDescriptionRequest } from './provider-request';
import type { ModelConfig, Provider } from '../../types/types';

const provider: Provider = {
	id: 'fireworks',
	name: 'Fireworks',
	baseUrl: 'https://api.fireworks.ai/inference/v1/chat/completions',
	apiKey: 'key'
};

const model: ModelConfig = {
	id: 'model',
	providerId: 'fireworks',
	providerModelId: 'accounts/fireworks/routers/kimi-k2p5-turbo',
	name: 'Kimi',
	enabled: true,
	visionEnabled: true,
	visionImageMode: 'url'
};

describe('provider request builder', () => {
	it('keeps text-only OpenAI-compatible requests unchanged when no images are attached', () => {
		const built = buildProviderRequest({ provider, model, systemContent: 'system', promptContext: 'context', promptContent: { prompts: { prompt_1: 'summary' } } });
		expect(built.requestBody).toEqual({
			model: model.providerModelId,
			messages: [
				{ role: 'system', content: 'system' },
				{ role: 'user', content: 'context' },
				{ role: 'user', content: '{"prompts":{"prompt_1":"summary"}}' }
			]
		});
	});

	it('uses OpenAI-compatible content blocks for a Fireworks main image', () => {
		const built = buildProviderRequest({
			provider,
			model,
			systemContent: 'system',
			promptContext: 'context',
			promptContent: { prompts: { prompt_1: 'summary' } },
			visionImages: [{ sourceUrl: 'https://pbs.twimg.com/media/AAA.jpg', remoteUrl: 'https://pbs.twimg.com/media/AAA.jpg', source: 'main_post' }]
		});
		const messages = built.requestBody.messages as any[];
		expect(messages[1].content[0].type).toBe('text');
		expect(messages[1].content[1]).toEqual({ type: 'image_url', image_url: { url: 'https://pbs.twimg.com/media/AAA.jpg' } });
		expect(built.attachedImageCount).toBe(1);
	});

	it('attaches main and quoted images in order', () => {
		const built = buildProviderRequest({
			provider,
			model,
			systemContent: 'system',
			promptContext: 'context',
			promptContent: { prompts: { prompt_1: 'summary' } },
			visionImages: [
				{ sourceUrl: 'https://pbs.twimg.com/media/AAA.jpg', remoteUrl: 'https://pbs.twimg.com/media/AAA.jpg', source: 'main_post' },
				{ sourceUrl: 'https://pbs.twimg.com/media/BBB.jpg', remoteUrl: 'https://pbs.twimg.com/media/BBB.jpg', source: 'quoted_or_embedded_post' }
			]
		});
		const content = ((built.requestBody.messages as any[])[1].content as any[]);
		expect(content.filter(block => block.type === 'image_url')).toEqual([
			{ type: 'image_url', image_url: { url: 'https://pbs.twimg.com/media/AAA.jpg' } },
			{ type: 'image_url', image_url: { url: 'https://pbs.twimg.com/media/BBB.jpg' } }
		]);
	});

	it('falls back to text-only when vision is disabled', () => {
		const built = buildProviderRequest({
			provider,
			model: { ...model, visionEnabled: false },
			systemContent: 'system',
			promptContext: 'context',
			promptContent: { prompts: { prompt_1: 'summary' } },
			visionCandidateCount: 1
		});
		expect((built.requestBody.messages as any[]).some(message => Array.isArray(message.content))).toBe(false);
		expect(JSON.stringify(built.requestBody)).not.toContain('image_url');
	});

	it('suppresses disabled vision status for final batched synthesis and adds batched evidence status', () => {
		const built = buildProviderRequest({
			provider,
			model,
			systemContent: 'system',
			promptContext: 'context\n\nBATCHED_VISION_NOTES_START\nImage notes\nBATCHED_VISION_NOTES_END',
			promptContent: { prompts: { prompt_1: 'summary' } },
			visionCandidateCount: 3,
			suppressDisabledVisionStatus: true,
			visionEvidenceMode: 'batched_notes'
		});

		const body = JSON.stringify(built.requestBody);
		expect(body).toContain('BATCHED_VISION_NOTES in this prompt are prior visual evidence');
		expect(body).not.toContain('Image candidate URLs were captured, but this model did not attach them');
		expect(body).not.toContain('image_url');
	});

	it('can suppress disabled vision status without adding batched evidence status', () => {
		const built = buildProviderRequest({
			provider,
			model,
			systemContent: 'system',
			promptContext: 'context',
			promptContent: { prompts: { prompt_1: 'summary' } },
			visionCandidateCount: 2,
			suppressDisabledVisionStatus: true
		});

		expect(JSON.stringify(built.requestBody)).not.toContain('Image candidate URLs were captured, but this model did not attach them');
	});

	it('falls back to text-only with a warning for unsupported providers', () => {
		const built = buildProviderRequest({
			provider: { ...provider, name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1/messages' },
			model,
			systemContent: 'system',
			promptContext: 'context',
			promptContent: { prompts: { prompt_1: 'summary' } },
			visionImages: [{ sourceUrl: 'https://pbs.twimg.com/media/AAA.jpg', remoteUrl: 'https://pbs.twimg.com/media/AAA.jpg', source: 'main_post' }]
		});
		expect(JSON.stringify(built.requestBody)).not.toContain('image_url');
		expect(built.warnings.length).toBeGreaterThan(0);
	});

	it('uses OpenAI-compatible image_url content blocks for vision batch descriptions', () => {
		const built = buildVisionBatchDescriptionRequest({
			provider,
			model,
			systemContent: 'system',
			userText: 'describe these',
			visionImages: [{ sourceUrl: 'https://i.redd.it/1.jpg', remoteUrl: 'https://i.redd.it/1.jpg', source: 'post_gallery', index: 1 }]
		});
		const messages = built.requestBody.messages as any[];
		expect(messages[1].content).toEqual([
			{ type: 'text', text: 'describe these' },
			{ type: 'image_url', image_url: { url: 'https://i.redd.it/1.jpg' } }
		]);
		expect(built.attachedImageCount).toBe(1);
	});
});
