# Functional Flow and Data Integrity Audit

Phase 07 plan 07-03 audits the main product journeys end to end from user entrypoint to route, service, DAL, persistence, response contract, and client consumption. This is a read-only evidence document; no application code was changed.

## Scope

Covered flows:

- Signup
- Login, logout, and session persistence
- Onboarding and profile updates
- Program generation and dashboard today/next workout loading
- Exercise substitutions
- Session logging, completion, duration correction
- Session history and drilldown
- Adaptive recommendation generation, confirmation, and rejection
- Trends summary and exercise drilldown
- Recovery operations: manual admin reset and restore drill

## Executive Findings

| ID | Severity | Priority | Flow | Finding |
| --- | --- | --- | --- | --- |
| `FLOW-01` | Important | P1 | Dashboard today/next selection | `src/server/dal/program.ts` selects next sessions with `scheduledDate > endOfDay`, which can skip a next-day session stored exactly at midnight UTC. |
| `FLOW-02` | Important | P1 | Session history drilldown | `src/app/api/program/sessions/[sessionId]/route.ts` reads `getSessionById()` from active plans only, while history list uses all completed sessions; archived sessions can appear in history but fail drilldown after regeneration. |
| `FLOW-03` | Important | P1 | Workout resume integrity | `src/app/(private)/dashboard/_components/session-logger.tsx` never hydrates saved sets, skips, note, or timer state from persisted session detail, so refresh/reopen loses in-progress context despite backend persistence. |
| `FLOW-04` | Important | P1 | Dashboard degraded path | `src/app/(private)/dashboard/page.tsx` treats `/api/program/today` failures as `null`, which collapses into the same UI as “no workout planned” and masks route/service outages. |
| `FLOW-05` | Moderate | P2 | Profile fetch degraded path | `src/app/(private)/onboarding/page.tsx` and `src/app/(private)/profile/page.tsx` swallow `/api/profile` failures and keep default form state, which obscures unauthorized/server failures. |
| `FLOW-06` | Moderate | P2 | History contract integrity | `src/app/(private)/dashboard/_components/session-history-card.tsx` uses `asHistoryDetail()` coercion instead of strict response parsing, which can hide response-shape drift. |
| `FLOW-07` | Moderate | P2 | Adaptive post-decision UX consistency | `src/app/(private)/dashboard/components/adaptive-confirmation-banner.tsx` resolves locally after confirm/reject but does not refresh dashboard server state, so adjacent forecast data can remain stale until reload. |
| `FLOW-08` | Moderate | P2 | Restore verification depth | `infra/scripts/run-restore-drill.sh` verifies restore + anonymous smoke reachability, but does not authenticate or assert restored business data correctness. |

## Flow Matrix

### 1. Signup

**Entrypoint:** `src/app/(public)/signup/page.tsx` posts to `src/app/api/auth/signup/route.ts`

**Backend path**

- Route: `src/app/api/auth/signup/route.ts`
- Contract and validation: `src/lib/auth/contracts.ts::validateSignupInput`, password policy in `src/lib/auth/password.ts`
- Service: `src/lib/auth/auth.ts::createAuthService().signup`
- Persistence: `User` creation in Prisma via route-local repository
- Evidence tests: `tests/auth/session-lifecycle.test.ts`, `tests/auth/contracts.test.ts`

**Happy path**

- JSON body is parsed.
- `validateSignupInput` requires non-empty trimmed username and password.
- Password policy is enforced before persistence.
- Service checks existing username, creates `User`, and returns `{ id, username }`.
- Route returns `201` with a minimal response payload and does not create a session yet.

**Error path**

- Invalid JSON returns `400 Invalid request payload`.
- Invalid contract or password policy returns `400` with validation text.
- Duplicate username returns `409 Username is already in use`.
- Unexpected persistence failures return `500 Unable to create account`.

**Validation**

- Username and password are mandatory.
- Password policy is centralized in auth domain code, not route-local.
- Prisma unique violation is normalized into the same duplicate-username behavior.

**Invariant**

- Username normalization is consistent before lookup and create.
- Only `id` and `username` are exposed in response; password hash never leaves server code.

**Auth masking**

- Not applicable for the create-account path.

**Assessment**

- Flow is coherent end to end and has explicit contract and uniqueness handling.
- No production blocker found in this path.

