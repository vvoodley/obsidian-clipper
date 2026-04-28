import { describe, expect, it } from 'vitest';
import { addDeterministicMediaTagsToNoteContent, buildMediaDiagnostics, extractVideoCandidateUrls } from './media-diagnostics';
import type { VisionProcessingPlan } from './vision-plan';
import type { VisionBatchResult } from '../../types/types';

const basePlan: VisionProcessingPlan = {
	candidates: [],
	selectedForSingleShot: [],
	batches: [],
	candidateCount: 0,
	plannedImageCount: 0,
	skippedCandidates: [],
	warnings: [],
	batchSize: 5,
	batchingEnabled: false,
	shouldBatch: false
};

describe('media diagnostics', () => {
	it('extracts and dedupes video candidate URLs', () => {
		expect(extractVideoCandidateUrls(`Possible videos:
https://v.redd.it/example
https://cdn.example.com/video.mp4
https://v.redd.it/example`)).toEqual([
			'https://v.redd.it/example',
			'https://cdn.example.com/video.mp4'
		]);
	});

	it('adds deterministic video tags when video candidates exist', () => {
		const diagnostics = buildMediaDiagnostics('https://v.redd.it/example', basePlan);
		expect(diagnostics.deterministicTags).toContain('media/has-video-candidate');
		expect(diagnostics.deterministicTags).toContain('workflow/needs-video-download');
	});

	it('adds partial vision tags when a batch image failed', () => {
		const batchResults: VisionBatchResult[] = [{
			batchIndex: 1,
			totalBatches: 1,
			attempts: 3,
			startedAt: '2026-01-01T00:00:00.000Z',
			images: [{
				source: 'post_gallery',
				index: 1,
				url: 'https://i.redd.it/a.jpg',
				inspected: false,
				status: 'failed',
				error: 'timeout'
			}]
		}];
		const diagnostics = buildMediaDiagnostics('', { ...basePlan, candidateCount: 1, shouldBatch: true }, batchResults);
		expect(diagnostics.deterministicTags).toContain('media/vision-partial');
		expect(diagnostics.deterministicTags).toContain('media/vision-batched');
	});

	it('inserts deterministic tags into existing YAML frontmatter', () => {
		const note = `---
tags:
  - source/reddit
---

Body`;
		const result = addDeterministicMediaTagsToNoteContent(note, {
			deterministicTags: ['media/vision-batched', 'workflow/needs-media-review']
		});
		expect(result).toContain('  - source/reddit');
		expect(result).toContain('  - media/vision-batched');
		expect(result).toContain('  - workflow/needs-media-review');
	});

	it('does not duplicate existing tags', () => {
		const note = `---
tags:
  - media/vision-batched
---
Body`;
		const result = addDeterministicMediaTagsToNoteContent(note, {
			deterministicTags: ['media/vision-batched']
		});
		expect(result.match(/media\/vision-batched/g)).toHaveLength(1);
	});
});
