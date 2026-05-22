# iOS URL Shortcuts — Review

## Round 1

### Summary verdict

changes-required

The implementation covers the requested URL handler, daily-note targeting, forced auto-start option, documentation, and validation passes. However, the new custom protocol endpoint can be invoked externally and currently defaults to recording and auto-starting for a bare `obsidian://voice-md` URL. That should be tightened before this is accepted.

### Security findings

- **Medium — External URL can trigger microphone recording too broadly.** `VoiceMDProtocolHandler.handleAsync()` treats a missing `record` parameter as recording intent and defaults `autostart` to true, so any external app/webpage/link that opens `obsidian://voice-md` can bring Obsidian forward and start recording if mic permission is already granted. The requested Shortcut flow can still work with explicit parameters, but the handler should require an explicit recording intent and an explicit or user-configured auto-start opt-in.
- **Medium — URL-controlled vault writes are not validated tightly enough.** The `file` parameter is normalized and used to create missing parent folders and a markdown file. Add explicit validation for non-empty vault-relative paths and reject traversal/absolute/suspicious paths before creation. This reduces the blast radius of externally opened `obsidian://voice-md?...file=...` URLs.

### Correctness/maintainability findings

- **Low — Main entry point continues to grow.** The feature adds settings UI directly in `main.ts`, which is now over the project guideline target for a lifecycle-focused entry point. This is not blocking for this round, but moving the settings tab to `src/settings/` would improve maintainability.

### Required fixes

- [ ] Require explicit URL intent before recording, at minimum `record=true`; a bare `obsidian://voice-md` should no-op or show a safe notice.
- [ ] Avoid default auto-start from arbitrary protocol invocations unless explicitly requested with `autostart=true` or enabled via a clearly documented setting.
- [ ] Validate `file`/computed daily paths before creating files/folders: reject empty paths, absolute paths, path traversal (`..`), and non-markdown targets after normalization.
- [ ] Update README text to mention the external URL-trigger privacy caveat and the exact explicit parameters required for auto-start.

### Optional suggestions

- Consider adding a settings-module follow-up to keep `main.ts` smaller.
- Consider adding a lightweight helper for protocol boolean parsing and path validation so URL behavior is easy to unit-test later.

### Validation reviewed or recommended

Reviewed:

```bash
npm run lint && npm run build
```

Result: passed.

Recommended after fixes:

- Repeat `npm run lint && npm run build`.
- Manual test: `obsidian://voice-md` should not start recording.
- Manual test: `obsidian://voice-md?record=true&daily=true&autostart=true` should open/create the daily note and start recording.
- Manual test: malformed `file=` values such as empty paths, leading slashes, and `../` traversal should be rejected without creating files.

## Round 2

### Summary verdict

pass-with-nits

The required round 1 fixes were implemented: URL recording now requires explicit `record=true`, microphone auto-start requires explicit `autostart=true`, URL-controlled paths are validated before creation, and README documents the external URL privacy caveat. Build and lint pass. Remaining items are non-blocking maintainability/manual-validation follow-ups.

### Security findings

- **None requiring changes.** The custom URL handler no longer records or auto-starts from a bare `obsidian://voice-md` URL, and path validation rejects empty, absolute, traversal, and explicit non-markdown targets before vault writes.

### Correctness/maintainability findings

- **Low — `main.ts` remains large and includes settings UI.** This predates/extends the feature work and is not blocking, but moving settings UI into `src/settings/` would better match project structure guidance.
- **Low — Manual iOS behavior remains unverified in this environment.** The code includes bounded readiness polling, but cold-start, Action Button routing, microphone prompts, and multi-vault behavior still need device testing.

### Required fixes

- [x] Require explicit URL intent before recording with `record=true`.
- [x] Avoid default auto-start unless explicitly requested with `autostart=true`.
- [x] Validate URL-controlled file/daily paths before creating files/folders.
- [x] Update README with explicit URL parameters and external URL-trigger privacy caveat.

No additional required fixes for this round.

### Optional suggestions

- Move `VoiceMDSettingTab` out of `main.ts` in a future cleanup.
- Consider extracting protocol path/boolean parsing into pure helpers if automated tests are added later.
- Add on-device iOS validation notes to release readiness documentation.

### Validation reviewed or recommended

Reviewed in this round:

```bash
npm run lint && npm run build
```

Result: passed.

Recommended manual validation before release:

- `obsidian://voice-md` shows/does nothing safe and does not start recording.
- `obsidian://voice-md?record=true` opens the modal but does not start the microphone.
- `obsidian://voice-md?record=true&daily=true&autostart=true` opens/creates today's configured daily note and starts recording.
- Malformed `file=` values, leading slashes, and `../` traversal are rejected without creating files.
- iOS cold-start, Action Button, microphone-permission, and multi-vault scenarios are tested on device.
