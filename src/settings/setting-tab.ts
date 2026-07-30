import { App, MarkdownView, normalizePath, PluginSettingTab, Setting } from 'obsidian';
import type VoiceMDPlugin from '../../main';
import {
	CURATED_CHAT_MODELS,
	CUSTOM_CHAT_MODEL_OPTION,
	isCuratedChatModel,
	normalizeChatModel,
} from './chat-models';

export class VoiceMDSettingTab extends PluginSettingTab {
	readonly plugin: VoiceMDPlugin;
	private showCustomModelInput = false;

	constructor(app: App, plugin: VoiceMDPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('OpenAI API key')
			.setDesc(`Enter your OpenAI API key to enable audio transcription. ${this.plugin.getApiKeyStore().usesSecretStorage() ? 'Stored with Obsidian SecretStorage when saved. If a key is already saved, leave this blank to keep it.' : 'Stored in local plugin data on this Obsidian version.'}`)
			.addText(text => {
				const saveEnteredKey = async () => {
					const value = text.getValue().trim();
					if (!value && this.plugin.getApiKeyStore().usesSecretStorage()) return;
					await this.plugin.getApiKeyStore().setApiKey(value);
					if (this.plugin.getApiKeyStore().usesSecretStorage()) text.setValue('');
				};

				text.setPlaceholder(this.plugin.getApiKeyStore().usesSecretStorage() ? 'Enter a new key to replace saved key' : 'sk-...')
					.setValue(this.plugin.getApiKeyStore().usesSecretStorage() ? '' : this.plugin.pluginSettings.openaiApiKey);
				text.inputEl.addEventListener('change', () => {
					void saveEnteredKey();
				});
				text.inputEl.addEventListener('keydown', (event) => {
					if (event.key === 'Enter') {
						text.inputEl.blur();
					}
				});
			})
			.addButton(button => button
				.setButtonText('Clear')
				.setTooltip('Clear the saved API key')
				.onClick(async () => {
					await this.plugin.getApiKeyStore().setApiKey('');
					this.display();
				}));

		new Setting(containerEl)
			.setName('Max recording duration')
			.setDesc('Maximum recording duration in seconds (default: 300 seconds / 5 minutes)')
			.addText(text => text
				.setPlaceholder('300')
				.setValue(String(this.plugin.pluginSettings.maxRecordingDuration))
				.onChange(async (value) => {
					const numValue = parseInt(value);
					if (!isNaN(numValue) && numValue > 0) {
						this.plugin.pluginSettings.maxRecordingDuration = numValue;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Retain failed audio')
			.setDesc('Days to keep local audio for failed or pending transcription retries. Audio is deleted after successful transcription. Default: 7 days.')
			.addText(text => text
				.setPlaceholder('7')
				.setValue(String(this.plugin.pluginSettings.failedAudioRetentionDays))
				.onChange(async (value) => {
					const numValue = parseInt(value);
					if (!isNaN(numValue) && numValue > 0) {
						this.plugin.pluginSettings.failedAudioRetentionDays = numValue;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Pending transcriptions')
			.setDesc('Retry recordings saved locally after a network or transcription failure.')
			.addButton(button => button
				.setButtonText(`Retry ${this.plugin.getRetryableJobs().length} pending`)
				.onClick(() => {
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
					void this.plugin.retryPendingJobs(view?.editor);
				}));

		new Setting(containerEl)
			.setName('Auto-start recording')
			.setDesc('Automatically start recording when opening the voice recording modal')
			.addToggle(toggle => toggle
				.setValue(this.plugin.pluginSettings.autoStartRecording)
				.onChange(async (value) => {
					this.plugin.pluginSettings.autoStartRecording = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Daily note folder')
			.setDesc('Folder for iOS shortcut daily-note URLs. Match your daily notes settings, or leave blank for the vault root.')
			.addText(text => text
				.setPlaceholder('Daily')
				.setValue(this.plugin.pluginSettings.dailyNoteFolder)
				.onChange(async (value) => {
					this.plugin.pluginSettings.dailyNoteFolder = normalizePath(value);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Daily note date format')
			.setDesc('Date format for iOS shortcut daily-note URLs. Match your daily notes settings.')
			.addText(text => text
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- Moment date format tokens are case-sensitive.
				.setPlaceholder('YYYY-MM-DD')
				.setValue(this.plugin.pluginSettings.dailyNoteFormat)
				.onChange(async (value) => {
					this.plugin.pluginSettings.dailyNoteFormat = value.trim() || 'YYYY-MM-DD';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Use 24-hour time')
			.setDesc('Use 24-hour timestamps for recordings appended by iOS shortcut URLs. Turn off for am/pm.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.pluginSettings.use24HourTime)
				.onChange(async (value) => {
					this.plugin.pluginSettings.use24HourTime = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Language')
			.setDesc('Optional: force a specific language (e.g., "en", "es", "fr"). Leave empty for auto-detection.')
			.addText(text => text
				.setPlaceholder('Auto-detect')
				.setValue(this.plugin.pluginSettings.language || '')
				.onChange(async (value) => {
					this.plugin.pluginSettings.language = value || undefined;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable post-processing')
			.setDesc('Structure transcriptions into formatted Markdown using GPT. Raw transcript is saved first, then structured output is created if this is enabled.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.pluginSettings.enablePostProcessing)
				.onChange(async (value) => {
					this.plugin.pluginSettings.enablePostProcessing = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		if (this.plugin.pluginSettings.enablePostProcessing) {
			const configuredModel = normalizeChatModel(this.plugin.pluginSettings.chatModel);
			const hasCustomModel = !isCuratedChatModel(configuredModel);
			const showCustomModel = this.showCustomModelInput || hasCustomModel;

			new Setting(containerEl)
				.setName('Chat model')
				.setDesc('Choose a curated post-processing model, or select Custom model to enter any OpenAI model ID. Availability and cost depend on your OpenAI account.')
				.addDropdown(dropdown => {
					for (const [model, label] of CURATED_CHAT_MODELS) {
						dropdown.addOption(model, label);
					}
					dropdown.addOption(CUSTOM_CHAT_MODEL_OPTION, 'Custom model…')
						.setValue(showCustomModel ? CUSTOM_CHAT_MODEL_OPTION : configuredModel)
						.onChange(async (value) => {
							if (value === CUSTOM_CHAT_MODEL_OPTION) {
								this.showCustomModelInput = true;
								this.display();
								return;
							}

							this.showCustomModelInput = false;
							this.plugin.pluginSettings.chatModel = value;
							await this.plugin.saveSettings();
							this.display();
						});
				});

			if (showCustomModel) {
				let customModelDraft = hasCustomModel ? configuredModel : '';
				const saveCustomModel = async () => {
					const model = customModelDraft.trim();
					this.showCustomModelInput = false;
					if (!model) {
						this.display();
						return;
					}

					this.plugin.pluginSettings.chatModel = normalizeChatModel(model);
					await this.plugin.saveSettings();
					this.display();
				};

				new Setting(containerEl)
					.setName('Custom model name')
					.setDesc('Enter the exact model ID from OpenAI, then select Save or press Enter. Leave it blank to cancel.')
					.addText(text => {
						// eslint-disable-next-line obsidianmd/ui/sentence-case -- OpenAI model IDs are lowercase and case-sensitive.
						text.setPlaceholder('gpt-5.6-terra')
							.setValue(customModelDraft)
							.onChange((value) => {
								customModelDraft = value;
							});
						text.inputEl.addEventListener('keydown', (event) => {
							if (event.key === 'Enter') void saveCustomModel();
						});
					})
					.addButton(button => button
						.setButtonText('Save')
						.setCta()
						.onClick(saveCustomModel))
					.addButton(button => button
						.setButtonText('Cancel')
						.onClick(() => {
							this.showCustomModelInput = false;
							this.display();
						}));
			}

			new Setting(containerEl)
				.setName('Custom formatting prompt')
				.setDesc('Override the default prompt for structuring. Leave blank to use default.')
				.addTextArea(text => text
					.setPlaceholder('Leave blank for default prompt')
					.setValue(this.plugin.pluginSettings.postProcessingPrompt || '')
					.onChange(async (value) => {
						this.plugin.pluginSettings.postProcessingPrompt = value || undefined;
						await this.plugin.saveSettings();
					}));
		}
	}
}
