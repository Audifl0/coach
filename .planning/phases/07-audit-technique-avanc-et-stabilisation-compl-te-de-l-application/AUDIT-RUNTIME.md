# Runtime Audit

Phase 07 runtime audit covering performance, scalability, and production runtime behavior across the dashboard SSR surface, program DAL, adaptive coaching lifecycle, and operational scripts.

## Executive Summary

Current runtime posture is functional at small scale, but several repository-level patterns will become visible under production traffic:

- The dashboard server component performs same-service authenticated HTTP fetches in addition to direct DAL reads, adding avoidable SSR latency and duplicated session/origin work on every page render.
- Trend, history, and dashboard read paths aggregate full result sets in application memory with no pagination, limit, or pre-aggregation, so latency and memory grow linearly with retained workout data.
- Adaptive generation is latency-sensitive because it chains multiple reads with optional provider calls and does not guard against duplicate generation attempts.
- Several write paths rely on read-then-write checks without a transaction or uniqueness guard, which leaves concurrency windows around plan generation, session logging, and adaptive recommendation decisions.

The repository already has some healthy runtime foundations:

- `prisma/schema.prisma` indexes hot read paths such as `ProgramPlan(userId, status)`, `PlannedSession(userId, scheduledDate)`, and adaptive recommendation lifecycle queries.
- `src/server/dal/program.ts::replaceActivePlan()` already wraps archive-and-create plan replacement in a transaction.
- `src/server/dal/adaptive-coaching.ts::updateAdaptiveRecommendationStatus()` records status changes inside a transaction and maintains append-only decision history.

## Runtime Hotspot Snapshot

| Area | Status | Notes |
| --- | --- | --- |
| Dashboard SSR data loading | Important | Same-service `fetch()` calls add extra network and serialization hops on authenticated page render. |
| Trends and history aggregation | Important | 7d/30d/90d reads materialize full session and set windows in memory and compute metrics in TypeScript. |
| Adaptive generation latency | Important | Recommendation generation chains profile, session, history, recommendation, and optional provider calls serially. |
| Restore drill runtime proof | Moderate | Operational drill proves restore mechanics, but runtime smoke checks stay shallow and anonymous. |

## Positive Runtime Controls Observed

- `prisma/schema.prisma` includes indexes for `ProgramPlan(userId, status)`, `PlannedSession(userId, scheduledDate)`, `LoggedSet(userId, plannedSessionId)`, `AdaptiveRecommendation(userId, createdAt desc)`, and `AdaptiveRecommendation(userId, status, createdAt desc)`.
- `src/server/dal/program.ts::getTodayOrNextSessionCandidates()` and trend/history methods stay account-scoped through `buildAccountScopedWhere(...)`.
- `infra/scripts/restore.sh` uses `psql -X`, `ON_ERROR_STOP`, and `--single-transaction`, which keeps restore failures fail-fast rather than partially applied.

## Findings

### RUN-01

- Severity: important
- Priority: P1
- Domain: runtime
- Surface: `src/app/(private)/dashboard/page.tsx`, `src/app/api/program/today/route.ts`, `src/app/api/program/trends/route.ts`
- Production blocker: no

**Evidence**

- `DashboardPage` resolves auth/profile state directly, then separately calls `loadProgramTodayData()` and `loadProgramTrendsData()`, both of which reconstruct an origin and issue authenticated `fetch()` calls back into the same service.
- Those fetches trigger route-level session resolution and JSON serialization/parsing again instead of reusing already available server-side context.
- The two internal requests are awaited sequentially around other DAL work rather than collapsed into a single server-side read model.

**Risk**

Each dashboard request pays for extra loopback HTTP, repeated session validation, header/cookie marshaling, and response parsing. Under modest traffic this inflates tail latency and increases the chance that one degraded route silently removes dashboard sections even while the page shell itself remains healthy.

**Recommendation**

Later remediation should replace same-service SSR fetches with direct service or DAL calls, or consolidate dashboard data loading behind one server-side composition layer.

**Validation needed**

- Measure dashboard SSR latency before and after replacing internal HTTP hops.
- Confirm today/trends failure modes are observable separately from true empty-state business outcomes.

### RUN-02

- Severity: important
- Priority: P1
- Domain: runtime
- Surface: `src/server/dal/program.ts::getTrendSummary`, `src/server/dal/program.ts::getExerciseTrendSeries`, `src/server/dal/program.ts::getHistoryList`
- Production blocker: no

**Evidence**

