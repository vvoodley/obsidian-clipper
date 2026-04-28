import type { ModelConfig } from '../../types/types';
import type { VisionImageAttachment, VisionImageCandidate } from './image-types';
import { extractVisionImageCandidates, selectVisionImageCandidates } from './image-candidates';

const MAX_PLANNED_IMAGES = 20;
const DEFAULT_PER_REQUEST_LIMIT = 8;
const DEFAULT_BATCH_SIZE = 5;

export interface VisionProcessingPlan {
	candidates: VisionImageCandidate[];
	selectedForSingleShot: VisionImageAttachment[];
	batches: VisionImageAttachment[][];
	candidateCount: number;
	plannedImageCount: number;
	skippedCandidates: VisionImageCandidate[];
	warnings: string[];
	batchSize: number;
	batchingEnabled: boolean;
	shouldBatch: boolean;
}

function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.max(min, Math.min(max, Math.floor(value)));
}

export function getEffectiveVisionPerRequestLimit(model: ModelConfig): number {
	return clamp(model.maxVisionImages ?? DEFAULT_PER_REQUEST_LIMIT, 0, MAX_PLANNED_IMAGES);
}

export function getEffectiveVisionBatchSize(model: ModelConfig): number {
	const perRequestLimit = getEffectiveVisionPerRequestLimit(model);
	return clamp(model.visionBatchSize ?? DEFAULT_BATCH_SIZE, 1, perRequestLimit || 1);
}

function chunkAttachments(attachments: VisionImageAttachment[], batchSize: number): VisionImageAttachment[][] {
	const batches: VisionImageAttachment[][] = [];
	for (let index = 0; index < attachments.length; index += batchSize) {
		batches.push(attachments.slice(index, index + batchSize));
	}
	return batches;
}

function buildAttachments(candidates: VisionImageCandidate[]): VisionImageAttachment[] {
	return candidates.map(candidate => ({
		sourceUrl: candidate.url,
		remoteUrl: candidate.url,
		source: candidate.source,
		index: candidate.index
	}));
}

export function prepareVisionProcessingPlan(promptContext: string, model: ModelConfig): VisionProcessingPlan {
	const candidates = extractVisionImageCandidates(promptContext);
	const candidateCount = candidates.length;
	const warnings: string[] = [];
	const perRequestLimit = getEffectiveVisionPerRequestLimit(model);
	const batchSize = getEffectiveVisionBatchSize(model);
	const batchingEnabled = model.visionBatchingEnabled === true;
	const emptyBase = {
		candidates,
		selectedForSingleShot: [],
		batches: [],
		candidateCount,
		plannedImageCount: 0,
		skippedCandidates: [] as VisionImageCandidate[],
		warnings,
		batchSize,
		batchingEnabled,
		shouldBatch: false
	};

	if (model.visionEnabled !== true) {
		if (candidateCount > 0) warnings.push('Vision image candidates were captured, but vision is disabled for this model.');
		return emptyBase;
	}

	const mode = model.visionImageMode || 'url';
	if (mode !== 'url') {
		if (candidateCount > 0) warnings.push(`Vision image mode "${mode}" is not implemented yet; falling back to text-only.`);
		return emptyBase;
	}

	if (candidateCount === 0 || perRequestLimit === 0) {
		if (candidateCount > 0 && perRequestLimit === 0) warnings.push('Vision image candidates were captured, but maxVisionImages is 0.');
		return emptyBase;
	}

	if (!batchingEnabled || candidateCount <= perRequestLimit) {
		const selected = selectVisionImageCandidates(candidates, perRequestLimit);
		if (candidateCount > selected.length) {
			warnings.push(`Vision image candidates were captured, but only the first ${selected.length} image(s) will be attached because batching is disabled.`);
		}
		return {
			...emptyBase,
			selectedForSingleShot: buildAttachments(selected),
			plannedImageCount: selected.length,
			skippedCandidates: candidates.filter(candidate => !selected.includes(candidate))
		};
	}

	const plannedCandidates = selectVisionImageCandidates(candidates, MAX_PLANNED_IMAGES);
	const attachments = buildAttachments(plannedCandidates);
	return {
		...emptyBase,
		batches: chunkAttachments(attachments, batchSize),
		plannedImageCount: attachments.length,
		skippedCandidates: candidates.filter(candidate => !plannedCandidates.includes(candidate)),
		shouldBatch: true
	};
}
