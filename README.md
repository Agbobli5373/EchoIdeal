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
```

## Building

A build compiles the app in release mode and packages it into installers. On Windows they land in `src-tauri/target/release/bundle/` (or under `CARGO_TARGET_DIR` when it's set; see [Building outside OneDrive](#building-outside-onedrive)):

- `msi/EchoIdeal_<version>_x64_en-US.msi`
- `nsis/EchoIdeal_<version>_x64-setup.exe`

On Linux the same folder gets `.deb`, `.rpm` and `.AppImage` packages instead. The first build takes several minutes; later ones reuse what's already compiled.

### Test build

For installers you only install yourself, skip the updater signing step, which needs the signing key:

```bash
npx tauri build --config src-tauri/tauri.unsigned.conf.json
```

These installers run normally, but can't be published as an update: the in-app updater only accepts signed ones.

### Release build

Release builds are signed so the in-app updater accepts them: it only installs updates signed with the key whose public half is `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`. The private key and its password are kept by the maintainer, outside the repo.

To sign, point the build at the key and give it the password, in the terminal you build from (PowerShell):

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\echoideal.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [Net.NetworkCredential]::new('', (Read-Host 'Signing key password' -AsSecureString)).Password
npx tauri build
Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

Each installer then gets a `.sig` file next to it; publishing an update needs both. Losing the key or its password means installed copies can't be updated: a new key needs a new `pubkey`, and everyone reinstalls once.

### Building outside OneDrive

If the repo is in a folder that OneDrive (or another sync client) syncs, build into a folder outside it. The sync client and antivirus open new files in `src-tauri/target` to upload or scan them. If that happens while the build is writing the installer type into the app, that installer ships without it, and the in-app updater can't tell how the app was installed.

Set `CARGO_TARGET_DIR` in the terminal you build from, then run the test or release build as usual:

```powershell
$env:CARGO_TARGET_DIR = "$env:USERPROFILE\echoideal-target"
```

The installers then land in `%USERPROFILE%\echoideal-target\release\bundle\`, with their `.sig` files for a release build. The setting lasts until that terminal closes. The first build there compiles everything from scratch; later ones reuse it. `npx tauri dev` still uses `src-tauri/target` in any terminal without the variable.

### If the build fails

- **`A public key has been found, but no private key`**: the installers were built; only the signing step failed, because the key isn't set. Use the test build, or sign it as above.
- **`failed to remove file …\target\release\echoideal.exe` … `Access is denied`**: a copy of the app from an earlier build is still running, and Windows can't replace a running program. Quit it and build again.
- **`Failed to add bundler type to the binary` … `being used by another process (os error 32)`**: something opened the app while the build was writing the installer type into it, usually OneDrive or antivirus. The installer was still built, but without its type; don't publish it. [Build outside OneDrive](#building-outside-onedrive) and build again.

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
