import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { OpenCodeSettings, Provider, ExecutionMode, Theme, PROVIDERS } from './types';
import type OpenCodePlugin from './main';

export class OpenCodeSettingTab extends PluginSettingTab {
	plugin: OpenCodePlugin;
	private newProviderValue: string = '';

	constructor(app: App, plugin: OpenCodePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async loadAuthProviders(authListEl: HTMLElement): Promise<void> {
		try {
			if (this.plugin.processManager) {
				const authProviders = await this.plugin.processManager.getAuthProviders();

				if (authProviders.length > 0) {
					authProviders.forEach(auth => {
						const authItem = authListEl.createDiv({ cls: 'opencode-auth-item' });
						authItem.createSpan({ text: `✅ ${auth.provider}`, cls: 'auth-provider-name' });
						authItem.createSpan({ text: `(${auth.type})`, cls: 'auth-provider-type' });

						authItem.createEl('button', {
							cls: 'auth-logout-btn',
							text: 'Logout'
						}).addEventListener('click', async () => {
							if (this.plugin.processManager) {
								const result = await this.plugin.processManager.logoutProvider(auth.provider);
								new Notice(result.message);
								if (result.success) {
									this.display();
								}
							}
						});
					});
				} else {
					authListEl.createEl('p', {
						text: 'No authenticated providers found. Add one below.',
						cls: 'setting-item-description'
					});
				}
			}
		} catch (error) {
			authListEl.createEl('p', {
				text: `Failed to load auth status: ${error}`,
				cls: 'opencode-error'
			});
		}
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h1', { text: 'Master of OpenCode' });
		containerEl.createEl('p', {
			text: 'Configure your AI-powered development assistant',
			cls: 'setting-item-description'
		});

		containerEl.createEl('h2', { text: '🔌 OpenCode Connection' });

		const statusEl = containerEl.createDiv({ cls: 'opencode-status' });
		const state = this.plugin.processManager?.getState();

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
								text: result.error ? `❌ Error: ${result.error}` : '❌ OpenCode not found. Please install.',
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

		containerEl.createEl('h2', { text: '🤖 AI Model Settings' });

		new Setting(containerEl)
			.setName('Authentication Status')
			.setDesc('Manage your OpenCode CLI provider credentials')
			.addButton(button => button
				.setButtonText('🔄 Refresh Auth Status')
				.onClick(async () => {
					button.setDisabled(true);
					button.setButtonText('Refreshing...');
					this.display();
					button.setDisabled(false);
					button.setButtonText('🔄 Refresh Auth Status');
				}));

		const authListEl = containerEl.createDiv({ cls: 'opencode-auth-list' });

		this.loadAuthProviders(authListEl);

		new Setting(containerEl)
			.setName('Add Provider Login')
			.setDesc('Log in to a new AI provider (will open browser)')
			.addText(text => text
				.setPlaceholder('anthropic, google, xai, etc.')
				.setValue('')
				.onChange((value) => {
					this.newProviderValue = value;
				}))
			.addButton(button => button
				.setButtonText('Login')
				.setCta()
				.onClick(async () => {
					if (this.newProviderValue && this.newProviderValue.trim()) {
						if (this.plugin.processManager) {
							const result = await this.plugin.processManager.loginProvider(this.newProviderValue.trim());
							new Notice(result.message);
							if (result.success) {
								this.display();
							}
						}
					}
				}));

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
						await this.plugin.saveSettings();
						this.display();
					});
			});

		const modelSetting = new Setting(containerEl)
			.setName('Model')
			.setDesc('Select model from OpenCode CLI');

		const modelDropdown = modelSetting.controlEl.createEl('select', { cls: 'dropdown' });
		this.loadModelsIntoDropdown(modelDropdown);

		modelDropdown.addEventListener('change', async () => {
			const value = modelDropdown.value;
			this.plugin.settings.model = value;
			const [provider] = value.split('/');
			this.plugin.settings.provider = provider as Provider;
			await this.plugin.saveSettings();
		});

		modelSetting.addText(text => text
			.setPlaceholder('Or enter custom model (provider/model)')
			.setValue(this.plugin.settings.model)
			.onChange(async (value) => {
				this.plugin.settings.model = value;
				await this.plugin.saveSettings();
			}));

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

		containerEl.createEl('h2', { text: '🎨 UI & Appearance' });

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

		new Setting(containerEl)
			.setName('Notifications')
			.setDesc('Show notifications for completed tasks')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.notifications)
				.onChange(async (value) => {
					this.plugin.settings.notifications = value;
					await this.plugin.saveSettings();
				}));

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

		new Setting(containerEl)
			.addButton(button => button
				.setButtonText('+ Add Favorite')
				.onClick(async () => {
					this.plugin.settings.favoriteModels.push('provider/model-name');
					await this.plugin.saveSettings();
					this.display();
				}));
	}

	private async loadModelsIntoDropdown(dropdown: HTMLSelectElement): Promise<void> {
		const currentModel = this.plugin.settings.model.includes('/')
			? this.plugin.settings.model
			: `${this.plugin.settings.provider}/${this.plugin.settings.model}`;

		dropdown.createEl('option', { value: currentModel, text: currentModel });

		try {
			const models = await this.plugin.processManager?.getAvailableModels();
			if (models && models.length > 0) {
				dropdown.empty();
				models.forEach((model: string) => {
					const option = dropdown.createEl('option', { value: model, text: model });
					if (model === currentModel) {
						option.selected = true;
					}
				});
			}
		} catch {
			return;
		}
	}
}
