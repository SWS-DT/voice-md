import { App, normalizePath } from 'obsidian';

export interface TranscriptionFileResult {
	rawPath: string;
	structuredPath?: string;
}

export class TranscriptionFiles {
	constructor(private readonly app: App) {}

	async saveRaw(rawText: string, timestamp = new Date()): Promise<{ rawPath: string; baseName: string }> {
		const folderPath = await this.ensureFolder();
		const baseName = this.createUniqueBaseName(folderPath, timestamp);
		const rawPath = `${folderPath}/${baseName}-raw.md`;
		await this.app.vault.create(rawPath, rawText);
		return { rawPath, baseName };
	}

	async saveStructured(structuredText: string, rawPath: string, baseName: string): Promise<string> {
		const folderPath = normalizePath('Voice Transcriptions');
		const structuredPath = `${folderPath}/${baseName}.md`;
		const rawName = rawPath.split('/').pop()?.replace(/\.md$/, '') ?? `${baseName}-raw`;
		const structuredContent = `> Raw transcription: [[${rawName}]]\n\n${structuredText}`;
		await this.app.vault.create(structuredPath, structuredContent);
		return structuredPath;
	}

	private async ensureFolder(): Promise<string> {
		const folderPath = normalizePath('Voice Transcriptions');
		const existingFolder = this.app.vault.getFolderByPath(folderPath);
		if (!existingFolder) {
			if (this.app.vault.getFileByPath(folderPath)) {
				throw new Error('Voice Transcriptions exists but is not a folder.');
			}
			await this.app.vault.createFolder(folderPath);
		}
		return folderPath;
	}

	private createUniqueBaseName(folderPath: string, timestamp: Date): string {
		const stamp = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')}-${String(timestamp.getHours()).padStart(2, '0')}${String(timestamp.getMinutes()).padStart(2, '0')}${String(timestamp.getSeconds()).padStart(2, '0')}`;
		let baseName = `transcription-${stamp}`;
		let suffix = 1;
		while (this.app.vault.getFileByPath(`${folderPath}/${baseName}-raw.md`) || this.app.vault.getFileByPath(`${folderPath}/${baseName}.md`)) {
			baseName = `transcription-${stamp}-${suffix}`;
			suffix++;
		}
		return baseName;
	}
}
