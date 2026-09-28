# Building and releasing

How to build installers, sign them for the in-app updater, and publish a release. For the prerequisites and running the app in development, see [Building](../README.md#building) in the README. Commands run from the repository root.

- [Installers](#installers)
- [Test build](#test-build)
- [Release build](#release-build)
- [Publishing a release](#publishing-a-release)
- [Building outside OneDrive](#building-outside-onedrive)
- [If the build fails](#if-the-build-fails)
- [Optional: cloud backend](#optional-cloud-backend)

## Installers

A build compiles the app in release mode and packages it into installers. On Windows they land in `src-tauri/target/release/bundle/` (or under `CARGO_TARGET_DIR` when it's set; see [Building outside OneDrive](#building-outside-onedrive)):

- `msi/EchoIdeal_<version>_x64_en-US.msi`
- `nsis/EchoIdeal_<version>_x64-setup.exe`

On Linux the same folder gets `.deb`, `.rpm` and `.AppImage` packages instead. The first build takes several minutes; later ones reuse what's already compiled.

## Test build

For installers you only install yourself, skip the updater signing step, which needs the signing key:

```bash
npx tauri build --config src-tauri/tauri.unsigned.conf.json
```

These installers run normally, but can't be published as an update: the in-app updater only accepts signed ones.

## Release build

Release builds are signed so the in-app updater accepts them: it only installs updates signed with the key whose public half is `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`. The private key and its password are kept by the maintainer, outside the repo.

To sign, point the build at the key and give it the password, in the terminal you build from (PowerShell):

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\echoideal.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [Net.NetworkCredential]::new('', (Read-Host 'Signing key password' -AsSecureString)).Password
npx tauri build
Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

Each installer then gets a `.sig` file next to it; publishing an update needs both. Losing the key or its password means installed copies can't be updated: a new key needs a new `pubkey`, and everyone reinstalls once.

## Publishing a release

Releases are built by GitHub Actions ([`.github/workflows/release.yml`](../.github/workflows/release.yml)), so nobody has to build or upload installers by hand. The workflow signs with the repository secrets `TAURI_SIGNING_PRIVATE_KEY` (the contents of the key file) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

1. Set the new version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, and merge it to `main`.
2. Tag that commit and push the tag:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
3. The workflow builds `EchoIdeal_x64-setup.exe` and `EchoIdeal_x64.msi`, their `.sig` files and the updater's `latest.json`, and puts them in a **draft** release. It stops if the tag doesn't match the version.
4. Check the draft on GitHub, then publish it. Installed copies look for updates at `releases/latest/download/latest.json`, so they only see a release once it's published.

## Building outside OneDrive

If the repo is in a folder that OneDrive (or another sync client) syncs, build into a folder outside it. The sync client and antivirus open new files in `src-tauri/target` to upload or scan them. If that happens while the build is writing the installer type into the app, that installer ships without it, and the in-app updater can't tell how the app was installed.

Set `CARGO_TARGET_DIR` in the terminal you build from, then run the test or release build as usual:

```powershell
$env:CARGO_TARGET_DIR = "$env:USERPROFILE\echoideal-target"
```

The installers then land in `%USERPROFILE%\echoideal-target\release\bundle\`, with their `.sig` files for a release build. The setting lasts until that terminal closes. The first build there compiles everything from scratch; later ones reuse it. `npx tauri dev` still uses `src-tauri/target` in any terminal without the variable.

## If the build fails

- **`A public key has been found, but no private key`**: the installers were built; only the signing step failed, because the key isn't set. Use the test build, or sign it as above.
- **`failed to remove file …\target\release\echoideal.exe` … `Access is denied`**: a copy of the app from an earlier build is still running, and Windows can't replace a running program. Quit it and build again.
- **`Failed to add bundler type to the binary` … `being used by another process (os error 32)`**: something opened the app while the build was writing the installer type into it, usually OneDrive or antivirus. The installer was still built, but without its type; don't publish it. [Build outside OneDrive](#building-outside-onedrive) and build again.

## Optional: cloud backend

EchoIdeal can be built to use a cloud backend for licensing plus hosted AI/STT proxying (without persisting user content). The official releases are built without it (the release workflow sets none of the variables below).

- Backend docs: [`cloud-backend/README.md`](../cloud-backend/README.md)

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
