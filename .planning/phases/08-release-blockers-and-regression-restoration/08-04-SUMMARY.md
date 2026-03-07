---
phase: 08-release-blockers-and-regression-restoration
plan: 08-04
subsystem: auth
tags: [auth, rate-limit, nextjs, node:test]
requires:
  - phase: 01-platform-foundation-security-and-authentication
    provides: "Username/password auth routes, generic invalid-credentials semantics, and persistent session cookies."
  - phase: 08-release-blockers-and-regression-restoration
    provides: "Release-blocker sequencing from 08-01 through 08-03 so auth abuse hardening lands on a green build/typecheck baseline."
provides:
  - "Public login throttling keyed by normalized username plus forwarded client IP."
  - "Public signup throttling keyed by forwarded client IP with surfaced Retry-After windows."
  - "Structured auth_failure and auth_throttle operator logs with focused regression coverage."
affects: [09-security-runtime-and-release-proof-stabilization, auth, release-readiness]
tech-stack:
  added: []
  patterns:
    - "Injectable auth route limiter/logger dependencies for deterministic route tests."
    - "Process-local runtime limiter bound only at POST entrypoints so tests remain isolated while production requests share state."
key-files:
  created:
    - src/lib/auth/client-ip.ts
    - src/lib/auth/rate-limit.ts
    - src/lib/auth/auth-logger.ts
  modified:
    - src/app/api/auth/login/route.ts
    - src/app/api/auth/signup/route.ts
    - tests/auth/auth-rate-limit.test.ts
key-decisions:
  - "Keep brute-force protection route-local instead of introducing a generic abuse platform in phase 08."
  - "Throttle login on the request after the configured failure threshold so sub-threshold failures preserve generic 401 behavior."
  - "Bind the shared limiter only in runtime POST handlers; direct handler factories create isolated limiters for deterministic tests."
patterns-established:
  - "Forwarded client identity is resolved from X-Forwarded-For first, then X-Real-IP and CF-Connecting-IP."
  - "Operator-visible auth observability uses explicit auth_failure and auth_throttle records with injectable writers."
requirements-completed: [AUTH-01, AUTH-02, AUTH-03]
duration: 9 min
completed: 2026-03-07
---

# Phase 08 Plan 04: Focused auth throttling and abuse-proof verification Summary

**Public login/signup routes now enforce bounded brute-force throttling with Retry-After responses, forwarded-IP identity resolution, and structured operator-visible auth abuse events**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-07T10:36:28Z
- **Completed:** 2026-03-07T10:45:14Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Added a focused in-memory auth limiter for login and signup with deterministic retry-window behavior.
- Wired the public auth routes to resolve forwarded client IPs, preserve normal `401` and `409` responses below threshold, and emit `429` plus `Retry-After` once throttled.
- Proved the default runtime behavior with repeated fixed-IP requests and captured the emitted `auth_failure` and `auth_throttle` events.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add focused auth limiter and client-identity helpers with deterministic tests** - `9d3239e` (test), `b354901` (feat)
2. **Task 2: Wire login and signup handlers to enforce throttling without regressing existing auth semantics** - `3a54bb0` (test), `9fd0f11` (feat)
3. **Task 3: Run focused manual abuse proof against the auth endpoints** - `f489fe9` (chore)

**Plan metadata:** Pending final docs commit

_Note: TDD tasks used explicit red then green commits._

## Files Created/Modified
- `src/lib/auth/client-ip.ts` - Resolves the caller IP from reverse-proxy forwarding headers with safe fallbacks.
- `src/lib/auth/rate-limit.ts` - Implements deterministic login/signup limiter buckets and retry-window calculations.
- `src/lib/auth/auth-logger.ts` - Emits structured auth abuse records through an injectable writer.
- `src/app/api/auth/login/route.ts` - Applies login throttling, failure logging, and bucket reset on successful sign-in.
- `src/app/api/auth/signup/route.ts` - Applies signup throttling and throttle-event logging on the public signup route.
- `tests/auth/auth-rate-limit.test.ts` - Covers limiter primitives, route throttling behavior, reset semantics, and structured logs.

## Decisions Made
- Kept brute-force protection strictly on `/api/auth/login` and `/api/auth/signup` rather than building a generic rate-limit layer.
- Used normalized username plus client IP for login keys, and client IP only for signup keys, matching the approved plan boundary.
- Preserved normal auth semantics by returning generic `401` or `409` below threshold and moving throttle enforcement to explicit `429` responses with `Retry-After`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prevented shared limiter state from leaking across direct handler tests**
- **Found during:** Task 2 (Wire login and signup handlers to enforce throttling without regressing existing auth semantics)
- **Issue:** Using a module-level default limiter directly inside `createLoginHandler(...)` and `createSignupHandler(...)` caused independent tests to share failure buckets and break unrelated auth lifecycle assertions.
- **Fix:** Bound the shared limiter only in the exported `POST` handlers while direct handler factories create isolated limiters unless tests inject one explicitly.
- **Files modified:** `src/app/api/auth/login/route.ts`, `src/app/api/auth/signup/route.ts`
- **Verification:** `corepack pnpm test -- tests/auth/auth-rate-limit.test.ts tests/auth/session-lifecycle.test.ts`
- **Committed in:** `9fd0f11` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 rule-1 bug)
**Impact on plan:** The fix was necessary for correctness and test determinism. It stayed within the planned auth-route throttling scope.

## Issues Encountered
- The generic executor instructions referenced `/home/flo/.claude/get-shit-done/bin/gsd-tools.cjs`, but this workspace uses `/home/flo/.codex/get-shit-done/bin/gsd-tools.cjs`; state updates were executed against the installed `.codex` path.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Release-blocker wave 4 is complete with runtime-enforced auth abuse controls and focused proof of `429` behavior.
- Phase `08-05` can now focus on the adaptive lifecycle and evidence regressions while relying on the public auth boundary being measurably hardened.

## Abuse Proof Evidence

- Default login throttle: attempts 1-5 returned `401`; attempt 6 returned `429` with `Retry-After: 900`.
- Default signup throttle: attempts 1-3 returned `201`; attempt 4 returned `429` with `Retry-After: 3600`.
- Observed operator-visible event names: `auth_failure`, `auth_throttle`.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/08-release-blockers-and-regression-restoration/08-04-SUMMARY.md`.
- Task commits `9d3239e`, `b354901`, `3a54bb0`, `9fd0f11`, and `f489fe9` are present in git history.

---
*Phase: 08-release-blockers-and-regression-restoration*
*Completed: 2026-03-07*
