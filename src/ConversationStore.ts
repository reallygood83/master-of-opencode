import type OpenCodePlugin from './main';
import { Conversation, ChatMessage } from './types';

const STORAGE_KEY = 'opencode-conversations';
const MAX_CONVERSATIONS = 20;

export class ConversationStore {
	private plugin: OpenCodePlugin;
	private conversations: Conversation[] = [];
	private activeConversationId: string | null = null;

	constructor(plugin: OpenCodePlugin) {
		this.plugin = plugin;
	}

	async load(): Promise<void> {
		const data = await this.plugin.loadData();
		if (data && data[STORAGE_KEY]) {
			this.conversations = data[STORAGE_KEY] || [];
			this.activeConversationId = data['activeConversationId'] || null;
		}
	}

	async save(): Promise<void> {
		const data = await this.plugin.loadData() || {};
		data[STORAGE_KEY] = this.conversations.slice(0, MAX_CONVERSATIONS);
		data['activeConversationId'] = this.activeConversationId;
		await this.plugin.saveData(data);
	}

	createConversation(title?: string): Conversation {
		const conversation: Conversation = {
			id: `conv-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
			title: title || this.generateTitle(),
			messages: [],
			sessionID: null,
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		this.conversations.unshift(conversation);
		this.activeConversationId = conversation.id;
		this.save();
		return conversation;
	}

	private generateTitle(): string {
		const now = new Date();
		return now.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	getActiveConversation(): Conversation | null {
		if (!this.activeConversationId) {
			return null;
		}
		return this.conversations.find(c => c.id === this.activeConversationId) || null;
	}

	setActiveConversation(id: string): Conversation | null {
		const conversation = this.conversations.find(c => c.id === id);
		if (conversation) {
			this.activeConversationId = id;
			this.save();
		}
		return conversation || null;
	}

	getConversationList(): { id: string; title: string; updatedAt: number; messageCount: number }[] {
		return this.conversations.map(c => ({
			id: c.id,
			title: c.title,
			updatedAt: c.updatedAt,
			messageCount: c.messages.length
		}));
	}

	updateConversation(id: string, updates: Partial<Conversation>): void {
		const conversation = this.conversations.find(c => c.id === id);
		if (conversation) {
			Object.assign(conversation, updates, { updatedAt: Date.now() });
			this.save();
		}
	}

	addMessage(conversationId: string, message: ChatMessage): void {
		const conversation = this.conversations.find(c => c.id === conversationId);
		if (conversation) {
			conversation.messages.push(message);
			conversation.updatedAt = Date.now();
			
			if (conversation.messages.length === 1 && message.role === 'user') {
				conversation.title = message.content.substring(0, 50) + 
					(message.content.length > 50 ? '...' : '');
			}
			
			this.save();
		}
	}

	deleteConversation(id: string): void {
		const index = this.conversations.findIndex(c => c.id === id);
		if (index !== -1) {
			this.conversations.splice(index, 1);
			if (this.activeConversationId === id) {
				this.activeConversationId = this.conversations[0]?.id || null;
			}
			this.save();
		}
	}

	getOrCreateActiveConversation(): Conversation {
		let conversation = this.getActiveConversation();
		if (!conversation) {
			conversation = this.createConversation();
		}
		return conversation;
	}
}
