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

	it('does not treat arbitrary URLs containing video as video candidates outside video sections', () => {
		expect(extractVideoCandidateUrls('https://example.com/articles/video-game-guide')).toEqual([]);
		expect(extractVideoCandidateUrls(`Reddit video candidates:
https://example.com/articles/video-game-guide`)).toEqual(['https://example.com/articles/video-game-guide']);
	});

	it('marks single-shot unsupported provider diagnostics as vision not run', () => {
		const diagnostics = buildMediaDiagnostics('', {
			...basePlan,
			candidateCount: 2,
			selectedForSingleShot: [
				{ sourceUrl: 'https://i.redd.it/1.jpg', remoteUrl: 'https://i.redd.it/1.jpg', source: 'post_gallery', index: 1 }
			]
		}, [], { singleShotAttachedCount: 0 });

		expect(diagnostics.imageInspectedCount).toBe(0);
		expect(diagnostics.deterministicTags).toContain('media/vision-not-run');
		expect(diagnostics.deterministicTags).toContain('workflow/needs-media-review');
	});

	it('counts single-shot images as inspected only when they were attached', () => {
		const diagnostics = buildMediaDiagnostics('', {
			...basePlan,
			candidateCount: 1,
			selectedForSingleShot: [
				{ sourceUrl: 'https://i.redd.it/1.jpg', remoteUrl: 'https://i.redd.it/1.jpg', source: 'post_gallery', index: 1 }
			]
		}, [], { singleShotAttachedCount: 1 });

		expect(diagnostics.imageInspectedCount).toBe(1);
		expect(diagnostics.deterministicTags).not.toContain('media/vision-not-run');
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

	it('adds vision-not-run when batched images are skipped without inspection', () => {
		const batchResults: VisionBatchResult[] = [{
			batchIndex: 1,
			totalBatches: 1,
			attempts: 0,
			startedAt: '2026-01-01T00:00:00.000Z',
			images: [{
				source: 'post_gallery',
				index: 1,
				url: 'https://i.redd.it/a.jpg',
				inspected: false,
				status: 'skipped',
				error: 'unsupported provider'
			}]
		}];
		const diagnostics = buildMediaDiagnostics('', { ...basePlan, candidateCount: 1, shouldBatch: true }, batchResults);
		expect(diagnostics.imageInspectedCount).toBe(0);
		expect(diagnostics.deterministicTags).toContain('media/vision-not-run');
		expect(diagnostics.deterministicTags).toContain('workflow/needs-media-review');
	});

	it('does not duplicate quoted block-style tags', () => {
		const note = `---
tags:
  - "media/vision-batched"
  - 'workflow/needs-media-review'
---
Body`;
		const result = addDeterministicMediaTagsToNoteContent(note, {
			deterministicTags: ['media/vision-batched', 'workflow/needs-media-review']
		});

		expect(result.match(/media\/vision-batched/g)).toHaveLength(1);
		expect(result.match(/workflow\/needs-media-review/g)).toHaveLength(1);
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

	it('inserts deterministic tags into generated full file frontmatter', () => {
		const fileContent = `---
created: 2026-01-01
---
---
schema: embedded_template
tags:
  - source/reddit
---

Body`;
		const result = addDeterministicMediaTagsToNoteContent(fileContent, {
			deterministicTags: ['media/vision-batched']
		});

		expect(result).toContain(`created: 2026-01-01
tags:
  - media/vision-batched
---`);
		expect(result).toContain('schema: embedded_template');
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
