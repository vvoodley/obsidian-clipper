import type { MediaDiagnostics, VisionBatchResult } from '../../types/types';
import type { VisionProcessingPlan } from './vision-plan';

const URL_REGEX = /https?:\/\/[^\s<>"'`)]+/g;

function unique(values: string[]): string[] {
	return Array.from(new Set(values));
}

export function extractVideoCandidateUrls(promptContext: string): string[] {
	const urls = promptContext.match(URL_REGEX) || [];
	return unique(urls.filter(url =>
		/v\.redd\.it|og:video|video|\.mp4|\.m3u8/i.test(url)
	));
}

export function buildMediaDiagnostics(
	promptContext: string,
	plan: VisionProcessingPlan,
	batchResults: VisionBatchResult[] = []
): MediaDiagnostics {
	const videoCandidateUrls = extractVideoCandidateUrls(promptContext);
	const imageResults = batchResults.flatMap(result => result.images);
	const imageInspectedCount = imageResults.length > 0
		? imageResults.filter(image => image.inspected && image.status === 'described').length
		: plan.selectedForSingleShot.length;
	const imageFailedCount = imageResults.filter(image => image.status === 'failed').length;
	const imageSkippedCount = Math.max(0, plan.candidateCount - imageInspectedCount - imageFailedCount);
	const deterministicTags: string[] = [];
	const warnings = [...plan.warnings];

	if (plan.shouldBatch) deterministicTags.push('media/vision-batched');
	if (videoCandidateUrls.length > 0) deterministicTags.push('media/has-video-candidate', 'workflow/needs-video-download');
	if (imageSkippedCount > 0) deterministicTags.push('media/has-uninspected-images', 'workflow/needs-media-review');
	if (imageFailedCount > 0) deterministicTags.push('media/vision-partial', 'workflow/needs-media-review');
	if (plan.candidateCount > 0 && imageInspectedCount === 0 && !plan.shouldBatch && plan.selectedForSingleShot.length === 0) {
		deterministicTags.push('media/vision-not-run', 'workflow/needs-media-review');
	}

	return {
		imageCandidateCount: plan.candidateCount,
		imageInspectedCount,
		imageSkippedCount,
		imageFailedCount,
		videoCandidateCount: videoCandidateUrls.length,
		hasVideoCandidates: videoCandidateUrls.length > 0,
		deterministicTags: unique(deterministicTags),
		warnings
	};
}

function parseYamlTagBlock(lines: string[], tagLineIndex: number): { existing: string[]; insertAt: number; mode: 'list' | 'inline' } {
	const line = lines[tagLineIndex];
	const afterColon = line.slice(line.indexOf(':') + 1).trim();
	if (afterColon.startsWith('[')) {
		const existing = afterColon.replace(/^\[/, '').replace(/]$/, '').split(',').map(tag => tag.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
		return { existing, insertAt: tagLineIndex + 1, mode: 'inline' };
	}
	const existing: string[] = [];
	let insertAt = tagLineIndex + 1;
	for (let index = tagLineIndex + 1; index < lines.length; index++) {
		if (/^\s*-\s+/.test(lines[index])) {
			existing.push(lines[index].replace(/^\s*-\s+/, '').trim());
			insertAt = index + 1;
			continue;
		}
		if (/^\s+\S/.test(lines[index]) || !lines[index].trim()) {
			insertAt = index + 1;
			continue;
		}
		break;
	}
	return { existing, insertAt, mode: 'list' };
}

export function addDeterministicMediaTagsToNoteContent(noteContent: string, diagnostics: MediaDiagnostics): string {
	const tags = diagnostics.deterministicTags || [];
	if (tags.length === 0) return noteContent;
	if (!noteContent.startsWith('---\n') && !noteContent.startsWith('---\r\n')) {
		return `${noteContent}\n\n## Media diagnostics\n\n${tags.map(tag => `- ${tag}`).join('\n')}\n`;
	}

	const newline = noteContent.includes('\r\n') ? '\r\n' : '\n';
	const lines = noteContent.split(/\r?\n/);
	const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
	if (endIndex === -1) return noteContent;

	const tagLineIndex = lines.findIndex((line, index) => index > 0 && index < endIndex && /^tags\s*:/.test(line));
	if (tagLineIndex === -1) {
		lines.splice(endIndex, 0, 'tags:', ...tags.map(tag => `  - ${tag}`));
		return lines.join(newline);
	}

	const parsed = parseYamlTagBlock(lines, tagLineIndex);
	const missing = tags.filter(tag => !parsed.existing.includes(tag));
	if (missing.length === 0) return noteContent;
	if (parsed.mode === 'inline') {
		lines[tagLineIndex] = `tags: [${[...parsed.existing, ...missing].join(', ')}]`;
	} else {
		lines.splice(parsed.insertAt, 0, ...missing.map(tag => `  - ${tag}`));
	}
	return lines.join(newline);
}
