# iOS URL Shortcuts — Research

## Summary of the request

The requested feature is an iOS Shortcut / Action Button flow that opens Obsidian to today's daily note and immediately starts Voice MD recording in that note. The user specifically asked whether this can be achieved with Obsidian commands / URL shortcuts.

Acceptance criteria imply two related capabilities:

1. A documented URL-based path usable from iOS Shortcuts.
2. Plugin behavior that is reliable on mobile startup/navigation, especially avoiding races where the command fires before the markdown editor is available.

## Relevant architecture and current behavior

### Plugin entry points

- `main.ts`
  - Loads settings and persisted transcription jobs.
  - Creates `IndexedDBAudioStore`, `JobQueue`, and `ApiKeyStore`.
  - Registers ribbon icon and commands.
  - Current recording command:
    - ID: `start-voice-recording`
    - Full Obsidian command ID exposed to command systems should be `voice-md:start-voice-recording` because Obsidian prefixes plugin commands with the plugin id.
    - Uses `editorCallback`, so it only runs when Obsidian has an active markdown editor context.
  - Retry/count commands use global `callback` and do not require an editor.

### Recording workflow

- `src/commands/voice-command.ts`
  - `VoiceCommand.execute(editor: Editor)` checks for an API key, opens `RecordingModal`, and passes the active editor to the recording completion handler.
  - `RecordingModal` is constructed with `this.settings.autoStartRecording`; immediate recording currently depends on the global setting.
  - After stop, the final audio blob is stored in IndexedDB, enqueued, transcribed, saved to `Voice Transcriptions/`, and inserted into the editor when an editor is available.
  - Retry flows support optional editor insertion (`retryPending(editor?: Editor)`).

- `src/audio/audio-modal.ts`
  - `RecordingModal` auto-starts only when its constructor `autoStart` argument is true.
  - Uses browser/mobile APIs (`navigator.mediaDevices`, `MediaRecorder`) and modal-local event listeners.

### Daily-note behavior today

- The plugin has no daily-note code.
- There are no settings for daily-note folder/format/template.
- There is no code that invokes Obsidian's core Daily Notes plugin or opens/creates a daily note.
- Current ribbon and command flows require the user to already have a markdown note/editor open.

## Obsidian URL shortcuts and command triggering on iOS

### APIs available locally

The installed `obsidian` typings expose:

- `Plugin.registerObsidianProtocolHandler(action, handler)` in `node_modules/obsidian/obsidian.d.ts`:
  - Registers a handler for `obsidian://` URLs.
  - Example from typings: action `open` corresponds to `obsidian://open`.
  - Handler receives decoded query parameters as `ObsidianProtocolData`.
  - Available since Obsidian API `0.11.0`; project `minAppVersion` is already `0.15.0`, so this is compatible.
- Workspace readiness/navigation APIs:
  - `app.workspace.onLayoutReady(callback)`
  - `app.workspace.getLeaf(false)` / `WorkspaceLeaf.openFile(file, { active: true })`
  - `app.workspace.getActiveViewOfType(MarkdownView)`
- Vault APIs:
  - `app.vault.getAbstractFileByPath(path)`
  - `app.vault.create(path, data)`
  - `normalizePath(path)` and `TFile` are available.
- `moment` is exported by `obsidian` and can format today's date without adding a dependency.

### Core Obsidian URI behavior

Core Obsidian URI support can open vaults/files, for example:

```text
obsidian://open?vault=My%20Vault&file=Daily%2F2026-05-22.md
```

This is useful from iOS Shortcuts because the Shortcut can compute today's date and open the exact daily note path. However, core `obsidian://open` does not, by itself, run a plugin command after the file opens.

### Advanced URI plugin behavior

The community Advanced URI plugin is commonly used to trigger Obsidian commands from URLs. A likely direct command URL is:

```text
obsidian://advanced-uri?vault=My%20Vault&commandid=voice-md%3Astart-voice-recording
```

A combined daily-note/open-file + command flow may be possible with Advanced URI options such as a `filepath`/daily-note parameter plus `commandid`, depending on that plugin version and installed configuration. This repository does not include Advanced URI docs/code, so exact parameter names and sequencing should be verified manually before documenting as a primary supported path.

Limitations for the current Voice MD command:

