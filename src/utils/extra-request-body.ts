const BLOCKED_EXTRA_REQUEST_BODY_KEYS = new Set(['messages', 'model']);

export interface ExtraRequestBodyValidationResult {
	value?: Record<string, unknown>;
	error?: string;
}

export function validateExtraRequestBodyJson(json: string): ExtraRequestBodyValidationResult {
	const trimmedJson = json.trim();
	if (!trimmedJson) {
		return {};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmedJson);
	} catch {
		return { error: 'Extra API parameters JSON must be valid JSON.' };
	}

	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return { error: 'Extra API parameters JSON must be a JSON object.' };
	}

	const blockedKeys = Object.keys(parsed).filter(key => BLOCKED_EXTRA_REQUEST_BODY_KEYS.has(key));
	if (blockedKeys.length > 0) {
		return { error: `Extra API parameters JSON cannot include reserved keys: ${blockedKeys.join(', ')}.` };
	}

	return { value: parsed as Record<string, unknown> };
}

export function mergeExtraRequestBody(
	requestBody: Record<string, unknown>,
	extraRequestBody?: Record<string, unknown>
): Record<string, unknown> {
	if (!extraRequestBody) {
		return requestBody;
	}

	const sanitizedExtra: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(extraRequestBody)) {
		if (BLOCKED_EXTRA_REQUEST_BODY_KEYS.has(key)) {
			console.warn(`Ignoring blocked extra request body key: ${key}`);
			continue;
		}
		sanitizedExtra[key] = value;
	}

	return {
		...requestBody,
		...sanitizedExtra
	};
}
