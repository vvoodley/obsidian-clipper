import { defineConfig } from 'vitest/config';

export default defineConfig({
	define: {
		DEBUG_MODE: false,
	},
	test: {
		include: ['src/**/*.test.ts'],
		globals: true,
		setupFiles: ['src/utils/test/setup-timezone.ts'],
		alias: {
			'webextension-polyfill': new URL('./src/utils/__mocks__/webextension-polyfill.ts', import.meta.url).pathname,
		},
	},
});
