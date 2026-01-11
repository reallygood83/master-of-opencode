import { Plugin, WorkspaceLeaf, TFile } from 'obsidian';
import { OpenCodeSettings, DEFAULT_SETTINGS } from './types';
import { OpenCodeSettingTab } from './SettingsTab';
import { ProcessManager } from './ProcessManager';
import { ConversationStore } from './ConversationStore';
import { OpenCodeChatView, VIEW_TYPE_OPENCODE_CHAT } from './ChatView';

export default class OpenCodePlugin extends Plugin {
	settings: OpenCodeSettings;
	processManager: ProcessManager | null = null;
	conversationStore: ConversationStore;

	async onload(): Promise<void> {
		console.log('Loading Master of OpenCode plugin');

		await this.loadSettings();

		this.conversationStore = new ConversationStore(this);
		await this.conversationStore.load();

		const vaultPath = (this.app.vault.adapter as any).basePath;
		this.processManager = new ProcessManager(this.settings, vaultPath);

		this.registerView(
			VIEW_TYPE_OPENCODE_CHAT,
			(leaf) => new OpenCodeChatView(leaf, this)
		);

		this.addRibbonIcon('terminal', 'Open OpenCode', async () => {
			await this.activateView();
		});

		this.addCommand({
			id: 'open-opencode-chat',
			name: 'Open OpenCode Chat',
			callback: async () => {
				await this.activateView();
			}
		});

		this.addCommand({
			id: 'send-file-to-opencode',
			name: 'Send Active File to OpenCode',
			editorCallback: async (editor, view) => {
				const content = editor.getValue();
				const file = view.file;
				if (file && this.processManager) {
					const message = `Analyze this file: ${file.path}\n\n\`\`\`\n${content}\n\`\`\``;
					await this.activateView();
					await this.processManager.sendMessage(message);
				}
			}
		});

		this.addSettingTab(new OpenCodeSettingTab(this.app, this));

		// Register context menu for files
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (!(file instanceof TFile)) return;

				menu.addItem((item) => {
					item
						.setTitle('Send to OpenCode')
						.setIcon('terminal')
						.onClick(async () => {
							const content = await this.app.vault.read(file);
							await this.activateView();
							const message = `Please analyze this file: ${file.path}\n\n\`\`\`\n${content}\n\`\`\``;
							await this.processManager?.sendMessage(message);
						});
				});
			})
		);

		console.log('Master of OpenCode plugin loaded');
	}

	async onunload(): Promise<void> {
		console.log('Unloading Master of OpenCode plugin');

		if (this.processManager) {
			await this.processManager.stop();
			this.processManager = null;
		}

		this.app.workspace.detachLeavesOfType(VIEW_TYPE_OPENCODE_CHAT);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		if (this.processManager) {
			this.processManager.updateSettings(this.settings);
		}
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_OPENCODE_CHAT);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: VIEW_TYPE_OPENCODE_CHAT,
					active: true
				});
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}
}
