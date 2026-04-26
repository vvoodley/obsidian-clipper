import { describe, expect, it } from 'vitest';
import { buildRemoteVisionImageAttachments } from './image-attachments';

describe('vision image attachments', () => {
	it('preserves source and order for remote URL attachments', () => {
		expect(buildRemoteVisionImageAttachments([
			{ url: 'https://pbs.twimg.com/media/AAA.jpg', source: 'main_post', priority: 1 },
			{ url: 'https://pbs.twimg.com/media/BBB.jpg', source: 'quoted_or_embedded_post', priority: 2 }
		])).toEqual([
			{ sourceUrl: 'https://pbs.twimg.com/media/AAA.jpg', remoteUrl: 'https://pbs.twimg.com/media/AAA.jpg', source: 'main_post' },
			{ sourceUrl: 'https://pbs.twimg.com/media/BBB.jpg', remoteUrl: 'https://pbs.twimg.com/media/BBB.jpg', source: 'quoted_or_embedded_post' }
		]);
	});

	it('does not produce data URLs in URL mode attachments', () => {
		const [attachment] = buildRemoteVisionImageAttachments([
			{ url: 'https://pbs.twimg.com/media/AAA.jpg', source: 'main_post', priority: 1 }
		]);
		expect(attachment.dataUrl).toBeUndefined();
	});
});
