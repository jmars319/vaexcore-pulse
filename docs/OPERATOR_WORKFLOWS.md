# Pulse Operator Workflows

This guide covers the daily review workstation path for Pulse: intake,
transcript import, analyzer review, human decisions, and export.

Pulse reduces review friction. It does not publish clips automatically and does
not replace editorial judgment.

## First Run

Check:

- Desktop app launches without the web dev server for packaged validation.
- API and analyzer health checks pass.
- SQLite workspace path is visible in diagnostics.
- Demo/sample project can open.
- Existing local or browser fallback state imports only when the operator
  chooses it.

Run:

```bash
pnpm run verify:all
pnpm run health
```

Use `pnpm run release:check` before describing a package as tester-ready.

## Intake Workflow

1. Create or select a project.
2. Import a Studio handoff, local recording, or transcript.
3. Label provenance clearly: Studio handoff, local file, transcript import,
   demo content, mock analysis, real analysis, partial analysis, or failed
   analysis.
4. Confirm media duration and transcript coverage before starting review.
5. Keep manual review available even when analyzer signals are partial or
   unavailable.

## Transcript Import

Supported transcript inputs:

- SRT.
- VTT.
- Timestamped text.
- Plain text.

After import:

- Check whether timestamps aligned to the media duration.
- Correct obvious speaker or timing drift before relying on anchors.
- Keep imported transcript provenance visible in the session detail.
- Re-run candidate generation when transcript corrections materially change the
  timeline.

## Review Workflow

Use keyboard-first review for speed:

- Accept, reject, or defer candidates.
- Move across the timeline.
- Create manual candidates.
- Split or merge candidates.
- Adjust rank or confidence when human review disagrees with analyzer order.
- Add tags and notes before export.

Duplicate and near-duplicate hints should reduce repeated review. They should
not hide candidates automatically.

## Analyzer Profiles

Pick the analysis profile that matches the content type before a serious review.
Profiles should influence scoring and reason visibility, but the session should
record whether the analyzer path was mock, real, partial, or failed.

Use mock analysis for demos and deterministic tests. Use real analysis for
operator review when local media and FFmpeg/audio extraction are available.

## Export Workflow

1. Filter to accepted decisions.
2. Pick an export preset: YouTube chapters, shorts CSV, editor handoff JSON,
   Pulse evidence JSON, timestamp list, or EDL.
3. Preview the export summary.
4. Save the batch package.
5. Reopen the session and confirm the accepted/rejected/deferred state
   persisted.

Exports should cite the saved review session and avoid claiming that rejected or
deferred candidates were approved.

## Library And Search

Use the saved-session library to find:

- Project titles.
- Session titles.
- Transcript text.
- Review tags.
- Decisions.
- Accepted export labels.

Large sessions should remain searchable without blocking the review surface.

## Crash And Error Reports

Attach:

- Pulse diagnostics output.
- Session id, project id, analyzer provenance, and import type.
- Transcript format and whether timestamps were corrected.
- Export preset and export summary.
- App version, commit, platform, and packaging type.

Do not attach private recordings, transcripts, or client material unless the
operator explicitly chooses to share them.

## Accessibility And Keyboard Baseline

- Review decisions must not require pointer-only controls.
- Timeline movement and candidate selection must keep visible focus.
- Disabled export actions must explain the missing requirement.
- Analyzer failures must be text-visible and preserve manual review.
- Library search results must be readable with clear project/session context.
