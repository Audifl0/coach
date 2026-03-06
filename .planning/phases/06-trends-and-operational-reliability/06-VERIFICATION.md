---
status: gaps_found
phase: 06-trends-and-operational-reliability
verified_on: 2026-03-05
requirement_ids:
  - DASH-02
  - PLAT-02
---

# Phase 06 Verification

## Goal Under Verification
Finalize decision-support trends and production recovery readiness.

## Result
Phase 06 is **partially achieved**. Most must-haves are implemented and validated, but one functional gap blocks full DASH-02 acceptance for horizon toggle behavior.

## Requirement ID Accounting

Plan frontmatter requirement IDs:
- `06-01-PLAN.md`: `DASH-02` ([06-01-PLAN.md](./06-01-PLAN.md):17)
- `06-02-PLAN.md`: `DASH-02` ([06-02-PLAN.md](./06-02-PLAN.md):16)
- `06-03-PLAN.md`: `PLAT-02` ([06-03-PLAN.md](./06-03-PLAN.md):16)

Cross-reference with `.planning/REQUIREMENTS.md`:
- `DASH-02` exists and is mapped to phase 6 ([REQUIREMENTS.md](../../REQUIREMENTS.md):51, [REQUIREMENTS.md](../../REQUIREMENTS.md):113)
- `PLAT-02` exists and is mapped to phase 6 ([REQUIREMENTS.md](../../REQUIREMENTS.md):57, [REQUIREMENTS.md](../../REQUIREMENTS.md):116)

Accounting conclusion:
- Plan requirement IDs are valid and fully accounted for in requirements traceability.

## Must-Have Verification Evidence

### 06-01 (DASH-02 data/API foundation)

Verified artifacts and behaviors:
- Strict trend query/payload parsing is implemented and exported:
  - [src/lib/program/trends.ts](/home/flo/projects/coach/src/lib/program/trends.ts)
  - [src/lib/program/contracts.ts](/home/flo/projects/coach/src/lib/program/contracts.ts):265
- Summary and drilldown routes enforce auth, validate query, and parse response payloads:
  - [route.ts](/home/flo/projects/coach/src/app/api/program/trends/route.ts):19
  - [[exerciseKey]/route.ts](/home/flo/projects/coach/src/app/api/program/trends/[exerciseKey]/route.ts):26
- DAL computes deterministic volume/intensity/adherence and exercise drilldown with account scoping:
  - [program.ts](/home/flo/projects/coach/src/server/dal/program.ts):774
  - [program.ts](/home/flo/projects/coach/src/server/dal/program.ts):908

Automated evidence:
- [program-trends-contracts.test.ts](/home/flo/projects/coach/tests/program/program-trends-contracts.test.ts)
- [program-dal-trends.test.ts](/home/flo/projects/coach/tests/program/program-dal-trends.test.ts)
- [program-trends-route.test.ts](/home/flo/projects/coach/tests/program/program-trends-route.test.ts)

Status: **meets must-haves**.

### 06-02 (DASH-02 dashboard trend surface)

Verified artifacts and behaviors:
- Trends section composition and initial server request (`period=30d`, `cache: no-store`):
  - [page.tsx](/home/flo/projects/coach/src/app/(private)/dashboard/page.tsx):159
  - [page.tsx](/home/flo/projects/coach/src/app/(private)/dashboard/page.tsx):193
- Summary renders 3 metric cards (volume/intensity/adherence) and visual-only output:
  - [trends-summary-card.tsx](/home/flo/projects/coach/src/app/(private)/dashboard/_components/trends-summary-card.tsx):46
  - [trends-summary-card.tsx](/home/flo/projects/coach/src/app/(private)/dashboard/_components/trends-summary-card.tsx):164
- Drilldown renders separate reps/load evolution charts:
  - [trends-drilldown.tsx](/home/flo/projects/coach/src/app/(private)/dashboard/_components/trends-drilldown.tsx):28
  - [trends-drilldown.tsx](/home/flo/projects/coach/src/app/(private)/dashboard/_components/trends-drilldown.tsx):100

Automated evidence:
- [dashboard-trends-surface.test.ts](/home/flo/projects/coach/tests/program/dashboard-trends-surface.test.ts)

Status: **gap found** (see gap list).

### 06-03 (PLAT-02 restore readiness)

Verified artifacts and behaviors:
- Restore script has fail-fast semantics and production-target guardrail:
  - [restore.sh](/home/flo/projects/coach/infra/scripts/restore.sh):46
  - [restore.sh](/home/flo/projects/coach/infra/scripts/restore.sh):70
- Monthly drill orchestration writes timestamped evidence and performs login/dashboard smoke checks:
  - [run-restore-drill.sh](/home/flo/projects/coach/infra/scripts/run-restore-drill.sh):86
  - [run-restore-drill.sh](/home/flo/projects/coach/infra/scripts/run-restore-drill.sh):93
- Monthly persistent timer and runbook procedure are present:
  - [coach-restore-drill.timer](/home/flo/projects/coach/infra/systemd/coach-restore-drill.timer):5
  - [restore-drill-runbook.md](/home/flo/projects/coach/docs/operations/restore-drill-runbook.md):22

Automated evidence:
- [restore-drill.test.ts](/home/flo/projects/coach/tests/ops/restore-drill.test.ts)
- Shell syntax checks passed for backup/restore/drill scripts.

Status: **meets must-haves** (subject to VPS `user_setup` execution from plan).

## Executed Verification Checks

Command:
```bash
corepack pnpm test tests/program/program-trends-contracts.test.ts tests/program/program-dal-trends.test.ts tests/program/program-trends-route.test.ts tests/program/dashboard-trends-surface.test.ts tests/program/dashboard-today-surface.test.ts tests/ops/restore-drill.test.ts
```

Outcome:
- `36` tests passed, `0` failed.

Command:
```bash
bash -n infra/scripts/backup.sh infra/scripts/restore.sh infra/scripts/run-restore-drill.sh
```

Outcome:
- Syntax checks passed.

## Explicit Gaps And Proposed Closure

1. Gap: Horizon toggle can display stale data when switching back to `30d`.
- Evidence:
  - In [trends-summary-card.tsx](/home/flo/projects/coach/src/app/(private)/dashboard/_components/trends-summary-card.tsx):96, effect returns early when `state.period === initialData.period`.
  - After loading `7d` or `90d`, switching back to `30d` does not restore `initialData` or refetch; `state.data` can remain from prior period.
- Impact:
  - Violates the "working 7/30/90 toggles" must-have from [06-02-PLAN.md](./06-02-PLAN.md):21 and success criteria at [06-02-PLAN.md](./06-02-PLAN.md):127.
- Proposed closure:
  - Update `TrendsSummaryCard` period change logic so `30d` always reflects 30d data by either:
    - Option A: when `state.period === initialData.period`, explicitly set `state.data = initialData`; or
    - Option B: track `state.data.period` and fetch whenever `state.data.period !== state.period`.
  - Add regression test in [dashboard-trends-surface.test.ts](/home/flo/projects/coach/tests/program/dashboard-trends-surface.test.ts) for sequence `30d -> 7d -> 30d` ensuring displayed dataset period is `30d`.

## Final Verification Decision

`status: gaps_found`

Reason:
- `PLAT-02` operational readiness artifacts and checks are satisfied.
- `DASH-02` is mostly implemented, but one concrete toggle-state bug prevents full goal acceptance.
