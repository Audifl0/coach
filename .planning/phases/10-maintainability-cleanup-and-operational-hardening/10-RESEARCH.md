# Phase 10 Research: Maintainability cleanup and operational hardening

**Date:** 2026-03-06
**Scope:** `CLEAN-01` to `CLEAN-03` only
**Inputs:** phase 10 context, phase 07 audit package, phase 08/09 context, current repo code and tests

## Preconditions

Phase 10 should not start from the current repository state. It is explicitly post-stabilization work.

Required entry conditions:

- Phase 08 has restored green `corepack pnpm typecheck`, `corepack pnpm build`, and adaptive regressions under `corepack pnpm test`.
- Phase 09 has removed dashboard request-origin trust, hardened critical write consistency, and established one narrow release-proof path with authenticated verification.
- The phase 09 release-proof path is the default validation harness reused by phase 10. Phase 10 should not invent a second competing release gate.

If any of those are still red, finish phase 08/09 first. Do not use phase 10 to discover release blockers.

## Standard Stack

- Keep the existing stack: Next.js App Router, React 19, TypeScript strict mode, Prisma 7, `node:test`, and `tsx --test`.
- Keep reverse-proxy hardening in `infra/caddy/Caddyfile` and script-driven operations in `infra/scripts/*`.
- Prefer small file-level extractions and typed adapters over new libraries or framework migrations.

## Architecture Patterns

### 1. Hide Prisma compatibility behind DAL constructors

The most repeated `as never` seams are constructor calls such as:

- `createProgramDal(prisma as never, { userId })`
- `createProfileDal(prisma as never)`
- `createAdaptiveCoachingDal(prisma as never, { userId })`

Safe phase-10 direction:

- Add DAL-local Prisma wrapper constructors or adapter factories.
- Keep existing public DAL method names stable.
- Move the cast, if one is still temporarily required, into one DAL-local adapter file instead of repeating it across routes and services.

This reduces drift without changing route behavior.

### 2. Preserve the existing route-handler injection style

The repo already uses safe seams for behavior-preserving cleanup:

- `createProgramTodayGetHandler(...)`
- `createProgramTrendsGetHandler(...)`
- `createProgramHistoryGetHandler(...)`
- `createProgramSessionExerciseSetsPostHandler(...)`
- `createProgramSessionExerciseSkipPostHandler(...)`
- `createProfileGetHandler(...)`

Phase 10 should keep these factories and clean the default dependency builders behind them. That lets tests continue targeting the handlers directly while internals move.

### 3. Decompose internals behind stable exports

Two modules are already structured in a way that supports internal extraction without changing callers:

- `src/server/dal/program.ts`
- `src/app/(private)/dashboard/_components/session-logger.tsx`

For both, keep the exported API stable first and split internals second.

## CLEAN-01: Reduce type-boundary erosion and cast drift

### Repo-specific hotspots

- `src/app/(private)/dashboard/page.tsx`
- `src/app/api/profile/route.ts`
- most `src/app/api/program/*` route builders
- `src/server/services/adaptive-coaching.ts`
- tests under `tests/program/*` and `tests/profile/*`

### Safest order

1. **Profile boundary first**
   - `src/server/dal/profile.ts`, `src/lib/profile/completeness.ts`, and `src/app/api/profile/route.ts` are the smallest end-to-end seam.
   - Existing coverage: `tests/profile/profile-route.test.ts`, `tests/profile/onboarding-gate.test.ts`.
   - Goal: stop passing `unknown`/`as never` through profile reads and writes; make route deps use the same profile record/input types the DAL already exports.

2. **Program read surfaces next**
   - Start with `today`, `trends`, and `history` default dependency builders.
   - These are lower-risk than session mutations and adaptive transitions.
   - Existing coverage: `tests/program/dashboard-today-surface.test.ts`, `tests/program/dashboard-trends-surface.test.ts`, `tests/program/program-trends-route.test.ts`, `tests/program/session-history-surface.test.ts`.

3. **Adaptive and session-mutation bootstrapping last**
   - `src/server/services/adaptive-coaching.ts` and session mutation routes still sit close to phase 09 stabilization concerns.
   - Only remove constructor casts there after phase 09 has stabilized the behavior they depend on.

### Recommended implementation seam

Prefer this pattern over repo-wide signature rewrites:

- add a Prisma-backed constructor per DAL, for example "from Prisma" wrappers;
- export narrow DAL dependency types for routes/services to consume;
- replace repeated `unknown` route dep signatures where the real DTO already exists.

