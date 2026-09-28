<div align="center">

<img src="src-tauri/icons/128x128@2x.png" width="96" alt="EchoIdeal logo">

# EchoIdeal

**The honest interview copilot.** Answers you can stand behind.

A free, open-source desktop app that listens to both sides of your interview or meeting and suggests what to say next, grounded in your own CV and documents, and honest when it doesn't know.

[![Latest release](https://img.shields.io/github/v/release/Agbobli5373/EchoIdeal?label=release&color=5b64e8)](https://github.com/Agbobli5373/EchoIdeal/releases/latest)
[![Platform: Windows 10 and 11](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078d4)](https://github.com/Agbobli5373/EchoIdeal/releases/latest)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-2ea44f)](LICENSE)

[Website](https://echo-ideal.vercel.app) · [Download for Windows](https://github.com/Agbobli5373/EchoIdeal/releases/latest/download/EchoIdeal_x64-setup.exe) · [Report a bug](https://github.com/Agbobli5373/EchoIdeal/issues)

</div>

https://github.com/user-attachments/assets/80666d76-0ef9-4f4c-857a-a2baa920a0a5

## Why EchoIdeal

Most AI copilots will put words in your mouth. EchoIdeal starts from yours.

- **Grounded.** Facts about you (roles, projects, numbers) come only from your Knowledge Documents and what's been said in the Meeting.
- **Honest.** When a question needs a fact about you that isn't there, the Suggested Answer is marked *Not from your knowledge*, so you can check it before you say it.
- **Consistent.** If what you say contradicts your CV, you get a private Discrepancy note, and later answers follow what you actually said.

## Features

### Before: your knowledge

- **Knowledge Documents.** Upload a file, turn an image into text, or paste your CV, the job description, prepared stories or a product manual. Switch each one on or off.
- **Knowledge Budget.** See how much of your Active Knowledge goes with each question. Documents too large to send in full become Searched Documents, which send only their best-matching passages (this needs an embeddings provider).
- **Carry forward.** Switch on a Recap from an earlier round so the next one stays consistent with it.

### During the meeting

- **Both sides, transcribed live.** The other side comes through your system audio and you through your mic. Their voice leaking into your mic is cancelled, so it's never taken for yours.
- **Voices told apart.** Several interviewers are shown as Interviewer 1, 2… (Them 1, 2… in other meetings). Name them, merge two, or move a line to someone else.
- **Suggested Answers.** Answers to each question, consistent with everything said so far.
- **Private Requests.** Type a question mid-meeting, like "What does the JD say about the team?". It never becomes part of the Meeting record.
- **Screen Capture and Assessments.** Capture a coding problem and get a solution to submit. Switch on Web Search (with your own [Tavily](https://tavily.com) key) to bring in documentation and current facts, never facts about you.

### After: Recaps and summaries

- **Interview Recaps.** The facts, numbers and stories you committed to, and the topics the Interviewer probed.
- **Assessment Recaps.** Each problem and the solution you submitted.
- **Meeting summaries.** For General Meetings: an overview, key topics, decisions, action items and follow-up questions, in Markdown with tables, code and diagrams. Keep asking AI Chat about the meeting after it ends.

### Private by design

- **Hidden from screen shares and recordings.** The overlay floats over your call; the people you share your screen with don't see it.
- **No bot joins your call.** EchoIdeal listens to your computer's audio instead of connecting to the meeting.
- **Your history stays with you.** Meetings, transcripts, Recaps and chats are stored locally in SQLite.
- **Bring your own model.** OpenAI, Claude, Gemini, Grok and custom providers, or a local model through [Ollama](https://ollama.com).

## Download

EchoIdeal is free. **[Download `EchoIdeal_x64-setup.exe`](https://github.com/Agbobli5373/EchoIdeal/releases/latest/download/EchoIdeal_x64-setup.exe)** from the [latest release](https://github.com/Agbobli5373/EchoIdeal/releases/latest) and run it. Once installed, the app updates itself from new releases.

- **Windows 10 and 11.** The installer isn't code-signed yet, so Windows SmartScreen may say "Windows protected your PC". Choose **More info**, then **Run anyway**.
- **macOS and Linux.** Builds are planned. Until then, you can [build from source](#building).

## Getting started

1. **Open EchoIdeal.** The dashboard's **Home** page lists anything left to set up.
2. **Choose your providers.** In **AI and Speech**, pick an AI provider and a speech-to-text provider and add your API keys, or choose a local model through Ollama.
3. **Add your knowledge.** In **Knowledge**, add your CV, the job description or your notes, and switch them on.
4. **Start a Meeting.** Start listening from the overlay and choose Interview, Assessment or Meeting, or press **New Meeting** on the dashboard's **Meetings** page.

| Shortcut | Action |
|---|---|
| <kbd>Ctrl</kbd> + <kbd>&#92;</kbd> | Show or hide the overlay |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>M</kbd> | Start or stop listening |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> | Take a Screen Capture |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>I</kbd> | Type a Private Request |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd> | Open or close the dashboard |

You can change them all in **Shortcuts and Cursor**.

## Privacy

- **On your computer:** your Meetings, transcripts, Recaps, chats and settings, in a local SQLite database. Voices are told apart on this computer too.
- **Sent to the providers you choose:** audio goes to your speech-to-text provider. Your questions, Meeting Memory and Active Knowledge go to your AI provider; a Searched Document sends only its best-matching passages. When Web Search is on, search queries go to Tavily.
- **Nothing else:** there's no EchoIdeal account or subscription, and you pay your providers directly for what you use.

## Building

EchoIdeal is a [Tauri v2](https://tauri.app) app: a React 19 and TypeScript front end (Vite 7, Tailwind CSS v4, shadcn/ui) over a Rust back end, with SQLite storage.

### Prerequisites

- **Node.js** 18 or later
- **Rust** 1.94 or later (for edition 2024 support)
- **Linux only:** `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libasound2-dev libpulse-dev libssl-dev patchelf pkg-config`

### Run from source

```bash
npm install
npx tauri dev
```

`npx tauri dev` runs the front end and the Rust back end together. The first run compiles the Rust dependencies, which takes a few minutes.

### Checks

```bash
npx tsc --noEmit                  # TypeScript
cd src-tauri && cargo check       # Rust
```

### Installers

```bash
npx tauri build --config src-tauri/tauri.unsigned.conf.json
```

That's a test build, for installers you only install yourself. See [Building and releasing](docs/building.md) for where installers land, signed release builds, publishing a release, building outside OneDrive, fixes for common build errors and the optional cloud backend.

## Contributing

Issues and pull requests are welcome. Before a larger change, it helps to read:

- [Architecture](docs/ARCHITECTURE.md): how the overlay, the dashboard and the Rust back end fit together.
- [CONTEXT.md](CONTEXT.md): the project's vocabulary (Meeting, Knowledge Document, Suggested Answer…), used in the code and the UI.
- [Decision records](docs/adr): why things work the way they do.

## License

EchoIdeal is free software under the [GNU General Public License v3.0](LICENSE).

Telling voices apart uses the [WeSpeaker](https://github.com/wenet-e2e/wespeaker) ResNet34 voice model trained on [VoxCeleb](https://www.robots.ox.ac.uk/~vgg/data/voxceleb/), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The app downloads it the first time it's needed.
