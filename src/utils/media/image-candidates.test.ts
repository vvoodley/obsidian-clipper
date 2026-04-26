import { describe, expect, it } from 'vitest';
import { extractVisionImageCandidates, selectVisionImageCandidates } from './image-candidates';

const block = (main: string, quoted: string, extra = '') => `outside https://pbs.twimg.com/media/OUT.jpg
VISION_IMAGE_URLS_START

MAIN_POST_FIRST_IMAGE:
${main}

QUOTED_OR_EMBEDDED_POST_FIRST_IMAGE:
${quoted}

${extra}
VISION_IMAGE_URLS_END`;

describe('vision image candidate parsing', () => {
	it('extracts main and quoted images in order', () => {
		expect(extractVisionImageCandidates(block('https://pbs.twimg.com/media/AAA.jpg?name=orig', 'https://pbs.twimg.com/media/BBB.jpg?name=orig'))).toEqual([
			{ url: 'https://pbs.twimg.com/media/AAA.jpg?name=orig', source: 'main_post', priority: 1, index: 1 },
			{ url: 'https://pbs.twimg.com/media/BBB.jpg?name=orig', source: 'quoted_or_embedded_post', priority: 5, index: 1 }
		]);
	});

	it('extracts only main when quoted is empty', () => {
		expect(extractVisionImageCandidates(block('https://pbs.twimg.com/media/AAA.jpg?name=orig', ''))).toEqual([
			{ url: 'https://pbs.twimg.com/media/AAA.jpg?name=orig', source: 'main_post', priority: 1, index: 1 }
		]);
	});

	it('extracts only quoted when main is empty', () => {
		expect(extractVisionImageCandidates(block('', 'https://pbs.twimg.com/media/BBB.jpg?name=orig'))).toEqual([
			{ url: 'https://pbs.twimg.com/media/BBB.jpg?name=orig', source: 'quoted_or_embedded_post', priority: 5, index: 1 }
		]);
	});

	it('returns no candidates when both fields are empty', () => {
		expect(extractVisionImageCandidates(block('', ''))).toEqual([]);
	});

	it('deduplicates duplicate URLs and keeps the main post source', () => {
		expect(extractVisionImageCandidates(block('https://pbs.twimg.com/media/AAA.jpg?name=orig', 'https://pbs.twimg.com/media/AAA.jpg?name=orig'))).toEqual([
			{ url: 'https://pbs.twimg.com/media/AAA.jpg?name=orig', source: 'main_post', priority: 1, index: 1 }
		]);
	});

	it('rejects invalid and unsafe schemes', () => {
		expect(extractVisionImageCandidates(block('data:image/png;base64,abc', 'javascript:alert(1)'))).toEqual([]);
	});

	it('ignores URLs outside the marker block', () => {
		expect(extractVisionImageCandidates('https://pbs.twimg.com/media/OUT.jpg')).toEqual([]);
	});

	it('maxImages = 1 keeps main when main exists', () => {
		const candidates = extractVisionImageCandidates(block('https://pbs.twimg.com/media/AAA.jpg?name=orig', 'https://pbs.twimg.com/media/BBB.jpg?name=orig'));
		expect(selectVisionImageCandidates(candidates, 1)).toEqual([
			{ url: 'https://pbs.twimg.com/media/AAA.jpg?name=orig', source: 'main_post', priority: 1, index: 1 }
		]);
	});

	it('maxImages = 1 keeps quoted if quoted is the only image', () => {
		const candidates = extractVisionImageCandidates(block('', 'https://pbs.twimg.com/media/BBB.jpg?name=orig'));
		expect(selectVisionImageCandidates(candidates, 1)).toEqual([
			{ url: 'https://pbs.twimg.com/media/BBB.jpg?name=orig', source: 'quoted_or_embedded_post', priority: 5, index: 1 }
		]);
	});

	it('extracts up to four main and four quoted image slots', () => {
		const input = `VISION_IMAGE_URLS_START
MAIN_POST_IMAGE_1:
https://pbs.twimg.com/media/M1.jpg
MAIN_POST_IMAGE_2:
https://pbs.twimg.com/media/M2.jpg
MAIN_POST_IMAGE_3:
https://pbs.twimg.com/media/M3.jpg
MAIN_POST_IMAGE_4:
https://pbs.twimg.com/media/M4.jpg
QUOTED_OR_EMBEDDED_POST_IMAGE_1:
https://pbs.twimg.com/media/Q1.jpg
QUOTED_OR_EMBEDDED_POST_IMAGE_2:
https://pbs.twimg.com/media/Q2.jpg
QUOTED_OR_EMBEDDED_POST_IMAGE_3:
https://pbs.twimg.com/media/Q3.jpg
QUOTED_OR_EMBEDDED_POST_IMAGE_4:
https://pbs.twimg.com/media/Q4.jpg
VISION_IMAGE_URLS_END`;

		expect(extractVisionImageCandidates(input).map(candidate => candidate.url)).toEqual([
			'https://pbs.twimg.com/media/M1.jpg?name=orig',
			'https://pbs.twimg.com/media/M2.jpg?name=orig',
			'https://pbs.twimg.com/media/M3.jpg?name=orig',
			'https://pbs.twimg.com/media/M4.jpg?name=orig',
			'https://pbs.twimg.com/media/Q1.jpg?name=orig',
			'https://pbs.twimg.com/media/Q2.jpg?name=orig',
			'https://pbs.twimg.com/media/Q3.jpg?name=orig',
			'https://pbs.twimg.com/media/Q4.jpg?name=orig'
		]);
	});

	it('normalizes Twitter media variants to orig and deduplicates by media id', () => {
		const input = `VISION_IMAGE_URLS_START
MAIN_POST_IMAGE_1:
https://pbs.twimg.com/media/AAA?format=jpg&name=small
MAIN_POST_IMAGE_2:
https://pbs.twimg.com/media/AAA?format=jpg&name=large
MAIN_POST_IMAGE_3:
https://pbs.twimg.com/media/BBB?format=png&name=900x900
VISION_IMAGE_URLS_END`;

		expect(extractVisionImageCandidates(input).map(candidate => candidate.url)).toEqual([
			'https://pbs.twimg.com/media/AAA?format=jpg&name=orig',
			'https://pbs.twimg.com/media/BBB?format=png&name=orig'
		]);
	});
});
