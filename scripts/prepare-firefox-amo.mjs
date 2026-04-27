#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ADDON_ID = 'obsidian-clipper-vvoodley@vvoodley.github.io';
const DEFAULT_ADDON_NAME = 'Obsidian Web Clipper VVood';
const DEFAULT_UPDATE_URL = 'https://vvoodley.github.io/obsidian-clipper/firefox/updates.json';
const OFFICIAL_ADDON_ID = 'clipper@obsidian.md';

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function getBuildNumber() {
	const raw = process.env.CUSTOM_FIREFOX_BUILD || process.env.GITHUB_RUN_NUMBER || String(Math.floor(Date.now() / 1000));
	const normalized = raw.replace(/\D+/g, '');
	if (!normalized) throw new Error('CUSTOM_FIREFOX_BUILD must contain at least one digit');
	return normalized;
}

function getBaseVersion(manifest, pkg) {
	const base = manifest.version || pkg.version;
	if (!/^\d+(?:\.\d+){0,2}$/.test(base)) {
		throw new Error(`Unsupported base version "${base}". Expected x, x.y, or x.y.z.`);
	}
	return base;
}

const manifestPath = path.resolve('dist_firefox/manifest.json');
const packagePath = path.resolve('package.json');

if (!fs.existsSync(manifestPath)) {
	throw new Error('dist_firefox/manifest.json not found. Run npm run build:firefox first.');
}

const manifest = readJson(manifestPath);
const pkg = readJson(packagePath);

const addonId = process.env.FIREFOX_CUSTOM_ADDON_ID || DEFAULT_ADDON_ID;
const addonName = process.env.FIREFOX_CUSTOM_ADDON_NAME || DEFAULT_ADDON_NAME;
const updateUrl = process.env.FIREFOX_UPDATE_URL || DEFAULT_UPDATE_URL;
const version = `${getBaseVersion(manifest, pkg)}.${getBuildNumber()}`;

if (addonId === OFFICIAL_ADDON_ID) {
	throw new Error(`Refusing to use official Obsidian add-on ID: ${OFFICIAL_ADDON_ID}`);
}
if (!/^https:\/\/.+\/updates\.json$/.test(updateUrl)) {
	throw new Error(`Firefox update URL must be an HTTPS updates.json URL: ${updateUrl}`);
}

manifest.name = addonName;
manifest.version = version;
manifest.browser_specific_settings = manifest.browser_specific_settings || {};
manifest.browser_specific_settings.gecko = manifest.browser_specific_settings.gecko || {};
manifest.browser_specific_settings.gecko.id = addonId;
manifest.browser_specific_settings.gecko.update_url = updateUrl;

if (manifest.browser_specific_settings.gecko.id === OFFICIAL_ADDON_ID) {
	throw new Error('Patched manifest still contains official add-on ID.');
}
if (updateUrl === DEFAULT_UPDATE_URL && manifest.browser_specific_settings.gecko.update_url !== DEFAULT_UPDATE_URL) {
	throw new Error(`Patched manifest update_url must be ${DEFAULT_UPDATE_URL}`);
}

writeJson(manifestPath, manifest);

const xpiBasename = `obsidian-web-clipper-vvood-${version}.xpi`;
writeJson('.firefox-build/metadata.json', {
	addon_id: addonId,
	addon_name: addonName,
	version,
	update_url: updateUrl,
	xpi_basename: xpiBasename
});

console.log('Prepared Firefox AMO manifest');
console.log(`  Add-on ID: ${addonId}`);
console.log(`  Name: ${addonName}`);
console.log(`  Version: ${version}`);
console.log(`  Update URL: ${updateUrl}`);
console.log(`  Suggested XPI basename: ${xpiBasename}`);
