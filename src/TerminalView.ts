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

        // Create terminal wrapper
        this.terminalContainer = container.createDiv({ cls: 'opencode-xterm-wrapper' });

        // Create toolbar as an overlay (very subtle)
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
            fontSize: 12,
            allowProposedApi: true,
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

        // Resize observer for 100% reactive scaling
        const resizeObserver = new ResizeObserver(() => {
            if (!this.isDisposed) {
                requestAnimationFrame(() => {
                    this.fitAddon.fit();
                    this.notifyResize();
                });
            }
        });
        resizeObserver.observe(this.terminalContainer);

        // Handle data input
        this.terminal.onData(data => {
            if (this.ptyProcess && this.ptyProcess.stdin) {
                this.ptyProcess.stdin.write(data);
            }
        });

        // Start session
        await this.startSession();
    }

    private notifyResize() {
        if (this.ptyProcess && (this.ptyProcess as any).stdio && (this.ptyProcess as any).stdio[3]) {
            const { cols, rows } = this.terminal;
            try {
                (this.ptyProcess as any).stdio[3].write(`R:${rows}:${cols}\n`);
            } catch (e) {
                // Ignore pipe errors
            }
        }
    }

    async startSession(): Promise<void> {
        this.terminal.clear();
        this.terminal.writeln('Initializing OpenCode Interactive Terminal...');

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

            // Set initial rows/cols for the bridge
            const { cols, rows } = this.terminal;
            env.ROWS = rows.toString();
            env.COLS = cols.toString();

            const args = ['-m', model];

            if (process.platform === 'win32') {
                this.ptyProcess = spawn(opencodePath, args, {
                    cwd: (this.app.vault.adapter as any).getBasePath(),
                    env: env,
                    shell: true
                });
            } else {
                // Fix: Properly formatted Python bridge using exec() to avoid semicolon SyntaxErrors
                const pythonCode = `
import os,sys,pty,select,array,fcntl,termios
m,p_v=pty.openpty()
r,c=os.environ.get('ROWS','24'),os.environ.get('COLS','80')
fcntl.ioctl(m,termios.TIOCSWINSZ,array.array('h',[int(r),int(c),0,0]))
if os.fork()==0:
 os.close(m);os.setsid();os.dup2(p_v,0);os.dup2(p_v,1);os.dup2(p_v,2)
 try:os.execvp(sys.argv[1],sys.argv[1:])
 except:os._exit(1)
os.close(p_v)
while True:
 rdk,_,_=select.select([m,0,3],[],[])
 if m in rdk:
  try:
   d=os.read(m,4096)
   if not d:break
   os.write(sys.stdout.buffer.fileno(),d)
  except:break
 if 0 in rdk:
  try:
   d=os.read(0,4096)
   if not d:break
   os.write(m,d)
  except:break
 if 3 in rdk:
  try:
   l=os.read(3,1024).decode().strip()
   if l.startswith('R:'):
    _,rs,cs=l.split(':');fcntl.ioctl(m,termios.TIOCSWINSZ,array.array('h',[int(rs),int(cs),0,0]))
  except:pass
`.trim();

                this.ptyProcess = spawn('python3', ['-c', pythonCode, opencodePath, ...args], {
                    cwd: (this.app.vault.adapter as any).getBasePath(),
                    env: env,
                    stdio: ['pipe', 'pipe', 'pipe', 'pipe']
                });
            }

            this.ptyProcess.stdout?.on('data', (data) => this.terminal.write(data));
            this.ptyProcess.stderr?.on('data', (data) => this.terminal.write(data));

            this.ptyProcess.on('error', (err) => {
                this.terminal.writeln(`\r\n[Fatal Error]: ${err.message}`);
            });

            this.ptyProcess.on('exit', (code, signal) => {
                this.terminal.writeln(`\r\n\r\n--- Session Ended (Code: ${code}, Signal: ${signal}) ---`);
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
