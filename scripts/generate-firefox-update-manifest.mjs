#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_OUTPUT = 'public/firefox/updates.json';
const DEFAULT_ADDON_ID = 'obsidian-clipper-vvoodley@vvoodley.github.io';

function getArg(name) {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

const metadataPath = getArg('--metadata') || '.firefox-build/metadata.json';
const outputPath = getArg('--output') || process.env.FIREFOX_UPDATE_MANIFEST_OUTPUT || DEFAULT_OUTPUT;
const updateLink = getArg('--update-link') || process.env.SIGNED_XPI_URL || process.env.RELEASE_ASSET_URL;

if (!fs.existsSync(metadataPath)) {
	throw new Error(`Firefox build metadata not found: ${metadataPath}`);
}
if (!updateLink) {
	throw new Error('Missing signed XPI URL. Pass --update-link or set SIGNED_XPI_URL.');
}
if (!updateLink.startsWith('https://')) {
	throw new Error(`Update link must start with https://: ${updateLink}`);
}
if (!/\.xpi(?:\?|$)/.test(updateLink)) {
	throw new Error(`Update link must point to a .xpi release asset: ${updateLink}`);
}

const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
const addonId = metadata.addon_id || process.env.FIREFOX_CUSTOM_ADDON_ID || DEFAULT_ADDON_ID;
const version = metadata.version;

if (!version) {
	throw new Error('Firefox build metadata is missing version.');
}

const manifest = {
	addons: {
		[addonId]: {
			updates: [
				{
					version,
					update_link: updateLink
				}
			]
		}
	}
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Wrote Firefox update manifest: ${outputPath}`);
console.log(`  Add-on ID: ${addonId}`);
console.log(`  Version: ${version}`);
console.log(`  Update link: ${updateLink}`);
