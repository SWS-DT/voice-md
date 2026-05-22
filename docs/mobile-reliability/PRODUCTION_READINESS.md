# Mobile Reliability — Production Readiness

- Reviewed: 2026-05-22T12:43:30Z
- Verdict: **conditionally ready for mobile beta / pre-release**, pending manual Obsidian mobile smoke testing.

## Documentation changes made

Documentation was already updated during implementation and reviewed in this phase; no additional product documentation edits were required.

Updated user/project documentation includes:

- `README.md`
  - Documents stopped-recording local IndexedDB persistence.
  - Documents pending retry jobs and the **Retry pending voice transcriptions** command.
  - Documents failed/pending audio retention and successful-audio deletion.
  - Documents raw transcript vault saves before structured-note generation.
  - Documents OpenAI 25 MB upload guard and SecretStorage/fallback API-key storage.
- `CHANGELOG.md`
  - Adds an unreleased `1.4.0` entry for mobile reliability, retry queue, retention, SecretStorage migration, raw-first saves, and upload guard.

Rationale for no further edits: the README already distinguishes stopped-recording durability from active-recording interruption, and the remaining caveats are better tracked here until mobile validation confirms exact user-facing behavior.

## Final behavior summary

- When a recording is stopped, Voice MD saves the final audio blob to local IndexedDB before starting transcription.
- A persisted transcription job is created in plugin data before OpenAI upload/transcription.
- Failed/offline retryable transcription jobs remain discoverable after plugin reload.
- On load, interrupted `processing` jobs are reset to retryable `pending` and a notice is shown when retryable jobs exist.
- Users can retry jobs with **Retry pending voice transcriptions** or from the settings affordance.
- Raw transcript files are saved to `Voice Transcriptions/` immediately after transcription succeeds and before optional post-processing.
- Structured notes, when enabled and successful, link back to the raw transcript.
- Successful job audio is deleted from local IndexedDB; failed/pending audio is retained for the configured number of days, default `7`.
- OpenAI transcription uploads larger than 25 MB are blocked before upload.
- API keys migrate to Obsidian SecretStorage when available, with fallback to plugin data on older Obsidian versions.

## Production readiness checklist

- [x] Build passes.
- [x] Lint passes.
- [x] Review completed with no required fixes.
- [x] Privacy documentation updated for local audio persistence and OpenAI data flow.
- [x] Retry queue is persisted through plugin data, not memory only.
- [x] Audio blobs are stored outside plugin data in IndexedDB.
- [x] Raw transcript is saved before structured-note generation.
- [x] Startup/retry command recovery affordance exists.
- [x] Successful audio cleanup exists.
- [x] Failed/pending retention policy exists.
- [x] Upload-size guard exists.
- [ ] Manual desktop smoke test completed.
- [ ] Manual iOS Obsidian smoke test completed.
- [ ] Manual Android Obsidian smoke test completed.
- [ ] Release version metadata bumped consistently if shipping as `1.4.0`.

## Validation status

Commands run in this phase:

- `npm run build` — passed.
- `npm run lint` — passed.

Validation also passed in earlier implementation and review phases.

Recommended final manual validation before release:

1. Desktop: record short audio with post-processing off; verify raw file save and editor insertion.
2. Desktop: record with post-processing on; verify raw file is created first and structured file links to raw.
3. Desktop/mobile: force network failure after stop; verify job persists after reload and retries successfully.
4. Mobile iOS and Android: verify IndexedDB persistence, pending notice, retry command, and retention cleanup.
5. Oversized recording/blob path: verify upload is blocked before OpenAI with clear messaging.
6. API-key migration: verify SecretStorage path on supported Obsidian and fallback path on unsupported versions if still supported.

## Operational, security, and privacy considerations

- Local audio persistence changes the privacy model: stopped recordings may exist in IndexedDB until success or retention expiry.
- The plugin should continue to avoid hidden telemetry; the only external service remains OpenAI for user-initiated transcription/post-processing.
- OpenAI API keys remain client-side for API calls. SecretStorage improves at-rest handling where available but does not remove client-side exposure inherent to the architecture.
- IndexedDB quota/eviction behavior varies across mobile WebViews. Storage failures are handled, but manual mobile testing is required to confirm reliability and messaging.
- Retry processing is user-initiated through commands/settings/startup notice; there is no background daemon.
- Plugin data now includes job metadata but not audio blobs.
- Raw transcript files are written to the vault by design and may contain sensitive dictated content.

## Known caveats

- Closing/terminating Obsidian while recording is still active can still lose not-yet-stopped audio; chunk/session persistence remains deferred.
- Post-processing failures complete as raw-only instead of creating a structured-only retry job.
- Pending-job UX is minimal; there is no per-job modal for retry/delete.
- Review noted a low-severity UX issue where a non-expiring processing notice may remain on some early-return failure paths.
- IndexedDB storage errors are currently generic rather than highly actionable.
- `package.json`/`manifest.json` remain at `1.3.2`; before an actual `1.4.0` release, update release metadata consistently.

## Launch recommendation

Proceed to manual desktop and mobile beta validation. If iOS/Android smoke tests pass, this is suitable for a `1.4.0` pre-release or staged release after version metadata is updated. For a wider production launch, consider first addressing the low-severity notice cleanup and improving storage/quota error messaging.
