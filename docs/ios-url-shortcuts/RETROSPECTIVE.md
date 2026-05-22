# iOS URL Shortcuts — Retrospective

## What went well

- The workflow kept a clear artifact trail from request through research, plan, implementation, review, fixes, and readiness.
- Research correctly identified the safest primary path: a plugin-owned `obsidian://voice-md` handler instead of relying on Advanced URI sequencing.
- The plan was concrete enough for implementation, including exact files, URL parameters, readiness handling, and validation commands.
- Review caught important security/privacy issues before completion, especially explicit `record=true`, explicit `autostart=true`, and URL path validation.
- The review-fix loop was short and effective; round 2 had no blocking findings.
- Automated validation was run repeatedly, and `npm run lint && npm run build` passed at implementation, review-fix, re-review, and production-readiness stages.

## What caused friction

- The implementation initially treated a bare custom URL as recording intent and defaulted auto-start to true, which created avoidable review churn.
- URL-controlled file creation needed more security-focused design up front; traversal, absolute paths, and non-markdown targets were only tightened after review.
- Manual iOS validation could not be completed in the coding environment, leaving Action Button, cold-start, microphone permission, and multi-vault behavior as release caveats.
- `main.ts` already carried settings UI responsibilities, so the feature added more weight to a file that project guidance prefers to keep lifecycle-focused.
- Moment typing/runtime details caused a build failure during implementation and required a narrow workaround.

## Missed or weak gates

- **G2 Plan actionable:** The plan mentioned auto-start surprise and path validation, but did not require explicit `record=true` and `autostart=true` as hard acceptance criteria.
- **G3 Implementation complete:** The implementation gate passed automated validation but did not sufficiently evaluate external URL threat modeling before review.
- **G4 Review acceptable:** This gate worked well; it caught the main safety issues and forced a fix loop.
- **G6 Production ready:** Correctly documented caveats, but could not close manual iOS validation. Future workflows should distinguish "automated production ready" from "device-validated production ready" when platform hardware is required.

## Prompt/process improvements for future workflows

- Add an explicit security checklist to planning for any feature reachable from external URLs, including intent confirmation, least-privilege defaults, path validation, and user-visible privacy caveats.
- Require implementation agents to document external-input threat modeling before marking G3 complete.
- For mobile/iOS features, add a required artifact section for manual test gaps and a clear release blocker/non-blocker decision.
- Ask planning agents to turn known risks into testable acceptance criteria rather than leaving them only in the risks section.
- Consider adding a pre-review self-check prompt for implementation agents: "What can an untrusted URL, file path, or external app cause this code to do?"

## Codebase-specific lessons

- Keep `main.ts` smaller in future changes by moving settings UI into `src/settings/` before adding more feature-specific settings.
- For Obsidian protocol handlers, default to inert behavior unless the URL includes explicit action parameters.
- Any vault write driven by URL parameters should validate paths before normalization-sensitive operations and before creating folders/files.
- Daily-note integration should stay plugin-local and configurable unless the project chooses a stable dependency/API for Daily Notes settings.
- iOS shortcut support must be documented with both URL examples and caveats around microphone permission, multi-vault routing, and cold-start reliability.
