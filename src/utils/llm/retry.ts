export interface RetryOptions {
	maxAttempts?: number;
	initialBackoffMs?: number;
	maxBackoffMs?: number;
	retryLabel?: string;
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export function isRetryableProviderError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error || '');
	if (/401|403|api key|authentication|unauthorized|forbidden|unsupported provider/i.test(message)) return false;
	return /networkerror|failed to fetch|load failed|timeout|timed out|408|429|5\d\d|rate limit|temporarily unavailable|service unavailable|malformed json|invalid json|failed to parse|could not parse|no json object/i.test(message);
}

export async function withProviderRetries<T>(
	operation: (attempt: number) => Promise<T>,
	options: RetryOptions = {}
): Promise<{ result: T; attempts: number }> {
	const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
	const initialBackoffMs = Math.max(0, options.initialBackoffMs ?? 1000);
	const maxBackoffMs = Math.max(initialBackoffMs, options.maxBackoffMs ?? 15000);
	let lastError: unknown;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return { result: await operation(attempt), attempts: attempt };
		} catch (error) {
			lastError = error;
			if (error && typeof error === 'object') {
				(error as { attempts?: number }).attempts = attempt;
			}
			if (attempt >= maxAttempts || !isRetryableProviderError(error)) {
				throw error;
			}
			const baseDelay = Math.min(maxBackoffMs, initialBackoffMs * Math.pow(2, attempt - 1));
			const jitter = Math.floor(Math.random() * Math.min(500, Math.max(1, baseDelay)));
			await sleep(baseDelay + jitter);
		}
	}

	throw lastError;
}
