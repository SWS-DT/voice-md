# Mobile Reliability — Retrospective

- Reviewed: 2026-05-22T12:44:30Z
- Outcome: Workflow completed successfully with a shippable mobile-reliability foundation, pending manual mobile validation.

## What went well

- The request was translated into a clear, bounded vertical slice rather than attempting the entire mobile-first strategy at once.
- Research identified important existing defects and architectural risks early, especially flat plugin-data persistence, output folder creation, stale privacy docs, missing upload guard, and lack of retry semantics.
- The plan was concrete enough for implementation: it named exact modules, ordered dependencies, validation commands, rollback notes, and acceptable non-goals.
- Implementation preserved mobile compatibility by using browser-compatible APIs and feature-detected SecretStorage instead of requiring a minimum app-version bump.
- Raw-first output, persisted final audio blobs, retryable job metadata, startup recovery notice, retention cleanup, and documentation updates all landed in one coherent slice.
- Build and lint were run in research, implementation, review, and production-readiness phases, giving repeated confidence that the codebase stayed buildable.
- Review produced a useful pass-with-nits verdict without derailing the workflow into optional polish.
- Production readiness clearly separated automated validation from the required manual Obsidian desktop/iOS/Android smoke tests.

## What caused friction

- The original product strategy included broader ambitions than a single workflow could safely implement, so scope control required repeated narrowing.
- Active-recording recovery is hard in mobile WebViews. The workflow had to settle for stopped-recording durability and document app/OS termination during active recording as a limitation.
- Persisted job metadata required changing the plugin-data shape, which is riskier than adding isolated feature code because settings saves and queue saves can accidentally overwrite each other.
- SecretStorage compatibility created release-policy friction: using it directly would imply a minimum app-version decision, while feature detection kept compatibility but required fallback documentation.
- Manual reliability validation could not be completed inside the agent workflow because it depends on Obsidian mobile behavior, IndexedDB quota/eviction, and real network failure scenarios.
- Minimal recovery UX met the acceptance criteria but left known UX gaps such as per-job delete/retry controls and clearer storage/quota errors.

## Missed or weak gates

- G3 implementation completion accepted code with low-severity UX issues that were only discovered in review, notably non-expiring notices on some early-return paths.
- G4 review correctly allowed pass-with-nits, but the process did not include an optional polish/fix pass for very cheap nits before production readiness.
- G6 production readiness documented manual mobile testing as required before release, but there is no explicit gate state for "automated ready but mobile smoke unverified." A conditional/pass-with-caveats status would be more precise.
- The workflow did not require inspection of final release metadata consistency after adding a `1.4.0` changelog entry while leaving manifest/package at `1.3.2`; production readiness caught this caveat, but an earlier release-hygiene gate would help.
- No gate explicitly verifies privacy-documentation accuracy against the exact code paths. Review covered this generally, but a checklist item for local persistence/OpenAI/SecretStorage disclosures would be useful.

## Prompt/process improvements for future workflows

- Add an explicit "scope lock" section after planning that states which requested items are in-scope, deferred, and intentionally not attempted.
- Add a lightweight optional polish loop after pass-with-nits when findings are low-risk and cheap, before production-readiness review.
- Add a dedicated mobile-validation checklist artifact or section with items that must be manually executed outside the agent environment.
- Add a release-hygiene gate for version files, changelog entries, manifest compatibility, and README privacy claims.
- Ask implementation agents to include a short "failure-mode walkthrough" for reliability work: what happens on offline failure, restart mid-processing, missing storage blob, oversized upload, and post-processing failure.
- For Obsidian mobile work, require documentation of which reliability guarantees are strong, best-effort, and unsupported due to WebView/OS constraints.

## Codebase-specific lessons

- `main.ts` had accumulated lifecycle, settings, and command responsibilities; new reliability features benefited from extracting storage, queue, output, and secrets modules.
- Flat `loadData()` / `saveData(settings)` patterns become fragile once plugins need persistent operational metadata. A versioned stored-data shape should be introduced before adding queues or background state.
- Browser-compatible durable storage should keep blobs out of plugin data; IndexedDB is the right local mechanism, but quota and availability must be treated as runtime failure modes.
- Obsidian mobile compatibility favors final-blob persistence as a first reliability milestone. Chunk-level persistence needs careful batching to avoid excessive writes and battery/storage pressure.
- Raw transcript saving should be independent from structured-note generation so post-processing failures do not erase the primary transcription artifact.
- Retry flows cannot rely on the original editor context after restart. Saving files should be the reliable contract; insertion into the active editor should remain best-effort.
- Privacy copy must evolve with persistence behavior. Once audio or transcripts are stored locally, README/settings text must explicitly describe where data lives, retention, cleanup, and OpenAI data flow.
- Feature-detected SecretStorage is a practical migration path for plugins that still support older Obsidian versions, but fallback behavior must remain visible to users.
