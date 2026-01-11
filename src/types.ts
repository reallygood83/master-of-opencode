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
	model: 'claude-sonnet-4-20250514',
	customApiBaseUrl: '',
	contextWindowLimit: 128000,
	executionMode: 'spawn',
	serverPort: 3000,
	opencodePath: '',
	theme: 'adaptive',
	notifications: true,
	favoriteModels: [
		'anthropic/claude-sonnet-4-20250514',
		'openai/gpt-4o',
		'google/gemini-1.5-pro'
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
			'claude-sonnet-4-20250514',
			'claude-opus-4-20250514',
			'claude-3-5-sonnet-20241022',
			'claude-3-5-haiku-20241022'
		]
	},
	openai: {
		name: 'OpenAI',
		models: [
			'gpt-4o',
			'gpt-4o-mini',
			'gpt-4-turbo',
			'o1-preview',
			'o1-mini'
		]
	},
	google: {
		name: 'Google',
		models: [
			'gemini-1.5-pro',
			'gemini-1.5-flash',
			'gemini-2.0-flash-exp'
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
