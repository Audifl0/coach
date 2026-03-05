---
phase: 05-adaptive-coaching-and-safety-guardrails
plan: 03
subsystem: api
tags: [adaptive-coaching, orchestration, safety-policy, fallback, nextjs-route]
requires:
  - phase: 05-01
    provides: account-scoped adaptive recommendation DAL and contracts
  - phase: 05-02
    provides: SAFE-01/SAFE-03 policy and confidence fallback primitives
provides:
  - Deterministic local evidence retrieval and explanation envelope helpers
  - LLM-first recommendation orchestration with fixed policy gate ordering
  - Authenticated adaptation generation endpoint with parse-validated payloads
affects: [dashboard-adaptation-surface, adaptive-confirmation-flow, recommendation-auditing]
tech-stack:
  added: []
  patterns: [guardrail-step-trace, response-parse-validation, account-scoped service composition]
key-files:
  created:
    - src/lib/adaptive-coaching/evidence.ts
    - src/lib/adaptive-coaching/orchestrator.ts
    - src/server/services/adaptive-coaching.ts
    - src/app/api/program/adaptation/route.ts
  modified:
    - tests/program/adaptive-coaching-service.test.ts
key-decisions:
  - "Orchestrator enforces fixed sequence parse -> integrity -> SAFE-01/02 -> SAFE-03 -> status assignment with explicit trace steps."
  - "Evidence tags returned to users are derived from local corpus retrieval, not model-provided tags."
  - "Route enforces output contract by parsing service payload before returning response."
patterns-established:
  - "Adaptive orchestration is service-driven and persistence-backed, while route remains auth + parsing boundary."
  - "Ownership masking for adaptive endpoints follows existing not-found semantics on account mismatch."
requirements-completed: [ADAP-01, ADAP-02, SAFE-03]
duration: 5min
completed: 2026-03-05
---

# Phase 05 Plan 03: Adaptive recommendation engine and endpoint Summary

**Policy-governed adaptive recommendation generation now produces evidence-backed explanations and serves them through an authenticated parse-validated API route.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-05T08:53:04Z
- **Completed:** 2026-03-05T08:57:34Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Implemented deterministic top-k evidence retrieval with stable short source references and strict explanation envelope rules.
- Implemented adaptive orchestration/service pipeline with fixed guardrail ordering and SAFE-03 fallback integration.
- Exposed `POST /api/program/adaptation` with authenticated account scope, ownership-masked not-found behavior, and output schema parsing.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build local-corpus evidence retrieval and explanation packaging**
2. `4b49868` (test), `dadf96f` (feat)
3. **Task 2: Implement LLM-first orchestration pipeline with fixed guardrail ordering**
4. `6234ef4` (test), `ed7370f` (feat)
5. **Task 3: Expose authenticated adaptation generation endpoint**
6. `0ac4b9a` (test), `b66392e` (feat)

## Files Created/Modified
- `src/lib/adaptive-coaching/evidence.ts` - Deterministic corpus retrieval, explanation envelope validation, context-quality scoring.
- `src/lib/adaptive-coaching/orchestrator.ts` - End-to-end recommendation orchestration with fixed guardrail ordering and status assignment.
- `src/server/services/adaptive-coaching.ts` - Context assembly, orchestration invocation, persistence, and decision-trace recording.
- `src/app/api/program/adaptation/route.ts` - Authenticated adaptation endpoint with parse validation and masked ownership errors.
- `tests/program/adaptive-coaching-service.test.ts` - TDD coverage for evidence, orchestration/service behavior, and adaptation route contracts.

## Decisions Made
- Kept model invocation pluggable through `proposeRecommendation` dependency while still treating the proposal as first input in orchestration.
- Normalized action-to-delta mapping in orchestration to keep SAFE-01 clamps deterministic even when proposal lacks explicit deltas.
- Stored orchestration trace steps in decision metadata for recommendation auditability.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `pnpm` binary unavailable in shell path**
- **Found during:** Task 1 RED verification
- **Issue:** Plan verification commands could not run with `pnpm` directly.
- **Fix:** Switched to `corepack pnpm ...` for all required verification runs.
- **Files modified:** None
- **Verification:** All plan test commands executed successfully using `corepack pnpm`.
- **Committed in:** `4b49868` (task test cycle)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope creep; verification command transport adjusted without changing feature scope.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Adaptive recommendation generation is available through authenticated API with explanations and fallback behavior. Ready for confirmation flows and dashboard integration in subsequent plans.

## Self-Check: PASSED
- Found `.planning/phases/05-adaptive-coaching-and-safety-guardrails/05-03-SUMMARY.md`
- Found commits: `4b49868`, `dadf96f`, `6234ef4`, `ed7370f`, `0ac4b9a`, `b66392e`
