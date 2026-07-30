# Voice MD

Capture thoughts before they disappear. Voice MD is a mobile-friendly voice capture plugin for Obsidian that records quick ideas, meeting recaps, and conversations, then turns them into Markdown notes you can actually use.

Use it when you are walking, commuting, leaving a meeting, or sitting at your desk and want speech to land directly in your vault.

[![GitHub release](https://img.shields.io/github/v/release/DenizOkcu/voice-md?style=flat-square)](https://github.com/DenizOkcu/voice-md/releases)

## Why Voice MD

- **Fast capture:** Start recording from the ribbon, command palette, or an iPhone Action Button shortcut.
- **Obsidian-native output:** Insert at the cursor, append to your daily note, and save raw/structured Markdown files in your vault.
- **Safer on mobile:** Stopped recordings are saved locally before transcription, so network failures can be retried.
- **Meeting-ready:** Optional speaker identification for conversations and meeting recordings.
- **Transparent AI:** Audio and optional transcript post-processing use OpenAI; no telemetry or hidden services.

## Quick start

1. Install **Voice MD** from **Settings → Community plugins → Browse**.
2. Add your [OpenAI API key](https://platform.openai.com/api-keys) in **Settings → Voice MD**.
3. Open a note and select the microphone ribbon icon, or run **Start voice recording** from the command palette.
4. Speak, stop, and your transcription appears as a new paragraph at the cursor.

## Common workflows

### Quick thought capture

Open any note, start recording, and stop when you are done. Voice MD inserts the transcript as a new paragraph at your current cursor position, so you can capture ideas without breaking your writing flow.

### Daily note capture from iPhone Action Button

Voice MD registers an Obsidian URL action for iOS Shortcuts:

```text
obsidian://voice-md?record=true&daily=true&autostart=true
```

Add this URL to an iOS Shortcut using **Open URLs**, then assign that shortcut to the iPhone Action Button. Voice MD opens or creates today's configured daily note, waits for the editor, starts recording, and appends the result at the end under a time heading:

```markdown
## 14:32

Remember to follow up with Sam about the launch notes...
```

A bare `obsidian://voice-md` URL does nothing safe. Recording requires `record=true`, and microphone auto-start requires `autostart=true`.

For multi-vault setups, include the vault name if needed:

```text
obsidian://voice-md?vault=Your%20Vault&record=true&daily=true&autostart=true
```

You can also pass an explicit vault-relative note path:

```text
obsidian://voice-md?record=true&file=Daily%2F2026-05-22.md&autostart=true
```

### Meeting and conversation notes

Enable **Meeting mode** in the recording modal to use speaker-aware transcription. This works best with 2–6 speakers and recordings longer than 30 seconds.

Example output:

```markdown
**Speaker A:** Let's review the Q3 numbers.

**Speaker B:** Revenue was up 12%, mostly driven by enterprise.

**Speaker A:** What about churn?
```

### Structured notes from raw transcripts

Enable **Post-processing** to ask a chat model to format the transcript into clean Markdown with headings, lists, and paragraphs. Voice MD saves both:

- `Voice Transcriptions/transcription-YYYY-MM-DD-HHMMSS-raw.md` — raw transcript
- `Voice Transcriptions/transcription-YYYY-MM-DD-HHMMSS.md` — structured note linked back to the raw transcript

Raw transcripts are saved before structuring, so a formatting failure does not discard the transcription.

## Mobile reliability

Voice MD is designed for mobile use, not just desktop dictation.

- Stopped recordings are saved locally in IndexedDB before transcription starts.
- Failed or offline transcriptions become retryable pending jobs.
- Run **Retry pending voice transcriptions** from the command palette when you are back online.
- Successful audio is deleted from local storage after completion.
- Failed/pending audio is retained for the configured number of days.

Note: if iOS or Android terminates Obsidian while recording is still active, audio that has not reached the stopped/saved state may still be lost.

## Settings

**Settings → Voice MD**

| Setting | Description | Default |
|---------|-------------|---------|
| OpenAI API key | Required for transcription. Stored with Obsidian SecretStorage when available | — |
| Max recording duration | Maximum seconds per recording | 300 |
| Auto-start recording | Start recording immediately when the modal opens | Off |
| Retain failed audio | Days to keep local audio for pending/failed retry jobs | 7 |
| Daily note folder | Folder used by `obsidian://voice-md?...daily=true` shortcuts | Vault root |
| Daily note date format | Date format used by daily-note shortcuts | `YYYY-MM-DD` |
| Use 24-hour time | Use 24-hour timestamps for URL-appended recordings | On |
| Language | Force a language code, or leave blank for auto-detect | Auto |
| Enable post-processing | Default for the post-processing checkbox | Off |
| Chat model | Curated model selector for post-processing, with support for custom OpenAI model IDs | `gpt-5.4-mini` |
| Custom formatting prompt | Override the default formatting instructions | — |

## Installation

### Community plugins

1. Open **Settings → Community plugins → Browse**.
2. Search for **Voice MD**.
3. Install and enable the plugin.

### Manual install

1. Download the latest [GitHub release](https://github.com/DenizOkcu/voice-md/releases).
2. Copy `main.js`, `manifest.json`, and `styles.css` to `<vault>/.obsidian/plugins/voice-md/`.
3. Reload Obsidian and enable **Voice MD** in **Settings → Community plugins**.

### Beta with BRAT

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat).
2. Open BRAT settings and add beta plugin `DenizOkcu/voice-md`.

## Privacy and data flow

- Audio is sent to OpenAI only when you transcribe.
- Optional post-processing sends transcript text to OpenAI.
- Stopped recordings are stored locally in browser IndexedDB so failed mobile/network attempts can be retried.
- Successful recordings are deleted from local audio storage after completion.
- Raw transcripts and structured notes are saved in your vault.
- Uploads above OpenAI's 25 MB transcription limit are blocked before upload.
- API keys use Obsidian SecretStorage when available; older Obsidian versions fall back to local plugin data.
- Voice MD has no telemetry, tracking, ads, or background analytics.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| No API key error | Add your OpenAI API key in **Settings → Voice MD** |
| Recording will not start | Grant microphone permission to Obsidian in your OS settings |
| Transcription fails | Check your API key, credits, and network. If audio was saved, run **Retry pending voice transcriptions** |
| Daily note shortcut opens the wrong place | Set **Daily note folder** and **Daily note date format** to match your Daily Notes setup; include `vault=` for multi-vault iOS setups |
| No speaker labels | Meeting mode works best with 2–6 speakers and recordings over 30 seconds |
| Long meeting formatting is incomplete | Try a model with a larger output/context limit or keep raw transcripts enabled as the source of truth |

## License

[MIT](LICENSE)
