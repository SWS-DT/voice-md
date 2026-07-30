import { App, Editor, Notice, Plugin, TFile } from 'obsidian';
import { RecordingModal } from '../audio/audio-modal';
import { OpenAIClient } from '../api/openai-client';
import { ErrorHandler } from '../utils/error-handler';
import { TranscriptionJob, VoiceMDError, VoiceMDSettings } from '../types';
import { IndexedDBAudioStore } from '../storage/indexeddb-audio-store';
import { JobQueue, isRetryableJobError } from '../jobs/job-queue';
import { TranscriptionFiles } from '../output/transcription-files';
import { ApiKeyStore } from '../secrets/api-key-store';

/**
 * VoiceCommand orchestrates the voice recording workflow:
 * Recording → Durable queue → Transcription → Raw save → Optional structure → Insertion
 */
export interface VoiceCommandOptions {
	autoStart?: boolean;
	insertionMode?: 'cursor' | 'append-to-end';
	targetPath?: string;
}

export class VoiceCommand {
	constructor(
		private readonly app: App,
		private readonly plugin: Plugin,
		private readonly settings: VoiceMDSettings,
		private readonly audioStore: IndexedDBAudioStore,
		private readonly jobQueue: JobQueue,
		private readonly apiKeyStore: ApiKeyStore
	) {}

	execute(editor: Editor, options?: VoiceCommandOptions): void {
		const apiKey = this.apiKeyStore.getApiKey();
		if (!apiKey.trim()) {
			new Notice('OpenAI API key not configured, please set it in Voice MD settings', 6000);
			return;
		}

		const modal = new RecordingModal(
			this.app,
			this.plugin,
			this.settings,
			this.settings.maxRecordingDuration,
			async (audioBlob, meetingMode, enablePostProcessing) => {
				await this.handleRecording(audioBlob, editor, meetingMode, enablePostProcessing, options);
			},
			options?.autoStart ?? this.settings.autoStartRecording
		);

		modal.open();
	}

	async retryPending(editor?: Editor): Promise<void> {
		const jobs = this.jobQueue.listRetryable();
		if (jobs.length === 0) {
			new Notice('No pending Voice MD transcriptions to retry', 3000);
			return;
		}

		new Notice(`Retrying ${jobs.length} Voice MD transcription${jobs.length === 1 ? '' : 's'}...`, 4000);
		for (const job of jobs) {
			await this.processJob(job, editor);
		}
	}

	private async handleRecording(audioBlob: Blob, editor: Editor, meetingMode: boolean, enablePostProcessing: boolean, options?: VoiceCommandOptions): Promise<void> {
		let notice = new Notice('Saving recording safely...', 0);
		try {
			const audioKey = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
			await this.audioStore.put(audioKey, audioBlob);
			const job = await this.jobQueue.enqueue({
				audioKey,
				mimeType: audioBlob.type,
				size: audioBlob.size,
				meetingMode,
				enablePostProcessing,
				language: this.settings.language,
				chatModel: this.settings.chatModel,
				postProcessingPrompt: this.settings.postProcessingPrompt,
				insertionMode: options?.insertionMode ?? 'cursor',
				targetPath: options?.targetPath,
			});

			notice.hide();
			notice = new Notice('Transcribing audio...', 0);
			await this.processJob(job, editor, notice);
		} catch (error) {
			notice.hide();
			ErrorHandler.handle(error);
		}
	}

