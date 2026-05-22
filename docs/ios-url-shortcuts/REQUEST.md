# iOS URL Shortcuts — Request

- Created: 2026-05-22T12:55:07Z

## Original request

Implement a way to handle Obsidian URL shortcuts on iOS. The user wants to add an iOS Shortcut, assign it to the phone Action Button, and have it open Obsidian to the current daily note and immediately start Voice MD recording in that daily note.

The user specifically asked to research how this can be achieved with Obsidian commands.

## Assumptions

- Preserve mobile compatibility (`isDesktopOnly: false`); do not introduce Node/Electron-only APIs.
- The implementation should work through Obsidian's URL scheme / Advanced URI / command mechanisms where possible.
- The voice recording should target the active daily note editor after Obsidian opens/navigates there.
- If direct daily-note creation/navigation is not available through core Obsidian APIs, implement the smallest safe plugin-level workaround and document required iOS Shortcut URL(s).
- Existing mobile-reliability changes are in the working tree; avoid unrelated refactors.

## Acceptance criteria

- There is a documented URL/shortcut path usable from iOS to open Obsidian and trigger Voice MD recording.
- The flow can target today's daily note or provides a clear fallback/required URL format.
- The command/handler waits for workspace/editor readiness enough to avoid racing Obsidian startup on mobile.
- Build and lint pass, or failures are documented.
