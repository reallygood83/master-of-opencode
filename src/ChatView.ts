import { ItemView, WorkspaceLeaf, MarkdownRenderer, Menu } from 'obsidian';
import type OpenCodePlugin from './main';
import { ChatMessage, ToolEvent, StepFinishEvent, Conversation } from './types';

export const VIEW_TYPE_OPENCODE_CHAT = 'opencode-chat-view';

export class OpenCodeChatView extends ItemView {
	plugin: OpenCodePlugin;
	private messagesContainer: HTMLElement;
	private inputContainer: HTMLElement;
	private inputField: HTMLTextAreaElement;
	private statusArea: HTMLElement;
	private historyBtn: HTMLElement;
	private currentAssistantContent: string = '';
	private currentAssistantEl: HTMLElement | null = null;
	private isStreaming: boolean = false;

	constructor(leaf: WorkspaceLeaf, plugin: OpenCodePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_OPENCODE_CHAT;
	}

	getDisplayText(): string {
		return 'OpenCode';
	}

	getIcon(): string {
		return 'terminal';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('opencode-container');

		this.createHeader(container as HTMLElement);
		this.messagesContainer = container.createDiv({ cls: 'opencode-messages' });
		this.inputContainer = container.createDiv({ cls: 'opencode-input-container' });
		this.createInputArea();
		this.setupProcessListeners();

		await this.loadConversation();
	}

	private async loadConversation(): Promise<void> {
		const conversation = this.plugin.conversationStore.getOrCreateActiveConversation();
		this.renderConversation(conversation);
	}

	private async renderConversation(conversation: Conversation): Promise<void> {
		this.messagesContainer.empty();

		if (conversation.messages.length === 0) {
			this.addSystemMessage('Welcome to Master of OpenCode! 🚀\nPowered by OpenCode CLI with multi-model support.');
		} else {
			for (const msg of conversation.messages) {
				await this.renderMessage(msg);
			}
		}
	}

	private async renderMessage(msg: ChatMessage): Promise<void> {
		switch (msg.role) {
			case 'user':
				this.renderUserMessage(msg.content);
				break;
			case 'assistant':
				await this.renderAssistantMessage(msg.content);
				break;
			case 'tool':
				if (msg.toolName && msg.toolStatus) {
					this.renderToolMessage({
						name: msg.toolName,
						status: msg.toolStatus,
						title: msg.toolTitle,
						input: msg.toolInput,
						output: msg.toolOutput
					});
				}
				break;
			case 'system':
				this.addSystemMessage(msg.content);
				break;
		}
	}

	private renderUserMessage(content: string): void {
		const msgEl = this.messagesContainer.createDiv({ cls: 'opencode-message opencode-message-user' });
		const contentEl = msgEl.createDiv({ cls: 'opencode-message-content' });
		contentEl.textContent = content;
	}

	private async renderAssistantMessage(content: string): Promise<void> {
		const msgEl = this.messagesContainer.createDiv({ cls: 'opencode-message opencode-message-assistant' });
		const contentEl = msgEl.createDiv({ cls: 'opencode-message-content' });
		await MarkdownRenderer.render(this.app, content, contentEl, '', this.plugin);
	}

	private renderToolMessage(event: ToolEvent): void {
		const msgEl = this.messagesContainer.createDiv({ cls: 'opencode-message opencode-message-tool' });
		this.updateToolElement(msgEl, event);
	}

