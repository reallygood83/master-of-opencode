import { spawn, exec, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import { OpenCodeSettings, ProcessState, ToolEvent, StepFinishEvent } from './types';
import { StreamParser, ParsedEvent, ParsedTextEvent, ParsedToolEvent, ParsedStepEvent, ParsedSessionEvent, ParsedErrorEvent } from './StreamParser';

const execAsync = promisify(exec);
const access = fs.promises.access;
const { constants } = fs;

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
		if (this.settings.opencodePath && this.settings.opencodePath.trim() !== '') {
			return this.settings.opencodePath;
		}

		const possiblePaths = [
			'/opt/homebrew/bin/opencode',
			'/usr/local/bin/opencode',
			'/usr/bin/opencode',
			`${process.env.HOME}/.local/bin/opencode`,
			`${process.env.HOME}/bin/opencode`,
			`${process.env.HOME}/Developer/opencode-patch/opencode/packages/opencode/dist/opencode-darwin-arm64/bin/opencode`
		];

		// Check explicit paths first using fs (more reliable than exec ls)
		for (const path of possiblePaths) {
			try {
				await access(path, constants.X_OK);
				return path;
			} catch {
				continue;
			}
		}

		// Fallback to 'which' to check PATH
		try {
			const { stdout } = await execAsync('which opencode');
			if (stdout && stdout.trim()) {
				return stdout.trim();
			}
		} catch (e) {
			// Ignore
		}

		return 'opencode';
	}

	async installOpenCode(): Promise<{ success: boolean; message: string; path?: string }> {
		try {
			await execAsync('npm install -g @opencode/cli', { timeout: 120000 });
			const { stdout } = await execAsync('which opencode');
			const path = stdout.trim();

			if (path) {
				return {
					success: true,
					message: 'OpenCode CLI installed successfully via npm',
					path
				};
			} else {
				return {
					success: false,
					message: 'Installation completed but executable not found in PATH'
				};
			}
		} catch (npmError) {
			try {
				await execAsync('curl -fsSL https://install.opencode.ai | sh', { timeout: 120000 });
				const { stdout } = await execAsync('which opencode');
				const path = stdout.trim();

				if (path) {
					return {
						success: true,
						message: 'OpenCode CLI installed successfully via installer script',
						path
					};
				} else {
					return {
						success: false,
						message: 'Installation completed but executable not found in PATH'
					};
				}
			} catch (curlError) {
				return {
					success: false,
					message: `Failed to install OpenCode CLI. Please install manually from https://opencode.ai or run: npm install -g @opencode/cli`
				};
			}
		}
	}

	async checkOpenCodeInstalled(): Promise<{ installed: boolean; version?: string; path?: string; error?: string }> {
		try {
			const path = await this.findOpenCodePath();
			const { stdout } = await execAsync(`"${path}" --version`);

			return {
				installed: true,
				version: stdout.trim(),
				path
			};
		} catch (error) {
			return { installed: false, error: error instanceof Error ? error.message : String(error) };
		}
	}

	async getAvailableModels(): Promise<string[]> {
		try {
			const path = await this.findOpenCodePath();
			const { stdout } = await execAsync(`"${path}" models`, { timeout: 30000 });

			const models = stdout
				.trim()
				.split('\n')
				.map(line => line.trim())
				.filter(line => line.length > 0);

			return models;
		} catch {
			return [];
		}
	}

	async getAuthProviders(): Promise<{ provider: string; type: string }[]> {
		try {
			const path = await this.findOpenCodePath();
			const { stdout } = await execAsync(`"${path}" auth list`, { timeout: 10000 });

			const lines = stdout.trim().split('\n');
			const providers: { provider: string; type: string }[] = [];

			for (const line of lines) {
				const match = line.match(/●?\s*(.+?)\s*\[(.+?)\]/);
				if (match) {
					providers.push({
						provider: match[1].trim(),
						type: match[2].trim()
					});
				}
			}

			return providers;
		} catch {
			return [];
		}
	}

	async loginProvider(provider: string): Promise<{ success: boolean; message: string }> {
		try {
			const path = await this.findOpenCodePath();
			const process = spawn(path, ['auth', 'login', provider], {
				detached: true,
				stdio: 'ignore'
			});

			process.unref();

			return {
				success: true,
				message: `Opening ${provider} login page... Check your browser.`
			};
		} catch (error) {
			return {
				success: false,
				message: `Failed to open ${provider} login: ${error}`
			};
		}
	}

	async logoutProvider(provider: string): Promise<{ success: boolean; message: string }> {
		try {
			const path = await this.findOpenCodePath();
			await execAsync(`"${path}" auth logout ${provider}`);

			return {
				success: true,
				message: `Logged out from ${provider}`
			};
		} catch (error) {
			return {
				success: false,
				message: `Failed to logout from ${provider}: ${error}`
			};
		}
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

		const modelArg = this.settings.model.includes('/')
			? this.settings.model
			: `${this.settings.provider}/${this.settings.model}`;

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

				if (errorText.includes('API key') || errorText.includes('auth')) {
					this.emit('error', new Error(`Authentication failed: ${errorText.trim()}`));
				} else if (errorText.includes('clipboard')) {
					this.emit('error', new Error(`Clipboard error: ${errorText.trim()} - Please select an image-capable model`));
				} else if (errorText.includes('model')) {
					this.emit('error', new Error(`Model error: ${errorText.trim()}`));
				}
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
