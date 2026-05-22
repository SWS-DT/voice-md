import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { VoiceCommand } from './src/commands/voice-command';
import { TranscriptionJob, VoiceMDSettings, VoiceMDStoredData } from './src/types';
import { IndexedDBAudioStore } from './src/storage/indexeddb-audio-store';
import { JobQueue } from './src/jobs/job-queue';
import { ApiKeyStore } from './src/secrets/api-key-store';
import { VoiceMDProtocolHandler } from './src/url/voice-md-protocol';

const DEFAULT_SETTINGS: VoiceMDSettings = {
	openaiApiKey: '',
	chatModel: 'gpt-4o-mini',
	enablePostProcessing: false,
	postProcessingPrompt: undefined,
	language: undefined,
	maxRecordingDuration: 300,
	autoStartRecording: false,
	failedAudioRetentionDays: 7,
	dailyNoteFolder: '',
	dailyNoteFormat: 'YYYY-MM-DD',
};

export default class VoiceMDPlugin extends Plugin {
	settings!: VoiceMDSettings;
	storedData!: VoiceMDStoredData;
	private audioStore!: IndexedDBAudioStore;
	private jobQueue!: JobQueue;
	private apiKeyStore!: ApiKeyStore;

	async onload() {
		await this.loadSettings();

		this.audioStore = new IndexedDBAudioStore();
		this.jobQueue = new JobQueue({
			getJobs: () => this.storedData.jobs,
			saveJobs: async (jobs) => {
				this.storedData.jobs = jobs;
				await this.saveStoredData();
			},
			getSettings: () => this.settings,
		});
		this.apiKeyStore = new ApiKeyStore(this.app, this.settings, () => this.saveSettings());
		const interruptedJobs = this.storedData.jobs.filter((job) => job.status === 'processing');
		if (interruptedJobs.length > 0) {
			this.storedData.jobs = this.storedData.jobs.map((job) => job.status === 'processing' ? { ...job, status: 'pending', retryable: true, updatedAt: Date.now() } : job);
			await this.saveStoredData();
		}
		await this.apiKeyStore.migratePlaintextKey();
		await this.jobQueue.purgeExpired((key) => this.audioStore.delete(key));

		const pendingCount = this.jobQueue.listRetryable().length;
		if (pendingCount > 0) {
			new Notice(`Voice MD has ${pendingCount} pending transcription${pendingCount === 1 ? '' : 's'}. Run “Retry pending voice transcriptions” to continue.`, 10000);
		}

		this.addRibbonIcon('voicemail', 'Start voice recording', () => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				void this.createVoiceCommand().execute(view.editor);
			}
		});

		this.addCommand({
			id: 'start-voice-recording',
			name: 'Start voice recording',
			icon: 'voicemail',
			editorCallback: (editor: Editor) => {
				void this.createVoiceCommand().execute(editor);
			},
		});

		this.addCommand({
			id: 'retry-pending-transcriptions',
			name: 'Retry pending voice transcriptions',
			callback: () => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				void this.createVoiceCommand().retryPending(view?.editor);
			},
		});

		const protocolHandler = new VoiceMDProtocolHandler(this.app, this.settings, () => this.createVoiceCommand());
		this.registerObsidianProtocolHandler('voice-md', (data) => protocolHandler.handle(data));

		this.addCommand({
			id: 'show-pending-transcriptions',
			name: 'Show pending voice transcriptions count',
			callback: () => {
				const jobs = this.jobQueue.listRetryable();
				new Notice(`Voice MD has ${jobs.length} retryable pending transcription${jobs.length === 1 ? '' : 's'}.`, 5000);
			},
		});

		this.addSettingTab(new VoiceMDSettingTab(this.app, this));
	}

	onunload() {
		// Cleanup is handled automatically by Obsidian
	}

	async loadSettings() {
		const loaded = await this.loadData() as Partial<VoiceMDStoredData> & Partial<VoiceMDSettings> | null;
		if (loaded && 'settings' in loaded) {
			this.storedData = {
				schemaVersion: 2,
				settings: Object.assign({}, DEFAULT_SETTINGS, loaded.settings),
				jobs: Array.isArray(loaded.jobs) ? loaded.jobs : [],
			};
		} else {
			this.storedData = {
				schemaVersion: 2,
				settings: Object.assign({}, DEFAULT_SETTINGS, loaded ?? {}),
				jobs: [],
			};
		}
		this.settings = this.storedData.settings;
		await this.saveStoredData();
	}

	async saveSettings() {
		this.storedData.settings = this.settings;
		await this.saveStoredData();
	}

	getRetryableJobs(): TranscriptionJob[] {
		return this.jobQueue.listRetryable();
	}

	getApiKeyStore(): ApiKeyStore {
		return this.apiKeyStore;
	}

	retryPendingJobs(editor?: Editor): Promise<void> {
		return this.createVoiceCommand().retryPending(editor);
	}

	private async saveStoredData() {
		await this.saveData(this.storedData);
	}

	private createVoiceCommand(): VoiceCommand {
		return new VoiceCommand(this.app, this, this.settings, this.audioStore, this.jobQueue, this.apiKeyStore);
	}
}

