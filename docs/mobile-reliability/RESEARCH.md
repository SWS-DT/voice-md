# Mobile Reliability — Research

## Summary of the request

Implement the smallest coherent foundation for mobile reliability in Voice MD so a mobile user can record, lose network or close Obsidian, reopen later, retry transcription, and still get both a raw transcript and a structured note. The requested focus areas are durable browser-compatible audio persistence, retryable persisted jobs, raw transcript-first saves, recovery/retry affordances, retention controls, API-key migration toward SecretStorage, OpenAI upload-size guardrails, and stale changelog/release hygiene.

## Relevant architecture and current behavior

### Plugin lifecycle and settings

- `main.ts` defines `VoiceMDPlugin`, `DEFAULT_SETTINGS`, `loadSettings()`, `saveSettings()`, commands, ribbon icon, and settings tab.
- Current persisted plugin data is treated as a flat `VoiceMDSettings` object via `this.loadData()` / `this.saveData(this.settings)`.
- There is no separate persisted queue/store metadata and no startup recovery flow.
- The only command is `start-voice-recording`; it requires an editor callback. The ribbon action gets the active `MarkdownView` and silently does nothing if no editor exists.

### Recording flow

- `src/audio/recorder.ts` wraps `navigator.mediaDevices.getUserMedia()` and `MediaRecorder`.
- `MediaRecorder.start(100)` emits chunks every 100 ms, but chunks are only accumulated in memory (`audioChunks: Blob[]`).
- `stop()` returns a final `Blob`; `cleanup()` clears chunks and media resources.
- If Obsidian/mobile WebView is closed during recording, current in-memory chunks are lost.
- MIME-type selection is browser/mobile compatible in intent: WebM first, then MP4/AAC for iOS Safari, OGG, WAV, and empty fallback.

### Modal and user flow

- `src/audio/audio-modal.ts` provides the recording UI, meeting-mode checkbox, post-processing checkbox, timer, auto-stop, and stop handling.
- On stop, it calls `onRecordingComplete(blob, meetingMode, postProcessingEnabled)` and closes after completion.
- If transcription/post-processing fails, errors bubble back from `VoiceCommand.handleRecording()` only as user notices; no durable retry job is created.
- `onClose()` always calls `recorder.cleanup()`, so closing/canceling discards any in-memory recording.
- DOM event listeners are attached directly to modal-owned elements. This is acceptable for modal-local cleanup, though long-lived plugin listeners should use Obsidian register helpers.

### Transcription and note creation

- `src/commands/voice-command.ts` orchestrates `Recording → Transcription → Insert`.
- `execute(editor)` refuses to open the modal unless `settings.openaiApiKey` is present.
- `handleRecording()` creates `OpenAIClient`, calls `client.transcribe()`, formats speaker segments when meeting mode is enabled, then either:
  - post-processing enabled: calls `client.structureText()`, then creates raw + structured files, then inserts structured text into the editor; or
  - post-processing disabled: inserts raw text into the editor only and saves no files.
- Raw transcript is **not** saved before structured note generation. `createTranscriptionFiles()` is called only after structuring succeeds.
- If post-processing fails, the fallback inserts raw text and shows an error but does not save the raw file.
- File output currently uses `normalizePath('Voice Transcriptions')` then `this.app.vault.create(folderPath, '')` when absent. This appears to create a file named `Voice Transcriptions`, not a folder; Obsidian folder creation should use `this.app.vault.createFolder(folderPath)`. This may be an existing runtime bug for post-processing output.
- File names are timestamped to second precision; collisions are possible if multiple jobs complete in the same second.

### OpenAI client and errors

- `src/api/openai-client.ts` uses the OpenAI SDK with `dangerouslyAllowBrowser: true`, required for this browser/Obsidian runtime but important to disclose because the API key is used client-side.
- `transcribe()` converts a `Blob` to a `File` named `recording.webm` regardless of actual MIME type; type is set from `audioBlob.type`.
- No upload-size guard exists. OpenAI audio transcription APIs commonly enforce a 25 MB file limit; current code can attempt oversized uploads and fail after recording.
- `src/utils/error-handler.ts` maps OpenAI errors to `VoiceMDError` and user notices. Network detection only checks Node-style `ENOTFOUND`/`ETIMEDOUT`; browser/mobile fetch failures may surface as different shapes/messages and may currently become generic API errors.

