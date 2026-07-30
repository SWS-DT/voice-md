export const DEFAULT_CHAT_MODEL = 'gpt-5.4-mini';
export const CUSTOM_CHAT_MODEL_OPTION = '__custom__';

// Keep this list to model IDs documented for the OpenAI Chat Completions API.
// Labels are intentionally factual so they do not become stale as pricing and capabilities change.
export const CURATED_CHAT_MODELS: ReadonlyArray<readonly [model: string, label: string]> = [
	['gpt-5.4-mini', 'gpt-5.4-mini — Default'],
	['gpt-5.6-sol', 'gpt-5.6-sol'],
	['gpt-5.5', 'gpt-5.5'],
	['gpt-5.4', 'gpt-5.4'],
	['gpt-5.4-nano', 'gpt-5.4-nano'],
	['gpt-5-mini', 'gpt-5-mini'],
	['gpt-4.1-mini', 'gpt-4.1-mini'],
	['gpt-4o-mini', 'gpt-4o-mini'],
];

export function normalizeChatModel(model: unknown): string {
	return typeof model === 'string' && model.trim() ? model.trim() : DEFAULT_CHAT_MODEL;
}

export function isCuratedChatModel(model: string): boolean {
	return CURATED_CHAT_MODELS.some(([candidate]) => candidate === model);
}