- `voice-md:start-voice-recording` is currently an `editorCallback` command. URL command runners typically invoke commands by ID, but the command still needs an active editor. If Obsidian is cold-starting on iOS or still navigating to the file, the command can race and fail/no-op.
- The command starts recording immediately only if the global **Auto-start recording** setting is enabled. The requested Action Button flow wants immediate recording regardless of the user's normal modal preference.
- Command URLs add a dependency on Advanced URI if the plugin does not implement its own protocol handler.

### Plugin-owned URL handler option

A more robust supported URL can be implemented directly with Obsidian's official protocol-handler API, for example:

```text
obsidian://voice-md?record=true
obsidian://voice-md?record=true&daily=true
obsidian://voice-md?record=true&file=Daily%2F2026-05-22.md
obsidian://voice-md?record=true&daily=true&autostart=true
```

The handler can wait for layout readiness, open/create the requested note, wait for a `MarkdownView`, then call Voice MD with a forced auto-start option. This avoids relying on Advanced URI sequencing and gives the plugin control over mobile readiness retries.

Uncertainty: vault selection for custom protocol actions should be manually tested on iOS. Including `vault=<vault name>` in URLs is standard for core URLs; the custom handler receives query parameters after Obsidian opens a vault, but behavior when multiple vaults are present should be validated.

## Files/components likely to change

Likely source changes:

- `main.ts`
  - Register a protocol handler via `this.registerObsidianProtocolHandler('voice-md', ...)`.
  - Possibly add a new global command that does not depend on `editorCallback`, e.g. `start-voice-recording-active-note` or `start-voice-recording-in-daily-note`.
  - Add settings for URL/daily-note behavior if plugin-level daily note creation is implemented.
- `src/commands/voice-command.ts`
  - Let `execute` accept an options object, especially `autoStart?: boolean`, so URL-triggered flows can force immediate recording without changing the user's global setting.
  - Potentially support optional editor insertion more generally, though for this feature the daily-note editor should be obtained first.
- New helper module under `src/` (recommended instead of growing `main.ts`):
  - `src/url/voice-md-protocol.ts` or `src/commands/url-shortcuts.ts`
  - Responsibilities: parse protocol params, open/create target note, wait for editor readiness, start command.
- `src/types.ts`
  - Add settings for daily-note URL handling if needed, e.g. `dailyNoteFolder`, `dailyNoteFormat`, maybe `dailyNoteTemplate`.
- `README.md`
  - Document iOS Shortcut setup and URL examples.
- Possibly `CHANGELOG.md` if the workflow expects release notes.

## Existing patterns to follow

- Keep `main.ts` focused on lifecycle/registration and delegate feature logic to a module.
- Use `this.addCommand(...)` for user-facing commands with stable IDs.
- Use `this.registerObsidianProtocolHandler(...)`; Obsidian will clean registered handlers with the plugin lifecycle.
- Existing command construction pattern is `this.createVoiceCommand().execute(editor)` in `main.ts`.
- Existing mobile-safe code avoids Node/Electron APIs and uses browser APIs.
- Existing persisted/retry flow already supports loss of network after a recording stops; do not bypass it.
- User-facing strings use sentence case and concise Notices.

## Constraints from project instructions

- Obsidian community plugin, TypeScript bundled with esbuild.
- Preserve mobile compatibility; `manifest.json` has `isDesktopOnly: false`.
- Avoid Node/Electron APIs in runtime code.
- Keep `main.ts` small and split larger feature logic into `src/` modules.
- Use stable command IDs; avoid renaming existing `start-voice-recording`.
- Use Obsidian registration helpers for lifecycle-managed handlers/listeners.
- No hidden telemetry or unnecessary network calls. This feature should only route local URLs and use the existing OpenAI call after user-initiated recording.
- Do not commit generated artifacts like `main.js` unless release packaging explicitly requires it.

## Risks, unknowns, and validation commands

### Risks and unknowns

- **Cold-start race on iOS:** URL handlers/commands may run before the workspace and markdown editor are ready. Implementation should use `onLayoutReady` and retry/poll briefly for `MarkdownView` after opening the file.
- **Advanced URI uncertainty:** This repo has no Advanced URI docs/code. Treat Advanced URI examples as optional/fallback until manually verified.
- **Daily Notes plugin internals:** Core Daily Notes settings/API are not public in `obsidian.d.ts`. Calling internal plugin APIs would be brittle. A plugin-level daily path setting is safer unless adding a well-maintained dependency is explicitly desired.
- **Daily note path mismatch:** Users may have custom Daily Notes folder/date formats. Defaults like `YYYY-MM-DD.md` may not match their vault. If the plugin creates daily notes itself, settings or URL `file=` override are needed.
- **Multiple vaults:** Custom protocol handler behavior with multiple vaults on iOS should be manually tested; document including `vault=` where applicable.
- **Microphone permission:** iOS will still require Obsidian microphone permission. A URL/Action Button cannot bypass permission prompts.
- **App backgrounding:** iOS Action Button opens Obsidian foreground; recording cannot continue if iOS suspends/terminates Obsidian. Existing active-recording loss caveat remains.