	private async processJob(job: TranscriptionJob, editor?: Editor, notice?: Notice): Promise<void> {
		let activeNotice = notice ?? new Notice('Transcribing audio...', 0);
		try {
			const apiKey = this.apiKeyStore.getApiKey();
			if (!apiKey.trim()) throw new Error('OpenAI API key not configured.');

			const processingJob = await this.jobQueue.markProcessing(job.id);
			if (!processingJob) {
				activeNotice.hide();
				return;
			}

			const audioBlob = await this.audioStore.get(processingJob.audioKey);
			if (!audioBlob) {
				await this.jobQueue.markFailed(processingJob.id, 'Saved audio is missing from local storage.', false);
				activeNotice.hide();
				new Notice('Saved audio is missing for a pending Voice MD job.', 6000);
				return;
			}

			const client = new OpenAIClient(apiKey);
			const result = await client.transcribe(audioBlob, { language: processingJob.language }, processingJob.meetingMode);
			if (!result.text?.trim()) {
				await this.jobQueue.markFailed(processingJob.id, 'Transcription was empty.', false);
				activeNotice.hide();
				new Notice('Transcription was empty', 3000);
				return;
			}

			let formattedText = result.text;
			if (processingJob.meetingMode && result.segments) {
				formattedText = this.formatWithSpeakers(result.segments);
			}

			const files = new TranscriptionFiles(this.app);
			const raw = await files.saveRaw(formattedText);
			let structuredPath: string | undefined;
			let insertionText = formattedText;

			if (processingJob.enablePostProcessing) {
				activeNotice.hide();
				activeNotice = new Notice('Structuring text...', 0);
				try {
					const structuredText = await client.structureText(formattedText, processingJob.chatModel, processingJob.postProcessingPrompt);
					structuredPath = await files.saveStructured(structuredText, raw.rawPath, raw.baseName);
					insertionText = structuredText;
				} catch (postProcessingError) {
					ErrorHandler.handle(postProcessingError);
				}
			}

			await this.insertResult(processingJob, insertionText, editor);
			await this.jobQueue.markSucceeded(processingJob.id, raw.rawPath, structuredPath);
			await this.audioStore.delete(processingJob.audioKey).catch(() => undefined);
			activeNotice.hide();
			new Notice(structuredPath ? 'Transcription complete, raw and structured files saved' : 'Transcription complete, raw file saved', 5000);
		} catch (error) {
			activeNotice.hide();
			const retryable = error instanceof VoiceMDError ? isRetryableJobError(error.errorType) : true;
			await this.jobQueue.markFailed(job.id, error instanceof Error ? error.message : String(error), retryable);
			ErrorHandler.handle(error);
			if (retryable) new Notice('Recording was saved. Retry later with the Voice MD retry command.', 8000);
		}
	}

	private async insertResult(job: TranscriptionJob, insertionText: string, editor?: Editor): Promise<void> {
		if (job.insertionMode === 'append-to-end') {
			const recordingBlock = this.createRecordingBlock(insertionText);
			if (editor) {
				this.appendToEnd(editor, recordingBlock);
				return;
			}
			if (job.targetPath) {
				await this.appendToFile(job.targetPath, recordingBlock);
			}
			return;
		}

		if (editor) this.insertAtCursorAsParagraph(editor, insertionText);
	}

	private insertAtCursorAsParagraph(editor: Editor, text: string): void {
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		const beforeCursor = line.slice(0, cursor.ch).trim();
		const afterCursor = line.slice(cursor.ch).trim();
		const prefix = beforeCursor ? '\n\n' : '';
		const suffix = afterCursor ? '\n\n' : '\n';
		editor.replaceRange(`${prefix}${text.trim()}${suffix}`, cursor);
	}

	private appendToEnd(editor: Editor, text: string): void {
		const lastLine = editor.lastLine();
		const lastLineText = editor.getLine(lastLine);
		const insertPosition = { line: lastLine, ch: lastLineText.length };
		const prefix = editor.getValue().trim() ? '\n\n' : '';
		editor.replaceRange(`${prefix}${text.trim()}\n`, insertPosition);
	}

	private async appendToFile(path: string, text: string): Promise<void> {
		const target = this.app.vault.getAbstractFileByPath(path);
		if (!(target instanceof TFile)) return;

		const append = (existing: string) => {
			const prefix = existing.trim() ? '\n\n' : '';
			return `${existing}${prefix}${text.trim()}\n`;
		};

		const existing = await this.app.vault.read(target);
		const updated = append(existing);
		await this.app.vault.append(target, updated.slice(existing.length));
	}

	private createRecordingBlock(insertionText: string): string {
		const timestamp = this.formatRecordingTime(new Date());
		return `## ${timestamp}\n\n${insertionText.trim()}`;
	}

	private formatRecordingTime(date: Date): string {
		if (this.settings.use24HourTime) {
			return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
		}
		const hours = date.getHours();
		const displayHours = hours % 12 || 12;
		const minutes = String(date.getMinutes()).padStart(2, '0');
		return `${displayHours}:${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;
	}

	private formatWithSpeakers(segments: Array<{text: string; speaker?: string}>): string {
		let currentSpeaker: string | undefined;
		let formatted = '';

		for (const segment of segments) {
			if (segment.speaker && segment.speaker !== currentSpeaker) {
				currentSpeaker = segment.speaker;
				formatted += `\n\n**Speaker ${segment.speaker}:** `;
			}
			formatted += segment.text.trim() + ' ';
		}

		return formatted.trim();
	}
}