### 2. Login, Session Persistence, and Logout

**Entrypoint:** `src/app/(public)/login/page.tsx`, private route access, dashboard logout form

**Backend path**

- Routes: `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`
- Contract and validation: `src/lib/auth/contracts.ts`
- Service: `src/lib/auth/auth.ts::login`
- Session validation: `src/lib/auth/session-gate.ts`
- Persistence: `Session` rows with token hash, expiry, revocation
- Evidence tests: `tests/auth/session-lifecycle.test.ts`, `tests/auth/session-gate.test.ts`

**Happy path**

- Login validates username/password payload.
- Password hash is verified; a random session token is generated and only its hash is stored.
- Route sets secure, httpOnly, sameSite=lax cookie and returns `{ userId, username }`.
- Private surfaces resolve session from cookie through `validateSessionFromCookies()`.
- Logout revokes only the matching active session hash and clears the cookie idempotently.

**Error path**

- Invalid JSON or invalid contract returns `400`.
- Unknown username or wrong password returns generic `401 Invalid username or password`.
- Missing cookie on logout still returns `200 { ok: true }` and clears the browser cookie.
- Invalid, revoked, or expired session token resolves to `null`, which leads protected routes to `401` or redirect behavior.

**Validation**

- Session token is never stored raw.
- Session gate rejects revoked or expired sessions.
- Cookie settings are explicit and server-owned.

**Invariant**

- Authoritative auth state comes from persisted session rows, not cookie presence alone.
- Logout is current-session scoped; it does not mass revoke sibling sessions.

**Auth masking**

- Invalid credentials are fully masked behind the generic auth error.
- Session gate returns `null` rather than surfacing whether token, expiry, or revocation caused failure.

**Assessment**

- Flow is robust and coherently masked.
- Session persistence behavior is stronger than typical cookie-only gating because every protected route re-validates persistence.

### 3. Onboarding and Profile Update

**Entrypoint:** `src/app/(private)/onboarding/page.tsx`, `src/app/(private)/profile/page.tsx`, shared `ProfileForm`

**Backend path**

- Route: `src/app/api/profile/route.ts`
- Contract and validation: `src/lib/profile/contracts.ts`
- Completeness gate: `src/lib/profile/completeness.ts`
- DAL: `src/server/dal/profile.ts`
- Persistence: `AthleteProfile`
- Evidence tests: `tests/profile/profile-route.test.ts`, `tests/profile/profile-contracts.test.ts`, `tests/profile/onboarding-gate.test.ts`

**Happy path**

- Client fetches `/api/profile` to preload existing state.
- GET returns `{ profile, complete }` for the authenticated user.
- PUT in onboarding mode validates full profile payload and upserts the row.
- PUT in edit mode validates patch payload, merges against the stored profile, and updates the row.
- Completeness is returned after write and onboarding redirects complete users to `/dashboard`.

**Error path**

- Missing session returns `401 Unauthorized`.
- Invalid JSON returns `400 Invalid request payload`.
- Invalid full or partial profile contract returns `400` with the contract error message.
- Patch against a missing profile returns `400 Profile does not exist`.

**Validation**

- Goal, weekly session target, session duration, and equipment categories are schema-constrained.
- Limitation declarations are cross-field validated:
  - `limitationsDeclared=true` requires at least one limitation.
  - `limitationsDeclared=false` forbids limitation rows.

**Invariant**

- Account scope comes only from the validated session, never caller-provided `userId`.
- Patch flow merges with existing persisted state before update, preventing sparse writes from dropping unrelated fields.

**Auth masking**

- Unauthorized is explicit here rather than masked as not found.

**Weak spots**

- `src/app/(private)/onboarding/page.tsx` and `src/app/(private)/profile/page.tsx` ignore non-OK `/api/profile` responses and keep rendering default form state. This makes auth expiry or server failure look like an empty profile instead of an error.
- The degraded UI path is therefore weaker than the route contract.

### 4. Program Generation and Dashboard Today/Next Workout Loading

**Entrypoint:** dashboard workflow after onboarding; dashboard SSR fetches `/api/program/today`

**Backend path**

