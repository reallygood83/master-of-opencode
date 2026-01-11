import { Plugin, WorkspaceLeaf, TFile } from 'obsidian';
import { OpenCodeSettings, DEFAULT_SETTINGS } from './types';
import { OpenCodeSettingTab } from './SettingsTab';
import { ProcessManager } from './ProcessManager';
import { ConversationStore } from './ConversationStore';
import { TerminalView, VIEW_TYPE_OPENCODE_TERMINAL } from './TerminalView';

export default class OpenCodePlugin extends Plugin {
	settings: OpenCodeSettings;
	processManager: ProcessManager | null = null;
	conversationStore: ConversationStore;

	async onload(): Promise<void> {
		console.log('Loading Master of OpenCode plugin (Terminal Mode)');

		await this.loadSettings();

		this.conversationStore = new ConversationStore(this);
		await this.conversationStore.load();

		const vaultPath = (this.app.vault.adapter as any).basePath;
		// Keep ProcessManager for settings/utility but not for chat execution in this mode
		this.processManager = new ProcessManager(this.settings, vaultPath);

		this.registerView(
			VIEW_TYPE_OPENCODE_TERMINAL,
			(leaf) => new TerminalView(leaf, this)
		);

		this.addRibbonIcon('terminal', 'Open OpenCode', async () => {
			await this.activateView();
		});

		this.addCommand({
			id: 'open-opencode-terminal',
			name: 'Open OpenCode Terminal',
			callback: async () => {
				await this.activateView();
			}
		});

		this.addSettingTab(new OpenCodeSettingTab(this.app, this));

		console.log('Master of OpenCode plugin loaded');
	}

	async onunload(): Promise<void> {
		console.log('Unloading Master of OpenCode plugin');
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_OPENCODE_TERMINAL);
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
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_OPENCODE_TERMINAL);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: VIEW_TYPE_OPENCODE_TERMINAL,
					active: true
				});
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}
}
