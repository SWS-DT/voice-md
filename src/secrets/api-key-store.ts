import { App } from 'obsidian';
import { VoiceMDSettings } from '../types';

interface SecretStorageLike {
	getSecret(key: string): string | null;
	setSecret(key: string, value: string): void;
}

export class ApiKeyStore {
	private readonly secretKey = 'voice-md-openai-api-key';

	constructor(private readonly app: App, private readonly settings: VoiceMDSettings, private readonly saveSettings: () => Promise<void>) {}

	getApiKey(): string {
		const secret = this.getSecretStorage();
		if (secret) {
			const value = secret.getSecret(this.secretKey);
			if (value) return value;
		}
		return this.settings.openaiApiKey;
	}

	async setApiKey(value: string): Promise<void> {
		const secret = this.getSecretStorage();
		if (secret) {
			secret.setSecret(this.secretKey, value);
			this.settings.openaiApiKey = '';
		} else {
			this.settings.openaiApiKey = value;
		}
		await this.saveSettings();
	}

	async migratePlaintextKey(): Promise<void> {
		if (!this.settings.openaiApiKey) return;
		const secret = this.getSecretStorage();
		if (!secret) return;

		const existing = secret.getSecret(this.secretKey);
		if (!existing) {
			secret.setSecret(this.secretKey, this.settings.openaiApiKey);
		}
		this.settings.openaiApiKey = '';
		await this.saveSettings();
	}

	usesSecretStorage(): boolean {
		return this.getSecretStorage() !== null;
	}

	private getSecretStorage(): SecretStorageLike | null {
		const candidate = (this.app as unknown as Record<string, unknown>)['secretStorage'];
		if (!candidate || typeof candidate !== 'object') return null;
		const storage = candidate as Partial<SecretStorageLike>;
		return typeof storage.getSecret === 'function' && typeof storage.setSecret === 'function'
			? storage as SecretStorageLike
			: null;
	}
}