- Generate route: `src/app/api/program/generate/route.ts`
- Generation service: `src/server/services/program-generation.ts`
- Planner: `src/lib/program/planner.ts`
- DAL: `src/server/dal/program.ts::replaceActivePlan`, `getTodayOrNextSessionCandidates`
- Response contracts and projections: `src/lib/program/contracts.ts`, `src/lib/program/select-today-session.ts`
- Dashboard consumer: `src/app/(private)/dashboard/page.tsx`, `src/app/(private)/dashboard/_components/today-workout-card.tsx`
- Evidence tests: `tests/program/program-generate-route.test.ts`, `tests/program/planner.test.ts`, `tests/program/dashboard-today-surface.test.ts`

**Happy path**

- Generate route requires an authenticated session.
- Payload is parsed by `parseProgramGenerateInput`.
- Service validates that profile exists and is complete.
- Planner builds a weekly program.
- DAL archives any active plan and creates a replacement plan with nested sessions and exercises inside a transaction.
- Dashboard SSR fetches `/api/program/today`, parses the response, and chooses today-first then next-session fallback.

**Error path**

- Unauthenticated callers receive `401`.
- Invalid JSON or invalid generate payload returns `400`.
- Missing or incomplete profile returns `400` from `ProgramGenerationError`.
- Unexpected generation errors return `500`.
- Dashboard SSR returns `null` if it cannot build an origin or if `/api/program/today` is non-OK.

**Validation**

- Full profile contract is re-validated inside the service before planning.
- Today response is contract-validated through `parseProgramTodayResponse`.

**Invariant**

- Plan replacement is transactional, so “archive previous active plan + create new active plan” is atomic.
- Account scope is derived from session and enforced inside the DAL.

**Auth masking**

- Unauthorized is explicit at route level.

**Weak spots**

- `src/server/dal/program.ts::getTodayOrNextSessionCandidates()` uses `scheduledDate > endOfDay` for the next-session lookup. Because planned dates are stored at UTC day start, a next-day session at exactly `00:00:00.000Z` is skipped.
- `src/app/(private)/dashboard/page.tsx::loadProgramTodayData()` returns `null` for any fetch failure, and `TodayWorkoutCard` then renders the same empty state used for “Aucune seance planifiee.” That masks outages as a legitimate no-plan condition.

### 5. Exercise Substitutions

**Entrypoint:** workout UI substitution action for a planned exercise

**Backend path**

- Candidate route: `src/app/api/program/exercises/[plannedExerciseId]/substitutions/route.ts`
- Apply route: `src/app/api/program/exercises/[plannedExerciseId]/substitute/route.ts`
- Domain logic: `src/lib/program/substitution.ts`
- Profile lookup: `src/server/dal/profile.ts`
- Ownership/update DAL: `src/server/dal/program.ts`
- Evidence tests: `tests/program/substitution.test.ts`

**Happy path**

- Authenticated caller requests candidates for a planned exercise.
- Route verifies ownership through account-scoped DAL lookup.
- Profile constraints are loaded.
- Candidate list is computed from exercise catalog, matching movement pattern, available equipment, and blocked limitations.
- Apply route validates `replacementExerciseKey`, re-checks profile and ownership, enforces today-only substitution, and updates the planned exercise in persistence.

**Error path**

- Unauthenticated callers receive `401`.
- Ownership mismatch is masked to `404 Planned exercise not found`.
- Missing profile returns `400`.
- Invalid replacement key or non-today substitution returns `400`.
- Unexpected mutation failures return `500`.

**Validation**

- Replacement key is schema-validated.
- Domain logic rejects replacements outside the computed candidate set.
- Limitations and equipment are re-applied at execution time, not trusted from the client.

**Invariant**

- Only the currently authenticated user’s planned exercise can be substituted.
- `originalExerciseKey` preserves the first source exercise even after replacement.
- Substitution is limited to the current day, which constrains mutation scope.

**Auth masking**

- Cross-account access is intentionally surfaced as not found.

**Assessment**

- Flow is coherent and conservative.
- No contract mismatch found in the route-service-DAL chain.

### 6. Session Logging, Completion, and Duration Correction

**Entrypoint:** `src/app/(private)/dashboard/_components/session-logger.tsx`

**Backend path**

- Routes:
  - `src/app/api/program/sessions/[sessionId]/exercises/[plannedExerciseId]/sets/route.ts`
  - `src/app/api/program/sessions/[sessionId]/exercises/[plannedExerciseId]/skip/route.ts`
  - `src/app/api/program/sessions/[sessionId]/note/route.ts`
  - `src/app/api/program/sessions/[sessionId]/complete/route.ts`
  - `src/app/api/program/sessions/[sessionId]/duration/route.ts`
