export class IndexedDBAudioStore {
	private readonly dbName = 'voice-md-audio';
	private readonly storeName = 'audio';
	private dbPromise: Promise<IDBDatabase> | null = null;

	isAvailable(): boolean {
		return typeof indexedDB !== 'undefined';
	}

	async put(key: string, blob: Blob): Promise<void> {
		const db = await this.open();
		await this.request<void>(() => db.transaction(this.storeName, 'readwrite').objectStore(this.storeName).put(blob, key));
	}

	async get(key: string): Promise<Blob | null> {
		const db = await this.open();
		const result = await this.request<Blob | undefined>(() => db.transaction(this.storeName, 'readonly').objectStore(this.storeName).get(key));
		return result ?? null;
	}

	async delete(key: string): Promise<void> {
		const db = await this.open();
		await this.request<void>(() => db.transaction(this.storeName, 'readwrite').objectStore(this.storeName).delete(key));
	}

	private async open(): Promise<IDBDatabase> {
		if (!this.isAvailable()) {
			throw new Error('IndexedDB is not available in this Obsidian environment.');
		}

		this.dbPromise ??= new Promise((resolve, reject) => {
			const request = indexedDB.open(this.dbName, 1);
			request.onupgradeneeded = () => {
				request.result.createObjectStore(this.storeName);
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error ?? new Error('Failed to open audio storage.'));
		});

		return this.dbPromise;
	}

	private request<T>(factory: () => IDBRequest): Promise<T> {
		return new Promise((resolve, reject) => {
			const request = factory();
			request.onsuccess = () => resolve(request.result as T);
			request.onerror = () => reject(request.error ?? new Error('Audio storage request failed.'));
		});
	}
}
