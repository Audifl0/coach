# Phase 09: Security, runtime, and release-proof stabilization - Research

**Researched:** 2026-03-06
**Domain:** Post-phase-08 stabilization of dashboard trust, concurrency, release proof, and operator readiness
**Confidence:** HIGH

<user_constraints>
## User Constraints (from 09-CONTEXT.md, phase 07 audit, and approved backlog)

### Locked scope
- Phase 09 starts only after phase 08 clears `RB-01` through `RB-04`.
- Scope is limited to `STAB-01` through `STAB-05`.
- Preserve current UX and business rules unless the audit identified a correctness, safety, or release-proof defect.
- Prefer deterministic regression coverage for each stabilized flow.
- Keep release-proof work narrow and repeatable; do not turn this into a CI-platform rewrite.

### Ordering constraints after phase 08
- Phase 08 must leave `corepack pnpm typecheck`, `corepack pnpm test`, and `corepack pnpm build` green.
- Phase 08 must already have closed the documented `.env.production` leak path and added auth abuse protection.
- Because `.planning/STATE.md` still records phase 07 as the last completed phase on 2026-03-06, phase 09 planning must treat those phase-08 outcomes as required preconditions, not as already-proven facts in this branch.

### Repo guardrails that matter here
- The dashboard currently mixes direct server reads with same-service authenticated `fetch()` calls from `src/app/(private)/dashboard/page.tsx`.
- The highest-risk writes are in `src/server/dal/program.ts` and `src/server/services/adaptive-coaching.ts`.
- Release and recovery operations already rely on `infra/scripts/deploy.sh`, `infra/scripts/smoke-test-https.sh`, `infra/scripts/restore.sh`, and `infra/scripts/run-restore-drill.sh`.
- `pino` is already installed in `package.json` but is not yet used as an app logger.
</user_constraints>

<phase_requirements>
## Phase Requirements Most Directly Affected

| Requirement | Why phase 09 touches it |
| --- | --- |
| `DASH-01` | Dashboard today/next workout loading must stop depending on request-derived origin trust and must expose degraded states explicitly. |
| `DASH-02` | Trends cannot silently disappear behind the same degraded-path masking used today. |
| `LOG-01` to `LOG-04` | Session logging, completion, history drilldown, and resume behavior all cross the race-sensitive program DAL. |
| `ADAP-01` to `ADAP-03` | Adaptive confirmation/rejection currently has stale-state and partial-write risk. |
| `SAFE-03` | Conservative fallback after adaptive rejection must become atomic, not best-effort. |
| `PLAT-01` to `PLAT-03` | Release proof, deploy verification, restore verification, env contract clarity, and app-level failure logging all land here. |
</phase_requirements>

## Summary

Phase 09 should stabilize the repository in five bounded waves, not as one mixed refactor:

1. Remove dashboard trust on request-derived internal origins and turn degraded reads into explicit section states.
2. Harden persistence guarantees on the three audit-identified mutation clusters: plan generation, session logging/completion, and adaptive confirmation/rejection.
3. Close the remaining high-impact dashboard/history flow drift on top of those stabilized data paths.
4. Centralize the operator env contract, add one authenticated smoke primitive, and add minimal structured app logging.
5. Compose those existing commands and new smoke helpers into one narrow release-proof workflow.

The implementation should stay repo-native: direct server composition instead of same-service SSR HTTP hops, Prisma/PostgreSQL-backed consistency guards instead of client debouncing, Node 22 `fetch`-based smoke scripts instead of a browser E2E stack, and `pino` instead of a custom logger.

## Recommended Execution Order

### Gate 0: Phase-08 completion proof
- Confirm the branch inherits working outputs for `RB-01` through `RB-04`.
- Do not start release-proof orchestration until compile, test, build, secret-safe deploy, and auth throttling are all already passing.

### Wave 1: `STAB-01`
- Fix the dashboard server data-loading seam first because it is both a trust issue and the main authenticated landing path used later by release proof.

### Wave 2: `STAB-02`
- Tighten write consistency next because release-proof/authenticated sanity must exercise deterministic plan/session/adaptive state.

### Wave 3: `STAB-04`
- Close the remaining dashboard/history functional drift only after the underlying loaders and mutation guarantees are stable.

### Wave 4: `STAB-05`
- Split if needed:
- `STAB-05a`: central env contract + authenticated smoke helper
- `STAB-05b`: minimal app-level structured logging + deeper restore/deploy evidence

### Wave 5: `STAB-03`
- Build the final release-proof wrapper last so it reflects the stabilized runtime instead of locking in pre-fix behavior.

