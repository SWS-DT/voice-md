# Mobile Reliability — Implementation Plan

## Goal and non-goals

### Goal

Implement the smallest coherent mobile-reliability foundation so a user can record on mobile, experience a network/transcription failure or restart Obsidian after recording, retry transcription later, and still get a raw transcript plus, when enabled, a structured note.

The target vertical slice is:

1. Persist stopped recordings durably in IndexedDB before transcription starts.
2. Persist retryable job metadata through Obsidian plugin data.
3. Process initial recordings and retry jobs through one queue-aware path.
4. Save the raw transcript before structured-note generation.
5. Expose pending/retryable jobs through startup notice and command-level affordances.
6. Add audio retention and upload-size guardrails.
7. Migrate API-key access toward SecretStorage when available, with fallback.
8. Update user-facing documentation and changelog for the privacy/behavior change.

### Non-goals

- Full guaranteed recovery from an OS/WebView kill while recording is actively in progress.
- A rich job-management UI with per-job controls beyond minimal retry/discovery affordances.
- Changing the OpenAI provider architecture or adding alternative transcription providers.
- Desktop-only storage, Node/Electron APIs, or background services outside Obsidian’s mobile-compatible runtime.
- Reworking all note-generation UX or release packaging artifacts beyond source/docs/version hygiene needed for this feature.

## Assumptions

- `indexedDB`, `Blob`, `File`, `MediaRecorder`, and Obsidian plugin data APIs are available in the target runtime, but IndexedDB failures/quota errors must be handled gracefully.
- Because `manifest.json` currently supports old Obsidian versions, SecretStorage should be feature-detected at runtime unless the implementation intentionally bumps `minAppVersion` and updates `versions.json`.
- Safe privacy default: delete persisted audio after successful transcription/job completion; retain failed/pending audio only for a bounded period, defaulting to 7 days.
- Retry after restart may not have the original editor/selection. Retried jobs should reliably save raw/structured files and only insert into the active editor when an editor context is available.
- OpenAI transcription upload guard should use 25 MB as the practical maximum unless implementation confirms a different current limit.
- Queue metadata should be small and stored in plugin data; audio blobs/chunks should not be stored in plugin data.

## Ordered implementation steps

1. **Define durable data/settings model**
   - Add types for stored plugin data, settings, retention policy, transcription jobs, job status, failure kind, and audio metadata.
   - Migrate existing flat settings data into a new stored shape without losing existing settings.
   - Ensure settings saves preserve queue metadata and queue saves preserve settings.

2. **Add SecretStorage API-key abstraction**
   - Create a small API-key store that reads/writes `app.secretStorage` when available and falls back to `settings.openaiApiKey` otherwise.
   - On load, migrate a plain stored API key to SecretStorage when supported; clear the plain setting only after a successful secret write.
   - Keep command/settings behavior compatible with older Obsidian versions.

3. **Add IndexedDB audio store**
   - Implement a dependency-free browser storage wrapper for audio blobs keyed by stable job/audio IDs.
   - Include feature detection/open handling, `put`, `get`, `delete`, and cleanup helpers.
   - Return clear typed errors/notices when storage is unavailable or quota-limited.

4. **Add persisted job queue service**
   - Store job metadata in plugin data: ID, audio key, MIME type, size, created/updated times, status, attempts, last error, retryability, meeting mode, post-processing flag, and settings snapshots needed for retry.
   - Provide enqueue, update status, list pending/failed, mark succeeded/failed, and purge-expired helpers.
   - Treat oversized jobs as failed/non-retryable with actionable messaging.

5. **Refactor transcription output creation**
   - Extract raw/structured file creation from `VoiceCommand` into a reusable output module.
   - Fix output folder creation by using Obsidian folder creation rather than creating an empty file at the folder path.
   - Make filenames collision-safe.
   - Save raw transcript immediately after transcription succeeds and before any structure call.
   - Link structured output back to the raw transcript when structured generation succeeds.

6. **Refactor recording command into queue-aware processing**
   - On stop, persist the final audio blob to IndexedDB first.
   - Enqueue a job before making OpenAI calls.
   - Process the job immediately when possible, keeping current editor insertion as a best-effort initial-flow behavior.
   - On network/API failures that are retryable, leave the job pending/failed with persisted audio and a clear notice.
   - On successful completion, delete audio according to retention settings and update queue metadata.

7. **Add upload-size and retryability handling**
   - Guard before OpenAI upload and fail fast for blobs over 25 MB.
   - Improve browser/mobile network error classification where needed so offline/fetch failures become retryable job failures.
   - Avoid infinite retry loops by tracking attempts and last error.

