import type { VoiceMDSettings } from '../types';

export const DEFAULT_SETTINGS: VoiceMDSettings = {
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
	use24HourTime: true,
};
