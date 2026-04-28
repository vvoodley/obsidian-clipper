import type { ModelConfig, Provider } from '../../types/types';
import type { VisionImageAttachment } from '../media/image-types';

export interface PromptContent {
	prompts: Record<string, string>;
}

export interface BuildProviderRequestArgs {
	provider: Provider;
	model: ModelConfig;
	systemContent: string;
	promptContext: string;
	promptContent: PromptContent;
	visionImages?: VisionImageAttachment[];
	visionCandidateCount?: number;
}

export interface BuildVisionBatchDescriptionRequestArgs {
	provider: Provider;
	model: ModelConfig;
	systemContent: string;
	userText: string;
	visionImages: VisionImageAttachment[];
}

export interface BuiltProviderRequest {
	requestBody: Record<string, unknown>;
	supportsVision: boolean;
	attachedImageCount: number;
	warnings: string[];
}