8. **Add recovery affordances**
   - On plugin load, perform lightweight queue inspection and retention cleanup.
   - If pending/failed retryable jobs exist, show a notice and expose commands to process/retry pending transcriptions.
   - Add a minimal command to list/count pending jobs or retry all retryable jobs; defer a full modal unless needed for a usable MVP.

9. **Expose retention and storage settings**
   - Add settings for failed/pending audio retention days and clarify successful-audio deletion behavior.
   - Include a delete/cleanup affordance if practical, or at minimum run cleanup on load and after successful jobs.
   - Update setting descriptions to disclose local temporary audio storage.

10. **Add chunk/session persistence only if low-risk after vertical slice**
    - If time and complexity allow, extend `AudioRecorder` with a chunk callback/session ID and persist coarser chunks during active recording.
    - If this creates too much risk/performance overhead, leave final-blob persistence as v1.4 foundation and document active-recording interruption recovery as a follow-up.

11. **Update docs and release hygiene**
    - Update README privacy, storage, recovery, retry, retention, and API-key storage sections.
    - Add a changelog entry for the mobile reliability work.
    - Update `manifest.json`, `package.json`, and `versions.json` only if choosing a target version/min-app-version bump in this workflow.

## Exact files expected to change

Product code:

- `main.ts`
- `src/types.ts`
- `src/audio/recorder.ts` only if chunk/session persistence is included
- `src/audio/audio-modal.ts`
- `src/commands/voice-command.ts`
- `src/api/openai-client.ts`
- `src/utils/error-handler.ts`
- `src/storage/indexeddb-audio-store.ts` (new)
- `src/jobs/job-queue.ts` (new)
- `src/output/transcription-files.ts` (new)
- `src/secrets/api-key-store.ts` (new)

Settings/UI/docs/release:

- `README.md`
- `CHANGELOG.md`
- `manifest.json` only if version/min app version changes
- `package.json` only if version changes
- `versions.json` only if version/min app version changes

Workflow artifact:

- `docs/mobile-reliability/IMPLEMENTATION.md` during implementation
- `docs/mobile-reliability/STATUS.md` during each phase

## Validation/build commands

Run after implementation:

```bash
npm run build
npm run lint
```

Recommended manual validation:

1. Configure an API key and confirm it is read from SecretStorage when supported, with fallback on unsupported versions.
2. Record a short clip with post-processing disabled; verify audio is persisted before transcription, raw transcript is saved, and active-editor insertion remains best effort.
3. Record with post-processing enabled; verify raw transcript file is created before structuring and structured file links to raw output.
4. Disable network after recording; verify a retryable persisted job remains after failure.
5. Reload Obsidian/plugin; verify pending-job notice/command discovers the job.
6. Restore network and retry; verify raw + structured outputs are created and successful audio is deleted by default.
7. Test an oversized blob/recording path; verify upload is blocked before OpenAI call with a clear non-retryable failure.
8. On mobile iOS/Android, smoke test start/stop, restart after failure, retry, IndexedDB persistence, and retention cleanup.

## Risks and mitigations

- **IndexedDB unavailable/quota-limited:** Feature-detect and catch open/write failures; show a clear notice and do not claim durable persistence when storage fails.
- **Plugin data overwrite loses queue/settings:** Introduce a single stored-data model and central save helpers; avoid direct `saveData(this.settings)` once queue metadata exists.
- **Mobile storage/battery pressure from chunk writes:** Prioritize final-blob persistence first; if chunk persistence is added, use coarse chunks or batching.
- **Retry without original editor:** Save files as the reliable outcome; active-editor insertion remains optional/best effort.
- **Privacy contract changes:** Update README/settings copy to disclose local temporary audio, retention, OpenAI data flow, and SecretStorage fallback.
- **SecretStorage compatibility:** Use runtime feature detection unless deliberately bumping `minAppVersion`; never hard-require it on old supported versions.
- **Output folder/file failures:** Fix folder creation and use collision-safe paths before retry flows depend on output files.
- **Repeated failed retries:** Track attempts, retryability, and last error; treat oversized audio as non-retryable.

## Rollback notes

- The feature can be rolled back by reverting new storage/queue/secrets/output modules and the wiring in `main.ts`, modal, command, OpenAI client, and error handler.
- Existing users with migrated SecretStorage API keys may need fallback handling if rollback code no longer reads SecretStorage. Prefer leaving the SecretStorage read path in place for at least one release if rolling back only queue/audio features.
- Persisted IndexedDB audio/job data is local-only; rollback should not attempt destructive cleanup automatically unless a user-facing cleanup command/settings affordance remains.
- If version/min-app-version files are changed, revert `manifest.json`, `package.json`, and `versions.json` together to keep release metadata consistent.
