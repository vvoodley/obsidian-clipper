import type { VisionImageCandidate, VisionImageSource } from './image-types';

const START_MARKER = 'VISION_IMAGE_URLS_START';
const END_MARKER = 'VISION_IMAGE_URLS_END';

const MAX_TOTAL_IMAGES = 20;

const FIELD_DEFINITIONS: Array<{ marker: string; source: VisionImageSource; priority: number; index: number }> = [
	{ marker: 'MAIN_POST_FIRST_IMAGE', source: 'main_post', priority: 1, index: 1 },
	{ marker: 'MAIN_POST_IMAGE_1', source: 'main_post', priority: 1, index: 1 },
	{ marker: 'MAIN_POST_IMAGE_2', source: 'main_post', priority: 2, index: 2 },
	{ marker: 'MAIN_POST_IMAGE_3', source: 'main_post', priority: 3, index: 3 },
	{ marker: 'MAIN_POST_IMAGE_4', source: 'main_post', priority: 4, index: 4 },
	{ marker: 'QUOTED_OR_EMBEDDED_POST_FIRST_IMAGE', source: 'quoted_or_embedded_post', priority: 5, index: 1 },
	{ marker: 'QUOTED_OR_EMBEDDED_POST_IMAGE_1', source: 'quoted_or_embedded_post', priority: 5, index: 1 },
	{ marker: 'QUOTED_OR_EMBEDDED_POST_IMAGE_2', source: 'quoted_or_embedded_post', priority: 6, index: 2 },
	{ marker: 'QUOTED_OR_EMBEDDED_POST_IMAGE_3', source: 'quoted_or_embedded_post', priority: 7, index: 3 },
	{ marker: 'QUOTED_OR_EMBEDDED_POST_IMAGE_4', source: 'quoted_or_embedded_post', priority: 8, index: 4 }
];

for (let index = 1; index <= MAX_TOTAL_IMAGES; index++) {
	FIELD_DEFINITIONS.push({
		marker: `POST_IMAGE_${index}`,
		source: 'post_gallery',
		priority: index,
		index
	});
	FIELD_DEFINITIONS.push({
		marker: `REDDIT_POST_IMAGE_${index}`,
		source: 'post_gallery',
		priority: index,
		index
	});
}

function getMarkedBlock(promptContext: string): string | undefined {
	const startIndex = promptContext.indexOf(START_MARKER);
	if (startIndex === -1) return undefined;
	const contentStart = startIndex + START_MARKER.length;
	const endIndex = promptContext.indexOf(END_MARKER, contentStart);
	if (endIndex === -1) return undefined;
	return promptContext.slice(contentStart, endIndex);
}

function cleanUrlCandidate(value: string): string {
	let cleaned = value.trim();
	const markdownImageMatch = cleaned.match(/^!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
	if (markdownImageMatch) {
		cleaned = markdownImageMatch[1];
	}
	cleaned = cleaned.trim().replace(/^[<"'`]+/, '').replace(/[>"'`]+$/, '');
	return cleaned;
}

function extractFirstUrlForMarker(block: string, marker: string): string | undefined {
	const markerRegex = new RegExp(`^\\s*${marker}\\s*:\\s*(.*)$`, 'im');
	const markerMatch = block.match(markerRegex);
	if (!markerMatch) return undefined;

	const lineValue = markerMatch[1] || '';
	const sameLineUrl = cleanUrlCandidate(lineValue);
	if (sameLineUrl) return sameLineUrl;

	const afterMarker = block.slice((markerMatch.index || 0) + markerMatch[0].length);
	for (const line of afterMarker.split(/\r?\n/)) {
		if (/^\s*[A-Z0-9_]+\s*:/.test(line)) break;
		const candidate = cleanUrlCandidate(line);
		if (candidate) return candidate;
	}
	return undefined;
}

function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}

function normalizeTwitterMediaUrl(value: string): string {
	try {
		const url = new URL(value);
		if (url.hostname !== 'pbs.twimg.com' || !url.pathname.startsWith('/media/')) {
			return value;
		}
		url.searchParams.set('name', 'orig');
		return url.toString();
	} catch {
		return value;
	}
}

function getDedupeKey(value: string): string {
	try {
		const url = new URL(value);
		if (url.hostname === 'pbs.twimg.com' && url.pathname.startsWith('/media/')) {
			return `${url.origin}${url.pathname}`;
		}
		return value;
	} catch {
		return value;
	}
}

export function extractVisionImageCandidates(promptContext: string): VisionImageCandidate[] {
	const block = getMarkedBlock(promptContext);
	if (!block) return [];

	const seen = new Set<string>();
	const candidates: VisionImageCandidate[] = [];

	for (const field of FIELD_DEFINITIONS) {
		const value = extractFirstUrlForMarker(block, field.marker);
		if (!value || !isHttpUrl(value)) continue;
		const normalizedValue = normalizeTwitterMediaUrl(value);
		const dedupeKey = getDedupeKey(normalizedValue);
		if (seen.has(dedupeKey)) continue;
		seen.add(dedupeKey);
		candidates.push({
			url: normalizedValue,
			source: field.source,
			priority: field.priority,
			index: field.index
		});
	}

	return candidates.slice(0, MAX_TOTAL_IMAGES);
}

export function selectVisionImageCandidates(
	candidates: VisionImageCandidate[],
	maxImages = MAX_TOTAL_IMAGES
): VisionImageCandidate[] {
	const limit = Math.max(0, Math.min(MAX_TOTAL_IMAGES, maxImages));
	return [...candidates]
		.sort((a, b) => a.priority - b.priority)
		.slice(0, limit);
}
