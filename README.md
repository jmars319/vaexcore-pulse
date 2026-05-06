# vaexcore pulse

vaexcore pulse is a local-first highlight scouting system for long-form stream recordings. It analyzes measurable signals, surfaces likely moments worth reviewing, suggests clip boundaries, and keeps final editorial control with the human creator.

This repository is the monorepo foundation for the project. It is structured to feel like a real product codebase now, while staying honest about what is still placeholder logic.

## Monorepo Layout

- `apps/desktopapp`
  - primary Tauri + React product surface
  - local project/session creation and analysis control
  - core review workstation and backlog workflow
- `apps/webapp`
  - browser companion surface
  - project browsing, candidate history, profile inspection
- `apps/mobileapp`
  - Expo + React Native companion surface
  - later-stage project browsing, queue visibility, accepted clip checks
- `services/analyzer`
  - Python analysis core scaffold
  - CLI and lightweight HTTP entrypoints
- `services/api`
  - TypeScript API/bridge service for the apps
- `packages/shared-types`
  - shared DTOs, enums, schemas, and mock data
- `packages/domain`
  - reusable business helpers and review workflow helpers
- `packages/ui`
  - shared UI primitives used by webapp and desktopapp
- `packages/storage`
  - SQLite contracts and migration placeholders
- `packages/media`
  - media utilities and future FFmpeg wrappers
- `packages/scoring`
  - reason code vocabulary and confidence helpers
- `packages/profiles`
  - profile presets and signal-weight placeholders
- `packages/export`
  - JSON/timestamp export helpers and EDL placeholder
- `packages/ai-assist`
  - optional AI-assist placeholder helpers only
- `scripts`
  - root-first bash wrappers for bootstrap, dev, verify, and doctor flows

## Bootstrap

```bash
pnpm bootstrap
```

That runs environment checks and installs workspace dependencies.

## Run Surfaces And Services

```bash
pnpm dev:pulse
pnpm dev:desktop
pnpm dev:web
pnpm dev:mobile
pnpm dev:analyzer
pnpm dev:api
pnpm dev:both
```

`dev:pulse` remains the live development stack: analyzer, then API, then the Tauri dev app after both health checks pass.
`dev:both` starts analyzer + API + webapp together as the easiest multi-surface development loop from the repo root.
The API bridge currently runs directly from TypeScript with `tsx`.
`dev:desktop` remains the primary product-development loop.

## Package The macOS App

```bash
pnpm app:build
pnpm app:zip
pnpm release:check
pnpm release:unsigned
pnpm diagnostics
```

`app:build` builds a real unsigned Tauri `.app` bundle at `release/mac-<arch>/vaexcore pulse.app`.
`app:zip` creates the unsigned zip, `.zip.sha256`, JSON manifest, and tester handoff markdown.
`release:check` runs build/test/release smoke checks.
`release:unsigned` runs the full unsigned release flow.
`diagnostics` creates a safe local support bundle that reports paths and environment metadata without config contents or secrets.

The packaged macOS identity is:

- Product name: `vaexcore pulse`
- Package name: `vaexcore-pulse`
- Bundle name: `vaexcore pulse.app`
- App ID: `com.vaexil.vaexcore.pulse`
- App data path:
  - macOS: `~/Library/Application Support/vaexcore pulse`
  - Windows: `%APPDATA%\vaexcore pulse`

## Verify The Repo

```bash
pnpm verify:web
pnpm verify:desktop
pnpm verify:mobile
pnpm verify:analyzer
pnpm verify:api
pnpm verify:all
pnpm test
pnpm health
pnpm run doctor
```

Use `pnpm health` as the primary repo health check. `pnpm doctor` is a built-in pnpm command and does not run the vaexcore pulse script.

## Local Tool Versions

- Node is pinned in `.nvmrc`
- Python is pinned in `.python-version`

## What Is Real Versus Stubbed

Real now:

- coherent pnpm workspace wiring
- desktop-first review surface with local analysis and backlog workflow
- optional vaexcore studio discovery for stopped recordings
- webapp companion surface for lighter browsing and inspection
- mobileapp companion scaffold with shared mock-derived views
- shared contracts, profiles, scoring helpers, and UI primitives
- analyzer CLI, analyzer HTTP server, and SQLite persistence scaffold
- API bridge with placeholder routes and analyzer health bridge
- root-first scripts for bootstrapping, running, and verification

Still stubbed on purpose:

- FFmpeg execution and media probing
- real acoustic feature extraction
- real offline STT provider integration
- analyzer job orchestration beyond mock/demo flows
- packaged production build output for the API bridge
- persistent desktopapp SQLite adapter
- API-backed mobile companion data
- any AI-dependent logic in the core engine

## Optional vaexcore studio Connection

When vaexcore studio is running, Pulse looks for Studio's local discovery file, checks `GET /recordings/recent`, and subscribes to the Studio event stream. A `recording.stopped` event stages the completed recording in Pulse so it can be scanned without manually copying the file path. After review, Pulse can send kept moments back to Studio as `marker.created` records with source metadata.

For browser-only dev runs, configure:

```bash
VITE_VAEXCORE_STUDIO_API_URL=http://127.0.0.1:51287
VITE_VAEXCORE_STUDIO_API_TOKEN=
```

## Documentation

- `docs/repo-map.md`
- `docs/architecture.md`
- `docs/mobileapp.md`
- `docs/analyzer-pipeline.md`
- `docs/scoring-model.md`
- `docs/profiles.md`
- `docs/desktopapp.md`
- `docs/webapp.md`
- `docs/api.md`
- `docs/storage.md`
- `docs/verification.md`
- `docs/archive/2026-03-13/`
