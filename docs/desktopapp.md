# Desktopapp

## Role

Desktopapp is the primary product surface in V1.

It is the default place for:

- local media selection
- video scanning
- moment review
- reference-guided decision-making
- saved-session follow-up

## Responsibilities

- local project/session creation
- local media selection
- scan launch control
- moment review UI
- moment detail inspection
- keep / skip / adjust / rename flow
- export entrypoint

## Current Navigation

The desktop app centers on four task areas:

- Start
- Review
- References
- Backlog

## macOS Packaging

The packaged app is `vaexcore pulse.app`.

- Product name: `vaexcore pulse`
- Bundle ID: `com.vaexil.vaexcore.pulse`
- Release output: `release/mac-<arch>/vaexcore pulse.app`
- App data path:
  - macOS: `~/Library/Application Support/vaexcore pulse`
  - Windows: `%APPDATA%\vaexcore pulse`

Use `pnpm release:unsigned` for local unsigned tester artifacts.
