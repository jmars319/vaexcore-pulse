# API

## Role

The API service is the stable bridge between UI apps and backend logic.

## Local Endpoints

- `GET /health`
- `GET /api/projects`
- `GET /api/candidates/current`
- `GET /api/profiles`
- `GET /api/bridge/analyzer`
- `POST /api/projects/analyze`
- `POST /api/projects/review`
- `POST /api/projects/candidates/edit`

`POST /api/projects/analyze` accepts `sourcePath`, optional `profileId`,
optional `sessionTitle`, and optional `transcriptPath`. `transcriptPath` points
to a local SRT, VTT, timestamped text, plain text, or JSON transcript file and is
forwarded only to the local analyzer service. Session responses include
`analysisProvenance` so UI clients can distinguish mock, real, partial, and
failed local analyzer signal coverage.

`POST /api/projects/review` records review decisions for keep, skip, defer,
retime, and relabel. Accepted decisions are the only decisions exported as kept
moments.

`POST /api/projects/candidates/edit` persists local candidate edits through the
analyzer SQLite session store. Supported actions are `CREATE`, `SPLIT`, `MERGE`,
`RANK`, and `TRANSCRIPT_CORRECTION`.

## Current Direction

The API remains a local bridge. It should keep UI clients away from analyzer
storage details while preserving explicit contracts for review and candidate
mutation.

At this scaffold stage, the service runs directly from TypeScript with `tsx`. The current `build` step is a compile verification step, not a packaged production artifact flow.
