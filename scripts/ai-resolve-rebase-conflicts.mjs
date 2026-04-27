#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const DEFAULT_BASE_URL = 'https://api.fireworks.ai/inference/v1';
const DEFAULT_MODEL = 'accounts/fireworks/routers/kimi-k2p5-turbo';
const STATE_DIR = '.sync-state';

const allowlist = [
	'src/utils/interpreter.ts',
	'src/utils/interpreter-job-manager.ts',
	'src/utils/llm/',
	'src/utils/media/',
	'src/managers/interpreter-settings.ts',
	'src/core/popup.ts',
	'src/background.ts',
	'src/types/types.ts',
	'src/utils/obsidian-note-creator.ts',
	'src/settings.html',
	'src/popup.html',
	'src/styles/interpreter.scss',
	'src/manifest.firefox.json',
	'src/utils/import-export.ts',
	'src/managers/template-manager.ts'
];

const hardRefuse = [
	'.github/workflows/',
	'package.json',
	'package-lock.json',
	'scripts/sync-upstream-ci.sh',
	'scripts/ai-resolve-rebase-conflicts.mjs',
	'scripts/prepare-firefox-amo.mjs',
	'scripts/generate-firefox-update-manifest.mjs'
];

function git(args, options = {}) {
	return execFileSync('git', args, { encoding: 'utf8', ...options }).trim();
}

function normalize(file) {
	return file.replaceAll('\\', '/');
}

function isAllowed(file) {
	const normalized = normalize(file);
	if (hardRefuse.some(entry => normalized === entry || normalized.startsWith(entry))) return false;
	if (allowlist.some(entry => normalized === entry || normalized.startsWith(entry))) return true;
	if (!normalized.endsWith('.test.ts')) return false;
	const testBase = path.basename(normalized).replace(/\.test\.ts$/, '');
	return allowlist.some(entry => {
		if (entry.endsWith('/')) return normalized.startsWith(entry) && normalized.endsWith('.test.ts');
		return path.basename(entry).replace(/\.ts$/, '') === testBase;
	});
}

function readIfExists(file) {
	return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function stripFences(value) {
	return value.replace(/^```[a-zA-Z0-9_-]*\s*/, '').replace(/\s*```$/, '');
}

function extractContent(responseText) {
	try {
		const parsed = JSON.parse(responseText);
		const content = parsed.choices?.[0]?.message?.content;
		if (!content) throw new Error('response did not contain choices[0].message.content');
		return stripFences(content);
	} catch (error) {
		throw new Error(`Failed to parse AI response: ${error.message}`);
	}
}

fs.mkdirSync(STATE_DIR, { recursive: true });

const conflictedFiles = git(['diff', '--name-only', '--diff-filter=U'])
	.split(/\r?\n/)
	.map(Boolean);

if (conflictedFiles.length === 0) {
	fs.writeFileSync(path.join(STATE_DIR, 'ai-resolution-summary.md'), '# AI resolution\n\nNo conflicted files were found.\n');
	console.log('No conflicted files found.');
	process.exit(0);
}

const disallowed = conflictedFiles.filter(file => !isAllowed(file));
if (disallowed.length > 0) {
	const summary = [
		'# AI resolution refused',
		'',
		'Conflicts outside the AI allowlist require human review:',
		'',
		...disallowed.map(file => `- ${file}`),
		''
	].join('\n');
	fs.writeFileSync(path.join(STATE_DIR, 'ai-resolution-summary.md'), summary);
	throw new Error(`Refusing to resolve disallowed conflicted files: ${disallowed.join(', ')}`);
}

const apiKey = process.env.AI_API_KEY;
if (!apiKey) {
	throw new Error('AI_API_KEY is required for AI conflict resolution.');
}

const baseUrl = (process.env.AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
const model = process.env.AI_MODEL || DEFAULT_MODEL;
const endpoint = `${baseUrl}/chat/completions`;

const forkMaintenance = readIfExists('FORK_MAINTENANCE.md');
const syncStrategy = readIfExists('docs/UPSTREAM_SYNC_STRATEGY.md');
const touched = [];

for (const file of conflictedFiles) {
	const content = fs.readFileSync(file, 'utf8');
	const prompt = [
		'Resolve this git rebase conflict by returning the full replacement file content only.',
		'Do not wrap the answer in Markdown fences. Do not include explanations.',
		'Preserve the custom interpreter workflow.',
		'Preserve advanced provider/model API parameters.',
		'Preserve background interpreter job persistence.',
		'Preserve image/media attachment behavior.',
		'Preserve template import/export custom fields.',
		'Preserve Firefox custom add-on identity.',
		'Preserve custom Firefox update URL behavior.',
		'Prefer adapting custom code to upstream APIs instead of reverting upstream changes.',
		'Keep changes minimal.',
		'Do not invent large new systems.',
		'Do not remove tests.',
		'Do not weaken permissions intentionally.',
		'If unsure, leave conflict markers so the script fails and requires human review.',
		'',
		`File: ${file}`,
		'',
		'FORK_MAINTENANCE.md:',
		forkMaintenance.slice(0, 12000),
		'',
		'docs/UPSTREAM_SYNC_STRATEGY.md:',
		syncStrategy.slice(0, 12000),
		'',
		'Conflicted file content:',
		content
	].join('\n');

	const body = {
		model,
		temperature: 0.1,
		max_tokens: 32768,
		messages: [
			{ role: 'system', content: 'You are a careful senior engineer resolving git rebase conflicts in a browser extension fork. Return only complete file contents.' },
			{ role: 'user', content: prompt }
		]
	};

	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			Accept: 'application/json'
		},
		body: JSON.stringify(body)
	});

	const responseText = await response.text();
	if (!response.ok) {
		throw new Error(`AI request failed with HTTP ${response.status}: ${responseText.slice(0, 500)}`);
	}

	const resolved = extractContent(responseText);
	if (/<<<<<<<|=======|>>>>>>>/.test(resolved)) {
		throw new Error(`AI output for ${file} still contains conflict markers.`);
	}

	fs.writeFileSync(file, resolved);
	git(['add', file]);
	touched.push(file);
}

const remaining = git(['diff', '--name-only', '--diff-filter=U'])
	.split(/\r?\n/)
	.map(Boolean);

let rebaseContinue = 'not-needed';
if (remaining.length === 0) {
	const result = spawnSync('git', ['rebase', '--continue'], {
		stdio: 'inherit',
		env: { ...process.env, GIT_EDITOR: 'true' }
	});
	rebaseContinue = result.status === 0 ? 'succeeded' : `failed (${result.status})`;
	if (result.status !== 0) process.exitCode = result.status || 1;
}

fs.writeFileSync(path.join(STATE_DIR, 'ai-resolution-summary.md'), [
	'# AI resolution summary',
	'',
	`- Model: ${model}`,
	`- Endpoint: ${baseUrl}/chat/completions`,
	`- Files touched: ${touched.length}`,
	...touched.map(file => `  - ${file}`),
	`- git rebase --continue: ${rebaseContinue}`,
	''
].join('\n'));

console.log(`AI conflict resolution touched ${touched.length} file(s).`);
