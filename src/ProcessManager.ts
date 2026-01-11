import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { OpenCodeSettings, ProcessState, ToolEvent, StepFinishEvent } from './types';
import { StreamParser, ParsedEvent, ParsedTextEvent, ParsedToolEvent, ParsedStepEvent, ParsedSessionEvent, ParsedErrorEvent } from './StreamParser';

export class ProcessManager extends EventEmitter {
	private process: ChildProcess | null = null;
	private settings: OpenCodeSettings;
	private vaultPath: string;
	private state: ProcessState = {
		isRunning: false,
		pid: null,
		lastError: null,
		sessionID: null
	};
	private parser: StreamParser;
	private messageQueue: string[] = [];
	private isProcessingQueue: boolean = false;

	constructor(settings: OpenCodeSettings, vaultPath: string) {
		super();
		this.settings = settings;
		this.vaultPath = vaultPath;
		this.parser = new StreamParser();
		this.setupParserListeners();
	}

	private setupParserListeners(): void {
		this.parser.on('event', (event: ParsedEvent) => {
			switch (event.type) {
				case 'text':
					this.emit('text', (event as ParsedTextEvent).content);
					break;
				case 'tool': {
					const toolEvent = event as ParsedToolEvent;
					const emitEvent: ToolEvent = {
						name: toolEvent.toolName,
						status: toolEvent.status,
						title: toolEvent.title,
						input: toolEvent.input,
						output: toolEvent.output,
						error: toolEvent.error
					};
					this.emit('tool', emitEvent);
					break;
				}
				case 'step_start':
					this.emit('step-start');
					break;
				case 'step_finish': {
					const stepEvent = event as ParsedStepEvent;
					const finishEvent: StepFinishEvent = {
						reason: stepEvent.reason,
						tokens: stepEvent.tokens,
						cost: stepEvent.cost
					};
					this.emit('step-finish', finishEvent);
					break;
				}
				case 'session':
					this.state.sessionID = (event as ParsedSessionEvent).sessionID;
					this.emit('session', this.state.sessionID);
					break;
				case 'error':
					this.emit('parse-error', (event as ParsedErrorEvent).message);
					break;
			}
		});
	}

	updateSettings(settings: OpenCodeSettings): void {
		this.settings = settings;
	}

	getState(): ProcessState {
		return { ...this.state };
	}

	async findOpenCodePath(): Promise<string> {
		if (this.settings.opencodePath) {
			return this.settings.opencodePath;
		}

		const possiblePaths = [
			'/opt/homebrew/bin/opencode',
			'/usr/local/bin/opencode',
			'/usr/bin/opencode',
			process.env.HOME + '/.local/bin/opencode',
			process.env.HOME + '/Developer/opencode-patch/opencode/packages/opencode/dist/opencode-darwin-arm64/bin/opencode'
		];

		for (const path of possiblePaths) {
			try {
				const { exec } = await import('child_process');
				const { promisify } = await import('util');
				const execAsync = promisify(exec);
				await execAsync(`"${path}" --version`);
				return path;
			} catch {
				continue;
			}
		}

		return 'opencode';
	}

	async start(): Promise<void> {
		this.state.isRunning = true;
		this.emit('started', this.state);
	}

	async sendMessage(message: string): Promise<void> {
		this.messageQueue.push(message);
		if (!this.isProcessingQueue) {
			await this.processQueue();
		}
	}

	private async processQueue(): Promise<void> {
		if (this.messageQueue.length === 0) {
			this.isProcessingQueue = false;
			return;
		}

		this.isProcessingQueue = true;
		const message = this.messageQueue.shift()!;

		try {
			await this.executeMessage(message);
		} catch (error) {
			this.emit('error', error instanceof Error ? error.message : String(error));
		}

		await this.processQueue();
	}

	private async executeMessage(message: string): Promise<void> {
		const opencodePath = await this.findOpenCodePath();
		const modelArg = `${this.settings.provider}/${this.settings.model}`;

		const args = [
			'run',
			'--format', 'json',
			'-m', modelArg,
			message
		];

		if (this.state.sessionID) {
			args.push('-s', this.state.sessionID);
		}

		const env: NodeJS.ProcessEnv = { ...process.env, TERM: 'dumb', NO_COLOR: '1' };
		if (this.settings.customApiBaseUrl) {
			env['OPENAI_BASE_URL'] = this.settings.customApiBaseUrl;
		}

		return new Promise((resolve, reject) => {
			this.parser.reset();
			
			this.process = spawn(opencodePath, args, {
				cwd: this.vaultPath,
				env,
				stdio: ['pipe', 'pipe', 'pipe']
			});

			this.state.isRunning = true;
			this.state.pid = this.process.pid || null;
			this.state.lastError = null;
			this.emit('running', this.state);

			this.process.stdout?.on('data', (data: Buffer) => {
				this.parser.feed(data.toString());
			});

			this.process.stderr?.on('data', (data: Buffer) => {
				const errorText = data.toString();
				console.error('OpenCode stderr:', errorText);
				this.emit('stderr', errorText);
			});

			this.process.on('exit', (code, signal) => {
				this.parser.flush();
				this.state.isRunning = false;
				this.state.pid = null;
				this.process = null;

				if (code !== 0 && code !== null) {
					this.state.lastError = `Process exited with code ${code}`;
					reject(new Error(this.state.lastError));
				} else {
					resolve();
				}

				this.emit('exit', { code, signal });
			});

			this.process.on('error', (error) => {
				this.state.lastError = error.message;
				this.state.isRunning = false;
				this.emit('error', error);
				reject(error);
			});
		});
	}

	async stop(): Promise<void> {
		if (!this.process || !this.state.isRunning) {
			return;
		}

		return new Promise((resolve) => {
			this.process?.on('exit', () => {
				resolve();
			});

			this.process?.kill('SIGTERM');

			setTimeout(() => {
				if (this.process && this.state.isRunning) {
					this.process.kill('SIGKILL');
				}
				resolve();
			}, 3000);
		});
	}

	async restart(): Promise<void> {
		await this.stop();
		this.parser.reset();
		this.state.sessionID = null;
		await this.start();
	}

	clearSession(): void {
		this.state.sessionID = null;
		this.parser.reset();
	}
}