## Standard Stack

| Tool / Pattern | Current repo status | Use in phase 09 |
| --- | --- | --- |
| Next.js App Router server composition | Already used on dashboard | Replace same-service SSR `fetch()` with direct server composition for dashboard sections. |
| Prisma 7.4 + PostgreSQL | Already used across DAL | Add bounded persistence guarantees through transactional helpers, conditional writes, and one manual SQL migration where Prisma schema alone is insufficient. |
| Zod contracts and route parsers | Already standard in repo | Keep route payload validation and use explicit error-state view models rather than `null` masking. |
| Node 22 built-in `fetch` | Available now | Power authenticated smoke scripts without introducing Playwright or another browser stack. |
| Existing ops shell scripts | Already present | Extend, do not replace: `deploy.sh`, `smoke-test-https.sh`, `restore.sh`, `run-restore-drill.sh`. |
| `pino` | Installed, unused | Add one server-only logger module for critical failure events. |

## Architecture Patterns

### Pattern 1: Direct server composition for authenticated dashboard data

**What to do**

- Move dashboard today/trends loading behind a server-only composition helper instead of building an origin from `host` / `x-forwarded-host` and forwarding cookies back into the same app.
- Keep the API routes for client-side consumers, but stop using them from `src/app/(private)/dashboard/page.tsx`.

**Repo seam**

- `src/app/(private)/dashboard/page.tsx`
- `src/app/api/program/today/route.ts`
- `src/app/api/program/trends/route.ts`
- `src/server/dal/program.ts`
- `src/lib/program/select-today-session.ts`

**Why this fits this repo**

- The page already resolves auth/profile state directly on the server.
- The today and trends routes are thin wrappers over DAL/projection logic, so the page can reuse the same DAL/projection path directly without inventing a new abstraction layer.
- This removes the audit’s host-header trust seam and the duplicate session/origin/JSON work called out in `AUD-05` and `RUN-01`.

### Pattern 2: Explicit section state, not `null` masking

**What to do**

- Replace `null`-on-failure dashboard section loading with an explicit state model per section: `ready`, `empty`, or `error`.
- Reuse the same style already present in `SessionHistoryCard`, which exposes `empty` and `error` distinctly.

**Repo seam**

- `loadProgramTodayData()` and `loadProgramTrendsData()` in `src/app/(private)/dashboard/page.tsx`
- `TodayWorkoutCard`
- `TrendsSummaryCard`
- `SessionHistoryCard` as the local pattern to imitate

### Pattern 3: Persistence-level guards for race-sensitive writes

**What to do**

- Keep current business rules in service code, but move stale-state enforcement into DAL writes so duplicate submits and multi-tab races fail deterministically at write time.
- Use the smallest persistence primitive that proves the invariant:
- manual SQL migration for “one active plan per user”
- conditional update counts or row locks for session-completion-sensitive writes
- atomic transition helper for adaptive rejection + fallback creation

**Repo seam**

- `src/server/dal/program.ts`
- `src/server/services/program-generation.ts`
- `src/server/services/session-logging.ts`
- `src/server/dal/adaptive-coaching.ts`
- `src/server/services/adaptive-coaching.ts`

### Pattern 4: Script-first release proof

**What to do**

- Compose the existing commands and ops scripts into one deterministic release-proof path.
- Add one authenticated smoke helper script and call it from deploy/release/restore flows rather than introducing CI-only or browser-only tooling.

**Repo seam**

- `package.json`
- `infra/scripts/deploy.sh`
- `infra/scripts/smoke-test-https.sh`
- `infra/scripts/run-restore-drill.sh`
- `docs/operations/vps-deploy.md`
- `docs/operations/restore-drill-runbook.md`

### Pattern 5: Minimal structured app logging at server boundaries

**What to do**

- Add one server logger module and log only critical failures and explicit degraded-path events.
- Keep logging at route/service/server-composition boundaries, not in client components.

**Repo seam**

- `src/server/llm/observability.ts` is already an allowlisted observability pattern
- `package.json` already includes `pino`
- current routes/services mostly swallow unexpected errors into generic responses with no structured server log

## Repo-Specific Implementation Guidance

### `STAB-01`: Remove request-derived internal dashboard fetch trust and explicit outage masking

**Current state**

- `src/app/(private)/dashboard/page.tsx` uses `buildRequestOrigin()` to derive an origin from `x-forwarded-host` / `host`.
- It forwards the full cookie header into same-service `fetch()` calls for `/api/program/today` and `/api/program/trends`.
- `loadProgramTodayData()` returns `null` on missing origin or non-OK response, which collapses into the same empty state as “no workout planned.”
- `loadProgramTrendsData()` also degrades to `null`, which causes the whole trends section to vanish without signaling outage.

