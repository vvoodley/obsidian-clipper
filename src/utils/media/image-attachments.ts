import type { VisionImageAttachment, VisionImageCandidate } from './image-types';
import type { ModelConfig } from '../../types/types';
import { extractVisionImageCandidates, selectVisionImageCandidates } from './image-candidates';

export function buildRemoteVisionImageAttachments(
	candidates: VisionImageCandidate[]
): VisionImageAttachment[] {
	return candidates.map(candidate => ({
		sourceUrl: candidate.url,
		remoteUrl: candidate.url,
		source: candidate.source
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
	const candidates = extractVisionImageCandidates(promptContext);
	const warnings: string[] = [];

	if (!model.visionEnabled) {
		return {
			visionImages: [],
			candidateCount: candidates.length,
			warnings: candidates.length > 0
				? ['Vision image candidates were captured, but vision is disabled for this model.']
				: []
		};
	}

	const mode = model.visionImageMode || 'url';
	if (mode !== 'url') {
		if (candidates.length > 0) {
			warnings.push(`Vision image mode "${mode}" is not implemented yet; falling back to text-only.`);
		}
		return {
			visionImages: [],
			candidateCount: candidates.length,
			warnings
		};
	}

	const selected = selectVisionImageCandidates(candidates, model.maxVisionImages ?? 2);
	return {
		visionImages: buildRemoteVisionImageAttachments(selected),
		candidateCount: candidates.length,
		warnings
	};
}
