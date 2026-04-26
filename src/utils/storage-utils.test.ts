import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from './browser-polyfill';

vi.mock('core/popup', () => ({
	copyToClipboard: vi.fn()
}));

let syncStorageMock: Record<string, any>;

beforeEach(() => {
	vi.restoreAllMocks();
	syncStorageMock = {};
	vi.spyOn(browser.storage.sync, 'get').mockImplementation(async () => syncStorageMock);
	vi.spyOn(browser.storage.sync, 'set').mockImplementation(async (value: Record<string, any>) => {
		syncStorageMock = { ...syncStorageMock, ...value };
	});
});

describe('closeTabAfterInterpreterAdd setting', () => {
	it('defaults to false', async () => {
		const { loadSettings } = await import('./storage-utils');

		const settings = await loadSettings();

		expect(settings.closeTabAfterInterpreterAdd).toBe(false);
	});

	it('persists true and false values', async () => {
		const { loadSettings, saveSettings } = await import('./storage-utils');

		await loadSettings();
		await saveSettings({ closeTabAfterInterpreterAdd: true });
		expect(syncStorageMock.general_settings.closeTabAfterInterpreterAdd).toBe(true);

		await saveSettings({ closeTabAfterInterpreterAdd: false });
		expect(syncStorageMock.general_settings.closeTabAfterInterpreterAdd).toBe(false);
	});
});
