import { TranscriptionJob, TranscriptionJobStatus, VoiceMDSettings } from '../types';

interface JobQueueDataAccess {
	getJobs(): TranscriptionJob[];
	saveJobs(jobs: TranscriptionJob[]): Promise<void>;
	getSettings(): VoiceMDSettings;
}

export class JobQueue {
	constructor(private readonly data: JobQueueDataAccess) {}

	async enqueue(params: Omit<TranscriptionJob, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'attempts' | 'retryable'>): Promise<TranscriptionJob> {
		const now = Date.now();
		const job: TranscriptionJob = {
			...params,
			id: this.createId(),
			createdAt: now,
			updatedAt: now,
			status: 'pending',
			attempts: 0,
			retryable: true,
		};

		await this.upsert(job);
		return job;
	}

	listAll(): TranscriptionJob[] {
		return [...this.data.getJobs()].sort((a, b) => a.createdAt - b.createdAt);
	}

	listRetryable(): TranscriptionJob[] {
		return this.listAll().filter((job) => (job.status === 'pending' || job.status === 'failed') && job.retryable);
	}

	get(id: string): TranscriptionJob | undefined {
		return this.data.getJobs().find((job) => job.id === id);
	}

	async markProcessing(id: string): Promise<TranscriptionJob | undefined> {
		const job = this.get(id);
		if (!job) return undefined;
		return this.upsert({ ...job, status: 'processing', attempts: job.attempts + 1, updatedAt: Date.now() });
	}

	async markFailed(id: string, message: string, retryable: boolean): Promise<TranscriptionJob | undefined> {
		const job = this.get(id);
		if (!job) return undefined;
		return this.upsert({ ...job, status: 'failed', lastError: message, retryable, updatedAt: Date.now() });
	}

	async markSucceeded(id: string, rawPath?: string, structuredPath?: string): Promise<TranscriptionJob | undefined> {
		const job = this.get(id);
		if (!job) return undefined;
		return this.upsert({ ...job, status: 'succeeded', rawPath, structuredPath, retryable: false, lastError: undefined, updatedAt: Date.now() });
	}

	async purgeExpired(deleteAudio: (key: string) => Promise<void>): Promise<number> {
		const retentionMs = Math.max(1, this.data.getSettings().failedAudioRetentionDays) * 24 * 60 * 60 * 1000;
		const cutoff = Date.now() - retentionMs;
		const jobs = this.data.getJobs();
		const keep: TranscriptionJob[] = [];
		let purged = 0;

		for (const job of jobs) {
			const expired = job.status === 'succeeded' || ((job.status === 'failed' || job.status === 'pending') && job.updatedAt < cutoff);
			if (expired) {
				await deleteAudio(job.audioKey).catch(() => undefined);
				purged++;
			} else {
				keep.push(job);
			}
		}

		if (purged > 0) await this.data.saveJobs(keep);
		return purged;
	}

	private async upsert(job: TranscriptionJob): Promise<TranscriptionJob> {
		const jobs = this.data.getJobs().filter((existing) => existing.id !== job.id);
		jobs.push(job);
		await this.data.saveJobs(jobs);
		return job;
	}

	private createId(): string {
		return `job-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
	}
}

export function isRetryableJobError(errorType: string | undefined): boolean {
	return errorType === 'NETWORK_ERROR' || errorType === 'API_ERROR' || errorType === 'POST_PROCESSING_ERROR';
}

export function isJobStatus(value: string): value is TranscriptionJobStatus {
	return ['pending', 'processing', 'failed', 'succeeded'].includes(value);
}
