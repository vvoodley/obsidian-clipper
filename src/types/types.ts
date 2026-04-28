import type { VisionImageSource } from '../utils/media/image-types';

export interface Template {
	id: string;
	name: string;
	behavior: 'create' | 'append-specific' | 'append-daily' | 'prepend-specific' | 'prepend-daily' | 'overwrite';
	noteNameFormat: string;
	path: string;
	noteContentFormat: string;
	properties: Property[];
	triggers?: string[];
	vault?: string;
	context?: string;
}

export interface Property {
	id?: string;
	name: string;
	value: string;
	type?: string;
}

export interface ExtractedContent {
	[key: string]: string;
}

export type FilterFunction = (value: string, param?: string) => string | any[];

export interface PromptVariable {
	key: string;
	prompt: string;
	filters?: string;
}

export interface PropertyType {
	name: string;
	type: string;
	defaultValue?: string;
}

export interface Provider {
	id: string;
	name: string;
	baseUrl: string;
	apiKey: string;
	apiKeyRequired?: boolean;
	presetId?: string;
}

export type VisionImageMode = 'none' | 'url' | 'data_url' | 'auto';

export interface Rating {
	rating: number;
	date: string;
}

export type SaveBehavior = 'addToObsidian' | 'saveFile' | 'copyToClipboard';

export interface ReaderSettings {
	fontSize: number;
	lineHeight: number;
	maxWidth: number;
	lightTheme: string;
	darkTheme: string;
	appearance: 'auto' | 'light' | 'dark';
	fonts: string[];
	defaultFont: string;
	blendImages: boolean;
	colorLinks: boolean;
	followLinks: boolean;
	pinPlayer: boolean;
	autoScroll: boolean;
	highlightActiveLine: boolean;
	customCss: string;
}

export interface Settings {
	vaults: string[];
	showMoreActionsButton: boolean;
	betaFeatures: boolean;
	legacyMode: boolean;
	silentOpen: boolean;
	closeTabAfterInterpreterAdd: boolean;
	openBehavior: 'popup' | 'embedded' | 'reader';
	highlighterEnabled: boolean;
	alwaysShowHighlights: boolean;
	highlightBehavior: string;
	interpreterModel?: string;
	models: ModelConfig[];
	providers: Provider[];
	interpreterEnabled: boolean;
	interpreterAutoRun: boolean;
	defaultPromptContext: string;
	propertyTypes: PropertyType[];
	readerSettings: ReaderSettings;
	stats: {
		addToObsidian: number;
		saveFile: number;
		copyToClipboard: number;
		share: number;
	};
	history: HistoryEntry[];
	ratings: Rating[];
	saveBehavior: 'addToObsidian' | 'saveFile' | 'copyToClipboard';
}

export interface ModelConfig {
	id: string;
	providerId: string;
	providerModelId: string;
	name: string;
	enabled: boolean;
	extraRequestBody?: Record<string, unknown>;
	visionEnabled?: boolean;
	visionImageMode?: VisionImageMode;
	maxVisionImages?: number;
	maxVisionImageBytes?: number;
	visionBatchingEnabled?: boolean;
	visionBatchSize?: number;
}

export type InterpreterJobStatus = 'queued' | 'running' | 'completed' | 'saved' | 'error';

export type InterpreterJobPhase =
	| 'queued'
	| 'capturing'
	| 'validating'
	| 'planning_vision'
	| 'describing_vision_batches'
	| 'sending_to_provider'
	| 'waiting_for_provider'
	| 'synthesizing_note'
	| 'parsing_response'
	| 'building_note'
	| 'saving_to_obsidian'
	| 'closing_tab'
	| 'done'
	| 'error';

export interface VisionBatchImageResult {
	source: VisionImageSource;
	index?: number;
	url: string;
	inspected: boolean;
	status: 'described' | 'failed' | 'skipped';
	mediaType?: string;
	description?: string;
	visibleText?: string;
	uncertainty?: string;
	error?: string;
}

export interface VisionBatchResult {
	batchIndex: number;
	totalBatches: number;
	attempts: number;
	startedAt: string;
	completedAt?: string;
	images: VisionBatchImageResult[];
	error?: string;
}

export interface MediaDiagnostics {
	imageCandidateCount?: number;
	imageInspectedCount?: number;
	imageSkippedCount?: number;
	imageFailedCount?: number;
	videoCandidateCount?: number;
	hasVideoCandidates?: boolean;
	deterministicTags?: string[];
	warnings?: string[];
}

export interface InterpreterJobSnapshot {
	tabId: number;
	url: string;
	title?: string;
	templateId: string;
	templateName: string;
	modelId: string;
	vault: string;
	path: string;
	noteName: string;
	noteContent: string;
	properties: Property[];
	behavior: Template['behavior'];
	promptContext: string;
	variables: Record<string, string>;
	createdAt: string;
}

export interface InterpreterJob {
	id: string;
	runId: string;
	sessionKey: string;
	key: string;
	status: InterpreterJobStatus;
	phase?: InterpreterJobPhase;
	snapshot: InterpreterJobSnapshot;
	addToObsidianWhenDone: boolean;
	closeTabAfterSave?: boolean;
	closeTabError?: string;
	startedAt?: string;
	updatedAt?: string;
	lastHeartbeatAt?: string;
	completedAt?: string;
	savedAt?: string;
	error?: string;
	metrics?: {
		providerName?: string;
		modelName?: string;
		promptContextChars?: number;
		contentChars?: number;
		promptVariableCount?: number;
		requestStartedAt?: string;
		responseReceivedAt?: string;
		responseChars?: number;
		saveStartedAt?: string;
		savedAt?: string;
		visionEnabled?: boolean;
		visionCandidateCount?: number;
		visionAttachedCount?: number;
		visionImageMode?: VisionImageMode;
		visionSources?: string[];
		visionImageCountBySource?: Record<string, number>;
		visionWarnings?: string[];
		providerRequestCount?: number;
		visionBatchingEnabled?: boolean;
		visionBatchCount?: number;
		visionBatchSize?: number;
		visionBatchFailures?: number;
		visionBatchRetries?: number;
		finalSynthesisResponseChars?: number;
	};
	visionBatchResults?: VisionBatchResult[];
	mediaDiagnostics?: MediaDiagnostics;
	promptResponses?: any[];
	interpreted?: {
		noteName: string;
		path: string;
		noteContent: string;
		properties: Property[];
		fileContent?: string;
	};
}

export interface HistoryEntry {
	datetime: string;
	url: string;
	action: 'addToObsidian' | 'saveFile' | 'copyToClipboard' | 'share';
	title?: string;
	vault?: string;
	path?: string;
}

export interface ConversationMessage {
	author: string;
	content: string;
	timestamp?: string;
	metadata?: Record<string, any>;
}

export interface ConversationMetadata {
	title?: string;
	description?: string;
	site: string;
	url: string;
	messageCount: number;
	startTime?: string;
	endTime?: string;
}

export interface Footnote {
	url: string;
	text: string;
}
