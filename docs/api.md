# API

## Role

The API service is the stable bridge between UI apps and backend logic.

## Placeholder Endpoints

- `GET /health`
- `GET /api/projects`
- `GET /api/candidates/current`
- `GET /api/profiles`
- `GET /api/bridge/analyzer`
- `POST /api/projects/analyze`
- `POST /api/projects/review`

`POST /api/projects/analyze` accepts `sourcePath`, optional `profileId`,
optional `sessionTitle`, and optional `transcriptPath`. `transcriptPath` points
to a local SRT, VTT, timestamped text, plain text, or JSON transcript file and is
forwarded only to the local analyzer service. Session responses include
`analysisProvenance` so UI clients can distinguish mock, real, partial, and
failed local analyzer signal coverage.

## Current Direction

The API returns mock/shared data now, but the route boundaries are set up to become the stable app-facing contract later.

At this scaffold stage, the service runs directly from TypeScript with `tsx`. The current `build` step is a compile verification step, not a packaged production artifact flow.
