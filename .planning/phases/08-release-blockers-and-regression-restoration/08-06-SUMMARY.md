---
phase: 08-release-blockers-and-regression-restoration
plan: 08-06
subsystem: infra
tags: [nextjs, dashboard, app-router, build, regression]
requires:
  - phase: 08-05
    provides: adaptive and test-gate restoration on current head before the final build blocker fix
provides:
  - stable Next.js workspace root inference for this repo
  - dashboard today and trends loading through direct server-side boundaries instead of SSR self-fetches
  - Next-compatible companion handler modules for tested app routes and a dynamic private route segment that no longer crashes static generation
affects: [phase-08, phase-09, dashboard, release-readiness]
tech-stack:
  added: []
  patterns:
    - app-router route and page helper logic lives in companion modules when tests need runtime access
    - authenticated app surfaces under the private segment are forced dynamic instead of relying on static generation heuristics
key-files:
  created:
    - .planning/phases/08-release-blockers-and-regression-restoration/08-06-DIAGNOSIS.md
    - .planning/phases/08-release-blockers-and-regression-restoration/08-06-GATES.md
    - src/app/(private)/dashboard/page-helpers.ts
    - src/app/(private)/layout.tsx
    - src/app/api/auth/handlers.ts
    - src/app/api/profile/route-handlers.ts
    - src/app/api/program/sessions/[sessionId]/route-handlers.ts
  modified:
    - next.config.ts
    - src/app/(private)/dashboard/page.tsx
    - src/app/api/program/today/route.ts
    - src/app/api/program/trends/route.ts
    - tests/program/dashboard-today-surface.test.ts
    - tests/program/dashboard-trends-surface.test.ts
key-decisions:
  - Force the entire `(private)` app segment dynamic so authenticated pages are never part of the static-generation worker path.
  - Keep route and page files Next-compatible by moving testable runtime helpers into companion `handlers` and `page-helpers` modules instead of exporting them directly from app entry files.
  - Preserve dashboard today and trends contracts by reusing DAL and projection logic directly on the server rather than going back through same-origin HTTP.
patterns-established:
  - Build-only Next app-router constraints should be validated against companion modules instead of weakening tests or suppressing type checks.
  - Authenticated private pages should declare dynamic rendering explicitly when they depend on session-gated server behavior.
requirements-completed: [PLAT-01, PLAT-03]
duration: 31 min
completed: 2026-03-07
---

# Phase 08 Plan 06: Next.js build-path remediation summary

**Next build now passes by pinning the repo root, removing dashboard SSR self-fetches, and forcing the authenticated private segment out of the static-generation worker path.**

## Performance

- **Duration:** 31 min
- **Started:** 2026-03-07T11:47:49Z
- **Completed:** 2026-03-07T12:19:02Z
- **Tasks:** 3
- **Files modified:** 20

## Accomplishments
- Captured deterministic evidence for the failing build seam and narrowed it to root inference drift plus build-time dashboard/self-fetch behavior.
- Restored a green production build by pinning Next root inference, moving dashboard today/trends data loading to direct server boundaries, extracting Next-compatible helper modules, and forcing the private segment dynamic.
- Re-ran release gates successfully: `corepack pnpm build`, `corepack pnpm typecheck`, and `corepack pnpm test` all pass on current HEAD.

## Task Commits

Each task was committed atomically:

1. **Task 1: Capture deterministic build-crash evidence and isolate the failing static-generation seam** - `3e1c1ed` (docs)
2. **Task 2: Patch only the isolated build seam in Next config/dashboard server data loading** - `0492e6d` (test), `728ce80` (feat)
3. **Task 3: Re-run release gates after the build crash fix** - `36b72a0` (chore)

**Plan metadata:** recorded in the final docs commit after summary/state updates.

