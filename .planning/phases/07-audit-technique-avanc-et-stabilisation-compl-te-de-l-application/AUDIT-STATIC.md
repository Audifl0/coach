# Static Analysis and Maintainability Audit

Phase 07 plan 07-02 static audit of the repository. This report is documentation-only and is based on direct repository reads plus existing project commands.

## Evidence Base

- `corepack pnpm exec tsc --noEmit`
  - Result: failed with cross-cutting TypeScript errors in runtime code and tests.
- `corepack pnpm test`
  - Result: 203 passing tests, 2 failing tests.
- `rg --files src tests scripts prisma infra docs | xargs wc -l | sort -nr | head -n 40`
  - Result: largest runtime files include `src/server/dal/program.ts` (1162 LOC), `src/server/services/adaptive-coaching.ts` (594 LOC), `src/app/(private)/dashboard/_components/session-logger.tsx` (562 LOC), and `src/app/(private)/dashboard/page.tsx` (283 LOC).
- `rg -n "\bany\b|@ts-ignore|eslint-disable|TODO|FIXME" src tests scripts prisma infra docs`
  - Result: only one local eslint suppression in `src/lib/db/prisma.ts`, but no broader lint gate exists.
- `rg -n "better-auth|pino|recharts" src tests scripts infra docs package.json`
  - Result: `recharts` is used; `better-auth` and `pino` appear only in `package.json`.
- `rg -n "as never" src tests scripts`
  - Result: repeated cast suppression in runtime code and tests, including dashboard, profile routes, adaptive service wiring, and session mutation routes.

## Findings

### ST-01

- **Severity:** critical
- **Priority:** P0
- **Domain:** static / release-readiness
- **Surface:** `package.json`, `src/app/(private)/dashboard/page.tsx`, `src/app/(private)/dashboard/_components/today-workout-card.tsx`, `src/app/api/program/sessions/[sessionId]/route.ts`, `src/app/api/program/today/route.ts`, `src/lib/adaptive-coaching/evidence-corpus.ts`, `src/server/llm/client.ts`, `src/server/llm/providers/anthropic-client.ts`, `src/server/llm/providers/openai-client.ts`, multiple tests under `tests/program/*`
- **Evidence:** `corepack pnpm exec tsc --noEmit` fails immediately. The failure set is not isolated to test helpers; it includes production files such as `src/app/(private)/dashboard/page.tsx:241`, `src/app/api/program/sessions/[sessionId]/route.ts:139`, `src/lib/adaptive-coaching/evidence-corpus.ts:150`, `src/server/llm/client.ts:106`, `src/server/llm/providers/anthropic-client.ts:97`, and `src/server/llm/providers/openai-client.ts:143`.
- **Risk:** The repository currently lacks a reliable green compile baseline. That turns future refactors into guesswork and creates a realistic risk that production builds or deployment validation will fail before remediation work even starts.
- **Recommendation:** Restore a clean `tsc --noEmit` baseline before any stabilization implementation plan is considered complete. Treat this as a release gate, not cleanup.
- **Validation needed:** Re-run `corepack pnpm exec tsc --noEmit` to a clean exit.

### ST-02

- **Severity:** important
- **Priority:** P1
- **Domain:** static / behavioral drift
- **Surface:** `tests/program/adaptive-coaching-confirm-route.test.ts`, `tests/program/adaptive-coaching-service.test.ts`, adaptive coaching runtime surfaces under `src/lib/adaptive-coaching/*` and `src/app/api/program/adaptation/*`
- **Evidence:** `corepack pnpm test` exits non-zero with 2 failing tests out of 205. The current failures are:
  - `tests/program/adaptive-coaching-confirm-route.test.ts`: expected `pending_confirmation`, got `fallback_applied`
  - `tests/program/adaptive-coaching-service.test.ts`: expected 3 evidence snippets, got 2
- **Risk:** Static review already shows type drift; the failing tests confirm active behavior drift in the adaptive path. This is not just maintainability debt: core recommendation lifecycle and evidence retrieval expectations are no longer stable.
- **Recommendation:** Triage the two failing adaptive tests as blockers for later remediation planning. Keep the fixes tightly scoped to the failing lifecycle and evidence-selection paths.
- **Validation needed:** Re-run `corepack pnpm test` to a zero-failure result.

### ST-03

- **Severity:** important
- **Priority:** P1
- **Domain:** static / coupling
- **Surface:** `src/app/(private)/dashboard/page.tsx:126-252`
- **Evidence:** The dashboard server page constructs request origin from forwarded headers, forwards cookies into internal `fetch` calls, performs auth resolution, profile completeness routing, adaptive recommendation reads, trends loading, and section ordering in a single file. The same file also contains current type errors on nullable session use and banner payload typing.
- **Risk:** UI composition, auth gating, and server-to-server data access are tightly coupled. That increases regression risk for any dashboard change and makes failures depend on header/cookie/origin assumptions instead of one direct server boundary.
- **Recommendation:** In a later remediation phase, extract server loaders for dashboard data and narrow the page module to route decisions plus render composition. Prefer one explicit data seam per concern instead of repeated local request reconstruction.
- **Validation needed:** Follow-up remediation should preserve route outcomes for login/onboarding/dashboard and keep dashboard data parity.

### ST-04

