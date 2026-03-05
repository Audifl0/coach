---
phase: 06-trends-and-operational-reliability
plan: 06-03
subsystem: infra
tags: [postgres, backup, restore, systemd, operations]
requires:
  - phase: 01-platform-foundation-security-and-authentication
    provides: encrypted backup and restore shell primitives
provides:
  - strict restore guardrails for dedicated drill database targeting
  - monthly restore drill automation with evidence logs
  - incident runbook for restore drill execution and failure handling
affects: [operations, reliability, incident-response, vps]
tech-stack:
  added: [systemd timer/service units]
  patterns: [fail-fast psql restore semantics, evidence-first operational drills]
key-files:
  created:
    - infra/scripts/run-restore-drill.sh
    - infra/systemd/coach-restore-drill.service
    - infra/systemd/coach-restore-drill.timer
    - docs/operations/restore-drill-runbook.md
  modified:
    - infra/scripts/restore.sh
    - docs/operations/data-protection.md
    - tests/ops/restore-drill.test.ts
key-decisions:
  - "Require RESTORE_TARGET_DB and block restores targeting production database name."
  - "Use psql -X with ON_ERROR_STOP and single-transaction restore semantics for fail-fast drills."
  - "Drive monthly drills via systemd timer with Persistent=true and timestamped evidence logs."
patterns-established:
  - "Restore drills run in deterministic stage order: backup selection, restore, login smoke, dashboard smoke."
  - "Operational runbooks must map directly to script outputs and evidence markers."
requirements-completed: [PLAT-02]
duration: 5 min
completed: 2026-03-05
---

# Phase 06 Plan 03: Restore Drill Automation Summary

**Monthly recoverability drills now restore encrypted backups into a dedicated drill database with strict fail-fast semantics, systemd scheduling, and incident-ready evidence logs.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-05T14:37:22Z
- **Completed:** 2026-03-05T14:42:03Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Hardened `restore.sh` to require explicit drill target DB and reject production-target restores.
- Added end-to-end `run-restore-drill.sh` orchestration with deterministic stage execution and timestamped evidence logging.
- Published operational runbook and linked baseline data-protection guidance to executable drill steps.

## Task Commits

1. **Task 1: Harden backup/restore scripts for strict restore safety and dedicated drill DB targeting**
   - `4973771` (`test`) RED tests
   - `f898bd2` (`fix`) GREEN implementation
2. **Task 2: Add drill orchestration script and monthly systemd units**
   - `c130433` (`test`) RED tests
   - `daa5deb` (`feat`) GREEN implementation
3. **Task 3: Publish incident-ready restore runbook and evidence checklist**
   - `e9bec73` (`docs`)

## Files Created/Modified
- `infra/scripts/restore.sh` - Enforces explicit drill target DB and strict psql restore flags.
- `infra/scripts/run-restore-drill.sh` - Orchestrates backup selection/creation, restore, smoke checks, and evidence output.
- `infra/systemd/coach-restore-drill.service` - One-shot service for drill execution.
- `infra/systemd/coach-restore-drill.timer` - Monthly persistent scheduler for catch-up behavior.
- `docs/operations/restore-drill-runbook.md` - Incident-ready drill and failure-handling checklist.
- `docs/operations/data-protection.md` - Cross-links to the runbook and updated drill procedure.
- `tests/ops/restore-drill.test.ts` - Contract tests for restore safety and scheduler/orchestrator wiring.

## Decisions Made
- Use explicit `RESTORE_TARGET_DB` as mandatory restore destination contract.
- Treat equality between `RESTORE_TARGET_DB` and `POSTGRES_DB` as a hard failure.
- Accept `2xx`/`3xx` smoke check responses for login/dashboard reachability validation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] gsd-tools path mismatch in execution environment**
- **Found during:** Executor initialization
- **Issue:** Plan workflow referenced `~/.claude/get-shit-done/bin/gsd-tools.cjs`, but workspace provides `~/.codex/get-shit-done/bin/gsd-tools.cjs`.
- **Fix:** Switched all gsd-tools invocations in this execution to the available `.codex` path.
- **Files modified:** None (execution-path adjustment only)
- **Verification:** `node "$HOME/.codex/get-shit-done/bin/gsd-tools.cjs" init execute-phase "06-trends-and-operational-reliability"` succeeded.
- **Committed in:** N/A (no repository file changes)

---

**Total deviations:** 1 auto-fixed (Rule 3: 1)
**Impact on plan:** No scope creep. Deviation only unblocked execution tooling; deliverables unchanged.

## Issues Encountered
None.

## User Setup Required
External setup is required on VPS:
- Create and expose `RESTORE_TARGET_DB` for drill restore target.
- Install and enable `coach-restore-drill.service` and `coach-restore-drill.timer`.

## Next Phase Readiness
Restore drill automation and runbook are ready for operational rollout and monthly cadence validation on VPS.
No code blockers remain for this plan.

---
*Phase: 06-trends-and-operational-reliability*
*Completed: 2026-03-05*

## Self-Check: PASSED