- `getTrendSummary()` loads every session in the selected range plus related exercises and logged sets, then computes volume, intensity, and adherence entirely in application memory.
- `getExerciseTrendSeries()` repeats the same pattern for the selected period, then filters and reduces sets in TypeScript.
- `getHistoryList()` returns all completed sessions inside the requested range with no page size, cursor, or hard cap.

**Risk**

Runtime cost grows linearly with data retention and training frequency. A long-lived account or a future multi-account/admin surface would increase query payload size, memory pressure, and CPU time per request, especially on the dashboard where trends are part of the default authenticated landing path.

**Recommendation**

Move heavy aggregations toward bounded queries, server-side limits, or pre-aggregated summaries once remediation starts. Keep pagination or window caps explicit for history surfaces before data volume grows.

**Validation needed**

- Inspect real SQL plans for 30d and 90d windows with representative logged-set volume.
- Load-test the dashboard and history routes with synthetic long-running accounts.

### RUN-03

- Severity: important
- Priority: P1
- Domain: runtime
- Surface: `src/server/services/adaptive-coaching.ts`, `src/app/api/program/adaptation/route.ts`
- Production blocker: no

**Evidence**

- `createAdaptiveCoachingService().generate()` performs profile load, today/next session lookup, 30-day history lookup, latest recommendation lookup, optional provider invocation, recommendation persistence, and decision-trace persistence in sequence.
- In real-provider mode, provider latency is inserted directly into the user-facing request path.
- The route exposes generation as a normal POST with no idempotency token, dedupe key, or in-flight suppression.

**Risk**

Adaptive generation becomes one of the most latency-sensitive routes in the repository. Duplicate clicks, browser retries, or provider slowness can multiply database work and external provider cost, while the user still perceives the feature as a single dashboard action.

**Recommendation**

When remediation begins, bound duplicate generation attempts and separate provider latency from request critical path where possible.

**Validation needed**

- Measure generation latency with provider mode disabled and enabled.
- Trigger duplicate POSTs to observe whether the route creates multiple recommendations for the same target session.

### RUN-04

- Severity: moderate
- Priority: P2
- Domain: runtime
- Surface: `infra/scripts/run-restore-drill.sh`
- Production blocker: no

**Evidence**

- The restore drill verifies encrypted backup selection, restore execution, `/login` reachability, and `/dashboard` HTTP status only.
- The smoke checks are anonymous and status-code-based; they do not authenticate, verify restored business data, or confirm app dependencies beyond route reachability.

**Risk**

The current drill proves that a restored stack starts and serves pages, but not that authenticated runtime behavior, data integrity, or post-restore business workflows remain sound. A broken session flow, missing migrated data, or dashboard data regression could pass the drill unnoticed.

**Recommendation**

Expand future drill validation to cover authenticated smoke behavior and at least one restored data assertion once audit findings are accepted.

**Validation needed**

- Confirm a restored environment can authenticate and load real account-scoped dashboard data.
- Verify at least one restored session-history or program record is queryable after drill completion.

## Concurrency and Consistency Assessment

The repository already contains some atomic building blocks, but the highest-risk mutation paths still rely on request ordering assumptions:

- `src/server/dal/program.ts::replaceActivePlan()` is transactional, but there is no database constraint enforcing a single active plan per user.
- `src/server/dal/program.ts::upsertLoggedSet()` and related session mutations check current state first, then write in a separate call, creating race windows.
- `src/server/dal/adaptive-coaching.ts::updateAdaptiveRecommendationStatus()` is transactional for a single recommendation transition, but `rejectAdaptiveRecommendation()` performs the rejection transition and conservative fallback creation as separate operations.

### RUN-05

- Severity: important
- Priority: P1
- Domain: runtime
- Surface: `src/server/dal/program.ts::replaceActivePlan`, `prisma/schema.prisma`
- Production blocker: no

**Evidence**

- `replaceActivePlan()` archives current active plans with `updateMany(...)`, then creates a new active plan in the same transaction.
- `ProgramPlan` has an index on `(userId, status)` but no uniqueness rule that prevents more than one `active` row for the same user.
- The generation route exposes plan creation as a normal request with no idempotency key or concurrency lock.

**Risk**

Concurrent generate requests from duplicate submits, retries, or multiple tabs can race and leave two active plans for one account. Downstream reads such as `getTodayOrNextSessionCandidates()` then depend on whichever active plan Prisma returns first, making the user-visible workout surface nondeterministic.

**Recommendation**

Future remediation should enforce single-active-plan semantics at the persistence layer or serialize replacements per user.

**Validation needed**

- Fire overlapping program-generation requests for the same account and inspect resulting `ProgramPlan` rows.
- Confirm active-plan reads remain deterministic after concurrent generation attempts.

