import { describe, expect, it } from 'vitest';
import { twitter_img_orig } from './twitter_img_orig';

describe('twitter_img_orig filter', () => {
	it('normalizes Twitter media URL lines to name=orig', () => {
		expect(twitter_img_orig([
			'https://pbs.twimg.com/media/AAA?format=jpg&name=small',
			'https://pbs.twimg.com/media/BBB?format=png&name=900x900'
		].join('\n'))).toBe([
			'https://pbs.twimg.com/media/AAA?format=jpg&name=orig',
			'https://pbs.twimg.com/media/BBB?format=png&name=orig'
		].join('\n'));
	});

	it('leaves non-Twitter media URLs unchanged', () => {
		expect(twitter_img_orig('https://example.com/image.jpg?name=small')).toBe('https://example.com/image.jpg?name=small');
	});

	it('normalizes Twitter media URLs inside Markdown image text', () => {
		expect(twitter_img_orig('![Image](https://pbs.twimg.com/media/AAA?format=jpg&name=large)')).toBe(
			'![Image](https://pbs.twimg.com/media/AAA?format=jpg&name=orig)'
		);
	});

	it('normalizes JSON arrays', () => {
		expect(twitter_img_orig(JSON.stringify([
			'https://pbs.twimg.com/media/AAA?format=jpg&name=large'
		]))).toBe(JSON.stringify([
			'https://pbs.twimg.com/media/AAA?format=jpg&name=orig'
		]));
	});
});