	private createHeader(container: HTMLElement): void {
		const header = container.createDiv({ cls: 'opencode-header' });

		const titleArea = header.createDiv({ cls: 'opencode-header-title' });
		titleArea.createSpan({ text: '⚡', cls: 'opencode-logo' });
		titleArea.createSpan({ text: 'OpenCode', cls: 'opencode-title' });

		const modelArea = header.createDiv({ cls: 'opencode-header-model' });
		const modelSelector = modelArea.createEl('select', { cls: 'opencode-model-selector' });
		
		this.loadModelsIntoSelector(modelSelector);

		modelSelector.addEventListener('change', async (e) => {
			const value = (e.target as HTMLSelectElement).value;
			this.plugin.settings.model = value;
			const [provider] = value.split('/');
			this.plugin.settings.provider = provider as any;
			await this.plugin.saveSettings();
			this.plugin.processManager?.clearSession();
			this.updateStatusIndicator();
		});

		this.statusArea = header.createDiv({ cls: 'opencode-header-status' });
		this.updateStatusIndicator();

		const actionsArea = header.createDiv({ cls: 'opencode-header-actions' });

		const addNoteBtn = actionsArea.createEl('button', {
			cls: 'opencode-btn opencode-btn-icon',
			attr: { title: 'Add Active Note to Context' }
		});
		addNoteBtn.innerHTML = '📄';
		addNoteBtn.addEventListener('click', () => this.addActiveNoteToContext());

		this.historyBtn = actionsArea.createEl('button', {
			cls: 'opencode-btn opencode-btn-icon',
			attr: { title: 'Conversation History' }
		});
		this.historyBtn.innerHTML = '📜';
		this.historyBtn.addEventListener('click', (e) => this.showHistoryMenu(e));

		const newChatBtn = actionsArea.createEl('button', {
			cls: 'opencode-btn opencode-btn-icon',
			attr: { title: 'New Chat' }
		});
		newChatBtn.innerHTML = '➕';
		newChatBtn.addEventListener('click', () => this.startNewConversation());

		const settingsBtn = actionsArea.createEl('button', {
			cls: 'opencode-btn opencode-btn-icon',
			attr: { title: 'Settings' }
		});
		settingsBtn.innerHTML = '⚙️';
		settingsBtn.addEventListener('click', () => {
			(this.app as any).setting.open();
			(this.app as any).setting.openTabById('master-of-opencode');
		});
	}

	private showHistoryMenu(e: MouseEvent): void {
		const menu = new Menu();
		const conversations = this.plugin.conversationStore.getConversationList();
		const activeConv = this.plugin.conversationStore.getActiveConversation();

		if (conversations.length === 0) {
			menu.addItem(item => {
				item.setTitle('No conversations yet');
				item.setDisabled(true);
			});
		} else {
			conversations.slice(0, 10).forEach((conv: { id: string; title: string; updatedAt: number; messageCount: number }) => {
				menu.addItem(item => {
					const isActive = activeConv?.id === conv.id;
					item.setTitle(`${isActive ? '● ' : ''}${conv.title}`);
					item.onClick(() => {
						const conversation = this.plugin.conversationStore.setActiveConversation(conv.id);
						if (conversation) {
							this.renderConversation(conversation);
							this.plugin.processManager?.clearSession();
							if (conversation.sessionID) {
								this.plugin.processManager?.getState();
							}
						}
					});
				});
			});

			menu.addSeparator();

			menu.addItem(item => {
				item.setTitle('🗑️ Clear All History');
				item.onClick(async () => {
					conversations.forEach((conv: { id: string }) => {
						this.plugin.conversationStore.deleteConversation(conv.id);
					});
					this.startNewConversation();
				});
			});
		}

		menu.showAtMouseEvent(e);
	}

	private updateStatusIndicator(): void {
		this.statusArea.empty();
		const state = this.plugin.processManager?.getState();

		if (this.isStreaming) {
			this.statusArea.createSpan({ text: '🔵', cls: 'status-dot' });
			this.statusArea.createSpan({ text: 'Streaming...', cls: 'status-text' });
		} else if (state?.sessionID) {
			this.statusArea.createSpan({ text: '🟢', cls: 'status-dot' });
			this.statusArea.createSpan({ text: 'Connected', cls: 'status-text' });
		} else {
			this.statusArea.createSpan({ text: '⚪', cls: 'status-dot' });
			this.statusArea.createSpan({ text: 'Ready', cls: 'status-text' });
		}
	}