### Validation commands run during research

```bash
npm run build
npm run lint
```

Both completed successfully during research.

### Recommended validation after implementation

```bash
npm run build
npm run lint
```

Manual validation:

1. Desktop quick test: open `obsidian://voice-md?record=true` in a test vault and confirm the recording modal opens.
2. Desktop/mobile test: open `obsidian://voice-md?record=true&file=Daily%2FYYYY-MM-DD.md` and confirm the file opens/creates and receives inserted transcription after stop.
3. iOS Shortcut test: create a Shortcut that opens the URL, assign it to the Action Button, and confirm Obsidian opens, navigates to today's note, and recording auto-starts.
4. Cold-start test: fully close Obsidian, trigger the Shortcut, and confirm readiness waits prevent no-op behavior.
5. Permission test: revoke microphone permission and confirm a clear error is shown.
6. Multi-vault test: include `vault=` and confirm the correct vault handles the URL.

## Recommended implementation approach

1. **Add a plugin-owned protocol handler as the primary supported flow.**
   - Register `obsidian://voice-md` with `registerObsidianProtocolHandler('voice-md', ...)`.
   - Supported query parameters:
     - `record=true` or default action to start recording.
     - `file=<vault-relative markdown path>` to open/create an explicit target file.
     - `daily=true` to compute today's note path from plugin settings.
     - `autostart=true` defaulting to true for URL flows.
   - Keep Advanced URI documented only as optional/fallback.

2. **Implement a small URL shortcut service/module.**
   - Wait for `app.workspace.onLayoutReady`.
   - Resolve target file:
     - If `file` is provided, normalize and ensure `.md` if appropriate.
     - If `daily=true`, compute `folder + moment().format(format) + '.md'`.
     - If neither is provided, use active markdown view.
   - Create the file if missing, creating folders as needed or showing an actionable notice if folder creation fails.
   - Open the file with `app.workspace.getLeaf(false).openFile(file, { active: true })`.
   - Poll briefly for `app.workspace.getActiveViewOfType(MarkdownView)?.editor` before starting.

3. **Force auto-start for URL-triggered recording without changing global settings.**
   - Change `VoiceCommand.execute(editor)` to `execute(editor, options?: { autoStart?: boolean })`.
   - Pass `options?.autoStart ?? this.settings.autoStartRecording` to `RecordingModal`.
   - Existing ribbon/command behavior remains unchanged.

4. **Add a stable command for the active-note URL/shortcut case if useful.**
   - Keep existing `voice-md:start-voice-recording` unchanged.
   - Consider adding a global callback command, e.g. `start-voice-recording-active-note`, that waits for/uses the active `MarkdownView`. This is friendlier to Advanced URI than the current `editorCallback`.

5. **Add minimal daily-note settings if implementing `daily=true`.**
   - Defaults: folder empty, format `YYYY-MM-DD`.
   - This avoids brittle dependence on unpublished Daily Notes internals.
   - Documentation should tell users to match these settings to their Daily Notes core plugin settings, or use explicit `file=` from iOS Shortcuts if they prefer.

6. **Document iOS Shortcut URLs.**
   - Preferred single URL after implementation:

   ```text
   obsidian://voice-md?record=true&daily=true&autostart=true
   ```

   - Explicit file path variant where iOS Shortcuts formats today's date:

   ```text
   obsidian://voice-md?record=true&file=Daily%2F2026-05-22.md&autostart=true
   ```

   - Optional Advanced URI fallback, if verified:

   ```text
   obsidian://open?vault=My%20Vault&file=Daily%2F2026-05-22.md
   obsidian://advanced-uri?vault=My%20Vault&commandid=voice-md%3Astart-voice-recording
   ```

The safest path is a plugin-owned protocol handler plus explicit readiness handling. It minimizes external dependencies, works within public Obsidian APIs, and allows Voice MD to force auto-start only for intentional URL-triggered recording flows.
