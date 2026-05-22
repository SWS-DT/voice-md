# Mobile Reliability — Implementation

## Files changed

- `main.ts`
- `src/types.ts`
- `src/commands/voice-command.ts`
- `src/audio/audio-modal.ts`
- `src/api/openai-client.ts`
- `src/utils/error-handler.ts`
- `src/storage/indexeddb-audio-store.ts` (new)
- `src/jobs/job-queue.ts` (new)
- `src/output/transcription-files.ts` (new)
- `src/secrets/api-key-store.ts` (new)
- `README.md`
- `CHANGELOG.md`
- `docs/mobile-reliability/STATUS.md`
- `docs/mobile-reliability/IMPLEMENTATION.md`

## Summary of code changes

- Added an IndexedDB-backed audio store and persist the stopped recording blob before starting transcription.
- Added a plugin-data-backed transcription job queue with pending/processing/failed/succeeded states, attempts, retryability, metadata snapshots, and retention cleanup.
- Migrated plugin data from the old flat settings shape to a schema containing `settings` and `jobs`, preserving existing settings.
- Refactored `VoiceCommand` so initial recordings and retry jobs use the same queue-aware processing path.
- Added commands to retry pending transcriptions and show pending counts, plus startup notice discovery for retryable jobs.
- Reset interrupted `processing` jobs back to retryable `pending` on plugin load to support restart during transcription.
- Saved raw transcript files before optional structured-note generation and fixed output folder creation with collision-safe names.
- Deleted persisted audio after successful completion and added a setting to retain failed/pending audio for a bounded number of days.
- Added runtime SecretStorage API-key migration with fallback to local plugin data on older Obsidian versions.
- Added an OpenAI 25 MB upload guard and improved browser/mobile network error classification.
- Updated README privacy/recovery/settings copy and added an unreleased changelog entry.

## Deviations from `PLAN.md` and why

- Did not implement active recording chunk/session persistence. The vertical slice persists the final blob after stop, which is the smallest safe foundation and avoids high-frequency IndexedDB writes on mobile.
- Did not add a rich pending-jobs modal. Startup notices, retry/count commands, and a settings button provide the minimal recovery affordance requested.
- Did not bump `manifest.json`, `package.json`, or `versions.json`. SecretStorage is feature-detected at runtime, so no minimum app version bump was required.
- Post-processing failures after a raw transcript is saved currently complete as raw-only rather than keeping a separate structured-note retry job. This preserves the raw transcript reliably and avoids duplicate raw files from naive whole-job retries; structured-only retry can be added later.

## Validation commands run and outcomes

- `npm run build` — passed.
- `npm run lint` — passed.

## Remaining risks or follow-ups

- Manual iOS/Android smoke testing is still needed for IndexedDB quota/eviction behavior in Obsidian mobile WebViews.
- App/OS termination during active recording can still lose not-yet-stopped audio; chunk persistence remains a follow-up.
- Structured-note retry after a post-processing-only failure is not yet modeled separately.
- A fuller pending-jobs UI with per-job retry/delete controls would improve recovery transparency.
