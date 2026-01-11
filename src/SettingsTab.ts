import { App, PluginSettingTab, Setting } from 'obsidian';
import { OpenCodeSettings, Provider, ExecutionMode, Theme, PROVIDERS } from './types';
import type OpenCodePlugin from './main';

export class OpenCodeSettingTab extends PluginSettingTab {
	plugin: OpenCodePlugin;

	constructor(app: App, plugin: OpenCodePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Header
		containerEl.createEl('h1', { text: 'Master of OpenCode' });
		containerEl.createEl('p', {
			text: 'Configure your AI-powered development assistant',
			cls: 'setting-item-description'
		});

		// ==================
		// OpenCode Installation & Connection
		// ==================
		containerEl.createEl('h2', { text: '🔌 OpenCode Connection' });

		const statusEl = containerEl.createDiv({ cls: 'opencode-status' });
		const state = this.plugin.processManager?.getState();

		// OpenCode Path
		new Setting(containerEl)
			.setName('OpenCode Path')
			.setDesc('Path to opencode binary (auto-detected if empty)')
			.addText(text => text
				.setPlaceholder('/opt/homebrew/bin/opencode')
				.setValue(this.plugin.settings.opencodePath)
				.onChange(async (value) => {
					this.plugin.settings.opencodePath = value;
					await this.plugin.saveSettings();
				}))
			.addButton(button => button
				.setButtonText('Test Connection')
				.setCta()
				.onClick(async () => {
					try {
						if (!this.plugin.processManager) {
							throw new Error('ProcessManager not initialized');
						}

						const result = await this.plugin.processManager.checkOpenCodeInstalled();

						statusEl.empty();

						if (result.installed) {
							statusEl.createEl('span', {
								text: `✅ OpenCode found at: ${result.path} (v${result.version})`,
								cls: 'opencode-status-running'
							});
						} else {
							statusEl.createEl('span', {
								text: '❌ OpenCode not found. Please install.',
								cls: 'opencode-status-stopped'
							});
						}
					} catch (error) {
						statusEl.empty();
						statusEl.createEl('span', {
							text: `❌ Error checking: ${error}`,
							cls: 'opencode-status-stopped'
						});
					}
				}))
			.addButton(button => button
				.setButtonText('📥 Install OpenCode')
				.setWarning()
				.onClick(async () => {
					button.setDisabled(true);
					button.setButtonText('Installing...');

					try {
						if (!this.plugin.processManager) {
							throw new Error('ProcessManager not initialized');
						}

						const result = await this.plugin.processManager.installOpenCode();

						statusEl.empty();

						if (result.success) {
							this.plugin.settings.opencodePath = result.path || '';
							await this.plugin.saveSettings();

							statusEl.createEl('span', {
								text: `✅ ${result.message}`,
								cls: 'opencode-status-running'
							});
							this.display();
						} else {
							statusEl.createEl('span', {
								text: `❌ ${result.message}`,
								cls: 'opencode-status-stopped'
							});
						}
					} catch (error) {
						statusEl.empty();
						statusEl.createEl('span', {
							text: `❌ Installation failed: ${error}`,
							cls: 'opencode-status-stopped'
						});
					} finally {
						button.setDisabled(false);
						button.setButtonText('📥 Install OpenCode');
					}
				}));

		// Status Display
		if (state?.sessionID) {
			statusEl.createEl('span', {
				text: '🟢 Session Active',
				cls: 'opencode-status-running'
			});
			statusEl.createEl('span', {
				text: ` (${state.sessionID.substring(0, 15)}...)`,
				cls: 'opencode-status-detail'
			});
		} else {
			statusEl.createEl('span', {
				text: '⚪ Ready',
				cls: 'opencode-status-stopped'
			});
		}

		new Setting(containerEl)
			.setName('Active Session')
			.setDesc('Manage current CLI session')
			.addButton(button => button
				.setButtonText('Clear Session')
				.onClick(async () => {
					this.plugin.processManager?.clearSession();
					this.display();
				}));

		// Execution Mode
		new Setting(containerEl)
			.setName('Execution Mode')
			.setDesc('How to connect to OpenCode')
			.addDropdown(dropdown => {
				dropdown
					.addOption('spawn', 'CLI Spawner (Default)')
					.addOption('server', 'Server Mode (Advanced)')
					.setValue(this.plugin.settings.executionMode)
					.onChange(async (value: string) => {
						this.plugin.settings.executionMode = value as ExecutionMode;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		// Server Port (only show in server mode)
		if (this.plugin.settings.executionMode === 'server') {
			new Setting(containerEl)
				.setName('Server Port')
				.setDesc('Port for OpenCode server')
				.addText(text => text
					.setPlaceholder('3000')
					.setValue(String(this.plugin.settings.serverPort))
					.onChange(async (value) => {
						this.plugin.settings.serverPort = parseInt(value) || 3000;
						await this.plugin.saveSettings();
					}));
		}

		// ==================
		// AI Model Settings
		// ==================
		containerEl.createEl('h2', { text: '🤖 AI Model Settings' });

		// Provider Selection
		new Setting(containerEl)
			.setName('AI Provider')
			.setDesc('Select "Default" to use your CLI configuration, or override with a specific provider.')
			.addDropdown(dropdown => {
				const providers: Record<string, string> = {
					'default': 'Default (Use OpenCode CLI Config)',
					'anthropic': 'Anthropic (Claude)',
					'openai': 'OpenAI (GPT)',
					'google': 'Google (Gemini)',
					'ollama': 'Ollama (Local)',
					'custom': 'Custom Provider'
				};

				Object.entries(providers).forEach(([value, name]) => {
					dropdown.addOption(value, name);
				});

				dropdown
					.setValue(this.plugin.settings.provider)
					.onChange(async (value: string) => {
						this.plugin.settings.provider = value as Provider;
						// Reset model when provider changes
						const providerConfig = PROVIDERS[value as Provider];
						if (providerConfig && providerConfig.models.length > 0) {
							this.plugin.settings.model = providerConfig.models[0];
						}
						await this.plugin.saveSettings();
						this.display(); // Refresh to show new models
					});
			});

		// Model Selection
		if (this.plugin.settings.provider !== 'default') {
			new Setting(containerEl)
				.setName('Model')
				.setDesc('Select the specific model to use')
				.addDropdown(dropdown => {
					const providerConfig = PROVIDERS[this.plugin.settings.provider];

					if (providerConfig && providerConfig.models.length > 0) {
						providerConfig.models.forEach(model => {
							dropdown.addOption(model, model);
						});
					} else {
						dropdown.addOption('custom', 'Enter custom model below');
					}

					dropdown
						.setValue(this.plugin.settings.model)
						.onChange(async (value) => {
							this.plugin.settings.model = value;
							await this.plugin.saveSettings();
						});
				})
				.addText(text => text
					.setPlaceholder('Or enter custom model ID')
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value;
						await this.plugin.saveSettings();
					}));
		}

		// Custom API Base URL
		new Setting(containerEl)
			.setName('Custom API Base URL')
			.setDesc('For local LLMs or custom proxies (leave empty for default)')
			.addText(text => text
				.setPlaceholder('https://api.example.com/v1')
				.setValue(this.plugin.settings.customApiBaseUrl)
				.onChange(async (value) => {
					this.plugin.settings.customApiBaseUrl = value;
					await this.plugin.saveSettings();
				}));

		// Context Window
		new Setting(containerEl)
			.setName('Context Window Limit')
			.setDesc('Maximum tokens for context (depends on model)')
			.addSlider(slider => slider
				.setLimits(4096, 200000, 4096)
				.setValue(this.plugin.settings.contextWindowLimit)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.contextWindowLimit = value;
					await this.plugin.saveSettings();
				}));

		// ==================
		// UI & Appearance
		// ==================
		containerEl.createEl('h2', { text: '🎨 UI & Appearance' });

		// Theme
		new Setting(containerEl)
			.setName('Theme')
			.setDesc('Chat interface theme')
			.addDropdown(dropdown => {
				dropdown
					.addOption('adaptive', 'Adaptive (Follow Obsidian)')
					.addOption('dark', 'Dark')
					.addOption('light', 'Light')
					.setValue(this.plugin.settings.theme)
					.onChange(async (value: string) => {
						this.plugin.settings.theme = value as Theme;
						await this.plugin.saveSettings();
					});
			});

		// Notifications
		new Setting(containerEl)
			.setName('Notifications')
			.setDesc('Show notifications for completed tasks')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.notifications)
				.onChange(async (value) => {
					this.plugin.settings.notifications = value;
					await this.plugin.saveSettings();
				}));

		// ==================
		// Favorite Models
		// ==================
		containerEl.createEl('h2', { text: '⭐ Favorite Models' });
		containerEl.createEl('p', {
			text: 'Quick access models shown in the toolbar (provider/model format)',
			cls: 'setting-item-description'
		});

		this.plugin.settings.favoriteModels.forEach((model, index) => {
			new Setting(containerEl)
				.setName(`Favorite ${index + 1}`)
				.addText(text => text
					.setValue(model)
					.onChange(async (value) => {
						this.plugin.settings.favoriteModels[index] = value;
						await this.plugin.saveSettings();
					}))
				.addButton(button => button
					.setIcon('trash')
					.setTooltip('Remove')
					.onClick(async () => {
						this.plugin.settings.favoriteModels.splice(index, 1);
						await this.plugin.saveSettings();
						this.display();
					}));
		});

		// Add Favorite Button
		new Setting(containerEl)
			.addButton(button => button
				.setButtonText('+ Add Favorite')
				.onClick(async () => {
					this.plugin.settings.favoriteModels.push('provider/model-name');
					await this.plugin.saveSettings();
					this.display();
				}));
	}
}
