---
phase: 01-platform-foundation-security-and-authentication
plan: 2
subsystem: auth
tags: [nextjs, prisma, zod, sessions, password-hashing]
requires:
  - phase: 01-05
    provides: Auth data model and contract validation helpers
provides:
  - Username/password auth service for signup and login with hashed password checks
  - Persistent 30-day secure session cookie issuance on successful login
  - Backend lifecycle tests covering signup, duplicate rejection, and generic auth failures
affects: [auth-ui, session-middleware, protected-routes]
tech-stack:
  added: []
  patterns: [injectable-auth-service, generic-auth-failure-policy, hashed-session-token-storage]
key-files:
  created:
    - src/lib/auth/auth.ts
    - src/lib/auth/password.ts
    - src/app/api/auth/signup/route.ts
    - src/app/api/auth/login/route.ts
    - tests/auth/session-lifecycle.test.ts
  modified:
    - tests/auth/session-lifecycle.test.ts
key-decisions:
  - "Use scrypt-based password hashing with minimum-length policy enforcement at signup."
  - "Issue secure, httpOnly, sameSite=lax session cookies with 30-day max age."
  - "Return a single generic invalid-credentials message for all login authentication failures."
patterns-established:
  - "Route handlers are factory-built for testability and can run with injected auth services."
  - "Session token plaintext is only in cookie; persisted storage keeps SHA-256 token hashes."
requirements-completed: [AUTH-01, AUTH-02, PLAT-03]
duration: 4min
completed: 2026-03-04
---

# Phase 01 Plan 02: Backend Signup and Login Summary

**Username/password signup and login now run through an auth service that hashes credentials, enforces generic login failures, and issues 30-day secure session cookies.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-04T10:57:41Z
- **Completed:** 2026-03-04T11:02:26Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Implemented auth/password services for signup and login including password hashing and session token hashing.
- Added Next.js API handlers for `/api/auth/signup` and `/api/auth/login` with validation, error mapping, and cookie issuance.
- Expanded lifecycle regression tests to enforce duplicate rejection, generic login failures, and persistent session semantics.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement username/password auth services and API handlers**
- `cde4717` (test)
- `dceb541` (feat)

2. **Task 2: Lock backend auth lifecycle regressions**
- `9ce5228` (test)

## Files Created/Modified
- `src/lib/auth/password.ts` - Password policy, scrypt hashing, and password verification helpers.
- `src/lib/auth/auth.ts` - Signup/login service, session cookie/session hash semantics, and auth error types.
- `src/app/api/auth/signup/route.ts` - Signup POST route with payload validation and duplicate username mapping.
- `src/app/api/auth/login/route.ts` - Login POST route returning generic auth failures and secure persistent session cookie.
- `tests/auth/session-lifecycle.test.ts` - Lifecycle tests for signup success, duplicate rejection, login failure genericity, and persistent cookie issuance.

## Decisions Made
- Set minimum password policy to length-only for low-friction V1 while still hashing credentials before persistence.
- Used 30-day session duration with secure cookie defaults (`httpOnly`, `secure`, `sameSite=lax`) aligned with phase context.
- Kept login failure responses invariant (`Invalid username or password`) to avoid account-existence leakage.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `pnpm` missing on PATH**
- **Found during:** Task 1 RED verification
- **Issue:** Planned verification command could not run because `pnpm` binary was unavailable.
- **Fix:** Used `corepack pnpm ...` command-equivalents for all test verification steps.
- **Files modified:** None
- **Verification:** `corepack pnpm test tests/auth/session-lifecycle.test.ts -t "signup and login"` executed successfully after implementation.
- **Committed in:** N/A

**2. [Rule 3 - Blocking] Route module imports initialized Prisma during test loading**
- **Found during:** Task 1 GREEN verification
- **Issue:** Importing route files for handler-factory tests eagerly initialized Prisma and failed isolated test execution.
- **Fix:** Switched routes to lazy-load Prisma in default `POST` handlers and kept factory functions injectable for tests.
- **Files modified:** src/app/api/auth/signup/route.ts, src/app/api/auth/login/route.ts
- **Verification:** Lifecycle tests run without database bootstrap and pass.
- **Committed in:** dceb541

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were execution blockers; no scope expansion or architectural drift.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend auth endpoints and session issuance behavior are stable for UI wiring and middleware integration.
- Regression coverage now locks critical backend auth lifecycle behavior for follow-up plans.

## Self-Check: PASSED
