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

        // Create toolbar
        const toolbar = container.createDiv({ cls: 'opencode-terminal-toolbar' });

        const restartBtn = toolbar.createEl('button', {
            text: 'Restart Session',
            cls: 'mod-cta'
        });
        restartBtn.onclick = () => this.restartSession();

        const settingsBtn = toolbar.createEl('button', {
            text: 'Settings',
            cls: 'clickable-icon'
        });
        settingsBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-settings"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';
        settingsBtn.onclick = () => {
            // @ts-ignore
            this.app.setting.open();
            // @ts-ignore
            this.app.setting.openTabById(this.plugin.manifest.id);
        };

        // Create terminal wrapper
        this.terminalContainer = container.createDiv({ cls: 'opencode-xterm-wrapper' });

        // Initialize xterm
        this.terminal = new Terminal({
            cursorBlink: true,
            convertEol: true,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            fontSize: 13,
            theme: {
                background: '#1e1e1e',
                foreground: '#f0f0f0',
                cursor: '#ffffff',
                selectionBackground: '#5da5f533',
                black: '#000000',
                blue: '#2472c8',
                cyan: '#11a8cd',
                green: '#0dbc79',
                magenta: '#bc3fbc',
                red: '#cd3131',
                white: '#e5e5e5',
                yellow: '#e5e510',
                brightBlack: '#666666',
                brightBlue: '#3b8eea',
                brightCyan: '#29b8db',
                brightGreen: '#23d18b',
                brightMagenta: '#d670d6',
                brightRed: '#f14c4c',
                brightWhite: '#e5e5e5',
                brightYellow: '#f5f543'
            }
        });

        this.fitAddon = new FitAddon();
        this.terminal.loadAddon(this.fitAddon);
        this.terminal.loadAddon(new WebLinksAddon());

        this.terminal.open(this.terminalContainer);
        this.fitAddon.fit();

        // Handle resize
        this.registerDomEvent(window, 'resize', () => {
            this.fitAddon.fit();
            if (this.ptyProcess) {
                // We can't resize standard spawn process easily without node-pty, 
                // but xterm handles wrapping reasonably well.
            }
        });

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
        this.terminal.writeln('Initializing OpenCode...');

        const opencodePath = await this.plugin.processManager?.findOpenCodePath() || 'opencode';

        const model = this.plugin.settings.model.includes('/')
            ? this.plugin.settings.model
            : `${this.plugin.settings.provider}/${this.plugin.settings.model}`;

        try {
            // macOS/Linux "script" command fails in Electron (socket error).
            // Fallback to direct spawn for ALL platforms, but aggressively force color/TTY env vars.
            // This sacrifices native PTY handling (arrow keys might be limited) for stability.
            this.ptyProcess = spawn(opencodePath, ['run', '-m', model], {
                cwd: (this.app.vault.adapter as any).getBasePath(),
                env: {
                    ...process.env,
                    // Force color/TTY-like behavior
                    FORCE_COLOR: '3', // 3 = TrueColor
                    CLICOLOR: '1',
                    CLICOLOR_FORCE: '1',
                    TERM: 'xterm-256color',
                    COLORTERM: 'truecolor',
                    NO_UPDATE_NOTIFIER: '1',
                    CI: '1' // Sometimes helps tools assume non-interactive but colored
                }
            });

            this.ptyProcess.stdout?.on('data', (data) => {
                this.terminal.write(data);
            });

            this.ptyProcess.stderr?.on('data', (data) => {
                this.terminal.write(data);
            });

            this.ptyProcess.on('exit', (code) => {
                if (code !== 0) {
                    this.terminal.writeln(`\r\nProcess exited with code ${code}`);
                } else {
                    this.terminal.writeln(`\r\nSession ended.`);
                }
            });

            this.terminal.focus();

        } catch (e) {
            this.terminal.writeln(`Error starting process: ${e}`);
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
