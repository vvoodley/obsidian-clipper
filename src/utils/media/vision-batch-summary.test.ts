import { describe, expect, it } from 'vitest';
import { appendVisionBatchResultsToPromptContext, formatVisionBatchResultsForPrompt } from './vision-batch-summary';
import type { VisionBatchResult } from '../../types/types';

const result: VisionBatchResult = {
	batchIndex: 1,
	totalBatches: 2,
	attempts: 1,
	startedAt: '2026-01-01T00:00:00.000Z',
	completedAt: '2026-01-01T00:00:01.000Z',
	images: [{
		source: 'post_gallery',
		index: 1,
		url: 'https://i.redd.it/a.jpg',
		inspected: true,
		status: 'described',
		mediaType: 'screenshot/UI',
		description: 'A UI screenshot.',
		visibleText: 'Start',
		uncertainty: 'Small text is hard to read.'
	}]
};

describe('vision batch summary formatting', () => {
	it('formats batch results into a stable prompt block', () => {
		const formatted = formatVisionBatchResultsForPrompt([result]);
		expect(formatted).toContain('BATCHED_VISION_NOTES_START');
		expect(formatted).toContain('Batch 1 of 2');
		expect(formatted).toContain('Source: post_gallery');
		expect(formatted).toContain('URL: https://i.redd.it/a.jpg');
		expect(formatted).toContain('Visible text: Start');
		expect(formatted).toContain('BATCHED_VISION_NOTES_END');
	});

	it('appends media diagnostics after batch results', () => {
		const appended = appendVisionBatchResultsToPromptContext('context', [result], {
			imageCandidateCount: 1,
			imageInspectedCount: 1,
			imageFailedCount: 0,
			imageSkippedCount: 0,
			videoCandidateCount: 1,
			deterministicTags: ['media/vision-batched']
		});
		expect(appended).toContain('context');
		expect(appended).toContain('MEDIA_DIAGNOSTICS_START');
		expect(appended).toContain('- media/vision-batched');
	});
});
