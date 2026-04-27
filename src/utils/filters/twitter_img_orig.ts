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

function normalizeTwitterMediaUrlsInText(value: string): string {
	return value.replace(/https?:\/\/pbs\.twimg\.com\/media\/[^\s)\]>"']+/g, match => normalizeTwitterMediaUrl(match));
}

export const twitter_img_orig = (input: string): string => {
	if (!input.trim()) return input;

	try {
		const parsed = JSON.parse(input);
		if (Array.isArray(parsed)) {
			return JSON.stringify(parsed.map(item => typeof item === 'string' ? normalizeTwitterMediaUrlsInText(item) : item));
		}
		if (parsed && typeof parsed === 'object') {
			return JSON.stringify(Object.fromEntries(
				Object.entries(parsed).map(([key, value]) => [
					normalizeTwitterMediaUrl(key),
					typeof value === 'string' ? normalizeTwitterMediaUrlsInText(value) : value
				])
			));
		}
	} catch {
		return normalizeTwitterMediaUrlsInText(input);
	}

	return input;
};
