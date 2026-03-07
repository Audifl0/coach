---
phase: 08-release-blockers-and-regression-restoration
plan: 08-01
subsystem: auth
tags: [prisma, nextjs, middleware, edge-runtime, auth]
requires:
  - phase: 07
    provides: audit evidence that isolated the RB-01 build blocker to stale Prisma output and middleware importing Node-only auth code
provides:
  - refreshed Prisma client state before RB-01 source remediation
  - edge-safe session cookie contract consumed by middleware without pulling Node-only auth runtime code
  - focused auth lifecycle verification for the middleware/auth seam
affects: [08-02, 08-03, auth, release-verification]
tech-stack:
  added: []
  patterns: [edge-safe contract module for shared auth constants, node-only auth runtime kept behind server-only imports]
key-files:
  created:
    - .planning/phases/08-release-blockers-and-regression-restoration/08-01-SUMMARY.md
    - .planning/phases/08-release-blockers-and-regression-restoration/deferred-items.md
    - src/lib/auth/session-contract.ts
  modified:
    - src/lib/auth/auth.ts
    - src/middleware.ts
key-decisions:
  - Middleware reads only SESSION_COOKIE_NAME from a leaf session contract module so Edge runtime code never imports node:crypto helpers.
  - The continuation backfill reran verification at current HEAD but did not reopen 08-01 source scope when a later generic Next.js build-worker failure appeared during static page generation.
patterns-established:
  - Shared auth constants that cross runtime boundaries live in tiny dependency-free modules.
  - Focused auth lifecycle tests remain the regression gate when middleware and server auth code are separated.
requirements-completed: [AUTH-02, PLAT-01]
duration: 32 min
completed: 2026-03-07
---

# Phase 08 Plan 01: Prisma Preflight and Edge-Safe Auth Split Summary

**Prisma client state was refreshed and middleware was moved onto an Edge-safe session contract so auth routing stays out of the Node-only runtime graph**

## Performance

- **Duration:** 32 min
- **Started:** 2026-03-07T09:03:00Z
- **Completed:** 2026-03-07T09:35:19Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments

- Refreshed generated Prisma client state before touching the RB-01 source fix path.
- Split shared session-cookie naming into `src/lib/auth/session-contract.ts` so middleware no longer depends on Node-only auth runtime helpers.
- Re-ran focused auth lifecycle coverage successfully during continuation, confirming session issuance and current-session logout behavior still hold after the runtime-boundary split.

## Task Commits

Each task was committed atomically:

1. **Task 1: Refresh generated Prisma client state before touching RB-01 source fixes** - `67c17be`
2. **Task 2: Split middleware-safe auth constants from Node-only auth runtime code** - `8e106ef`
3. **Task 3: Re-run focused auth regression coverage after the import-graph fix** - `7606844`
4. **Task 4: Overall plan verification and completion metadata** - recorded in the final docs commit that adds this summary

## Files Created/Modified

- `src/lib/auth/session-contract.ts` - Exposes the session cookie constant from a dependency-free module safe for both middleware and server auth code.
- `src/lib/auth/auth.ts` - Reuses the extracted session contract while keeping hashing and auth service logic on the Node-only side.
- `src/middleware.ts` - Reads the session cookie contract without importing the Node-only auth runtime graph.
- `.planning/phases/08-release-blockers-and-regression-restoration/deferred-items.md` - Records the current-head build-worker failure discovered during metadata backfill.

## Decisions Made

- Kept the fix intentionally narrow: only the shared cookie contract crossed the runtime boundary; password hashing and session service behavior stayed unchanged.
- Treated the generic current-head `next build` worker exit as a later verification result to hand off, not as a reason to reopen the already-committed 08-01 source fix during metadata backfill.

## Deviations from Plan

None - the source tasks were already executed as planned before continuation, and this continuation only reran verification plus completed missing metadata.

## Issues Encountered

- The continuation prompt referenced `~/.claude/get-shit-done`, but this workspace exposes the same tooling under `~/.codex/get-shit-done`; metadata commands used the available path.
- Current-head `corepack pnpm build` now exits during static page generation with `Next.js build worker exited with code: 1 and signal: null`. `corepack pnpm prisma:generate` and `corepack pnpm test -- tests/auth/session-lifecycle.test.ts` both succeed, so the auth seam remained intact while the broader build issue was deferred.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The auth runtime boundary introduced by 08-01 remains stable and was already usable by 08-02.
- A later phase-08 pass still needs to restore a green full `corepack pnpm build` at current HEAD before release closure.

## Self-Check: PASSED

- Verified `.planning/phases/08-release-blockers-and-regression-restoration/08-01-SUMMARY.md` exists.
- Verified prior task commits `67c17be`, `8e106ef`, and `7606844` exist in git history.

---
*Phase: 08-release-blockers-and-regression-restoration*
*Completed: 2026-03-07*
