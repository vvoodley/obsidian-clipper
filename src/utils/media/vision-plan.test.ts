import { describe, expect, it } from 'vitest';
import { prepareVisionProcessingPlan } from './vision-plan';
import type { ModelConfig } from '../../types/types';

const model: ModelConfig = {
	id: 'model',
	providerId: 'provider',
	providerModelId: 'model-id',
	name: 'Model',
	enabled: true,
	visionEnabled: true,
	visionImageMode: 'url',
	maxVisionImages: 5,
	visionBatchSize: 5
};

function contextWithImages(count: number): string {
	const markers = Array.from({ length: count }, (_, index) => `POST_IMAGE_${index + 1}:
https://i.redd.it/${index + 1}.jpg`).join('\n');
	return `VISION_IMAGE_URLS_START
${markers}
VISION_IMAGE_URLS_END`;
}

describe('vision processing plan', () => {
	it('returns an empty plan without candidates', () => {
		const plan = prepareVisionProcessingPlan('no markers', model);
		expect(plan.candidateCount).toBe(0);
		expect(plan.shouldBatch).toBe(false);
		expect(plan.selectedForSingleShot).toEqual([]);
	});

	it('returns warnings and no batches when vision is disabled', () => {
		const plan = prepareVisionProcessingPlan(contextWithImages(2), { ...model, visionEnabled: false });
		expect(plan.candidateCount).toBe(2);
		expect(plan.selectedForSingleShot).toEqual([]);
		expect(plan.batches).toEqual([]);
		expect(plan.warnings[0]).toContain('vision is disabled');
	});

	it('selects only the per-request limit when batching is disabled', () => {
		const plan = prepareVisionProcessingPlan(contextWithImages(12), { ...model, visionBatchingEnabled: false });
		expect(plan.shouldBatch).toBe(false);
		expect(plan.selectedForSingleShot).toHaveLength(5);
		expect(plan.skippedCandidates).toHaveLength(7);
	});

	it('creates three batches for twelve images with batch size five', () => {
		const plan = prepareVisionProcessingPlan(contextWithImages(12), { ...model, visionBatchingEnabled: true });
		expect(plan.shouldBatch).toBe(true);
		expect(plan.batches.map(batch => batch.length)).toEqual([5, 5, 2]);
	});

	it('creates four batches for twenty images with batch size five', () => {
		const plan = prepareVisionProcessingPlan(contextWithImages(20), { ...model, visionBatchingEnabled: true });
		expect(plan.batches.map(batch => batch.length)).toEqual([5, 5, 5, 5]);
	});

	it('clamps batch size above the per-request limit', () => {
		const plan = prepareVisionProcessingPlan(contextWithImages(12), { ...model, visionBatchingEnabled: true, visionBatchSize: 50 });
		expect(plan.batchSize).toBe(5);
		expect(plan.batches.map(batch => batch.length)).toEqual([5, 5, 2]);
	});

	it('clamps batch size below one', () => {
		const plan = prepareVisionProcessingPlan(contextWithImages(7), { ...model, visionBatchingEnabled: true, visionBatchSize: 0 });
		expect(plan.batchSize).toBe(1);
		expect(plan.batches.map(batch => batch.length)).toEqual([1, 1, 1, 1, 1, 1, 1]);
	});

	it('preserves candidate priority and index order', () => {
		const plan = prepareVisionProcessingPlan(contextWithImages(3), { ...model, visionBatchingEnabled: false });
		expect(plan.selectedForSingleShot.map(image => image.index)).toEqual([1, 2, 3]);
	});
});
