---
phase: 16-bootstrap-profond-du-worker-corpus-pour-b-tir-une-biblioth-que-scientifique-large-depuis-z-ro
plan: 16-02
subsystem: worker
tags: [bootstrap, pipeline, pagination, dedup, telemetry, pubmed, crossref, openalex]
requires:
  - phase: 16-01
    provides: "Bootstrap contracts, persistent campaign state, and worker mode split"
provides:
  - "Bootstrap collection jobs persisted as resumable queue entries"
  - "Canonical multi-source identity and dedup across evidence records"
  - "Bootstrap queue telemetry in run reports and source artifacts"
affects: [16-03, 16-04, 16-05, worker-corpus-dashboard]
tech-stack:
  added: []
  patterns: [resumable bootstrap queue, terminal job exhaustion states, canonical evidence dedup]
key-files:
  created:
    - .planning/phases/16-bootstrap-profond-du-worker-corpus-pour-b-tir-une-biblioth-que-scientifique-large-depuis-z-ro/16-02-SUMMARY.md
  modified:
    - scripts/adaptive-knowledge/discovery.ts
    - scripts/adaptive-knowledge/contracts.ts
    - scripts/adaptive-knowledge/connectors/shared.ts
    - scripts/adaptive-knowledge/pipeline-run.ts
    - tests/program/adaptive-knowledge-pipeline-run.test.ts
key-decisions:
  - "Bootstrap jobs now stay pending when a cursor can continue and become exhausted when a source or page budget is depleted."
  - "Canonical identity is derived at connector normalization time and used as the stable dedup key across sources."
  - "Bootstrap progress is exposed structurally in run reports instead of only through stage message strings."
patterns-established:
  - "Pattern: bootstrap queue entries are the source of truth for resumable collection progress."
  - "Pattern: worker artifacts carry queue depth, processed jobs, and exhaustion reasons for operator interpretation."
requirements-completed: [PROG-01, PROG-02, SAFE-02, PLAT-02]
duration: 13m
completed: 2026-03-13
---

# Phase 16 Plan 16-02: Deep Bootstrap Collection Summary

**Bootstrap backfill now runs as a resumable multi-source job queue with canonical evidence dedup and explicit operator telemetry for queue depth, pages consumed, and exhaustion states**

## Performance

- **Duration:** 13m
- **Started:** 2026-03-13T07:35:22Z
- **Completed:** 2026-03-13T07:48:35Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Replaced flat bootstrap discovery with persisted collection jobs that resume by source/query family instead of recreating ephemeral work.
- Added canonical evidence identity and cross-source dedup so the same paper no longer inflates the library across providers.
- Exposed bootstrap queue telemetry in `run-report.json` and `sources.json`, including pending depth, jobs processed, pages consumed, and exhaustion reasons.

## Task Commits

Each task was committed atomically:

1. **Task 1: Convertir la discovery en generatrice de jobs de collecte bootstrap** - `7d0fb2a` (test), `0d08bc4` (feat)
2. **Task 2: Generaliser pagination, curseurs et budgets par source** - `43280e5` (test), `2e4cd55` (feat)
3. **Task 3: Rendre la collecte incrementalement productive et explicable** - `c4f8ea4` (test), `6b61f87` (feat)

**Auto-fix within plan:** `971e8db` (fix)

## Files Created/Modified

- `scripts/adaptive-knowledge/discovery.ts` - Resumes only active bootstrap jobs and avoids reintroducing completed/exhausted work.
- `scripts/adaptive-knowledge/contracts.ts` - Defines canonical evidence IDs and structured bootstrap run telemetry.
- `scripts/adaptive-knowledge/connectors/shared.ts` - Normalizes canonical IDs and dedupes provenance across providers.
- `scripts/adaptive-knowledge/pipeline-run.ts` - Persists resumable job states, computes queue telemetry, and updates campaign backlog safely.
- `tests/program/adaptive-knowledge-pipeline-run.test.ts` - Covers queue generation, cursor resume, canonical dedup, short ticks, and non-duplicating resumes.

## Decisions Made

- Bootstrap job status is now semantic: `pending` means resumable, `exhausted` means terminal due to source/page budget, and `blocked` preserves connector failures without hiding them.
- Canonical dedup is performed before ranking/synthesis so downstream stages measure library growth from unique evidences rather than raw connector volume.
- Queue telemetry lives in structured report fields so later dashboard work can consume it without parsing human message strings.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Exposed bootstrap config overrides on pipeline input**
- **Found during:** Task 3
- **Issue:** Focused tests passed, but global `typecheck` failed because `runAdaptiveKnowledgePipeline` did not type the bootstrap override fields already supported by config parsing.
- **Fix:** Added `bootstrapMaxJobsPerRun`, `bootstrapMaxPagesPerJob`, `bootstrapMaxCanonicalRecordsPerRun`, and `bootstrapMaxRuntimeMs` to `configOverrides`.
- **Files modified:** `scripts/adaptive-knowledge/pipeline-run.ts`
- **Verification:** `corepack pnpm typecheck`
- **Committed in:** `971e8db`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The fix was required to keep the new bootstrap telemetry/test surface type-safe. No scope creep.

## Issues Encountered

- The bootstrap job lifecycle previously marked processed jobs as completed immediately, which prevented true multi-page resume. The final implementation corrected this by keeping resumable jobs pending and reserving exhausted for terminal states.
- The local GSD helper binary was unavailable in this environment, so state and roadmap close-out were updated manually rather than through `gsd-tools`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 16-03 can now build document staging and extraction on top of a stable resumable queue with canonical identities.
- Dashboard/operator work in 16-05 can consume structured bootstrap telemetry directly from artifacts and run reports.

## Self-Check: PASSED

- Summary file created at `.planning/phases/16-bootstrap-profond-du-worker-corpus-pour-b-tir-une-biblioth-que-scientifique-large-depuis-z-ro/16-02-SUMMARY.md`
- Verified task commits exist: `7d0fb2a`, `0d08bc4`, `43280e5`, `2e4cd55`, `c4f8ea4`, `6b61f87`, `971e8db`
- Verification completed:
  - `corepack pnpm test tests/program/adaptive-knowledge-pipeline-run.test.ts --runInBand`
  - `corepack pnpm typecheck`
  - `rg -n "cursor|page|budget|queue|job|exhausted|canonical|doi|pmid|dedup" scripts/adaptive-knowledge/discovery.ts scripts/adaptive-knowledge/contracts.ts scripts/adaptive-knowledge/connectors/shared.ts scripts/adaptive-knowledge/connectors/pubmed.ts scripts/adaptive-knowledge/connectors/crossref.ts scripts/adaptive-knowledge/connectors/openalex.ts scripts/adaptive-knowledge/pipeline-run.ts`