- **Severity:** important
- **Priority:** P1
- **Domain:** static / maintainability
- **Surface:** `src/server/dal/program.ts`, `tests/program/program-dal.test.ts`
- **Evidence:** `src/server/dal/program.ts` is 1162 LOC and exposes at least 15 async methods from one factory: active-plan replacement, today/next reads, ownership checks, substitutions, logging mutations, trends, history, and lifecycle reads. The corresponding test file is 948 LOC, which is consistent with a wide mocking and fixture burden.
- **Risk:** One module owns multiple unrelated responsibilities and change vectors. Any adjustment to session logging, trends, or history increases the chance of hidden coupling and forces very broad test maintenance.
- **Recommendation:** Split the DAL internally by bounded use case in a later plan: planning/read models, session mutation lifecycle, and trend/history reporting. Keep the account-scope primitives shared so behavior remains unchanged.
- **Validation needed:** Existing program DAL route/service tests should remain green after any later extraction.

### ST-05

- **Severity:** important
- **Priority:** P2
- **Domain:** static / UI maintainability
- **Surface:** `src/app/(private)/dashboard/_components/session-logger.tsx`
- **Evidence:** `SessionLogger` is 562 LOC and combines timer state, set drafting, skip state, completion flow, duration correction, inline validation, error translation, and five separate route interactions in one client component. Core mutation handlers span the same file from `saveSet(...)` through `correctDuration(...)`.
- **Risk:** The component has several independent state machines but only one module boundary. That increases the chance of accidental interaction bugs and makes targeted UI changes expensive to verify.
- **Recommendation:** Later refactoring should separate pure state helpers/hooks from transport concerns and view markup. The current helper extraction (`buildSkipPayload`, `buildCompleteSessionPayload`, timer reducers) is a good start but not yet enough.
- **Validation needed:** Session logging regression tests should keep covering autosave, skip/revert, completion, and duration correction flows.

### ST-06

- **Severity:** minor
- **Priority:** P2
- **Domain:** static / duplication
- **Surface:** `src/app/api/program/sessions/[sessionId]/exercises/[plannedExerciseId]/sets/route.ts`, `src/app/api/program/sessions/[sessionId]/exercises/[plannedExerciseId]/skip/route.ts`, plus sibling session mutation routes under `src/app/api/program/sessions/[sessionId]/*`
- **Evidence:** The set and skip routes duplicate the same route shell concerns: `resolveSession`, request JSON parsing, ownership lookup, auth masking, DAL bootstrap, service bootstrap, and error-to-HTTP translation. Repeated patterns also appear across note, complete, duration, today, history, and trends routes via `buildDefaultSessionGateRepository()`, `validateSessionFromCookies(...)`, and `createProgramDal(prisma as never, { userId })`.
- **Risk:** Auth and error semantics are intentionally strict today, but duplicated route shells make it easy for one handler to drift from the others over time.
- **Recommendation:** Consolidate only the repeated route shell concerns in a future cleanup plan. Keep domain-specific validation and not-found masking local so behavioral contracts stay explicit.
- **Validation needed:** Cross-route unauthorized, malformed-payload, and not-found masking tests should continue to pass unchanged.

### ST-07

- **Severity:** important
- **Priority:** P2
- **Domain:** static / type-boundary erosion
- **Surface:** `src/app/(private)/dashboard/page.tsx`, `src/app/api/profile/route.ts`, `src/server/services/adaptive-coaching.ts`, `src/app/api/program/sessions/[sessionId]/exercises/[plannedExerciseId]/skip/route.ts`, `src/app/api/program/sessions/[sessionId]/exercises/[plannedExerciseId]/sets/route.ts`, related tests under `tests/program/*`
- **Evidence:** Runtime and test code use `as never` repeatedly to force Prisma clients, profile objects, and route inputs through mismatched interfaces. The search is not isolated to tests; runtime occurrences exist in dashboard, profile routing, adaptive service bootstrap, substitutions, trends, today/history routes, and session mutation routes.
- **Risk:** These casts suppress the exact mismatches the type system is supposed to surface. The current typecheck failures show this is no longer theoretical; boundary drift is already leaking across modules.
- **Recommendation:** Replace cast-based adaptation with narrow DTO/adaptor types at Prisma-to-lib and route-to-service boundaries. Keep the change behavior-preserving by preserving existing runtime shapes and only making contracts explicit.
- **Validation needed:** Clean `tsc --noEmit` plus unchanged route/service tests for the affected surfaces.

### ST-08

- **Severity:** minor
- **Priority:** P3
- **Domain:** static / repository hygiene
- **Surface:** `package.json`, `tsconfig.json`
- **Evidence:** `package.json` exposes `typecheck` and `test` but no lint or equivalent unused-code gate. `tsconfig.json` is strict, yet it does not enable `noUnusedLocals` or `noUnusedParameters`. Repo-wide search also shows `better-auth` and `pino` present in `package.json` without corresponding source/test usage.
- **Risk:** Dead dependencies and unused symbols can accumulate without an automated signal, which makes later audits slower and weakens confidence in repository hygiene.
- **Recommendation:** Defer this until after compile/test health is restored, then add one lightweight static hygiene gate and confirm whether `better-auth` and `pino` are intentionally reserved or removable.
- **Validation needed:** A future hygiene pass should prove whether the unused dependencies are actually needed and should add an automated gate for unused code/dependency drift.

## Initial Prioritization

### Highest urgency

- `ST-01` Compile health is broken across runtime and test surfaces.
- `ST-02` Adaptive coaching behavior already has failing regression tests.

### Major maintainability debt

- `ST-03` Dashboard server page mixes routing, internal transport, and data orchestration.
- `ST-04` Program DAL is a monolith spanning too many concerns.
- `ST-05` Session logger client component carries too many state transitions in one file.
- `ST-07` `as never` casts are masking boundary drift.

### Secondary cleanup

- `ST-06` Route shell duplication increases drift risk.
- `ST-08` Static hygiene gates and dead dependency checks are incomplete.