### RUN-06

- Severity: important
- Priority: P1
- Domain: runtime
- Surface: `src/server/dal/program.ts::upsertLoggedSet`, `src/server/dal/program.ts::markExerciseSkipped`, `src/server/dal/program.ts::updateSessionNote`, `src/server/dal/program.ts::completeSession`
- Production blocker: no

**Evidence**

- `upsertLoggedSet()` loads the exercise and parent session, rejects if `completedAt` is already set, then performs `loggedSet.upsert(...)` in a separate call.
- `markExerciseSkipped()`, `revertExerciseSkipped()`, and `updateSessionNote()` follow the same read-then-write pattern.
- `completeSession()` likewise reads the session first and updates it afterward without a compare-and-set condition on the write itself.

**Risk**

These are time-of-check/time-of-use race windows. One tab can complete a session while another tab, holding a stale pre-check result, still writes sets, notes, or skip-state mutations afterward. The intended invariant of “no edits after completion” is therefore not fully atomic under concurrent requests.

**Recommendation**

Later remediation should move completion-sensitive guards into transactional or conditional writes so stale requests fail at write time, not only at pre-check time.

**Validation needed**

- Simulate concurrent `completeSession` and `upsertLoggedSet` requests against the same session.
- Verify post-completion writes are rejected even when the stale request passed its initial read.

### RUN-07

- Severity: important
- Priority: P1
- Domain: runtime
- Surface: `src/server/services/adaptive-coaching.ts::confirmAdaptiveRecommendation`, `src/server/services/adaptive-coaching.ts::rejectAdaptiveRecommendation`, `src/server/dal/adaptive-coaching.ts::updateAdaptiveRecommendationStatus`
- Production blocker: no

**Evidence**

- Confirm and reject operations depend on `expectedCurrentStatus: 'pending_confirmation'` and the current next-session target.
- `updateAdaptiveRecommendationStatus()` throws a generic error on status mismatch instead of returning a typed stale-state outcome.
- Route handlers catch `AdaptiveCoachingError` cleanly, but a raw mismatch error falls through to generic `500 Unable to confirm recommendation` or `500 Unable to reject recommendation`.
- `rejectAdaptiveRecommendation()` first marks the original recommendation as rejected, then creates a new conservative hold recommendation and decision trace in separate operations.

**Risk**

Concurrent confirmation or rejection requests can surface as server errors instead of deterministic stale-state responses. The rejection flow also is not atomic end to end: if fallback creation fails after the rejection update succeeds, the system can land in an inconsistent state where the high-impact recommendation is rejected but no conservative fallback was applied.

**Recommendation**

Remediation should turn stale confirmation/rejection attempts into explicit conflict responses and make rejection-plus-fallback creation atomic as one consistency unit.

**Validation needed**

- Race confirm and reject requests for the same recommendation and inspect route responses.
- Inject a failure between rejection status update and fallback creation to confirm whether partial state persists.

## Production Risk Register

| ID | Severity | Blocker | Summary |
| --- | --- | --- | --- |
| `RUN-01` | important | no | Dashboard SSR pays extra internal HTTP hops and repeated session/origin work on each render. |
| `RUN-02` | important | no | Trends and history aggregation cost grows linearly because reads are unbounded and reduced in memory. |
| `RUN-03` | important | no | Adaptive generation is a serial, provider-sensitive request path with no duplicate-submit suppression. |
| `RUN-04` | moderate | no | Restore drill proves startup and route reachability but not authenticated data integrity after restore. |
| `RUN-05` | important | no | Program generation has no single-active-plan constraint, so concurrent replacements can create inconsistent active state. |
| `RUN-06` | important | no | Session logging and completion rely on non-atomic read-then-write guards, leaving post-completion race windows. |
| `RUN-07` | important | no | Adaptive confirm/reject retries can degrade to 500s, and rejection fallback creation is not fully atomic. |

## Release-Sensitive Runtime Items

- `RUN-05`: concurrent plan generation can make the active training plan nondeterministic for one user.
- `RUN-06`: completion-sensitive workout writes are not fully atomic under stale multi-tab or retry conditions.
- `RUN-07`: adaptive recommendation decision flows can partially apply or surface incorrect server errors under concurrent user actions.

## Optimization Candidates

- `RUN-01`: remove same-service SSR fetches from dashboard composition.
- `RUN-02`: bound history/trend windows and move expensive aggregation closer to the database or cached summaries.
- `RUN-04`: deepen restore drill verification beyond anonymous HTTP smoke checks.
