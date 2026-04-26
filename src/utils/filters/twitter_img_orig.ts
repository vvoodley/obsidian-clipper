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

export const twitter_img_orig = (input: string): string => {
	if (!input.trim()) return input;

	try {
		const parsed = JSON.parse(input);
		if (Array.isArray(parsed)) {
			return JSON.stringify(parsed.map(item => typeof item === 'string' ? normalizeTwitterMediaUrl(item) : item));
		}
		if (parsed && typeof parsed === 'object') {
			return JSON.stringify(Object.fromEntries(
				Object.entries(parsed).map(([key, value]) => [
					normalizeTwitterMediaUrl(key),
					typeof value === 'string' ? normalizeTwitterMediaUrl(value) : value
				])
			));
		}
	} catch {
		return input
			.split(/\r?\n/)
			.map(line => normalizeTwitterMediaUrl(line))
			.join('\n');
	}

	return input;
};
