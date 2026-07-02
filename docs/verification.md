# Verification

## Philosophy

Verification should be meaningful without pretending the scaffold is feature-complete.

## Current Checks

- `test`
  - runs focused workspace smoke tests for shared contracts, domain helpers, and API routes
- `verify:web`
  - builds the webapp
- `verify:desktop`
  - builds desktop UI assets and runs `cargo check`
- `verify:mobile`
  - typechecks the Expo companion scaffold
- `verify:analyzer`
  - runs analyzer tests and mock output flow
- `verify:api`
  - runs the API bridge compile verification step
- `verify:all`
  - runs all of the above
- `app:build`
  - builds a real unsigned macOS `.app` at `release/mac-<arch>/vaexcore pulse.app`
- `app:zip`
  - creates the unsigned zip, SHA-256 file, JSON manifest, and tester handoff markdown
- `release:check`
  - runs typecheck, full verification, artifact smoke checks, diagnostics smoke, tester guide smoke, update-preservation smoke, metadata checks, and `git diff --check`
- `release:unsigned`
  - builds, zips, and checks the unsigned tester release
- `health`
  - primary repo health command
  - runs environment check, package layout check, the workspace test suite, and full verification
- `run doctor`
  - equivalent package-script form if you specifically want the `doctor` script name
  - use `pnpm run doctor`, not `pnpm doctor`

## Operator Validation

Use [Operator Workflows](OPERATOR_WORKFLOWS.md) after automated verification to
check first-run setup, transcript import, analyzer provenance, keyboard review,
accepted-only exports, persistence after restart, and local-only diagnostics.
