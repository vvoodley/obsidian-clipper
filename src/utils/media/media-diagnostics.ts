import type { MediaDiagnostics, VisionBatchResult } from '../../types/types';
import type { VisionProcessingPlan } from './vision-plan';

const URL_REGEX = /https?:\/\/[^\s<>"'`)]+/g;

function unique(values: string[]): string[] {
	return Array.from(new Set(values));
}

function isStrongVideoUrl(url: string): boolean {
	return /v\.redd\.it|(?:youtube\.com|youtu\.be)\/|\.mp4(?:[?#]|$)|\.m3u8(?:[?#]|$)|\.webm(?:[?#]|$)|\.mov(?:[?#]|$)/i.test(url);
}

export function extractVideoCandidateUrls(promptContext: string): string[] {
	const strongVideoUrls = (promptContext.match(URL_REGEX) || []).filter(isStrongVideoUrl);
	const sectionUrls: string[] = [];
	const lines = promptContext.split(/\r?\n/);
	for (let index = 0; index < lines.length; index++) {
		if (!/(video candidates|reddit video candidates|possible videos|og:video)/i.test(lines[index])) continue;
		for (let offset = 0; offset <= 12 && index + offset < lines.length; offset++) {
			const line = lines[index + offset];
			const trimmed = line.trim();
			const isSectionBoundary =
				/^VISION_IMAGE_URLS_(?:START|END)$/.test(trimmed) ||
				/^\s*(?:#{1,6}\s+|[A-Z][A-Z _/-]{6,}:?)\s*$/.test(line);
			if (offset > 0 && isSectionBoundary && !/(video|og:video)/i.test(line)) break;
			sectionUrls.push(...(line.match(URL_REGEX) || []).filter(isStrongVideoUrl));
		}
	}
	return unique([...strongVideoUrls, ...sectionUrls]);
}

export function buildMediaDiagnostics(
	promptContext: string,
	plan: VisionProcessingPlan,
	batchResults: VisionBatchResult[] = [],
	options: { singleShotAttachedCount?: number } = {}
): MediaDiagnostics {
	const videoCandidateUrls = extractVideoCandidateUrls(promptContext);
	const imageResults = batchResults.flatMap(result => result.images);
	const imageInspectedCount = imageResults.length > 0
		? imageResults.filter(image => image.inspected && image.status === 'described').length
		: options.singleShotAttachedCount ?? 0;
	const imageFailedCount = imageResults.filter(image => image.status === 'failed').length;
	const imageSkippedCount = Math.max(0, plan.candidateCount - imageInspectedCount - imageFailedCount);
	const deterministicTags: string[] = [];
	const warnings = [...plan.warnings];

	if (plan.candidateCount > 0) deterministicTags.push('media/has-possible-image');
	if (plan.shouldBatch) deterministicTags.push('media/vision-batched');
	if (videoCandidateUrls.length > 0) deterministicTags.push('media/has-video-candidate', 'workflow/needs-video-download');
	if (imageSkippedCount > 0) deterministicTags.push('media/has-uninspected-images', 'workflow/needs-media-review');
	if (imageFailedCount > 0) deterministicTags.push('media/vision-partial', 'workflow/needs-media-review');
	if (plan.candidateCount > 0 && imageInspectedCount === 0) {
		deterministicTags.push('media/vision-not-run', 'workflow/needs-media-review');
	}

	return {
		imageCandidateCount: plan.candidateCount,
		imageInspectedCount,
		imageSkippedCount,
		imageFailedCount,
		videoCandidateUrls,
		videoCandidateCount: videoCandidateUrls.length,
		hasVideoCandidates: videoCandidateUrls.length > 0,
		deterministicTags: unique(deterministicTags),
		warnings
	};
}

export function formatDeterministicMediaSectionGuidance(diagnostics?: MediaDiagnostics): string {
	if (!diagnostics) return '';
	const imageCandidateCount = diagnostics.imageCandidateCount ?? 0;
	const inspectedCount = diagnostics.imageInspectedCount ?? 0;
	const hasBatchedEvidence = diagnostics.deterministicTags?.includes('media/vision-batched') === true;
	const hasImageEvidence = imageCandidateCount > 0;
	const lines = [
		'DETERMINISTIC_MEDIA_SECTION_GUIDANCE_START',
		`Image candidates found: ${imageCandidateCount}`,
		`Images attached or described by vision: ${inspectedCount}`,
		`Batched vision notes present: ${hasBatchedEvidence ? 'yes' : 'no'}`
	];
	if (hasImageEvidence) {
		lines.push('Include a Visual analysis section when the template asks for one. Base it only on attached images, batched vision notes, or listed image candidates that are explicitly marked as uninspected.');
	} else {
		lines.push('Do not include a Visual analysis section. No template-scoped image candidates were captured.');
	}
	lines.push('Do not infer visual contents from URLs alone.');
	lines.push('DETERMINISTIC_MEDIA_SECTION_GUIDANCE_END');
	return lines.join('\n');
}

export function appendDeterministicMediaSectionGuidance(promptContext: string, diagnostics?: MediaDiagnostics): string {
	const guidance = formatDeterministicMediaSectionGuidance(diagnostics);
	return guidance ? `${promptContext}\n\n${guidance}` : promptContext;
}

export function removeVisualAnalysisSectionWhenNoImages(noteContent: string, diagnostics?: MediaDiagnostics): string {
	if ((diagnostics?.imageCandidateCount ?? 0) > 0) return noteContent;
	const newline = noteContent.includes('\r\n') ? '\r\n' : '\n';
	const lines = noteContent.split(/\r?\n/);
	const startIndex = lines.findIndex(line => /^#{2,6}\s+Visual analysis\s*$/i.test(line.trim()));
	if (startIndex === -1) return noteContent;
	let endIndex = lines.length;
	for (let index = startIndex + 1; index < lines.length; index++) {
		if (/^#{2,6}\s+\S/.test(lines[index].trim())) {
			endIndex = index;
			break;
		}
	}
	const before = lines.slice(0, startIndex);
	const after = lines.slice(endIndex);
	while (before.length > 0 && before[before.length - 1].trim() === '') before.pop();
	while (after.length > 0 && after[0].trim() === '') after.shift();
	return [...before, ...(before.length && after.length ? [''] : []), ...after].join(newline).trimStart();
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
			existing.push(lines[index].replace(/^\s*-\s+/, '').trim().replace(/^['"]|['"]$/g, ''));
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
