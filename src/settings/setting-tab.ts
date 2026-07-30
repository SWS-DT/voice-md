import { App, MarkdownView, normalizePath, PluginSettingTab, Setting } from 'obsidian';
import type VoiceMDPlugin from '../../main';

export class VoiceMDSettingTab extends PluginSettingTab {
	readonly plugin: VoiceMDPlugin;

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
			new Setting(containerEl)
				.setName('Chat model')
				.setDesc('OpenAI model for post-processing (e.g., gpt-4o-mini, gpt-4o), note: adds cost per transcription')
				.addText(text => text
					.setPlaceholder('gpt-4o-mini')
					.setValue(this.plugin.pluginSettings.chatModel)
					.onChange(async (value) => {
						this.plugin.pluginSettings.chatModel = value || 'gpt-4o-mini';
						await this.plugin.saveSettings();
					}));

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
