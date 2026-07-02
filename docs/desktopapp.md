# Desktopapp

## Role

Desktopapp is the primary product surface in V1.

It is the default place for:

- local media selection
- optional transcript import
- video scanning
- moment review
- reference-guided decision-making
- saved-session follow-up

## Responsibilities

- local project/session creation
- local media selection
- transcript import path selection for SRT, VTT, timestamped text, plain text, or JSON
- scan launch control
- moment review UI
- moment detail inspection
- keep / skip / defer / adjust / rename flow
- manual candidate creation, split, merge, rank adjustment, and transcript correction
- export entrypoint

## Current Navigation

The desktop app centers on four task areas:

- Start
- Review
- References
- Backlog

The Start surface can attach an operator-selected transcript file to a scan. The
analyzer persists imported transcript chunks with the SQLite-backed project
session, and the session overview labels the imported transcript provenance in
the ingest notes. Review sessions also show analyzer provenance so operators can
distinguish mock, partial, and real local signal coverage before exporting.

The Review surface is keyboard-first for the core pass: `k` keeps a moment, `x`
skips it, `d` defers it, `n` jumps to the next undecided candidate, `j` and `l`
move across visible candidates, and `[` / `]` expand the clip boundary. Optional
candidate edit controls are persisted through the analyzer-backed SQLite session
store rather than browser state.

## macOS Packaging

The packaged app is `vaexcore pulse.app`.

- Product name: `vaexcore pulse`
- Bundle ID: `com.vaexil.vaexcore.pulse`
- Release output: `release/mac-<arch>/vaexcore pulse.app`
- App data path:
  - macOS: `~/Library/Application Support/vaexcore pulse`
  - Windows: `%APPDATA%\vaexcore pulse`

Use `pnpm release:unsigned` for local unsigned tester artifacts.
