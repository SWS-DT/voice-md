# Mobile Reliability — Request

- Created: 2026-05-22T12:28:35Z

## Original request

The user provided a product strategy for Voice MD: become a mobile-first, reliable voice capture layer for Obsidian. The key shift is from `Record → Transcribe → Insert` to `Record → Persist safely → Queue job → Transcribe → Save raw transcript → Structure note → Link source → Export/use in Obsidian`.

The requested next concrete move is a focused v1.4/mobile-reliability effort whose mission is:

> A user can record on mobile, lose network, close Obsidian, reopen later, retry transcription, and still get a raw + structured note.

## Target scope for this workflow

Implement the smallest coherent mobile-reliability foundation in the current plugin codebase, prioritizing:

1. Durable temporary audio storage using browser-compatible APIs, preferably IndexedDB.
2. Recording session/chunk persistence during recording where feasible.
3. Retryable job queue persisted through plugin data.
4. Raw transcript saved before structured note generation.
5. Recovery/pending jobs affordance on plugin load or command/UI.
6. Audio retention setting with a safe default.
7. API key storage/migration toward Obsidian SecretStorage where supported.
8. Upload size guard for OpenAI transcription limits.
9. Changelog/release hygiene if obviously stale.

## Assumptions

- Preserve mobile compatibility; do not introduce Node/Electron-only APIs into shared runtime code.
- Keep changes incremental and buildable.
- Prefer safe abstractions and minimal UX over a large redesign.
- If full implementation is too large, implement a vertical slice and document remaining work clearly.

## Acceptance criteria

- Recordings are not lost solely because transcription fails after stop.
- Offline/network transcription failures create retryable jobs instead of dropping audio.
- Raw transcript is saved before any structured note attempt.
- Pending/retryable jobs can be discovered and retried by the user.
- Build/typecheck validation runs or failures are documented.
