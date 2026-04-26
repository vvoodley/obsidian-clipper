export type VisionImageSource = 'main_post' | 'quoted_or_embedded_post';

export interface VisionImageCandidate {
	url: string;
	source: VisionImageSource;
	priority: number;
}

export interface VisionImageAttachment {
	sourceUrl: string;
	remoteUrl?: string;
	dataUrl?: string;
	source: VisionImageSource;
}