class VoiceMDSettingTab extends PluginSettingTab {
	plugin: VoiceMDPlugin;

	constructor(app: App, plugin: VoiceMDPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

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
					.setValue(this.plugin.getApiKeyStore().usesSecretStorage() ? '' : this.plugin.settings.openaiApiKey);
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
				.setValue(String(this.plugin.settings.maxRecordingDuration))
				.onChange(async (value) => {
					const numValue = parseInt(value);
					if (!isNaN(numValue) && numValue > 0) {
						this.plugin.settings.maxRecordingDuration = numValue;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Retain failed audio')
			.setDesc('Days to keep local audio for failed or pending transcription retries. Audio is deleted after successful transcription. Default: 7 days.')
			.addText(text => text
				.setPlaceholder('7')
				.setValue(String(this.plugin.settings.failedAudioRetentionDays))
				.onChange(async (value) => {
					const numValue = parseInt(value);
					if (!isNaN(numValue) && numValue > 0) {
						this.plugin.settings.failedAudioRetentionDays = numValue;
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
				.setValue(this.plugin.settings.autoStartRecording)
				.onChange(async (value) => {
					this.plugin.settings.autoStartRecording = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Daily note folder')
			.setDesc('Folder for iOS shortcut daily-note URLs. Match your daily notes settings, or leave blank for the vault root.')
			.addText(text => text
				.setPlaceholder('Daily')
				.setValue(this.plugin.settings.dailyNoteFolder)
				.onChange(async (value) => {
					this.plugin.settings.dailyNoteFolder = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Daily note date format')
			.setDesc('Date format for iOS shortcut daily-note URLs. Match your daily notes settings.')
			.addText(text => text
				// eslint-disable-next-line obsidianmd/ui/sentence-case -- Moment date format tokens are case-sensitive.
				.setPlaceholder('YYYY-MM-DD')
				.setValue(this.plugin.settings.dailyNoteFormat)
				.onChange(async (value) => {
					this.plugin.settings.dailyNoteFormat = value.trim() || 'YYYY-MM-DD';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Language')
			.setDesc('Optional: force a specific language (e.g., "en", "es", "fr"). Leave empty for auto-detection.')
			.addText(text => text
				.setPlaceholder('Auto-detect')
				.setValue(this.plugin.settings.language || '')
				.onChange(async (value) => {
					this.plugin.settings.language = value || undefined;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable post-processing')
			.setDesc('Structure transcriptions into formatted Markdown using GPT. Raw transcript is saved first, then structured output is created if this is enabled.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enablePostProcessing)
				.onChange(async (value) => {
					this.plugin.settings.enablePostProcessing = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		if (this.plugin.settings.enablePostProcessing) {
			new Setting(containerEl)
				.setName('Chat model')
				.setDesc('OpenAI model for post-processing (e.g., gpt-4o-mini, gpt-4o), note: adds cost per transcription')
				.addText(text => text
					.setPlaceholder('gpt-4o-mini')
					.setValue(this.plugin.settings.chatModel)
					.onChange(async (value) => {
						this.plugin.settings.chatModel = value || 'gpt-4o-mini';
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Custom formatting prompt')
				.setDesc('Override the default prompt for structuring. Leave blank to use default.')
				.addTextArea(text => text
					.setPlaceholder('Leave blank for default prompt')
					.setValue(this.plugin.settings.postProcessingPrompt || '')
					.onChange(async (value) => {
						this.plugin.settings.postProcessingPrompt = value || undefined;
						await this.plugin.saveSettings();
					}));
		}
	}
}