- Contracts: `src/lib/program/contracts.ts`
- Service: `src/server/services/session-logging.ts`
- DAL: `src/server/dal/program.ts`
- Evidence tests: `tests/program/program-session-logging-route.test.ts`

**Happy path**

- Client validates obvious numeric constraints before submitting.
- Route validates account ownership by comparing `sessionId` URL param with exercise ownership.
- Service auto-starts the session on first logged set.
- Logged sets are upserted by `(plannedExerciseId, setIndex)`.
- Skip, note, completion, and duration correction reuse the same session lifecycle invariants.
- Completion records fatigue, readiness, comment, completion time, and derived duration.

**Error path**

- Invalid JSON or invalid contracts return `400`.
- Ownership mismatch is masked to `404`.
- Completed sessions reject further set edits, skips, note edits, or second completion.
- Duration correction rejects incomplete sessions and corrections outside the 24-hour window.
- Client surfaces generic French error messages on non-OK responses.

**Validation**

- Logged sets require positive load, integer reps, integer set index, optional RPE in range.
- Skip reason is mandatory and optional detail is capped.
- Completion requires fatigue/readiness in `[1,5]`.
- Duration correction requires positive seconds and a completed session.

**Invariant**

- Session mutations are account-scoped.
- Session start is idempotent.
- Logged sets are overwrite-safe at the set index level because DAL uses upsert.
- Completed sessions become immutable for normal logging mutations.

**Auth masking**

- Ownership failures are translated to `404 Planned exercise not found` or `404 Planned session not found`.

**Weak spots**

- `src/app/(private)/dashboard/_components/session-logger.tsx` never loads existing logged sets, skip flags, saved note, or persisted start time. The UI says “Reprendre seance” for started sessions, but the client state is rebuilt from scratch after refresh.
- Because the logger only appends optimistic local state, resumed sessions can feel empty even when persistence already contains data, which weakens data-integrity confidence for real-world multi-tab or interrupted sessions.

### 7. Session History and Drilldown

**Entrypoint:** `src/app/(private)/dashboard/_components/session-history-card.tsx`

**Backend path**

- History list route: `src/app/api/program/history/route.ts`
- Session detail route reused for history drilldown: `src/app/api/program/sessions/[sessionId]/route.ts`
- Projections: `src/lib/program/select-today-session.ts`
- DAL: `src/server/dal/program.ts::getHistoryList`, `getSessionById`, `getHistorySessionDetail`
- Evidence tests: `tests/program/session-history-surface.test.ts`

**Happy path**

- History card builds a query string for fixed or custom periods.
- Route validates period/from/to semantics and resolves a date range.
- DAL returns completed sessions with total load and counts.
- Client lists rows and can click a session to load drilldown detail from `/api/program/sessions/:sessionId`.

**Error path**

- Unauthenticated history requests receive `401`.
- Invalid period/from/to combinations return `400`.
- Detail route returns `404 Session not found` when the session is not returned by `getSessionById`.
- Client maps failures to generic UI messages.

**Validation**

- Custom ranges require both `from` and `to`.
- Non-custom periods reject explicit bounds.
- Detail response is strictly validated in the server projection.

**Invariant**

- History list is account-scoped and based on completed sessions only.
- Detail route re-filters exercise rows by `userId` before projection.

**Auth masking**

- History list uses explicit `401`.
- Detail route returns `404` rather than exposing account ownership mismatches.

**Weak spots**

- `src/server/dal/program.ts::getHistoryList()` includes all completed sessions, but `src/app/api/program/sessions/[sessionId]/route.ts` fetches detail through `getSessionById()`, which filters to `programPlan.status = active`. After generating a new plan, archived historical sessions can remain visible in the list and fail on click.
- The DAL already exposes `getHistorySessionDetail()`, but the history UI bypasses it.
- `src/app/(private)/dashboard/_components/session-history-card.tsx` uses `asHistoryDetail()` coercion instead of the existing strict history/detail parsers, so malformed response fields can silently coerce to empty strings and zeroes.

### 8. Adaptive Recommendation Generate, Confirm, and Reject

**Entrypoint:** dashboard server load for forecast/banner and banner button actions