### API key storage

- `VoiceMDSettings.openaiApiKey` is stored in normal plugin data.
- Installed `obsidian` types expose `app.secretStorage` / `SecretStorage` since Obsidian `1.11.4` (`setSecret`, `getSecret`, `listSecrets`).
- `manifest.json` currently has `minAppVersion: "0.15.0"`. If SecretStorage is used without a min-version bump, implementation must feature-detect it at runtime and gracefully fall back to existing plugin data. If min app version is bumped to `1.11.4`, update `versions.json` accordingly and consider release impact.

### Release/docs state

- `package.json`, `manifest.json`, and `versions.json` are at `1.3.2`.
- `CHANGELOG.md` stops at `1.2.6`; it is stale relative to the current manifest/package version.
- `README.md` privacy section currently says audio is never stored on disk/written to vault and API key stays in local Obsidian storage. Mobile reliability changes will require updates to accurately describe local temporary audio retention, queueing, raw/structured note saves, OpenAI data flow, and optional SecretStorage/fallback behavior.

## Files/components likely to change

High-likelihood product code changes:

- `main.ts`
  - Add defaults for retention and possibly queue metadata.
  - Add startup recovery notice/affordance.
  - Add command(s) such as `retry-pending-transcriptions` / `show-pending-transcriptions`.
  - Add settings for audio retention and maybe migration/SecretStorage API key handling.
  - Potentially refactor settings persistence to avoid overwriting queue metadata.
- `src/types.ts`
  - Add job queue types, job statuses, recording metadata, retention setting(s), stored-data shape, and storage abstractions.
  - Add error type(s) for oversized audio / retryable failures if useful.
- `src/audio/recorder.ts`
  - Add optional chunk persistence callback/session ID or a way to expose chunks as they arrive.
  - Preserve mobile-compatible `MediaRecorder` usage.
- `src/audio/audio-modal.ts`
  - Wire recording session persistence.
  - Update stop/cancel behavior and UX copy to reflect safe persistence/retry.
- `src/commands/voice-command.ts`
  - Persist final audio before transcription.
  - Create/update retryable jobs.
  - Save raw transcript before structuring.
  - Retry existing jobs independent of the original editor where necessary.
  - Fix folder creation (`createFolder`) and file path collision handling.
- `src/api/openai-client.ts`
  - Add upload-size guard before API call or in command layer.
  - Use file extension/name that matches MIME type if practical.
- `src/utils/error-handler.ts`
  - Classify browser/mobile network failures as retryable network errors.
  - Add user-friendly oversized-file messaging.

Likely new modules:

- `src/storage/audio-store.ts` or `src/storage/indexeddb-audio-store.ts`
  - Browser-compatible IndexedDB wrapper for recording/chunk `Blob`s.
- `src/jobs/job-queue.ts`
  - Persisted job metadata through plugin data; operations to enqueue, mark processing/succeeded/failed, retry, purge expired audio.
- `src/output/transcription-files.ts`
  - Extract raw/structured file creation from `VoiceCommand` for reuse by initial and retry flows.
- `src/secrets/api-key-store.ts`
  - Runtime feature-detected SecretStorage wrapper with migration from `settings.openaiApiKey` and fallback.
- Optional `src/ui/pending-jobs-modal.ts`
  - Minimal list/retry/delete pending jobs if notices/commands are insufficient.

Docs/release files likely to change:

- `README.md` for privacy, recovery behavior, settings, and troubleshooting.
- `CHANGELOG.md` for `1.4.0` or current target version.
- `manifest.json`, `package.json`, `versions.json` only if version/min app version is intentionally bumped in this workflow.

## Existing patterns to follow