**Recommended implementation**

- Introduce one dashboard server data helper that:
- resolves today/next data directly from `createProgramDal(...).getTodayOrNextSessionCandidates()`
- reuses the same projection logic as `/api/program/today`
- resolves trends directly from `createProgramDal(...).getTrendSummary({ period: '30d' })`
- returns explicit section states instead of `null`
- Keep `TodayWorkoutCard` behavior for true empty states, but add a distinct dashboard/server error surface for failed data loads.
- Keep `/api/program/today` and `/api/program/trends` for client consumers; do not remove them in this phase.

**Important integration seam**

- `pickDashboardSession()` can stay, but it should operate on a “today section ready payload” rather than a nullable fetch result.
- `resolveDashboardSectionOrder()` should remain stable; only the source of `hasTrends` changes from truthy data to ready/error state.

### `STAB-02`: Tighten concurrency guarantees around plan generation, session logging, and adaptive decisions

#### 1. Program generation

**Current state**

- `replaceActivePlan()` archives active plans then creates a new active plan in one transaction.
- `ProgramPlan` only has `@@index([userId, status])` in `prisma/schema.prisma`; nothing prevents two concurrent active plans.

**Recommended implementation**

- Add a manual PostgreSQL migration for a partial unique index on active plans per user.
- Keep `replaceActivePlan()` transactional, but teach the route/service layer to translate duplicate-active conflicts into a deterministic retry/conflict path instead of undefined behavior.
- Do not solve this only with client-side button disabling; the invariant is persistence-owned.

#### 2. Session logging and completion

**Current state**

- `createSessionLoggingService()` checks lifecycle first, then calls DAL methods.
- `upsertLoggedSet()`, `markExerciseSkipped()`, `revertExerciseSkipped()`, `updateSessionNote()`, and `completeSession()` all rely on read-then-write checks.
- `SessionLogger` can therefore race against another tab completing the session.

**Recommended implementation**

- Add bounded DAL mutation helpers that lock or conditionally guard the parent `PlannedSession` while performing the write.
- Keep the service API stable, but move completion-sensitive guarantees into the DAL transaction boundary.
- If Prisma cannot express the exact guard cleanly, keep raw SQL limited to session-row locking inside one helper instead of spreading raw SQL across routes.

#### 3. Adaptive confirmation/rejection

**Current state**

- `updateAdaptiveRecommendationStatus()` reads the record, then updates it, and throws a generic mismatch error when `expectedCurrentStatus` fails.
- `rejectAdaptiveRecommendation()` marks the original recommendation rejected, then separately creates the conservative hold fallback and its trace.
- Confirm/reject routes convert `AdaptiveCoachingError` cleanly, but raw mismatch errors fall through to `500`.

**Recommended implementation**

- Replace generic status mismatch throws with typed stale-state conflicts that routes can return as `409`.
- Add one DAL-level atomic helper for “reject high-impact recommendation + create conservative fallback + append trace.”
- Keep the existing confirmation eligibility rules (`pending_confirmation`, expiry, target-session match); phase 09 is about atomicity and response determinism, not policy redesign.

### `STAB-04`: Fix high-impact functional drift in dashboard and history flows

#### 1. Next-session midnight selection

**Current state**

- `getTodayOrNextSessionCandidates()` uses `setHours(...)` local-day logic and `scheduledDate: { gt: endOfDay }` for next-session lookup.
- The same file already contains `startOfUtcDay()` / `endOfUtcDay()` helpers used elsewhere.

**Recommended implementation**

- Rebase today/next selection on the existing UTC helpers so session selection matches how scheduled dates are stored (`T00:00:00.000Z`).
- Fix the next-session query to include the first session at the next UTC day boundary.

#### 2. Archived history drilldown

**Current state**

- The history list route uses completed sessions across date ranges.
- The session detail route still calls `dal.getSessionById()`, which is active-plan-only.
- `createProgramDal()` already has `getHistorySessionDetail(sessionId)`, but the route does not use it.

**Recommended implementation**

- Repoint the history detail path to `getHistorySessionDetail()` for completed/archived sessions.
- Preserve existing auth and ownership masking at the route boundary.
- Do not introduce a parallel history-detail route; reuse the current drilldown endpoint.

#### 3. Workout resume hydration

**Current state**

- `SessionLogger` initializes blank local state for timer, note, skip state, saved sets, completion state, and correction state.
- `TodayWorkoutCard` only passes the session summary into the logger.
- The detail route already returns enough information to hydrate resume state.

