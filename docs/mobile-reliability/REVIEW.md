# Mobile Reliability — Review

## Review round 1

- Summary verdict: **pass-with-nits**
- Reviewer: review agent
- Reviewed: 2026-05-22T12:42:00Z

### Security findings

- **None found (high/critical):** No new hidden telemetry, remote code execution, or unintended third-party services were introduced. OpenAI network use remains feature-essential and README disclosure was updated for local audio persistence, raw transcript vault writes, SecretStorage fallback, and OpenAI upload behavior.
- **Low — client-side API key exposure remains inherent:** SecretStorage improves at-rest storage when available, but OpenAI requests still use the API key client-side in Obsidian. This is consistent with the existing architecture and is disclosed; no required change for this round.

### Correctness/maintainability findings

- **Low — indefinite processing notices can remain on early-return paths:** In `src/commands/voice-command.ts`, `processJob()` returns early when saved audio is missing or transcription text is empty without hiding `activeNotice` first (`lines 93-105`). This can leave a non-expiring “Transcribing audio...” notice visible after the job has been marked failed. It does not appear to compromise data durability, but it is a UX/reliability nit.
- **Low — IndexedDB unavailable/quota errors are handled generically:** `src/storage/indexeddb-audio-store.ts` correctly fails closed, but storage open/write failures surface as generic notices. A more actionable message would better match the mobile reliability goal, especially on quota-constrained mobile WebViews.
- **Low — active recording chunk persistence remains deferred:** This is documented as a deviation/follow-up in `IMPLEMENTATION.md`. The implemented final-blob persistence satisfies the smallest coherent vertical slice, but OS/WebView termination during active recording remains a known limitation.

### Required fixes checklist

- [ ] No required fixes for this round.

### Optional suggestions

- [ ] Hide `activeNotice` before every early return in `processJob()` or wrap notice cleanup in a `finally` with careful handling for notice handoff during structuring.
- [ ] Convert IndexedDB storage failures into a typed/user-friendly error explaining that durable retry storage is unavailable and the recording could not be safely queued.
- [ ] Consider a future structured-only retry job for post-processing failures after raw transcript save.
- [ ] Consider a future pending-jobs modal with per-job delete/retry controls.

### Validation reviewed or recommended

Reviewed implementation notes and actual code diff/new files. Ran:

- `npm run build` — passed.
- `npm run lint` — passed.

Recommended before release:

- Manual Obsidian desktop smoke test for raw-only, post-processing, retry after forced network failure, oversized upload guard, and SecretStorage migration/fallback.
- Manual Obsidian mobile smoke test on iOS/Android for IndexedDB persistence, app reload after failed transcription, retry command, and retention cleanup.
