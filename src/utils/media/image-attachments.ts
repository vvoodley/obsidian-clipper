import type { VisionImageAttachment, VisionImageCandidate } from './image-types';
import type { ModelConfig } from '../../types/types';
import { prepareVisionProcessingPlan } from './vision-plan';

export function buildRemoteVisionImageAttachments(
	candidates: VisionImageCandidate[]
): VisionImageAttachment[] {
	return candidates.map(candidate => ({
		sourceUrl: candidate.url,
		remoteUrl: candidate.url,
		source: candidate.source,
		index: candidate.index
	}));
}

export function prepareVisionInputsFromPromptContext(
	promptContext: string,
	model: ModelConfig
): {
	visionImages: VisionImageAttachment[];
	candidateCount: number;
	warnings: string[];
} {
	const plan = prepareVisionProcessingPlan(promptContext, { ...model, visionBatchingEnabled: false });
	return {
		visionImages: plan.selectedForSingleShot,
		candidateCount: plan.candidateCount,
		warnings: plan.warnings
	};
}
