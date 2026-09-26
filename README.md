# EchoIdeal

A lightning-fast, privacy-first AI assistant that works seamlessly during meetings, interviews, and conversations. Built with Tauri + React + Rust.

This repo contains:

- The **desktop app** (React + Tauri): `src/`, `src-tauri/`
- An **optional cloud backend** for licensing + hosted AI/STT proxy: `cloud-backend/`

## Features

- **Undetectable Overlay** — Translucent window that floats over applications, hidden in screen shares and recordings
- **Multi-LLM Support** — OpenAI, Claude, Gemini, Grok, and custom/local providers (Ollama)
- **Voice Input** — Speech-to-text with voice activity detection (VAD)
- **Screenshot Capture** — Capture and analyze screen content
- **System Audio Capture** — Real-time transcription of system audio
- **Meeting AI Chat + Summary (Markdown)** — Meeting assistant replies and summaries render as Markdown (headings, lists, code, tables, mermaid)
- **Global Keyboard Shortcuts** — Quick access to core functions
- **Local History** — Conversations stored locally via SQLite

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 7 |
| Backend | Rust, Tauri v2 |
| Styling | TailwindCSS v4, shadcn/ui |
| Database | SQLite (tauri-plugin-sql) |

## Prerequisites

- **Node.js** >= 18
- **Rust** >= 1.94 (for edition 2024 support)
- **System libraries** (Linux): `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libasound2-dev libpulse-dev libssl-dev patchelf pkg-config`

## Getting Started

```bash
# Install dependencies
npm install

# Run in development mode (frontend + backend)
npx tauri dev

# Build for production
npx tauri build
```

## Optional: Cloud Backend (Licensing + Hosted AI/STT Proxy)

EchoIdeal can be built to use a cloud backend for licensing plus hosted AI/STT proxying (without persisting user content).

- Backend docs: [`cloud-backend/README.md`](cloud-backend/README.md)

To point the desktop app at your backend, set these env vars **before** running `npx tauri dev` or `npx tauri build` (they are embedded at build time via `src-tauri/build.rs`):

- `APP_ENDPOINT` (base URL for app API, e.g. `https://api.example.com`)
- `PAYMENT_ENDPOINT` (base URL for licensing endpoints, usually the same as `APP_ENDPOINT`)
- `API_ACCESS_KEY` (shared app-level gate key)

Example (local dev):

```bash
export APP_ENDPOINT=http://localhost:8787
export PAYMENT_ENDPOINT=http://localhost:8787
export API_ACCESS_KEY=dev_app_key_change_me

npx tauri dev
```

For production, use HTTPS.

## Development

```bash
# Frontend only (Vite dev server)
npm run dev

# TypeScript type check
npx tsc --noEmit

# Rust type check
cd src-tauri && cargo check
```

## License

EchoIdeal is free software under the GNU General Public License v3.0; see [LICENSE](LICENSE).

Telling voices apart uses the [WeSpeaker](https://github.com/wenet-e2e/wespeaker) ResNet34 voice model trained on [VoxCeleb](https://www.robots.ox.ac.uk/~vgg/data/voxceleb/), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The app downloads it the first time it's needed.
