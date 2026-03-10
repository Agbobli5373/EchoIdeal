# EchoIdeal

A lightning-fast, privacy-first AI assistant that works seamlessly during meetings, interviews, and conversations. Built with Tauri + React + Rust.

## Features

- **Undetectable Overlay** — Translucent window that floats over applications, hidden in screen shares and recordings
- **Multi-LLM Support** — OpenAI, Claude, Gemini, Grok, and custom/local providers (Ollama)
- **Voice Input** — Speech-to-text with voice activity detection (VAD)
- **Screenshot Capture** — Capture and analyze screen content
- **System Audio Capture** — Real-time transcription of system audio
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

GPL-3.0