- Keep `main.ts` lifecycle-oriented and delegate larger logic to modules. The project instructions explicitly ask to keep `main.ts` minimal and split files by responsibility.
- Use `this.loadData()` / `this.saveData()` for plugin metadata/settings persistence.
- Use `Notice` for lightweight user feedback.
- Use `Modal`/`Setting` from `obsidian` for UI/settings.
- Use browser APIs (`MediaRecorder`, `Blob`, `File`, `indexedDB`) because `manifest.json` has `isDesktopOnly: false`.
- Current command flow constructs `VoiceCommand(this.app, this, this.settings)` per invocation; new services can be passed similarly or constructed by plugin and passed in.
- Current output folder is `Voice Transcriptions/` with timestamped files and raw/structured cross-linking. Preserve or migrate this behavior for user continuity, but fix folder creation.
- Continue using `async/await` and user-friendly notices around long-running operations.

## Constraints from project instructions

- This is an Obsidian community plugin; required release artifacts are `main.js`, `manifest.json`, and optional `styles.css`.
- Source should live in `src/`; organize into multiple files and avoid large dependencies.
- Keep startup light; do not scan the entire vault on load. Checking persisted queue metadata and displaying a small notice is appropriate.
- Preserve mobile compatibility. Avoid Node/Electron APIs in runtime code unless `isDesktopOnly` changes, which is not desired here.
- No hidden telemetry and no unnecessary network calls. OpenAI calls must remain user-initiated/feature-essential and documented.
- Register/clean up long-lived DOM/app/interval listeners with Obsidian helpers where applicable. Modal-local listeners on elements removed during close are less risky.
- Clearly disclose local audio persistence, retention, OpenAI upload, transcript text sent for post-processing, and API-key storage behavior in README/settings.
- Do not commit generated build artifacts such as `main.js` during source-only workflow unless release packaging explicitly requires it.
- Use npm/esbuild; validation commands are `npm run build` and `npm run lint`.

## Risks, unknowns, and validation commands

### Risks

- **IndexedDB availability/quotas on Obsidian mobile:** IndexedDB should be available in mobile WebViews, but quota/eviction behavior varies. Implementation should catch quota/open failures and fall back to clear notices rather than silently dropping audio.
- **Chunk-level recovery complexity:** Persisting every 100 ms may create many writes and stress mobile storage/battery. Consider coarser chunks (e.g., 1–5 seconds) or batching writes if changing `MediaRecorder.start(timeslice)`.
- **Recording interrupted by app kill:** Persisted chunks improve odds, but no web app can guarantee finalization if the OS terminates the WebView mid-write. Mark abandoned sessions and offer recovery where possible.
- **Plugin data overwrite:** Current `saveSettings()` overwrites all plugin data with `settings`. Adding queue metadata requires a unified stored-data model or careful merge helpers to avoid losing jobs when settings are saved.
- **API key migration:** SecretStorage is available only on newer Obsidian versions. With `minAppVersion: 0.15.0`, use runtime feature detection or bump min app version and update `versions.json`.
- **Retry semantics without original editor:** After restart, the original editor selection may not exist. Retried jobs should at least save raw + structured files; cursor insertion can be best-effort only for initial successful flows.
- **Privacy expectation changes:** README currently promises audio is never stored. Durable local audio storage changes the privacy contract and must be documented prominently with retention/delete behavior.
- **OpenAI browser SDK:** The API key remains client-side. SecretStorage improves at-rest storage but does not change that requests are made directly from the client.
- **Output file collisions/folder bug:** Need to fix folder creation and duplicate file handling to avoid failed retries.

### Unknowns

- Exact Obsidian mobile support characteristics for `indexedDB` and `Blob` persistence should be manually tested on iOS and Android.
- Whether the target release should bump `minAppVersion` to use SecretStorage directly or retain fallback support.
- Desired UX for pending jobs: simple command + startup notice vs. dedicated modal/list. A minimal command/notice is likely enough for the first vertical slice.
- Whether audio retention should delete succeeded audio immediately by default or keep for a short period. The request asks for a safe default; safest privacy default is delete audio after successful transcription and retain failed/pending audio for a bounded period.

