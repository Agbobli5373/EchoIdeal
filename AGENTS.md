# AGENTS.md

## Cursor Cloud specific instructions

This repository ("EchoIdeal") is currently an empty project scaffold with only a `README.md`. There is no application code, no dependency manifests, no build system, and no services to run.

**When code is added**, future agents should:
- Identify the tech stack from newly added config files (e.g. `package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`).
- Update the VM environment update script accordingly (via `SetupVmEnvironment`).
- Re-evaluate lint, test, build, and run commands based on the chosen stack.

Until then, no dependency installation, build, lint, test, or service startup steps are needed.