**Backend path**

- Generate route: `src/app/api/program/adaptation/route.ts`
- Confirm/reject routes:
  - `src/app/api/program/adaptation/[recommendationId]/confirm/route.ts`
  - `src/app/api/program/adaptation/[recommendationId]/reject/route.ts`
- Contracts: `src/lib/adaptive-coaching/contracts.ts`
- Service: `src/server/services/adaptive-coaching.ts`
- DAL: `src/server/dal/adaptive-coaching.ts`
- Dashboard consumers:
  - `src/app/(private)/dashboard/components/adaptive-confirmation-banner.tsx`
  - `src/app/(private)/dashboard/components/adaptive-forecast-card.tsx`
- Evidence tests:
  - `tests/program/adaptive-coaching-service.test.ts`
  - `tests/program/adaptive-coaching-confirm-route.test.ts`
  - `tests/program/dashboard-adaptive-forecast.test.ts`

**Happy path**

- Authenticated generation validates profile presence and chooses target session from today/next candidates.
- The service computes a proposal, runs orchestration and safety logic, persists the recommendation, and returns a contract-validated payload with trace steps.
- High-impact outcomes move to `pending_confirmation` with `expiresAt`.
- Confirm route requires `{ decision: "accept" }`, re-validates pending status and target session continuity, then marks the recommendation `applied`.
- Reject route requires `{ decision: "reject" }`, marks the pending recommendation `rejected`, creates a conservative `hold` fallback, and returns the fallback payload.

**Error path**

- Missing auth returns `401`.
- Missing profile or missing target session returns structured `4xx` errors from `AdaptiveCoachingError`.
- Cross-account or missing recommendation lookup is masked to `404 Recommendation not found`.
- Invalid recommendation payloads from the service are translated to `500`.
- Expired or no-longer-targeting recommendations return `409`.

**Validation**

- Returned recommendations are re-parsed at route boundaries.
- Pending confirmation requires `expiresAt`.
- Confirm/reject payloads are strict single-purpose schemas.

**Invariant**

- Recommendation status transitions are persisted together with decision trace rows.
- Confirmation/rejection is only valid for high-impact `pending_confirmation` recommendations still targeting the next planned session.
- Reject flow always applies a conservative fallback recommendation rather than leaving the next session without an explicit outcome.

**Auth masking**

- Recommendation ownership mismatches are masked as not found.

**Weak spots**

- `src/app/(private)/dashboard/components/adaptive-confirmation-banner.tsx` updates only local banner state after confirm/reject; it does not refresh the server-rendered forecast card or surrounding dashboard data. Users can see a resolved banner alongside stale adjacent recommendation state until reload.

### 9. Trends Summary, Exercise Drilldown, and Dashboard SSR Loading

**Entrypoint:** dashboard SSR preload plus client drilldown interactions

**Backend path**

- Summary route: `src/app/api/program/trends/route.ts`
- Exercise route: `src/app/api/program/trends/[exerciseKey]/route.ts`
- Contracts: `src/lib/program/trends.ts` re-exported from `src/lib/program/contracts.ts`
- DAL: `src/server/dal/program.ts::getTrendSummary`, `getExerciseTrendSeries`
- Dashboard SSR loader: `src/app/(private)/dashboard/page.tsx::loadProgramTrendsData`
- Evidence tests:
  - `tests/program/program-trends-route.test.ts`
  - `tests/program/program-dal-trends.test.ts`
  - `tests/program/dashboard-trends-surface.test.ts`

**Happy path**

- Dashboard builds an origin from forwarded headers, forwards cookies, and fetches `/api/program/trends?period=30d`.
- Route validates period against `7d | 30d | 90d`.
- DAL computes aggregate volume, intensity, and adherence series over the requested range.
- Exercise drilldown route validates `exerciseKey`, parses period, and returns the requested series if data exists.

**Error path**

- Missing auth returns `401`.
- Invalid period returns `400`.
- Missing drilldown data returns `404 Trend data not found`.
- Dashboard SSR treats non-OK trend responses as `null` and simply omits the trends section.

**Validation**

- Trend period is strictly bounded.
- Response payloads are re-validated before being returned from routes and when parsed by the dashboard server component.

**Invariant**

