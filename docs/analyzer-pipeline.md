# Analyzer Pipeline

## Intended Stages

1. ingest orchestration
2. media preprocessing orchestration
3. transcript import/provider integration
4. speech activity estimation
5. acoustic feature extraction
6. candidate window generation
7. scoring orchestration
8. boundary shaping

## Current Scaffold Reality

- stage boundaries are real
- module names and entrypoints are real
- output contracts are real
- real-file scans can use operator-imported SRT, VTT, timestamped text, plain text, JSON transcripts, local sidecar transcripts, or deterministic local anchors when no transcript provider is available
- most acoustic analysis data is still deterministic local heuristic data

This is intentional. The scaffold optimizes for believable architecture, not premature feature logic.
