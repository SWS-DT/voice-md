# iOS URL Shortcuts — Plan

## Goal

Implement and document a reliable iOS Shortcut / Action Button flow that opens Obsidian, targets a markdown note (especially today's daily note), and starts Voice MD recording immediately.

The primary supported flow should be a Voice MD-owned Obsidian URL action, e.g.:

```text
obsidian://voice-md?record=true&daily=true&autostart=true
```

It should avoid mobile startup races by waiting for workspace/editor readiness before invoking the recording command.

## Non-goals

- Do not depend on the Advanced URI plugin for the primary flow.
- Do not call undocumented Daily Notes plugin internals.
- Do not rename or change behavior of the existing `voice-md:start-voice-recording` command.
- Do not introduce desktop-only Node/Electron APIs or change `isDesktopOnly`.
- Do not bypass microphone permission prompts or alter existing transcription/network behavior.
- Do not commit generated release artifacts such as `main.js` unless a later release task explicitly asks for them.

## Assumptions

- Obsidian's public `registerObsidianProtocolHandler` API is available because the plugin's minimum app version is already compatible.
- A custom protocol action like `obsidian://voice-md?...` can be handled after the intended vault is opened; users with multiple vaults may still need to include `vault=` or test vault selection manually on iOS.
- The plugin can safely provide its own daily-note path calculation using settings rather than reading the core Daily Notes plugin settings.
- If the user does not configure daily-note settings, defaults should be simple: empty folder and `YYYY-MM-DD` format.
- URL-triggered recording should force auto-start by default without changing the user's global **Auto-start recording** preference.

## Ordered implementation steps

1. **Add URL/daily-note settings types and defaults.**
   - Extend plugin settings with:
     - `dailyNoteFolder: string`
     - `dailyNoteFormat: string`
   - Default to an empty folder and `YYYY-MM-DD`.
   - Preserve existing loaded settings by merging with defaults as today.

2. **Allow forced auto-start in the voice command.**
   - Change `VoiceCommand.execute(editor)` to accept an optional options object, e.g. `execute(editor, { autoStart?: boolean })`.
   - Pass `options.autoStart ?? settings.autoStartRecording` to `RecordingModal`.
   - Keep existing ribbon and command calls behaviorally unchanged by not passing options there.

3. **Create a URL shortcut handler module.**
   - Add a small module responsible for parsing `ObsidianProtocolData`, resolving the target markdown file, waiting for workspace/editor readiness, and invoking `VoiceCommand`.
   - Supported query parameters:
     - `record=true` (or default to recording when handler is invoked)
     - `file=<vault-relative markdown path>` for explicit note targeting
     - `daily=true` to compute today's note path from plugin settings
     - `autostart=true|false`, defaulting to true for URL flows
   - For `file=`, normalize the path and add `.md` if the caller omitted it.
   - For `daily=true`, compute `<dailyNoteFolder>/<moment().format(dailyNoteFormat)>.md` with normalized path handling.
   - If neither `file` nor `daily=true` is provided, use the active markdown view/editor.

4. **Open or create the target note safely.**
   - If the target note exists and is a markdown file, open it in the active leaf.
   - If it does not exist, create missing parent folders as needed, then create the markdown file.
   - If the path points to a non-file or creation fails, show a concise `Notice` and abort without starting recording.

5. **Wait for mobile workspace/editor readiness.**
   - Use `app.workspace.onLayoutReady` before navigation work.
   - After opening/creating a file, poll briefly for `app.workspace.getActiveViewOfType(MarkdownView)?.editor`.
   - Use a bounded retry loop with a clear failure `Notice` if no editor becomes available.
   - Avoid long blocking startup work; this should run only when the URL handler is invoked.

6. **Register the protocol handler in plugin lifecycle.**
   - In `main.ts`, instantiate/register the URL shortcut handler with `this.registerObsidianProtocolHandler('voice-md', handler)`.
   - Keep `main.ts` minimal by delegating implementation details to the new module.

7. **Optionally add a global active-note command for URL command runners.**
   - Add a stable command such as `start-voice-recording-active-note` only if implementation can do so cleanly.
   - It should wait for/use the active `MarkdownView` and then invoke Voice MD with normal user settings unless explicitly designed otherwise.
   - This is secondary to the plugin-owned URL handler and should not delay the primary flow.

8. **Expose daily-note URL settings in the settings UI.**
   - Add settings controls for daily-note folder and date format, with helper text telling users to match their Daily Notes core plugin settings.
   - Keep labels short and sentence case.

9. **Document iOS Shortcut setup.**
   - Update documentation with preferred URLs, including:
     - Daily-note handler: `obsidian://voice-md?record=true&daily=true&autostart=true`
     - Explicit file variant for Shortcuts-computed dates: `obsidian://voice-md?record=true&file=Daily%2FYYYY-MM-DD.md&autostart=true`
   - Mention optional `vault=` usage/multi-vault caveat.
   - Include Action Button setup summary and microphone permission caveat.
   - Treat Advanced URI as optional/fallback only, not the supported primary path.

10. **Validate.**
    - Run build/lint commands.
    - Perform at least desktop/manual URL smoke testing if possible; document any manual iOS validation still required.

## Exact files expected to change

- `main.ts`
  - Register the `obsidian://voice-md` protocol handler.
  - Possibly register an optional global active-note command.
- `src/commands/voice-command.ts`
  - Add optional forced auto-start execution options.
- `src/types.ts`
  - Add daily-note shortcut settings fields.
- `src/settings/settings-tab.ts` or equivalent settings UI file
  - Add controls for daily-note folder and date format.
- `src/url/voice-md-protocol.ts` or `src/commands/url-shortcuts.ts` (new)
  - Implement URL parsing, note resolution/creation, readiness waiting, and command invocation.
- `README.md`
  - Document iOS Shortcut / Action Button setup and URL examples.
- `docs/ios-url-shortcuts/STATUS.md`
  - Workflow status updates by implementation agent.
- `docs/ios-url-shortcuts/IMPLEMENTATION.md`
  - Implementation artifact by implementation agent.

Possible but not required:

- `CHANGELOG.md` if this repository maintains release notes.
- A small utility module if folder creation/path handling is better shared, but avoid unnecessary refactors.

## Validation/build commands

Run:

```bash
npm run build
npm run lint
```

Recommended manual validation:

1. Open a test vault and trigger `obsidian://voice-md?record=true` with an active markdown note; confirm the recording modal opens and auto-starts.
2. Trigger `obsidian://voice-md?record=true&file=Daily%2FYYYY-MM-DD.md&autostart=true`; confirm the note opens or is created and recording starts.
3. Trigger `obsidian://voice-md?record=true&daily=true&autostart=true`; confirm the computed daily note path matches settings.
4. Fully quit Obsidian on iOS, trigger the Shortcut/Action Button URL, and confirm startup/navigation waits prevent a no-op.
5. Test microphone permission denied/revoked and confirm the user sees a clear error from existing recording flow.
6. Test a multiple-vault setup with `vault=` included if available.

## Risks and mitigations

- **iOS cold-start race:** Mitigate with `onLayoutReady` and bounded polling for an active `MarkdownView` editor after file open.
- **Daily-note path mismatch:** Mitigate with configurable daily-note folder/date format and explicit `file=` URL alternative.
- **Multiple-vault ambiguity:** Document `vault=` caveat and require manual verification; do not assume custom handler can choose a vault after launch.
- **Missing folder creation edge cases:** Normalize paths, create parent folders carefully, and abort with a `Notice` on invalid/non-markdown paths.
- **Auto-start surprise:** Force auto-start only for explicit URL-triggered flows by default; leave normal command/ribbon behavior unchanged.
- **Advanced URI uncertainty:** Keep Advanced URI documentation optional and clearly secondary.
- **Mobile browser API limitations:** Reuse existing `RecordingModal` and MediaRecorder permission handling; do not add new recording APIs.

## Rollback notes

To roll back the feature:

1. Remove the protocol-handler registration from `main.ts`.
2. Delete the new URL shortcut handler module.
3. Revert `VoiceCommand.execute` to its previous signature if no other code depends on forced auto-start options.
4. Remove daily-note URL settings from settings types/defaults and settings UI.
5. Remove the iOS Shortcut documentation from `README.md`.

Existing recording behavior should remain intact if rollback preserves the original `start-voice-recording` command and `RecordingModal` flow.