### Validation commands run during research

- `npm run build` — passed.
- `npm run lint` — passed.

### Recommended validation for implementation

- `npm run build`
- `npm run lint`
- Manual desktop smoke test:
  1. Configure API key.
  2. Record short audio with post-processing off; verify raw note/file is saved and insertion still works if intended.
  3. Record with post-processing on; verify raw file exists before/if structured generation fails and structured file links raw.
  4. Disable network before transcription; verify a pending job is created and can be retried later.
  5. Retry after restoring network; verify raw + structured outputs and job status cleanup.
  6. Try oversized synthetic/long recording path; verify guard prevents upload and creates clear retry/error state.
- Manual mobile smoke test on iOS/Android:
  1. Start/stop recording, close/reopen Obsidian before retry.
  2. Verify pending job discovery on load.
  3. Verify IndexedDB persistence and retention cleanup.

## Recommended implementation approach

1. **Define durable data model first.** Add a stored-data shape that contains `settings` plus queue metadata, while migrating from the existing flat settings object. Ensure settings saves preserve queue data.
2. **Add a small IndexedDB audio store.** Implement a dependency-free wrapper with object stores for audio blobs/chunks keyed by `recordingId`/`jobId`. Include feature detection, open errors, put/get/delete/list, and retention cleanup. Keep it browser-only.
3. **Implement a persisted job queue.** Store lightweight job metadata in plugin data: `id`, `audioKey`, MIME type, created/updated timestamps, status (`pending`, `processing`, `failed`, `succeeded`), attempts, last error, meeting/post-processing flags, language/chat model/prompt snapshot, and optional source file path. Do not store `Blob`s in plugin data.
4. **Persist audio before transcription.** On stop, write the final blob to IndexedDB and enqueue a job before calling OpenAI. This vertical slice alone prevents loss after transcription/network failures. If feasible, add chunk persistence during recording by passing an `onChunk` callback into `AudioRecorder`; otherwise document chunk-level persistence as follow-up.
5. **Process jobs through one reusable service.** Refactor `VoiceCommand.handleRecording()` into enqueue + process logic that can also retry pending jobs after restart. Initial command can still insert into the active editor on immediate success; retry flows should save files and show notices even without an editor.
6. **Save raw transcript immediately after transcription.** Split output creation into raw-first then structured. Create raw file as soon as formatted raw text is available; only then call `structureText()`. If structure fails, keep the raw file and mark job accordingly or complete as raw-only with a notice depending on UX choice.
7. **Add recovery affordance.** On plugin load, check queue metadata for pending/failed jobs and show a notice plus add a command to retry/process pending jobs. A minimal pending-jobs modal can come later unless needed for selecting/deleting jobs.
8. **Add retention setting and cleanup.** Add a safe default such as delete audio immediately after successful job completion and retain failed/pending audio for a bounded number of days (e.g., 7). Expose setting clearly. Run lightweight cleanup on load and after job completion.
9. **Add upload-size guard.** Before OpenAI upload, reject blobs above the transcription limit (use 25 MB unless project confirms a different model limit). Mark job failed with a non-retryable message or keep it for user deletion; do not repeatedly retry oversized audio.
10. **Migrate API key carefully.** Add a SecretStorage wrapper using runtime feature detection (`app.secretStorage` if available). Migrate existing `settings.openaiApiKey` to a secret ID like `voice-md-openai-api-key`, then clear the plain setting after successful write. If not available, continue existing storage with clear documentation. Avoid breaking old Obsidian unless intentionally bumping `minAppVersion`.
11. **Update docs/release hygiene.** Update README privacy/settings/recovery sections and add a changelog entry for the target version. If version/min app version changes, update `manifest.json`, `package.json`, and `versions.json` consistently.

The smallest safe vertical slice is: final-blob IndexedDB persistence on stop, persisted retry queue, raw-first file save, retry command/startup notice, retention cleanup for succeeded/failed jobs, and upload-size guard. Chunk persistence during active recording and a rich pending-jobs UI can be layered on after that if time/risk requires.
