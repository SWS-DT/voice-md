import { Editor, MarkdownView, Notice, Plugin } from 'obsidian';
import { VoiceCommand } from './src/commands/voice-command';
import { TranscriptionJob, VoiceMDSettings, VoiceMDStoredData } from './src/types';
import { IndexedDBAudioStore } from './src/storage/indexeddb-audio-store';
import { JobQueue } from './src/jobs/job-queue';
import { ApiKeyStore } from './src/secrets/api-key-store';
import { VoiceMDProtocolHandler } from './src/url/voice-md-protocol';
import { DEFAULT_SETTINGS } from './src/settings/defaults';
import { VoiceMDSettingTab } from './src/settings/setting-tab';

export default class VoiceMDPlugin extends Plugin {
	pluginSettings!: VoiceMDSettings;
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
			getSettings: () => this.pluginSettings,
		});
		this.apiKeyStore = new ApiKeyStore(this.app, this.pluginSettings, () => this.saveSettings());
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

		const protocolHandler = new VoiceMDProtocolHandler(this.app, this.pluginSettings, () => this.createVoiceCommand());
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
		this.pluginSettings = this.storedData.settings;
		await this.saveStoredData();
	}

	async saveSettings() {
		this.storedData.settings = this.pluginSettings;
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
		return new VoiceCommand(this.app, this, this.pluginSettings, this.audioStore, this.jobQueue, this.apiKeyStore);
	}
}
