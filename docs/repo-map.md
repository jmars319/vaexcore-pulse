# Repo Map

## Purpose

This repo is organized as a real monorepo, not a single-app prototype.

## Top-Level Structure

- `apps/desktopapp`
  - primary local-first desktop shell and review workstation
- `apps/webapp`
  - complementary browser companion
- `apps/mobileapp`
  - thin later-stage companion surface
- `services/analyzer`
  - Python analysis engine scaffold
- `services/api`
  - TypeScript bridge for app-facing endpoints
- `packages/shared-types`
  - shared contracts and schemas
- `packages/domain`
  - reusable business helpers
- `packages/ui`
  - shared design primitives and candidate display components
- `packages/storage`
  - SQLite contracts and migration placeholders
- `packages/media`
  - future FFmpeg/media orchestration wrappers
- `packages/scoring`
  - reason code vocabulary and confidence helpers
- `packages/profiles`
  - content weighting presets
- `packages/export`
  - export helpers, presets, and batch package builders
- `packages/ai-assist`
  - optional AI enhancements only
- `scripts`
  - root-first developer workflows
- `docs`
  - architecture and verification notes

## Practical Boundary Rule

Apps render and orchestrate.
Services expose stable runtime boundaries.
Packages hold reusable contracts, helpers, and primitives.
