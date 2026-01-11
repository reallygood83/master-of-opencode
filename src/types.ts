export type Provider = 'anthropic' | 'openai' | 'google' | 'ollama' | 'custom';
export type ExecutionMode = 'spawn' | 'server';
export type Theme = 'adaptive' | 'dark' | 'light';

export interface OpenCodeSettings {
	provider: Provider;
	model: string;
	customApiBaseUrl: string;
	contextWindowLimit: number;
	executionMode: ExecutionMode;
	serverPort: number;
	opencodePath: string;
	theme: Theme;
	notifications: boolean;
	favoriteModels: string[];
}

export const DEFAULT_SETTINGS: OpenCodeSettings = {
	provider: 'anthropic',
	model: 'claude-3-5-sonnet-latest',
	customApiBaseUrl: '',
	contextWindowLimit: 128000,
	executionMode: 'spawn',
	serverPort: 3000,
	opencodePath: '/Users/moon/Developer/opencode-patch/opencode/packages/opencode/dist/opencode-darwin-arm64/bin/opencode',
	theme: 'adaptive',
	notifications: true,
	favoriteModels: [
		'anthropic/claude-3-5-sonnet-latest',
		'openai/gpt-4o',
		'google/gemini-2.0-flash-exp'
	]
};

export interface ChatMessage {
	id: string;
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
	timestamp: Date;
	toolName?: string;
	toolStatus?: 'pending' | 'running' | 'completed' | 'error';
	toolInput?: Record<string, unknown>;
	toolOutput?: string;
	toolTitle?: string;
}

export interface ProcessState {
	isRunning: boolean;
	pid: number | null;
	lastError: string | null;
	sessionID: string | null;
}

export interface Conversation {
	id: string;
	title: string;
	messages: ChatMessage[];
	sessionID: string | null;
	createdAt: number;
	updatedAt: number;
}

export interface ToolEvent {
	name: string;
	status: 'pending' | 'running' | 'completed' | 'error';
	title?: string;
	input?: Record<string, unknown>;
	output?: string;
	error?: string;
}

export interface StepFinishEvent {
	reason?: string;
	tokens?: {
		input: number;
		output: number;
		reasoning: number;
		cache?: { read: number; write: number };
	};
	cost?: number;
}

export const PROVIDERS: Record<Provider, { name: string; models: string[] }> = {
	anthropic: {
		name: 'Anthropic',
		models: [
			'claude-3-5-sonnet-latest',
			'claude-3-5-sonnet-20241022',
			'claude-3-5-haiku-latest',
			'claude-3-opus-latest'
		]
	},
	openai: {
		name: 'OpenAI',
		models: [
			'gpt-4o',
			'gpt-4o-mini',
			'o1-preview',
			'o1-mini'
		]
	},
	google: {
		name: 'Google',
		models: [
			'gemini-2.0-flash-exp',
			'gemini-1.5-pro',
			'gemini-1.5-flash'
		]
	},
	ollama: {
		name: 'Ollama (Local)',
		models: [
			'llama3.1',
			'codellama',
			'mistral',
			'deepseek-coder'
		]
	},
	custom: {
		name: 'Custom',
		models: []
	}
};
