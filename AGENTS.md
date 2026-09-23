# AGENTS.md

## Cursor Cloud specific instructions

EchoIdeal is a Tauri v2 desktop AI assistant (React + TypeScript frontend, Rust backend). It replicates the Pluely project.

### Tech stack
- **Frontend**: React 19, TypeScript, Vite 7, TailwindCSS v4, shadcn/ui (Radix primitives)
- **Backend**: Rust (edition 2021), Tauri v2
- **Database**: SQLite via `tauri-plugin-sql`
- **Package manager**: npm (lockfile is `package-lock.json`)

### Running the app
- `npm run dev` starts only the Vite frontend on port 1420
- `npx tauri dev` starts both the Vite frontend AND the Rust backend together (this is the correct full dev command). First run compiles 774 Rust crates (~2-5 min). Subsequent runs use incremental compilation.
- `npx tauri build` creates release bundles (.deb, .rpm, .AppImage). The signing key (`TAURI_SIGNING_PRIVATE_KEY`) is not required for local dev builds.
- Requires `DISPLAY=:1` (or equivalent) when running on headless Linux.

### Build checks
- `npx tsc --noEmit` for TypeScript type checking (no separate eslint config exists)
- `cargo check` in `src-tauri/` for Rust type checking
- `npx vite build` for frontend production build

### System dependencies (Linux)
Tauri v2 on Linux requires: `libwebkit2gtk-4.1-dev`, `libjavascriptcoregtk-4.1-dev`, `libsoup-3.0-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libasound2-dev`, `libpulse-dev`, `libssl-dev`, `patchelf`, `pkg-config`. These are installed in the VM snapshot.

### Gotchas
- Rust 1.94+ is required (the `tauri-plugin-machine-uid` crate uses edition 2024). The VM has been updated via `rustup update stable`.
- The `tauri dev` command manages its own Vite server; do not start `npm run dev` separately before running `npx tauri dev` or port 1420 will conflict.
- The build emits a signing key error at the end when creating updater artifacts; this is harmless for development.
- `npm install` uses `--force` due to `.npmrc` containing `force=true` (needed for peer dependency conflicts with `@ricky0123/vad-react` requiring React 18 vs project's React 19).

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `Agbobli5373/EchoIdeal`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
