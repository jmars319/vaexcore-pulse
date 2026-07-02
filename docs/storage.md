# Storage

## Direction

vaexcore pulse stores project, candidate, and review data locally.

## Current Scaffold

- shared SQLite schema helpers in `packages/storage`
- Python SQLite persistence in `services/analyzer` for project sessions, candidate windows, review decisions, transcript imports, analysis artifacts, profiles, and media-library records
- desktop browser state only for UI resume helpers such as the last opened session, theme mode, and Studio intake queue presentation state
- operator-selected transcript imports are stored inside the saved analyzer session and analysis artifact rows, not as browser-local review data

## Deferred Work

- richer desktop query/index surfaces over the analyzer SQLite store
- richer query/index planning
