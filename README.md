# Vaexcore Pulse by Tenra

Vaexcore Pulse by Tenra is a local-first highlight scouting system for long-form stream recordings. It analyzes measurable signals, surfaces likely moments worth reviewing, suggests clip boundaries, and keeps final editorial control with the human creator.

Pulse is not an automatic clip factory. Its job is to reduce review friction while preserving editorial judgment.

## Operational Purpose

- Ingest or reference long-form recordings for review.
- Surface candidate moments with reason codes and confidence.
- Support a human review queue for accepting, rejecting, and exporting candidates.
- Keep analysis profiles, scoring, storage, and export logic separated.

## Design Posture

- Signal analysis before AI interpretation.
- Human review before publishing or clipping.
- Local-first desktop workflow with companion web and mobile surfaces.
- Analyzer and API services are explicit, replaceable parts of the stack.
- Optional AI-assist helpers remain bounded and non-authoritative.

## Architecture

```text
apps/
  desktopapp/       Primary Tauri + React review workstation
  webapp/           Browser companion surface
  mobileapp/        Expo companion scaffold

services/
  analyzer/         Python analysis core scaffold
  api/              Fastify bridge service

packages/
  domain/           Review workflow helpers
  scoring/          Reason-code vocabulary and confidence helpers
  profiles/         Signal-weight profiles and presets
  storage/          SQLite contracts and migration placeholders
  media/            Media utilities and future FFmpeg wrappers
  export/           JSON, timestamp, and EDL export helpers
  ai-assist/        Optional assistance helpers
  shared-types/     Shared DTOs, enums, schemas, and mock data
  ui/               Shared interface primitives
```

## Current State

- The desktop app is the primary product-development loop.
- `dev:pulse` starts analyzer, API, and Tauri desktop after health checks.
- The Python analyzer is still scaffolded and intentionally lightweight.
- Real local analysis now records transcript/audio quality signals, duplicate hints, and persistent candidate edit history.
- The review workstation supports keep, skip, defer, retime, relabel, manual candidate creation, split, merge, rank adjustment, and transcript correction.
- The saved-session backlog now works as a searchable library across titles, transcripts, decisions, review tags, and accepted export labels.
- Export helpers include timestamp, YouTube chapter, shorts CSV, editor-handoff JSON, Pulse evidence JSON, and EDL presets as a batch package.
- The API bridge runs from TypeScript with Fastify.
- Packaging flows produce unsigned local app artifacts and tester handoff material.
- The web and mobile surfaces are companion-oriented, not the main review station.

## Deployment Posture

Pulse is a local creator tool in active development. It supports local packaging and unsigned tester artifacts. Production use depends on hardening analyzer behavior, media handling, storage migrations, export paths, and platform-specific packaging.

## Working Locally

```bash
pnpm run bootstrap
pnpm run dev:pulse
pnpm run dev:desktop
pnpm run verify:all
pnpm run health
pnpm run release:check
```

Use `pnpm run doctor` only with the repo script form where documented; `pnpm doctor` is a pnpm command name.

## Local Tooling

- Use `cargo audit` and `cargo deny` for Rust/Tauri dependency advisory, license, duplicate, and policy checks.
- Use `sccache` for repeated Rust/Tauri build loops.
- Use `uv` for Python analyzer project work and `pipx` for standalone Python CLIs.
- Use `shellcheck` and `shfmt` after editing shell scripts.
- Use `actionlint` after editing GitHub Actions workflows.
- Use `osv-scanner` for broad dependency advisory checks across manifests and lockfiles.

## Direction

- Improve analyzer quality and reason-code explainability.
- Harden project storage and media file boundaries.
- Keep accepted clips as human-reviewed decisions.
- Maintain Studio integration through explicit discovery and suite protocol contracts.

## Related Documentation

- [Architecture](docs/architecture.md)
- [Analyzer Pipeline](docs/analyzer-pipeline.md)
- [API](docs/api.md)
- [Operator Workflows](docs/OPERATOR_WORKFLOWS.md)
- [Scoring Model](docs/scoring-model.md)
- [Suite Protocol](docs/SUITE_PROTOCOL.md)
