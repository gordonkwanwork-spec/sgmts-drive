# AGENTS.md

## Project Overview
SGMTS Drive is a browser driving game. Model settings are gameplay assumptions,
not surveyed geometry, certified vehicle performance or accessibility criteria.

## Key Files & Responsibilities
- `src/alignment.js`: route and station geometry.
- `src/operating.js`: pure operating rules and actor motion.
- `src/experience.js`: runtime integration, rendering and service interaction.
- `src/simulation.test.js`: simulation and loaded-asset regression checks.

## Workflow
Present a file-by-file plan before non-trivial implementation. Surface unexpected
geometry or scope changes. Keep the original main branch unchanged until review.

## What Never to Touch
Do not read or change secrets. Leave lockfiles, generated assets and deployment
configuration unchanged unless the task specifically authorizes those changes.

## Testing
Run `npm test`, `npm run build` and `git diff --check`. No lint or TypeScript
check is configured. Verify loaded station/vehicle interaction when docking changes.

## Lessons Learned
- [2026-09-11] Check loaded station and vehicle geometry when tightening docking: road-level door pivots are not boarding sills, and the A7 road/platform mismatch requires an explicit temporary gameplay allowance.
- [2026-09-11] Regression tests must bound deceleration as well as check stop positions; impossible late stops must be reported instead of hidden by snapping.
- [2026-09-11] Stage 1 tests and build passed; browser probes confirmed nominal docking and short passenger-exchange transitions at all seven stations without runtime errors.
