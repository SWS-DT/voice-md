import { App, MarkdownView, moment, normalizePath, Notice, ObsidianProtocolData, TFile, TFolder } from 'obsidian';
import { VoiceCommand } from '../commands/voice-command';
import { VoiceMDSettings } from '../types';

const EDITOR_WAIT_ATTEMPTS = 24;
const EDITOR_WAIT_DELAY_MS = 250;

export class VoiceMDProtocolHandler {
	constructor(
		private readonly app: App,
		private readonly settings: VoiceMDSettings,
		private readonly createVoiceCommand: () => VoiceCommand
	) {}

	handle(data: ObsidianProtocolData): void {
		void this.handleAsync(data).catch((error) => {
			console.error('Voice MD URL shortcut failed', error);
			new Notice(`Voice MD shortcut failed: ${error instanceof Error ? error.message : String(error)}`, 8000);
		});
	}

	private async handleAsync(data: ObsidianProtocolData): Promise<void> {
		if (!this.isTruthy(this.getParam(data, 'record'))) {
			new Notice('Voice MD shortcut ignored because record=true was not provided.', 5000);
			return;
		}

		await this.waitForLayoutReady();

		let openedPath: string | undefined;
		const targetPath = this.getTargetPath(data);
		if (targetPath) {
			const file = await this.openOrCreateMarkdownFile(targetPath);
			openedPath = file.path;
			const workspace = this.app.workspace as unknown as {
				getLeaf?: (newLeaf?: boolean) => { openFile(file: TFile): Promise<void> };
				getUnpinnedLeaf(): { openFile(file: TFile): Promise<void> };
			};
			const leaf = typeof workspace.getLeaf === 'function'
				? workspace.getLeaf(false)
				: workspace.getUnpinnedLeaf();
			await leaf.openFile(file);
		}

		const editor = await this.waitForActiveEditor();
		if (!editor) {
			new Notice('Voice MD could not find an active markdown editor for this shortcut.', 7000);
			return;
		}

		const autoStart = this.isTruthy(this.getParam(data, 'autostart'));
		this.createVoiceCommand().execute(editor, {
			autoStart,
			insertionMode: 'append-to-end',
			targetPath: openedPath,
		});
	}

	private getTargetPath(data: ObsidianProtocolData): string | undefined {
		const explicitFile = this.getParam(data, 'file');
		if (explicitFile !== undefined) {
			return this.ensureMarkdownPath(explicitFile);
		}

		if (this.isTruthy(this.getParam(data, 'daily'))) {
			const today = (moment as unknown as () => { format(format: string): string })();
			const fileName = `${today.format(this.settings.dailyNoteFormat || 'YYYY-MM-DD')}.md`;
			return this.ensureMarkdownPath([this.settings.dailyNoteFolder, fileName].filter(Boolean).join('/'));
		}

		return undefined;
	}

	private async openOrCreateMarkdownFile(path: string): Promise<TFile> {
		const normalizedPath = this.ensureMarkdownPath(path);
		const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (existing instanceof TFile) {
			if (existing.extension !== 'md') {
				throw new Error('Shortcut target must be a markdown file.');
			}
			return existing;
		}
		if (existing instanceof TFolder) {
			throw new Error('Shortcut target path is a folder.');
		}

		await this.createParentFolders(normalizedPath);
		return this.app.vault.create(normalizedPath, '');
	}

	private async createParentFolders(path: string): Promise<void> {
		const parts = path.split('/');
		parts.pop();
		let currentPath = '';

		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			const existing = this.app.vault.getAbstractFileByPath(currentPath);
			if (existing instanceof TFolder) {
				continue;
			}
			if (existing) {
				throw new Error(`Cannot create folder ${currentPath}; a file already exists there.`);
			}
			await this.app.vault.adapter.mkdir(currentPath);
		}
	}

	private async waitForLayoutReady(): Promise<void> {
		await new Promise<void>((resolve) => this.app.workspace.onLayoutReady(resolve));
	}

	private async waitForActiveEditor() {
		for (let attempt = 0; attempt < EDITOR_WAIT_ATTEMPTS; attempt++) {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view?.editor) {
				return view.editor;
			}
			await this.sleep(EDITOR_WAIT_DELAY_MS);
		}
		return undefined;
	}

	private ensureMarkdownPath(path: string): string {
		const trimmedPath = path.trim();
		if (!trimmedPath) {
			throw new Error('Shortcut target path cannot be empty.');
		}
		if (trimmedPath.startsWith('/') || trimmedPath.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(trimmedPath)) {
			throw new Error('Shortcut target path must be vault-relative.');
		}

		const rawParts = trimmedPath.split(/[\\/]+/);
		if (rawParts.some((part) => part === '..' || part === '.')) {
			throw new Error('Shortcut target path cannot include traversal segments.');
		}

		const normalizedPath = normalizePath(trimmedPath);
		const normalizedParts = normalizedPath.split('/');
		if (!normalizedPath || normalizedPath.startsWith('/') || normalizedParts.some((part) => !part || part === '..' || part === '.')) {
			throw new Error('Shortcut target path is invalid.');
		}

		const fileName = normalizedParts[normalizedParts.length - 1];
		if (!fileName) {
			throw new Error('Shortcut target path is invalid.');
		}
		if (/\.[^/.]+$/.test(fileName) && !fileName.toLowerCase().endsWith('.md')) {
			throw new Error('Shortcut target must be a markdown file.');
		}

		return normalizedPath.toLowerCase().endsWith('.md') ? normalizedPath : `${normalizedPath}.md`;
	}

	private getParam(data: ObsidianProtocolData, key: string): string | undefined {
		const value = data[key] as string | string[] | undefined;
		if (Array.isArray(value)) {
			return value[0];
		}
		return value;
	}

	private isTruthy(value: string | undefined): boolean {
		return value === 'true' || value === '1' || value === 'yes';
	}

	private async sleep(ms: number): Promise<void> {
		await new Promise((resolve) => window.setTimeout(resolve, ms));
	}
}