Do not try to remove every `as never` in one pass. Shrink the number of cast entry points first.

## CLEAN-02: Decompose large coupled modules behind stable interfaces

### A. `src/server/dal/program.ts`

Current file owns:

- active-plan replacement
- today/next reads
- substitution ownership and mutation
- session logging lifecycle writes
- trends aggregation
- history list/detail reads

Safest extraction path:

1. Keep `createProgramDal(...)` as the public entrypoint.
2. Extract internal concern modules under a `program/` folder or equivalent:
   - plan lifecycle + session lookup
   - session logging ownership/lifecycle mutations
   - trends read model
   - history read model
3. Re-compose them from the existing factory so routes and services do not change call sites in phase 10.

Why this seam is safe:

- `tests/program/program-dal.test.ts` already covers many public methods.
- `tests/program/program-dal-trends.test.ts` protects the trend aggregations.
- route tests already exercise DAL-backed behavior through handler factories.

Do not use this phase to redesign DAL ownership rules or account-scope semantics. Those are foundations worth preserving from earlier phases.

### B. `src/app/(private)/dashboard/page.tsx`

The current file still mixes:

- session validation
- onboarding redirect logic
- today-session loading
- adaptive lookup
- trends loading
- section ordering
- render composition

Phase 10 should only decompose this **after** phase 09 removes internal request-origin fetch trust and degraded-state masking.

Safe extraction path after phase 09:

1. keep route resolution and redirects in `page.tsx`;
2. extract server loaders/view-model builders by concern:
   - dashboard access/profile routing
   - today-workout surface
   - adaptive forecast surface
   - trends surface
3. keep the final page responsible only for orchestration and JSX composition.

Existing helper coverage already protects part of this:

- `resolveDashboardRoute`
- `pickDashboardSession`
- `resolveAdaptiveForecastCard`
- `buildDashboardTrendsRequest`
- `loadProgramTrendsData`
- `resolveDashboardSectionOrder`

What is missing before major extraction:

- one characterization test for the post-phase-09 dashboard loader composition path, so decomposition does not reintroduce trust/degraded-state drift.

### C. `src/app/(private)/dashboard/_components/session-logger.tsx`

The file already has some extracted pure helpers, but the component still owns:

- timer state
- set drafting
- skip state
- note save
- completion flow
- duration correction
- direct fetch calls to five endpoints
- error message policy

Safe extraction path:

1. keep endpoint URLs and payloads unchanged;
2. extract pure state helpers first;
3. then extract a mutation client/hook layer;
4. move presentational sub-sections last.

Current coverage is not enough for a broad component split:

- `tests/program/dashboard-today-surface.test.ts` covers helper functions only.
- route tests cover server handlers, not the client request sequence.

Add characterization tests first for:

- first saved set starts the timer once;
- skip and revert keep the same endpoint semantics;
- completion switches the component into duration-correction mode;
- error handling still maps failed network calls to the same user-visible messages.

If phase 09 adds browser-based authenticated smoke, reuse it here instead of introducing a new component-test stack just for phase 10.

## CLEAN-03: Browser hardening and secondary ops hardening

### Browser and proxy hardening

Current state:

- `infra/caddy/Caddyfile` proxies traffic but does not set a response header policy.

Safe phase-10 order:

1. Add low-risk headers first at the proxy layer:
   - `X-Content-Type-Options`
   - `Referrer-Policy`
   - `Permissions-Policy`
   - clickjacking protection via `frame-ancestors`/`X-Frame-Options`
2. Validate through the phase-09 smoke path plus direct header checks.
3. Treat strict CSP as a bounded follow-up inside phase 10 only if the deployed Next.js app is proven compatible.

Do not start with a strict blocking CSP on this repo. The app is Next.js-based and phase 10 is not the place for a nonce-based CSP redesign unless validation already proves it safe. If needed, begin with report-only or narrowly scoped directives that do not break hydration.

### Non-echo admin reset

Current state:

- `scripts/admin-reset-password.ts` prompts with `rl.question('New password: ')`, which echoes the password.
- `tests/auth/admin-reset.test.ts` covers service semantics only, not CLI prompt behavior.

Safe seam:

- extract a tiny CLI prompt helper for secret entry;
- keep `src/lib/auth/admin-reset.ts` unchanged;
- preserve generic completion messaging and confirmation flow.

Validation:

- keep existing service tests;
- add one narrow test around the secret prompt helper or CLI wrapper behavior.

