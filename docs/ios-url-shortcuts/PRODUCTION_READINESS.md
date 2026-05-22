# iOS URL Shortcuts — Production Readiness

## Documentation changes

- Updated `README.md` with an **iOS Shortcut / Action Button** section documenting the supported Voice MD URL action:
  - `obsidian://voice-md?record=true&daily=true&autostart=true`
  - `obsidian://voice-md?record=true&file=Daily%2F2026-05-22.md&autostart=true`
- Documented required explicit parameters: `record=true` to invoke recording and `autostart=true` to start the microphone immediately.
- Documented daily-note settings users must align with their Daily Notes setup: **Daily note folder** and **Daily note date format**.
- Documented multi-vault, microphone permission, and trusted-shortcut caveats.
- Updated the settings table in `README.md` for the new daily-note URL settings.
- Updated `CHANGELOG.md` under `1.4.0` with the new iOS Shortcut / Action Button URL support.

## Final behavior summary

- Voice MD registers a plugin-owned Obsidian URL handler for `obsidian://voice-md`.
- The handler is intentionally inert unless the URL includes `record=true`.
- `record=true` without `autostart=true` opens the recording modal but does not start the microphone.
- `record=true&autostart=true` starts recording after Obsidian has an active markdown editor.
- `daily=true` opens or creates today's daily note using Voice MD settings for folder and date format.
- `file=<vault-relative-path>` opens or creates a specific markdown note, appending `.md` if omitted.
- The handler waits for layout readiness and polls briefly for an active markdown editor to reduce mobile cold-start races.
- URL-controlled paths are validated to reject empty paths, absolute paths, traversal segments, and explicit non-markdown extensions before file/folder creation.

## Production readiness checklist

- [x] Primary URL flow implemented without requiring Advanced URI.
- [x] Existing command ID `voice-md:start-voice-recording` preserved.
- [x] URL recording requires explicit `record=true` intent.
- [x] URL microphone auto-start requires explicit `autostart=true`.
- [x] Daily-note folder/date-format settings added and documented.
- [x] Mobile startup/editor readiness wait added.
- [x] URL-controlled vault writes validate paths before creation.
- [x] User documentation updated with setup steps and caveats.
- [x] Changelog updated for unreleased feature notes.
- [x] Lint and production build pass.
- [ ] On-device iOS Action Button validation completed.
- [ ] Multi-vault URL routing verified on iOS.

## Validation status

Automated validation run after documentation/readiness updates:

```bash
npm run lint && npm run build
```

Result: passed.

Manual validation still recommended before release:

1. Open `obsidian://voice-md` and confirm it does not start recording.
2. Open `obsidian://voice-md?record=true` and confirm the modal opens without auto-starting the microphone.
3. Open `obsidian://voice-md?record=true&daily=true&autostart=true` and confirm today's configured daily note opens/creates and recording starts.
4. Open a URL with `file=` and confirm the explicit markdown note opens/creates.
5. Try malformed `file=` values such as `/bad.md`, `../bad.md`, and `bad.txt` and confirm no vault files are created.
6. On iOS, fully quit Obsidian and trigger the Shortcut/Action Button to verify cold-start reliability.
7. On iOS, test microphone permission denied/revoked behavior.
8. In a multi-vault setup, include `vault=` and confirm routing opens the intended vault.

## Operational, security, and privacy considerations

- External URL invocation is possible from iOS Shortcuts or links, so recording and microphone auto-start are gated behind explicit URL parameters.
- The URL handler can create markdown files/folders inside the vault only after path validation; it does not access files outside the vault.
- Microphone access remains controlled by Obsidian/iOS permission prompts; the plugin does not bypass OS permission controls.
- Audio handling and network behavior remain the existing Voice MD flow: stopped recordings are stored locally for retry, sent to OpenAI for transcription, and deleted after successful completion.
- Daily-note path calculation is plugin-local and does not read undocumented Daily Notes internals; users must keep Voice MD settings aligned with their daily-note convention.
- Multi-vault routing is ultimately controlled by Obsidian/iOS URL handling and should be tested for each user's setup.

## Known caveats

- On-device iOS validation was not possible in this coding environment.
- Cold-start readiness is mitigated by bounded waits, but real iOS behavior can vary by device, Obsidian state, and vault size.
- `daily=true` uses Voice MD's own daily-note folder/date-format settings, not the core Daily Notes plugin settings.
- Users with custom daily note templates will get an empty created note from this handler unless their workflow creates the note separately or uses an explicit `file=` path.
- `main.ts` remains larger than ideal because settings UI still lives there; review marked this as a non-blocking maintainability follow-up.

## Launch recommendation

Launch is acceptable after manual iOS smoke testing confirms the Action Button flow, microphone permission behavior, cold-start routing, and any multi-vault requirements. Automated validation is green and no blocking review findings remain.