**Recommended implementation**

- Reuse the existing detail fetch path to hydrate logger state when the workout logger opens.
- `SessionLogger` should derive initial local state from persisted `startedAt`, `completedAt`, `note`, `postSession*`, `isSkipped`, and `loggedSets`.
- Keep the current client component split; phase 09 does not need a full session-logger rewrite.

### `STAB-05`: Deepen operator readiness

#### `STAB-05a`: Central env contract and authenticated smoke primitive

**Current state**

- `.env.example` only documents local app vars.
- deploy/backup/restore docs spread production requirements across multiple markdown files and scripts.
- `run-restore-drill.sh` only proves anonymous `/login` and `/dashboard` reachability.

**Recommended implementation**

- Centralize the production/release contract in one canonical place, then make scripts validate against it.
- The best repo-fit is:
- expand `.env.example` or add a dedicated production env example for ops variables
- add one shell or TS validator script used by release/deploy/restore workflows
- document required vs optional variables once, then link other runbooks back to that source
- Add one authenticated smoke helper that:
- logs in with a dedicated smoke account
- captures the session cookie
- loads `/dashboard` and `/api/program/today`
- asserts authenticated success plus parsable account-scoped payload

#### `STAB-05b`: Minimal structured failure logging

**Current state**

- The repo has `pino` installed and one allowlisted provider envelope helper, but no general app logger.
- Many route/service catches return generic 500s with no structured server event.

**Recommended implementation**

- Add a small server-only logger module and use it for:
- dashboard degraded section failures
- program generation consistency conflicts
- session logging stale-write rejections
- adaptive confirmation/rejection conflicts and unexpected failures
- authenticated smoke failures in server-side verification helpers
- Keep logs structured and non-PII. Follow the same allowlist discipline already used in `src/server/llm/observability.ts`.

### `STAB-03`: Add a narrow release-proof workflow

**Current state**

- `package.json` only exposes `typecheck`, `test`, and `build`.
- `infra/scripts/deploy.sh` already does compose pull/build/up and optionally calls `smoke-test-https.sh`.
- `run-restore-drill.sh` already has deterministic evidence-stage logging.

**Recommended implementation**

- Add one release-proof entrypoint, preferably under `infra/scripts/`, that runs:
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- deploy via `infra/scripts/deploy.sh`
- anonymous HTTPS smoke via existing script
- authenticated smoke via the new helper from `STAB-05a`
- Keep this runnable locally by operators and callable later from CI, but do not make CI a phase requirement.
- Reuse the same authenticated smoke helper in restore-drill validation so deploy proof and recovery proof do not drift apart.

## Integration Seams To Preserve

| Seam | Keep stable | What changes in phase 09 |
| --- | --- | --- |
| Route contracts in `src/lib/program/contracts.ts` and adaptive contracts | Public payload shape and Zod validation | Server-side dashboard composition bypasses same-service HTTP, but routes remain available and contract-validated. |
| `TodayWorkoutCard`, `SessionHistoryCard`, `AdaptiveConfirmationBanner`, `AdaptiveForecastCard` | Existing UX placement and high-level behavior | Add explicit degraded states and resume hydration, not a visual redesign. |
| `createProgramDal()` and `createAdaptiveCoachingDal()` | DAL remains the authority for scoped persistence | Add narrow consistency helpers rather than broad service rewrites. |
| Existing ops scripts and runbooks | Script-first operator model | Extend them with env validation, authenticated smoke, and clearer evidence markers. |

## Don't Hand-Roll

| Problem | Avoid | Use instead |
| --- | --- | --- |
| Same-service authenticated dashboard reads | Rebuilding trust with more header filtering | Direct server composition from existing DAL/projection helpers |
| Single-active-plan guarantee | UI debouncing only | PostgreSQL uniqueness at the persistence layer plus deterministic conflict handling |
| Post-completion write protection | Extra client state flags only | DAL-level transactional/conditional guards on session-owned writes |
| Adaptive stale-state handling | Generic thrown strings | Typed conflicts plus one atomic DAL helper for rejection fallback |
| Release proof | Introducing Playwright/Cypress for this phase | Node 22 `fetch`-based authenticated smoke on current routes |
| App logging | Custom JSON logger wrapper from scratch | `pino` with allowlisted fields and server-boundary usage |

## Common Pitfalls

### Pitfall 1: Fixing host-header trust but keeping silent dashboard failure masking
- Removing `buildRequestOrigin()` is not enough if the page still collapses route or DAL failures into “no workout.”