## Files Created/Modified
- `.planning/phases/08-release-blockers-and-regression-restoration/08-06-DIAGNOSIS.md` - Records the reproduced build failure and the bounded seam chosen for remediation.
- `.planning/phases/08-release-blockers-and-regression-restoration/08-06-GATES.md` - Captures the final passing build, typecheck, and test commands.
- `next.config.ts` - Pins Next workspace root inference for both output tracing and Turbopack.
- `src/app/(private)/dashboard/page.tsx` - Uses direct server-side today/trends loaders instead of authenticated same-origin self-fetches.
- `src/app/(private)/dashboard/page-helpers.ts` - Holds dashboard helper logic needed by tests without violating app-router entry export rules.
- `src/app/(private)/layout.tsx` - Forces the authenticated private segment to render dynamically.
- `src/app/api/auth/handlers.ts` - Centralizes testable auth route handlers outside app entry files.
- `src/app/api/program/sessions/[sessionId]/route-handlers.ts` - Centralizes testable session route handlers and Promise-based route context helpers.
- `tests/program/dashboard-today-surface.test.ts` - Covers direct today-session loading and unchanged projection behavior.
- `tests/program/dashboard-trends-surface.test.ts` - Covers direct trends loading success and graceful null fallback.

## Decisions Made
- Kept today/trends response parsing on the dashboard side even after removing SSR HTTP hops, so route and page contracts stay aligned through the same projection/parse helpers.
- Solved the Next app-router export restriction by extraction, not by weakening tests or moving logic into untyped test-only code.
- Declared the `(private)` segment dynamic instead of trying to preserve static generation for authenticated pages, because auth/session gating is inherently request-bound.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extracted route and page helpers into companion modules for Next app-router compatibility**
- **Found during:** Task 2 (Patch only the isolated build seam in Next config/dashboard server data loading)
- **Issue:** Once `.next/types` was generated, Next rejected extra runtime exports from `page.tsx` and `route.ts` files and hid the real problem behind the generic build-worker exit.
- **Fix:** Moved testable runtime helpers into companion `page-helpers.ts` and `route-handlers.ts` modules, updated route/page entry files to export only allowed Next symbols, and updated tests to import from the companion modules.
- **Files modified:** `src/app/(private)/dashboard/page.tsx`, `src/app/(private)/dashboard/page-helpers.ts`, `src/app/api/auth/handlers.ts`, `src/app/api/profile/route-handlers.ts`, `src/app/api/program/**/*.route-handlers.ts`, related route files, and affected tests.
- **Verification:** `corepack pnpm typecheck`; focused route/dashboard suites; final full `corepack pnpm test`
- **Committed in:** `728ce80`

**2. [Rule 3 - Blocking] Forced the authenticated private segment dynamic to keep it out of static generation**
- **Found during:** Task 2 (Patch only the isolated build seam in Next config/dashboard server data loading)
- **Issue:** Even after the dashboard self-fetch seam was removed and typecheck passed, the production build still died while generating static pages for the authenticated app surface.
- **Fix:** Added `src/app/(private)/layout.tsx` with `dynamic = 'force-dynamic'` so `/dashboard`, `/onboarding`, and `/profile` render on demand instead of entering the static worker pool.
- **Files modified:** `src/app/(private)/layout.tsx`
- **Verification:** `corepack pnpm build`
- **Committed in:** `728ce80`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both deviations were required to make the intended dashboard/build fix actually shippable under Next 16 build rules. Scope stayed inside the build path and authenticated dashboard/private-route surface.

## Issues Encountered
- The executor workflow references `~/.claude/get-shit-done/bin/gsd-tools.cjs`, but this workspace uses the same tooling under `~/.codex/get-shit-done/bin/gsd-tools.cjs`. Execution proceeded with the available path.
- Next build initially surfaced only `Next.js build worker exited with code: 1 and signal: null`; the concrete blocking causes only became visible after focused typecheck/build iterations.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 08 no longer carries the static-generation worker crash called out in `08-VERIFICATION.md`.
- Phase 09 can assume green build, typecheck, and test gates on current HEAD, with authenticated private surfaces explicitly treated as dynamic.

## Self-Check: PASSED
- Verified `.planning/phases/08-release-blockers-and-regression-restoration/08-06-SUMMARY.md` exists.
- Verified task commits `3e1c1ed`, `0492e6d`, `728ce80`, and `36b72a0` exist in git history.
