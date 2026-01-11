import { ItemView, WorkspaceLeaf, Menu } from 'obsidian';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { spawn, ChildProcess } from 'child_process';
import type OpenCodePlugin from './main';
import * as path from 'path';

export const VIEW_TYPE_OPENCODE_TERMINAL = 'opencode-terminal-view';

export class TerminalView extends ItemView {
    plugin: OpenCodePlugin;
    private terminal: Terminal;
    private fitAddon: FitAddon;
    private ptyProcess: ChildProcess | null = null;
    private terminalContainer: HTMLElement;
    private isDisposed: boolean = false;

    constructor(leaf: WorkspaceLeaf, plugin: OpenCodePlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_OPENCODE_TERMINAL;
    }

    getDisplayText(): string {
        return 'OpenCode Terminal';
    }

    getIcon(): string {
        return 'terminal-square';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('opencode-terminal-container');

        // Create terminal wrapper first to ensure toolbar overlays it
        this.terminalContainer = container.createDiv({ cls: 'opencode-xterm-wrapper' });

        // Create toolbar as an overlay
        const toolbar = container.createDiv({ cls: 'opencode-terminal-toolbar' });

        const restartBtn = toolbar.createEl('button', {
            text: 'Restart',
            cls: 'mod-cta'
        });
        restartBtn.onclick = () => this.restartSession();

        const settingsBtn = toolbar.createEl('button', {
            cls: 'clickable-icon'
        });
        settingsBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-settings"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';
        settingsBtn.onclick = () => {
            // @ts-ignore
            this.app.setting.open();
            // @ts-ignore
            this.app.setting.openTabById(this.plugin.manifest.id);
        };

        // Initialize xterm
        this.terminal = new Terminal({
            cursorBlink: true,
            convertEol: true,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            fontSize: 12, // Slightly smaller for sidebar
            theme: {
                background: '#1e1e1e',
                foreground: '#f0f0f0',
                cursor: '#ffffff',
                selectionBackground: '#5da5f533'
            }
        });

        this.fitAddon = new FitAddon();
        this.terminal.loadAddon(this.fitAddon);
        this.terminal.loadAddon(new WebLinksAddon());

        this.terminal.open(this.terminalContainer);

        // Use ResizeObserver for precise fitting
        const resizeObserver = new ResizeObserver(() => {
            if (this.isDisposed) return;
            this.fitAddon.fit();
        });
        resizeObserver.observe(this.terminalContainer);

        // Handle data input
        this.terminal.onData(data => {
            if (this.ptyProcess && this.ptyProcess.stdin) {
                this.ptyProcess.stdin.write(data);
            }
        });

        // Start the process
        await this.startSession();
    }

    async startSession(): Promise<void> {
        this.terminal.clear();
        this.terminal.writeln('Initializing OpenCode Terminal...');

        const opencodePath = await this.plugin.processManager?.findOpenCodePath() || 'opencode';
        const model = this.plugin.settings.model.includes('/')
            ? this.plugin.settings.model
            : `${this.plugin.settings.provider}/${this.plugin.settings.model}`;

        try {
            const env = { ...process.env };
            if (process.platform !== 'win32') {
                const extraPaths = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
                env.PATH = extraPaths.join(':') + ':' + (env.PATH || '');
            }

            env.FORCE_COLOR = '3';
            env.TERM = 'xterm-256color';
            env.COLORTERM = 'truecolor';
            env.LANG = 'en_US.UTF-8';

            // Use just the binary with model flag for interactive mode
            const args = ['-m', model];

            if (process.platform === 'win32') {
                this.terminal.writeln(`Starting OpenCode (Windows)...`);
                this.ptyProcess = spawn(opencodePath, args, {
                    cwd: (this.app.vault.adapter as any).getBasePath(),
                    env: env,
                    shell: true
                });
            } else {
                this.terminal.writeln(`Starting OpenCode PTY session...`);
                // Use python3 PTY bridge for a real TTY environment
                const pythonScript = `import pty, sys; pty.spawn(["${opencodePath}", ${args.map(a => `"${a}"`).join(", ")}])`;

                this.ptyProcess = spawn('python3', ['-c', pythonScript], {
                    cwd: (this.app.vault.adapter as any).getBasePath(),
                    env: env
                });
            }

            this.ptyProcess.stdout?.on('data', (data) => {
                this.terminal.write(data);
            });

            this.ptyProcess.stderr?.on('data', (data) => {
                this.terminal.write(data);
            });

            this.ptyProcess.on('error', (err) => {
                this.terminal.writeln(`\r\n[Fatal Error]: ${err.message}`);
                if (process.platform !== 'win32') {
                    this.terminal.writeln('Please ensure python3 and opencode are in your PATH.');
                }
            });

            this.ptyProcess.on('exit', (code, signal) => {
                this.terminal.writeln(`\r\n\r\n--- Interaction Ended (Code: ${code}, Signal: ${signal}) ---`);
            });

            this.terminal.focus();

        } catch (e) {
            this.terminal.writeln(`Detailed Error: ${e}`);
        }
    }

    async restartSession(): Promise<void> {
        if (this.ptyProcess) {
            this.ptyProcess.kill();
            this.ptyProcess = null;
        }
        await this.startSession();
    }

    async onClose(): Promise<void> {
        this.isDisposed = true;
        if (this.ptyProcess) {
            this.ptyProcess.kill();
        }
        this.terminal.dispose();
    }
}
