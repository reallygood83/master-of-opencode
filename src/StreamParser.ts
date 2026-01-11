import { EventEmitter } from 'events';

export interface OpenCodeEvent {
	type: 'step_start' | 'text' | 'tool_use' | 'step_finish' | 'error';
	timestamp: number;
	sessionID: string;
	part: OpenCodePart;
}

export interface OpenCodePart {
	id: string;
	sessionID: string;
	messageID: string;
	type: string;
	text?: string;
	tool?: string;
	callID?: string;
	state?: ToolState;
	reason?: 'stop' | 'tool-calls' | 'error';
	cost?: number;
	tokens?: TokenUsage;
	time?: { start: number; end: number };
}

export interface ToolState {
	status: 'pending' | 'running' | 'completed' | 'error';
	input?: Record<string, unknown>;
	output?: string;
	title?: string;
	metadata?: Record<string, unknown>;
	error?: string;
}

export interface TokenUsage {
	input: number;
	output: number;
	reasoning: number;
	cache?: { read: number; write: number };
}

export interface ParsedTextEvent {
	type: 'text';
	content: string;
	messageID: string;
}

export interface ParsedToolEvent {
	type: 'tool';
	toolName: string;
	callID: string;
	status: 'pending' | 'running' | 'completed' | 'error';
	input?: Record<string, unknown>;
	output?: string;
	title?: string;
	error?: string;
}

export interface ParsedStepEvent {
	type: 'step_start' | 'step_finish';
	reason?: string;
	tokens?: TokenUsage;
	cost?: number;
}

export interface ParsedSessionEvent {
	type: 'session';
	sessionID: string;
}

export interface ParsedErrorEvent {
	type: 'error';
	message: string;
}

export type ParsedEvent = 
	| ParsedTextEvent 
	| ParsedToolEvent 
	| ParsedStepEvent 
	| ParsedSessionEvent
	| ParsedErrorEvent;

export class StreamParser extends EventEmitter {
	private buffer: string = '';
	private currentSessionID: string | null = null;
	private pendingTools: Map<string, ParsedToolEvent> = new Map();

	constructor() {
		super();
	}

	feed(data: string): void {
		this.buffer += data;
		this.processBuffer();
	}

	private processBuffer(): void {
		const lines = this.buffer.split('\n');
		this.buffer = lines.pop() || '';

		for (const line of lines) {
			if (!line.trim()) continue;
			this.parseLine(line.trim());
		}
	}

	private parseLine(line: string): void {
		try {
			const event = JSON.parse(line) as OpenCodeEvent;
			this.handleEvent(event);
		} catch {
			if (line.trim()) {
				this.emit('event', {
					type: 'text',
					content: line,
					messageID: 'raw'
				} as ParsedTextEvent);
			}
		}
	}

	private handleEvent(event: OpenCodeEvent): void {
		if (event.sessionID && !this.currentSessionID) {
			this.currentSessionID = event.sessionID;
			this.emit('event', {
				type: 'session',
				sessionID: event.sessionID
			} as ParsedSessionEvent);
		}

		switch (event.type) {
			case 'step_start':
				this.emit('event', { type: 'step_start' } as ParsedStepEvent);
				break;

			case 'text':
				if (event.part.text) {
					this.emit('event', {
						type: 'text',
						content: event.part.text,
						messageID: event.part.messageID
					} as ParsedTextEvent);
				}
				break;

			case 'tool_use':
				this.handleToolEvent(event);
				break;

			case 'step_finish':
				this.emit('event', {
					type: 'step_finish',
					reason: event.part.reason,
					tokens: event.part.tokens,
					cost: event.part.cost
				} as ParsedStepEvent);
				break;

			case 'error':
				this.emit('event', {
					type: 'error',
					message: event.part.text || 'Unknown error'
				} as ParsedErrorEvent);
				break;
		}
	}

	private handleToolEvent(event: OpenCodeEvent): void {
		const part = event.part;
		const callID = part.callID || part.id;
		const state = part.state;

		const toolEvent: ParsedToolEvent = {
			type: 'tool',
			toolName: part.tool || 'unknown',
			callID,
			status: state?.status || 'pending',
			input: state?.input,
			output: state?.output,
			title: state?.title,
			error: state?.error
		};

		this.pendingTools.set(callID, toolEvent);
		this.emit('event', toolEvent);
	}

	getSessionID(): string | null {
		return this.currentSessionID;
	}

	reset(): void {
		this.buffer = '';
		this.currentSessionID = null;
		this.pendingTools.clear();
	}

	flush(): void {
		if (this.buffer.trim()) {
			this.parseLine(this.buffer.trim());
			this.buffer = '';
		}
	}
}
