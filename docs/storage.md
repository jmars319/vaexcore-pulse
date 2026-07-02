# Storage

## Direction

vaexcore pulse stores project, candidate, and review data locally.

## Current Scaffold

- shared SQLite schema helpers in `packages/storage`
- Python SQLite persistence in `services/analyzer` for project sessions, candidate windows, review decisions, transcript imports, analyzer provenance, analysis artifacts, profiles, and media-library records
- candidate edit history, rank adjustments, quality signals, duplicate metadata, and transcript corrections are stored in the saved analyzer session snapshot
- analyzer-backed library search scans persisted session snapshots for titles, media paths, transcripts, candidate labels, review tags, decisions, decision notes, and accepted export labels
- desktop browser state only for UI resume helpers such as the last opened session, theme mode, and Studio intake queue presentation state
- operator-selected transcript imports are stored inside the saved analyzer session and analysis artifact rows, not as browser-local review data

## Deferred Work

- richer indexed search tables if large local libraries outgrow snapshot scanning
- archive-file writing for batch export packages
