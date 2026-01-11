export type Provider = 'default' | 'anthropic' | 'openai' | 'google' | 'xai' | 'opencode' | 'ollama' | 'custom';
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
	model: 'claude-sonnet-4-5',
	customApiBaseUrl: '',
	contextWindowLimit: 128000,
	executionMode: 'spawn',
	serverPort: 3000,
	opencodePath: '',
	theme: 'adaptive',
	notifications: true,
	favoriteModels: [
		'anthropic/claude-sonnet-4-5',
		'xai/grok-4-1-fast',
		'google/gemini-3-pro-high'
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

export const PROVIDERS: Record<Provider, { name: string }> = {
	default: { name: 'Default (OpenCode Config)' },
	anthropic: { name: 'Anthropic (Claude)' },
	openai: { name: 'OpenAI (GPT)' },
	google: { name: 'Google (Gemini)' },
	xai: { name: 'xAI (Grok)' },
	opencode: { name: 'OpenCode' },
	ollama: { name: 'Ollama (Local)' },
	custom: { name: 'Custom' }
};