	private createInputArea(): void {
		this.inputField = this.inputContainer.createEl('textarea', {
			cls: 'opencode-input',
			attr: {
				placeholder: 'Ask OpenCode anything... (Shift+Enter for new line)',
				rows: '1'
			}
		});

		this.inputField.addEventListener('input', () => {
			this.inputField.style.height = 'auto';
			this.inputField.style.height = Math.min(this.inputField.scrollHeight, 200) + 'px';
		});

		this.inputField.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});

		const sendBtn = this.inputContainer.createEl('button', {
			cls: 'opencode-send-btn',
			text: '➤'
		});
		sendBtn.addEventListener('click', () => this.sendMessage());
	}

	private setupProcessListeners(): void {
		if (!this.plugin.processManager) return;

		this.plugin.processManager.on('text', (content: string) => {
			this.appendAssistantText(content);
		});

		this.plugin.processManager.on('tool', (event: ToolEvent) => {
			this.handleToolEvent(event);
		});

		this.plugin.processManager.on('step-start', () => {
			this.isStreaming = true;
			this.updateStatusIndicator();
		});

		this.plugin.processManager.on('step-finish', (event: StepFinishEvent) => {
			this.finalizeAssistantMessage();
			if (event.tokens) {
				this.showTokenUsage(event.tokens);
			}
		});

		this.plugin.processManager.on('session', (sessionID: string) => {
			const conversation = this.plugin.conversationStore.getActiveConversation();
			if (conversation) {
				this.plugin.conversationStore.updateConversation(conversation.id, { sessionID });
			}
			this.updateStatusIndicator();
		});

		this.plugin.processManager.on('exit', () => {
			this.isStreaming = false;
			this.finalizeAssistantMessage();
			this.updateStatusIndicator();
		});

		this.plugin.processManager.on('error', (error: Error | string) => {
			this.isStreaming = false;
			const errorMsg = error instanceof Error ? error.message : error;

			if (errorMsg.includes('API key') || errorMsg.includes('auth')) {
				this.addSystemMessage(`🔑 Authentication Error\n\n${errorMsg}\n\n💡 Please check your OpenCode CLI authentication:\n1. Open Settings > Authentication Status\n2. Ensure your provider is logged in\n3. Or run: opencode auth login <provider>`);
			} else if (errorMsg.includes('clipboard')) {
				this.addSystemMessage(`🖼️ Image Input Error\n\n${errorMsg}\n\n💡 Please select an image-capable model:\nAvailable models marked with 🖼️ in the dropdown above.`);
			} else {
				this.addSystemMessage(`❌ Error: ${errorMsg}`);
			}

			this.updateStatusIndicator();
		});
	}

	private appendAssistantText(content: string): void {
		this.currentAssistantContent += content;

		if (!this.currentAssistantEl) {
			this.currentAssistantEl = this.messagesContainer.createDiv({
				cls: 'opencode-message opencode-message-assistant streaming'
			});
		}

		const contentEl = this.currentAssistantEl.querySelector('.opencode-message-content') ||
			this.currentAssistantEl.createDiv({ cls: 'opencode-message-content' });

		contentEl.empty();
		MarkdownRenderer.render(
			this.app,
			this.currentAssistantContent,
			contentEl as HTMLElement,
			'',
			this.plugin
		);

		this.scrollToBottom();
	}

	private finalizeAssistantMessage(): void {
		if (this.currentAssistantEl) {
			this.currentAssistantEl.removeClass('streaming');

			if (this.currentAssistantContent.trim()) {
				const conversation = this.plugin.conversationStore.getActiveConversation();
				if (conversation) {
					const msg: ChatMessage = {
						id: Date.now().toString(),
						role: 'assistant',
						content: this.currentAssistantContent,
						timestamp: new Date()
					};
					this.plugin.conversationStore.addMessage(conversation.id, msg);
				}
			}
		}

		this.currentAssistantEl = null;
		this.currentAssistantContent = '';
		this.isStreaming = false;
	}

	private handleToolEvent(event: ToolEvent): void {
		const existingTool = this.messagesContainer.querySelector(`[data-tool-id="${event.name}-latest"]`);

		if (existingTool && event.status !== 'pending') {
			this.updateToolElement(existingTool as HTMLElement, event);
		} else if (event.status === 'pending' || event.status === 'running' || !existingTool) {
			this.createToolElement(event);
		}
	}

	private createToolElement(event: ToolEvent): void {
		const msgEl = this.messagesContainer.createDiv({
			cls: 'opencode-message opencode-message-tool',
			attr: { 'data-tool-id': `${event.name}-latest` }
		});

		this.updateToolElement(msgEl, event);
		this.scrollToBottom();

		const conversation = this.plugin.conversationStore.getActiveConversation();
		if (conversation) {
			const msg: ChatMessage = {
				id: Date.now().toString(),
				role: 'tool',
				content: event.title || event.name,
				timestamp: new Date(),
				toolName: event.name,
				toolStatus: event.status,
				toolInput: event.input,
				toolOutput: event.output,
				toolTitle: event.title
			};
			this.plugin.conversationStore.addMessage(conversation.id, msg);
		}
	}

	private updateToolElement(el: HTMLElement, event: ToolEvent): void {
		const statusIcon = this.getStatusIcon(event.status);
		const statusText = this.getStatusText(event.status);
		const title = event.title || event.name;

		el.empty();
		const block = el.createDiv({ cls: 'opencode-tool-block' });

		const header = block.createDiv({ cls: 'opencode-tool-header' });
		header.createSpan({ text: statusIcon, cls: 'opencode-tool-icon' });
		header.createSpan({ text: title, cls: 'opencode-tool-name' });
		header.createSpan({ text: statusText, cls: `opencode-tool-status status-${event.status}` });

		if (event.output && event.status === 'completed') {
			const outputEl = block.createDiv({ cls: 'opencode-tool-output collapsed' });
			const toggleBtn = header.createEl('button', {
				cls: 'opencode-tool-toggle',
				text: '▶'
			});

			toggleBtn.addEventListener('click', () => {
				outputEl.toggleClass('collapsed', !outputEl.hasClass('collapsed'));
				toggleBtn.textContent = outputEl.hasClass('collapsed') ? '▶' : '▼';
			});

			const pre = outputEl.createEl('pre');
			const output = event.output.length > 500
				? event.output.substring(0, 500) + '...\n(truncated)'
				: event.output;
			pre.textContent = output;
		}

		if (event.error) {
			const errorEl = block.createDiv({ cls: 'opencode-tool-error' });
			errorEl.textContent = `Error: ${event.error}`;
		}
	}

	private getStatusIcon(status: string): string {
		switch (status) {
			case 'pending': return '⏳';
			case 'running': return '🔄';
			case 'completed': return '✅';
			case 'error': return '❌';
			default: return '❓';
		}
	}

	private getStatusText(status: string): string {
		switch (status) {
			case 'pending': return 'Pending';
			case 'running': return 'Running...';
			case 'completed': return 'Done';
			case 'error': return 'Error';
			default: return status;
		}
	}

	private showTokenUsage(tokens: { input: number; output: number; reasoning: number; cache?: { read: number; write: number } }): void {
		const usageEl = this.messagesContainer.createDiv({ cls: 'opencode-token-usage' });
		usageEl.innerHTML = `<span class="token-label">Tokens:</span> 
			<span class="token-in">↓${tokens.input}</span> 
			<span class="token-out">↑${tokens.output}</span>
			${tokens.cache ? `<span class="token-cache">📦${tokens.cache.read}</span>` : ''}`;
	}

	private async sendMessage(): Promise<void> {
		const message = this.inputField.value.trim();
		if (!message || this.isStreaming) return;

		const conversation = this.plugin.conversationStore.getOrCreateActiveConversation();

		const msg: ChatMessage = {
			id: Date.now().toString(),
			role: 'user',
			content: message,
			timestamp: new Date()
		};
		this.plugin.conversationStore.addMessage(conversation.id, msg);
		this.renderUserMessage(message);

		this.inputField.value = '';
		this.inputField.style.height = 'auto';
		this.currentAssistantContent = '';
		this.scrollToBottom();

		try {
			await this.plugin.processManager?.sendMessage(message);
		} catch (error) {
			this.addSystemMessage(`❌ Failed to send message: ${error}`);
		}
	}

	private addSystemMessage(content: string): void {
		const msgEl = this.messagesContainer.createDiv({ cls: 'opencode-message opencode-message-system' });
		const contentEl = msgEl.createDiv({ cls: 'opencode-message-content' });
		contentEl.textContent = content;
		this.scrollToBottom();
	}

	private scrollToBottom(): void {
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	private async addActiveNoteToContext(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			this.addSystemMessage('No active file to add.');
			return;
		}

		const content = await this.app.vault.read(activeFile);
		const message = `Please analyze this file: ${activeFile.path}\n\n\`\`\`\n${content}\n\`\`\``;
		this.inputField.value = message;
		this.addSystemMessage(`📄 Added "${activeFile.name}" to context. Press Enter to send.`);
	}

	private startNewConversation(): void {
		this.plugin.processManager?.clearSession();
		const conversation = this.plugin.conversationStore.createConversation();
		this.renderConversation(conversation);
	}

	private async loadModelsIntoSelector(selector: HTMLSelectElement): Promise<void> {
		const currentModel = this.plugin.settings.model.includes('/')
			? this.plugin.settings.model
			: `${this.plugin.settings.provider}/${this.plugin.settings.model}`;

		selector.createEl('option', { value: currentModel, text: currentModel });

		try {
			const models = await this.plugin.processManager?.getAvailableModels();
			if (models && models.length > 0) {
				selector.empty();
				models.forEach((model: string) => {
					const option = selector.createEl('option', { value: model, text: model });
					if (model === currentModel) {
						option.selected = true;
					}
				});
			}
		} catch {
			return;
		}
	}

	async onClose(): Promise<void> {
		await this.plugin.conversationStore.save();
	}
}