- Trend reads stay account-scoped.
- Summary always returns one bounded period and a generated timestamp.
- Drilldown uses the exact requested `exerciseKey`, not loose matching.

**Auth masking**

- Summary uses explicit `401`.
- Drilldown uses `404` when no scoped trend series exists.

**Weak spots**

- The SSR degraded path silently hides the trends section when the internal fetch fails, which is operationally safe but weak for diagnosis because data absence and data-fetch failure are indistinguishable in the UI.

### 10. Recovery Operations: Manual Admin Reset and Restore Drill

**Entrypoint:** privileged operator shell procedures, not end-user UI

**Backend path**

- Password reset CLI: `scripts/admin-reset-password.ts`
- Reset service: `src/lib/auth/admin-reset.ts`
- Recovery runbook: `docs/operations/auth-recovery.md`
- Restore scripts:
  - `infra/scripts/restore.sh`
  - `infra/scripts/run-restore-drill.sh`
- Restore runbook: `docs/operations/restore-drill-runbook.md`
- Evidence tests: `tests/auth/admin-reset.test.ts`, `tests/ops/restore-drill.test.ts`

**Happy path**

- Admin reset prompts for username, new password, and explicit `RESET <username>` confirmation.
- Service normalizes username, enforces password policy, updates password hash, and revokes active sessions.
- CLI prints a generic success message regardless of account existence handling.
- Restore drill chooses an encrypted backup, decrypts it with `BACKUP_PASSPHRASE`, restores into `RESTORE_TARGET_DB`, and records timestamped evidence plus smoke checks.

**Error path**

- Missing username/password or confirmation mismatch aborts reset locally.
- Unknown username throws `GenericResetResponseError`, which still prints the generic completion message.
- Restore script hard-fails on missing backup, env file, passphrase, compose tooling, or unsafe `RESTORE_TARGET_DB`.
- Drill writes structured evidence markers and records failed stage/exit code on error.

**Validation**

- Password policy is enforced even in admin reset.
- Restore requires encrypted input and dedicated target DB.
- `RESTORE_TARGET_DB` must differ from `POSTGRES_DB`.

**Invariant**

- Reset is privileged and non-self-service by design.
- Admin reset revokes active sessions after password rotation.
- Restore drill never targets the production DB name.

**Auth masking**

- Reset flow intentionally masks whether the username existed.

**Weak spots**

- Restore drill smoke checks prove reachability of `/login` and anonymous redirect behavior on `/dashboard`, but they do not authenticate, assert a restored account can sign in, or validate recovered business data. This leaves a gap between restore success and product-level recoverability proof.

## Cross-Flow Integrity Notes

### Account-scope handling

- Strong overall pattern: route handlers resolve session, DAL calls use `requireAccountScope()` and `buildAccountScopedWhere()`, and several mutation routes translate ownership mismatches into not-found responses.
- This account-scope invariant is consistently stronger than trusting caller-supplied identifiers.

### Response-shape handling

- Strong pattern in route projections and dashboard SSR: `parseProgramTodayResponse`, `parseProgramSessionDetailResponse`, `parseProgramTrendsSummaryResponse`, `parseAdaptiveRecommendation`.
- Main exception: `SessionHistoryCard` uses loose coercion instead of strict history detail parsing.

### Error-path handling

- Route layers are generally explicit and conservative.
- The weakest error-path handling is in client/server consumers that collapse transport failure into empty-state UI:
  - profile preload pages
  - dashboard today/trends SSR loaders
  - adaptive post-decision refresh

## Recommended Follow-up Items For Later Remediation Planning

1. Fix the next-session boundary bug in `getTodayOrNextSessionCandidates()` and add regression coverage for midnight-next-day sessions.
2. Route history drilldown through `getHistorySessionDetail()` or relax detail lookup so archived completed sessions remain inspectable.
3. Hydrate `SessionLogger` from persisted session detail so reloads and resumed sessions preserve logged sets, skip state, note, and timer context.
4. Distinguish dashboard fetch failures from legitimate “empty workout” and “no trends” states.
5. Surface `/api/profile` preload failures explicitly in onboarding/profile pages instead of silently reverting to defaults.
6. Replace `asHistoryDetail()` with strict response parsing to preserve contract integrity.
7. Refresh or revalidate dashboard state after adaptive confirm/reject actions.
8. Deepen restore-drill verification with authenticated post-restore checks against restored data.
