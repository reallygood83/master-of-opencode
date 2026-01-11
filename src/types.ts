export type Provider = 'default' | 'anthropic' | 'openai' | 'google' | 'ollama' | 'custom';
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
	provider: 'default',
	model: 'claude-3-5-sonnet-latest',
	customApiBaseUrl: '',
	contextWindowLimit: 128000,
	executionMode: 'spawn',
	serverPort: 3000,
	opencodePath: '',
	theme: 'adaptive',
	notifications: true,
	favoriteModels: [
		'anthropic/claude-3-5-sonnet-latest',
		'openai/gpt-4o',
		'google/gemini-2.5-flash-exp'
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
	default: {
		name: 'Default (OpenCode Config)',
		models: []
	},
	anthropic: {
		name: 'Anthropic',
		models: [
			'claude-3-5-sonnet-latest',
			'claude-3-5-sonnet-20241022',
			'claude-3-5-haiku-latest',
			'claude-3-opus-latest',
			'claude-3-opus-20240229',
			'claude-3-sonnet-20240229',
			'claude-3-haiku-20240307',
			'claude-3-5-sonnet-20240620',
			'claude-3-5-haiku-20241022'
		]
	},
	openai: {
		name: 'OpenAI',
		models: [
			'gpt-4o',
			'gpt-4o-mini',
			'gpt-4-turbo',
			'gpt-4',
			'gpt-4-turbo-preview',
			'gpt-3.5-turbo',
			'o1-preview',
			'o1-mini',
			'gpt-4o-2024-11-20',
			'gpt-4o-mini-2024-07-18'
		]
	},
	google: {
		name: 'Google',
		models: [
			'gemini-2.5-flash-exp',
			'gemini-2.0-flash-exp',
			'gemini-1.5-pro',
			'gemini-1.5-pro-002',
			'gemini-1.5-flash',
			'gemini-1.5-flash-002',
			'gemini-1.5-flash-8b',
			'gemini-1.5-pro-001',
			'gemini-2.5-pro-exp'
		]
	},
	ollama: {
		name: 'Ollama (Local)',
		models: [
			'llama3.1',
			'llama3.2',
			'llama3.3',
			'codellama',
			'mistral',
			'deepseek-coder',
			'qwen2.5-coder',
			'phi3'
		]
	},
	custom: {
		name: 'Custom',
		models: []
	}
};