### Pitfall 2: Fixing races only in service code
- `createSessionLoggingService()` already shows why pre-checks alone are insufficient; stale requests must fail at write time.

### Pitfall 3: Solving active-plan races without a persistence invariant
- As long as `ProgramPlan` permits multiple active rows per user, concurrent generation remains nondeterministic.

### Pitfall 4: Reusing `getSessionById()` for history detail
- That keeps the active-plan-only bug alive. The repo already has `getHistorySessionDetail()`; use it.

### Pitfall 5: Adding authenticated smoke that only proves login
- Phase 09 needs authenticated business sanity, not just auth cookie issuance. The smoke must hit dashboard or program data after login.

### Pitfall 6: Adding logging in client components
- The important failures here happen at server composition, route, and DAL/service boundaries. Client logs will not help operators during deploy or incident response.

## Validation Strategy

### Extend current test anchors first

- `tests/program/dashboard-today-surface.test.ts`
- add explicit degraded-state tests for dashboard today loading
- add next-session-at-midnight UTC regression coverage
- `tests/program/dashboard-trends-surface.test.ts`
- replace “degrades gracefully to null” expectations with explicit section-error behavior where appropriate
- `tests/program/session-history-surface.test.ts`
- keep error/empty state explicit and add archived-session drilldown regression coverage
- `tests/program/program-session-logging-route.test.ts`
- add stale post-completion write cases and deterministic conflict responses
- `tests/program/adaptive-coaching-confirm-route.test.ts`
- add concurrent stale-state conflict expectations and fallback atomicity checks
- `tests/ops/restore-drill.test.ts`
- add stage/evidence expectations for authenticated smoke and env-contract validation

### Add narrow persistence-proof coverage where unit tests are not enough

- Program generation:
- prove duplicate generate requests cannot leave two active plans
- Session logging:
- prove writes after completion are rejected even when the stale request already read an incomplete session
- Adaptive rejection:
- prove the original recommendation is not left rejected without its conservative fallback

### Manual or scripted phase-end proof

- Run the final release-proof entrypoint on a known-good branch state.
- Run the restore drill with the same authenticated smoke helper and keep the evidence file.
- Capture one proof that dashboard loads, authenticated program today data is readable, and deterministic mutation paths behave under duplicate-submit repros.

## Code Examples

### 1. Dashboard server composition state shape

```ts
type DashboardSectionState<T> =
  | { state: 'ready'; data: T }
  | { state: 'empty' }
  | { state: 'error'; reason: 'today_load_failed' | 'trends_load_failed' };
```

Use this shape between `src/app/(private)/dashboard/page.tsx` and the section cards so outages stop masquerading as empty business results.

### 2. Manual migration for single active plan per user

```sql
CREATE UNIQUE INDEX program_plan_one_active_per_user_idx
ON "ProgramPlan" ("userId")
WHERE status = 'active';
```

This is the cleanest persistence invariant for `replaceActivePlan()` because `prisma/schema.prisma` currently has only a non-unique `(userId, status)` index.

### 3. Authenticated smoke flow for deploy and restore proof

```ts
const login = await fetch(`${baseUrl}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username, password }),
});

const cookie = login.headers.get('set-cookie');
const dashboard = await fetch(`${baseUrl}/dashboard`, { headers: { cookie: cookie ?? '' } });
const today = await fetch(`${baseUrl}/api/program/today`, { headers: { cookie: cookie ?? '' } });
```

Assert `login.ok`, `dashboard.ok`, and that `/api/program/today` parses successfully. This is enough for a narrow release-proof layer without adding a browser test stack.

### 4. Minimal server logger seam

```ts
logger.error({
  event: 'dashboard_today_load_failed',
  userId,
  route: '/dashboard',
  reason: errorCode,
});
```

Keep fields allowlisted and avoid prompt contents, cookie values, or raw request bodies.

## Final Recommendation

Phase 09 should be planned as stabilization of existing seams, not as architecture renewal. The repo already has the right anchors: thin routes, DAL ownership boundaries, script-first ops, contract parsing, and existing tests around dashboard/history/adaptive/restore behavior. The plan should exploit those anchors directly:

- direct dashboard server composition instead of internal SSR HTTP
- persistence-owned concurrency guards instead of UI throttling
- reuse of `getHistorySessionDetail()` and existing detail payloads instead of new surfaces
- one shared authenticated smoke primitive reused by deploy and restore proof
- one minimal `pino` logger reused at server boundaries

If phase 09 stays bounded that way, it will materially improve release credibility without slipping into phase-10 cleanup territory.
