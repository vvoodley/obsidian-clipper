import type { MediaDiagnostics, VisionBatchResult } from '../../types/types';

function formatValue(value: string | undefined): string {
	return value && value.trim() ? value.trim() : 'None captured.';
}

export function formatVisionBatchResultsForPrompt(results: VisionBatchResult[]): string {
	if (results.length === 0) return '';
	const lines = ['BATCHED_VISION_NOTES_START', ''];
	for (const result of results) {
		lines.push(`Batch ${result.batchIndex} of ${result.totalBatches}`);
		if (result.error) lines.push(`Batch error: ${result.error}`);
		for (let index = 0; index < result.images.length; index++) {
			const image = result.images[index];
			lines.push(`Image ${index + 1}`);
			lines.push(`Source: ${image.source}`);
			if (image.index !== undefined) lines.push(`Index: ${image.index}`);
			lines.push(`URL: ${image.url}`);
			lines.push(`Status: ${image.status}`);
			lines.push(`Inspected: ${image.inspected ? 'true' : 'false'}`);
			lines.push(`Media type: ${formatValue(image.mediaType)}`);
			lines.push(`Description: ${formatValue(image.description)}`);
			lines.push(`Visible text: ${formatValue(image.visibleText)}`);
			lines.push(`Uncertainty: ${formatValue(image.uncertainty)}`);
			if (image.error) lines.push(`Error: ${image.error}`);
			lines.push('');
		}
	}
	lines.push('BATCHED_VISION_NOTES_END');
	return lines.join('\n');
}

export function formatMediaDiagnosticsForPrompt(diagnostics?: MediaDiagnostics): string {
	if (!diagnostics) return '';
	const lines = [
		'MEDIA_DIAGNOSTICS_START',
		`Image candidates found: ${diagnostics.imageCandidateCount ?? 0}`,
		`Images inspected by vision: ${diagnostics.imageInspectedCount ?? 0}`,
		`Images failed: ${diagnostics.imageFailedCount ?? 0}`,
		`Images skipped: ${diagnostics.imageSkippedCount ?? 0}`,
		`Video candidates found: ${diagnostics.videoCandidateCount ?? 0}`,
		'Deterministic follow-up tags:'
	];
	for (const tag of diagnostics.deterministicTags || []) {
		lines.push(`- ${tag}`);
	}
	if (diagnostics.warnings?.length) {
		lines.push('Warnings:');
		for (const warning of diagnostics.warnings) lines.push(`- ${warning}`);
	}
	lines.push('MEDIA_DIAGNOSTICS_END');
	return lines.join('\n');
}

export function appendVisionBatchResultsToPromptContext(
	promptContext: string,
	results: VisionBatchResult[],
	diagnostics?: MediaDiagnostics
): string {
	const blocks = [
		promptContext,
		formatVisionBatchResultsForPrompt(results),
		formatMediaDiagnosticsForPrompt(diagnostics)
	].filter(block => block.trim().length > 0);
	return blocks.join('\n\n');
}