### Backup plaintext-window reduction

Current state:

- `infra/scripts/backup.sh` writes plaintext SQL to `backups/*.sql` before encryption.
- `infra/scripts/restore.sh` writes decrypted SQL to a temp file before `psql`.

Safe seam:

- replace file-based plaintext handling with streaming pipelines:
  - `pg_dump | openssl ... > backup.sql.enc`
  - `openssl -d ... | psql ...`
- keep `set -euo pipefail`, fail-fast semantics, and `RESTORE_TARGET_DB` protections.

Validation:

- extend `tests/ops/restore-drill.test.ts` to assert streaming behavior and continued guardrails;
- reuse phase-09 restore/deploy verification to prove restore still works end to end.

## Recommended Execution Order Inside Phase 10

1. Confirm the post-phase-09 baseline is green:
   - `corepack pnpm typecheck`
   - `corepack pnpm test`
   - `corepack pnpm build`
   - phase-09 authenticated smoke / release-proof path
2. Add missing characterization tests for the refactor seams that are not yet well protected.
3. Execute `CLEAN-01` on the smallest seams first:
   - profile
   - read-only program routes
   - remaining DAL constructor call sites
4. Execute `CLEAN-02`:
   - internal `program` DAL decomposition
   - post-phase-09 dashboard decomposition
   - session logger extraction last
5. Execute `CLEAN-03`:
   - backup/restore streaming hardening
   - non-echo admin reset
   - proxy/browser header hardening, validated against the release-proof path

`CLEAN-03` can overlap with the later half of `CLEAN-02`, but it should still validate through the phase-09 proof path rather than standalone ad hoc checks.

## Behavior-Preserving Validation Strategy

### Always-on gate after each bounded cleanup

- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`

### Focused regression matrix by seam

For `CLEAN-01` profile and dashboard typing work:

- `tests/profile/profile-route.test.ts`
- `tests/profile/onboarding-gate.test.ts`
- `tests/program/dashboard-today-surface.test.ts`
- `tests/program/dashboard-trends-surface.test.ts`
- `tests/program/dashboard-adaptive-forecast.test.ts`

For `CLEAN-01` and `CLEAN-02` program DAL changes:

- `tests/program/program-dal.test.ts`
- `tests/program/program-dal-trends.test.ts`
- `tests/program/program-session-logging-route.test.ts`
- `tests/program/program-trends-route.test.ts`
- `tests/program/session-history-surface.test.ts`

For `CLEAN-02` session logger decomposition:

- keep the existing helper assertions in `tests/program/dashboard-today-surface.test.ts`
- add characterization coverage before moving request logic
- reuse phase-09 authenticated smoke for final confidence

For `CLEAN-03` ops and browser hardening:

- `tests/ops/restore-drill.test.ts`
- `tests/auth/admin-reset.test.ts`
- direct header verification against a built/deployed app via the phase-09 smoke path

## Don't Hand-Roll

- Do not introduce a generic repository abstraction across the whole backend.
- Do not rewrite DAL public APIs just to make internals prettier.
- Do not add a large new test framework solely for phase 10.
- Do not build a nonce/CSP platform unless the release-proof path shows a small, compatible solution.
- Do not fold route-shell deduplication or unused-dependency cleanup into this phase unless they are required by one of the bounded cleanups above.

## Common Pitfalls

- Starting dashboard decomposition before phase 09 removes internal fetch trust.
- Mixing cast cleanup with behavior changes in adaptive or concurrency-sensitive flows.
- Splitting `session-logger.tsx` before adding characterization coverage for the client request sequence.
- Replacing plaintext backup handling without preserving `pipefail` and clear failure modes.
- Treating phase 10 as a generic polish bucket. It is still a bounded remediation phase mapped to `CLEAN-01` to `CLEAN-03`.

## Code Examples

Patterns already present in the repo that phase 10 should follow:

- pure helper extraction with direct tests:
  - `resolveDashboardSectionOrder(...)`
  - `buildDashboardTrendsRequest(...)`
  - `buildSkipPayload(...)`
  - `buildCompleteSessionPayload(...)`
- route factories with injected dependencies:
  - `createProgramTodayGetHandler(...)`
  - `createProgramTrendsGetHandler(...)`
  - `createProfilePutHandler(...)`
- service layer over DAL behavior:
  - `createSessionLoggingService(...)`

Use those patterns to narrow seams. Avoid changing user-visible contracts while extracting them.
