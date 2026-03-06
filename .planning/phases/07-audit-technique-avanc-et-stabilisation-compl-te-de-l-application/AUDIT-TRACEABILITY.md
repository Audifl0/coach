# Audit Traceability Baseline

Phase 07 traceability baseline linking every v1 requirement to concrete repository surfaces, persistence areas, automated tests, and operational controls. This is a coverage map, not a quality judgment. Weak or indirect evidence is called out so later audit plans know where to focus.

## Evidence Scale

| Level | Meaning |
| --- | --- |
| Strong | Clear runtime surface plus dedicated automated tests or ops proof. |
| Moderate | Runtime surface is clear, but evidence is mostly unit/service/route level or indirect. |
| Weak | Requirement is represented, but proof is largely documentary, script-level, or missing end-to-end evidence. |

## Requirement Matrix

| Requirement | User/runtime surface | API and server path | Persistence/schema area | Automated tests | Ops/docs controls | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `AUTH-01` | `src/app/(public)/signup/page.tsx` | `src/app/api/auth/signup/route.ts`, `src/lib/auth/auth.ts` | `User`, `Session` in `prisma/schema.prisma` | `tests/auth/session-lifecycle.test.ts`, `tests/auth/contracts.test.ts`, `tests/auth/schema-auth-model.test.mjs` | `docs/operations/vps-deploy.md` | Strong | Dedicated signup route and session creation path are covered by auth lifecycle tests. |
| `AUTH-02` | `src/app/(public)/login/page.tsx`, private pages gated by `src/middleware.ts` | `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`, `src/lib/auth/session-gate.ts` | `Session` model with token hash and expiry | `tests/auth/session-lifecycle.test.ts`, `tests/auth/session-gate.test.ts` | `docs/operations/vps-deploy.md`, `docs/operations/data-protection.md` | Strong | Persisted-session validation is explicit and separately tested. |
| `AUTH-03` | No end-user self-service page; server-operator flow only | `scripts/admin-reset-password.ts`, `src/lib/auth/admin-reset.ts` | `User.passwordHash`, `Session.revokedAt` | `tests/auth/admin-reset.test.ts` | `docs/operations/auth-recovery.md` | Moderate | Proof is strong at CLI/service level but there is no browser-accessible recovery flow by design. |
| `PROF-01` | `src/app/(private)/onboarding/page.tsx`, `src/components/profile/profile-form.tsx` | `src/app/api/profile/route.ts`, `src/lib/profile/contracts.ts`, `src/server/dal/profile.ts` | `AthleteProfile.goal` | `tests/profile/profile-route.test.ts`, `tests/profile/profile-contracts.test.ts`, `tests/profile/onboarding-gate.test.ts` | None specific | Strong | Goal capture is part of validated profile contract and onboarding gate. |
| `PROF-02` | Onboarding/profile forms | `src/app/api/profile/route.ts`, `src/lib/profile/contracts.ts`, `src/server/dal/profile.ts` | `AthleteProfile.weeklySessionTarget`, `sessionDuration`, `equipmentCategories` | `tests/profile/profile-route.test.ts`, `tests/profile/profile-contracts.test.ts` | None specific | Strong | Constraints persist through the same profile contract/write path. |
| `PROF-03` | Onboarding/profile forms | `src/app/api/profile/route.ts`, `src/lib/profile/contracts.ts`, `src/server/dal/profile.ts` | `AthleteProfile.limitationsDeclared`, `limitations` | `tests/profile/profile-route.test.ts`, `tests/profile/profile-contracts.test.ts` | None specific | Strong | Limitation flags are first-class profile data and later consumed by adaptive safety logic. |
| `PROF-04` | `src/app/(private)/profile/page.tsx`, shared profile form | `src/app/api/profile/route.ts` edit mode, `src/server/dal/profile.ts::patchProfile` | `AthleteProfile` row update path | `tests/profile/profile-route.test.ts` | None specific | Strong | Dedicated patch flow exists and is test-covered at route level. |
| `PROG-01` | Dashboard and private workflow after onboarding | `src/app/api/program/generate/route.ts`, `src/server/services/program-generation.ts`, `src/lib/program/planner.ts` | `ProgramPlan`, `PlannedSession`, `PlannedExercise` | `tests/program/program-generate-route.test.ts`, `tests/program/planner.test.ts`, `tests/program/program-dal.test.ts` | None specific | Strong | Requirement is backed by a distinct service + planner + replace-active-plan path. |
| `PROG-02` | `src/app/(private)/dashboard/page.tsx`, `today-workout-card.tsx` | `src/app/api/program/today/route.ts`, `src/lib/program/select-today-session.ts` | `PlannedSession`, `PlannedExercise` | `tests/program/dashboard-today-surface.test.ts`, `tests/program/contracts.test.ts` | None specific | Strong | Prescription payload and dashboard rendering have direct tests. |
| `PROG-03` | Workout UI substitution flow | `src/app/api/program/exercises/[plannedExerciseId]/substitutions/route.ts`, `src/app/api/program/exercises/[plannedExerciseId]/substitute/route.ts`, `src/lib/program/substitution.ts` | `PlannedExercise.isSubstituted`, replacement fields | `tests/program/substitution.test.ts` | None specific | Moderate | Business rules are tested, but there is no browser-level exercise replacement flow test. |
| `LOG-01` | `session-logger.tsx` | `src/app/api/program/sessions/[sessionId]/exercises/[plannedExerciseId]/sets/route.ts`, `src/server/services/session-logging.ts` | `LoggedSet`, `PlannedSession.startedAt` | `tests/program/program-session-logging-route.test.ts` | None specific | Strong | Logging path and session-start semantics are represented in route tests. |
| `LOG-02` | `session-logger.tsx` | `src/app/api/program/sessions/[sessionId]/exercises/[plannedExerciseId]/skip/route.ts`, `src/server/services/session-logging.ts` | `PlannedExercise.isSkipped`, reason fields, timestamps | `tests/program/program-session-logging-route.test.ts` | None specific | Strong | Skip and unskip are explicit route surfaces with persisted reason data. |
| `LOG-03` | Session completion UI | `src/app/api/program/sessions/[sessionId]/complete/route.ts`, `src/app/api/program/sessions/[sessionId]/note/route.ts`, `src/server/services/session-logging.ts` | `PlannedSession.postSessionFatigue`, `postSessionReadiness`, `postSessionComment`, `note` | `tests/program/program-session-logging-route.test.ts` | None specific | Strong | Completion payload and note persistence are part of the same covered lifecycle. |
| `LOG-04` | `session-history-card.tsx`, dashboard history UI | `src/app/api/program/history/route.ts`, `src/app/api/program/sessions/[sessionId]/route.ts`, `src/lib/program/select-today-session.ts` | Completed `PlannedSession` plus associated `LoggedSet` rows | `tests/program/session-history-surface.test.ts` | None specific | Strong | List and detail history surfaces both exist and are tested. |
| `ADAP-01` | Dashboard adaptive forecast/banner surfaces | `src/app/api/program/adaptation/route.ts`, `src/server/services/adaptive-coaching.ts`, `src/lib/adaptive-coaching/orchestrator.ts` | `AdaptiveRecommendation` | `tests/program/adaptive-coaching-service.test.ts`, `tests/program/adaptive-coaching-fallback.test.ts`, `tests/program/adaptive-coaching-provider-integration.test.ts` | Adaptive corpus cron install script indirectly supports evidence freshness | Strong | Recommendation generation is a distinct runtime flow with service/provider tests. |
| `ADAP-02` | Adaptive forecast/banner UI | `src/lib/adaptive-coaching/evidence.ts`, `src/lib/adaptive-coaching/forecast.ts`, `src/app/(private)/dashboard/components/adaptive-forecast-card.tsx` | `AdaptiveRecommendation.reasons`, `evidenceTags`, `forecastPayload` | `tests/program/adaptive-coaching-contracts.test.ts`, `tests/program/dashboard-adaptive-forecast.test.ts` | None specific | Moderate | Reason/evidence fields are explicit, but proof is mostly contract/view-model level. |
| `ADAP-03` | Adaptive confirmation banner | `src/app/api/program/adaptation/[recommendationId]/confirm/route.ts`, `src/app/api/program/adaptation/[recommendationId]/reject/route.ts`, `src/server/services/adaptive-coaching.ts` | `AdaptiveRecommendation.status`, `expiresAt`, `AdaptiveRecommendationDecision` | `tests/program/adaptive-coaching-confirm-route.test.ts`, `tests/program/adaptive-coaching-service.test.ts` | None specific | Strong | Confirmation window and reject fallback are explicit persisted lifecycle states. |
| `SAFE-01` | Indirect; enforced before recommendation display | `src/lib/adaptive-coaching/policy.ts`, `src/lib/adaptive-coaching/orchestrator.ts`, adaptive service | `AdaptiveRecommendation.progressionDelta*` | `tests/program/adaptive-coaching-policy.test.ts`, `tests/program/adaptive-coaching-service.test.ts` | None specific | Strong | Safety bounds are centralized and exercised by policy/service tests. |
| `SAFE-02` | Adaptive UI warning states | `src/lib/adaptive-coaching/policy.ts`, `src/server/services/adaptive-coaching.ts` | `AdaptiveRecommendation.warningFlag`, `warningText` | `tests/program/adaptive-coaching-policy.test.ts`, `tests/program/adaptive-coaching-service.test.ts`, adaptive-knowledge tests for corpus support | None specific | Moderate | Conflict detection exists, but evidence is service/policy level rather than end-user flow level. |
| `SAFE-03` | Adaptive UI fallback states | `src/lib/adaptive-coaching/confidence.ts`, `src/lib/adaptive-coaching/orchestrator.ts`, `src/server/services/adaptive-coaching.ts` | `AdaptiveRecommendation.fallbackApplied`, `fallbackReason`, fallback recommendation rows | `tests/program/adaptive-coaching-fallback.test.ts`, `tests/program/adaptive-coaching-provider-fallback.test.ts`, `tests/program/adaptive-coaching-provider-retry.test.ts` | Adaptive corpus pipeline and rollback scripts protect evidence source integrity indirectly | Strong | Conservative fallback is a first-class path with dedicated tests. |
| `DASH-01` | `src/app/(private)/dashboard/page.tsx`, `today-workout-card.tsx` | `src/app/api/program/today/route.ts`, `src/lib/program/select-today-session.ts` | Planned session/exercise data | `tests/program/dashboard-today-surface.test.ts` | None specific | Strong | Dashboard main use case is directly represented and tested. |
| `DASH-02` | `trends-summary-card.tsx`, `trends-drilldown.tsx` | `src/app/api/program/trends/route.ts`, `src/app/api/program/trends/[exerciseKey]/route.ts`, `src/lib/program/trends.ts` | Aggregated completed-session data from `PlannedSession`, `LoggedSet`, `PlannedExercise` | `tests/program/program-dal-trends.test.ts`, `tests/program/program-trends-route.test.ts`, `tests/program/dashboard-trends-surface.test.ts`, `tests/program/program-trends-contracts.test.ts` | None specific | Strong | Summary and drilldown trends have DAL, route, contract, and surface tests. |
| `DASH-03` | `adaptive-forecast-card.tsx`, dashboard composition | `src/app/(private)/dashboard/page.tsx`, `src/lib/adaptive-coaching/forecast.ts` | Latest `AdaptiveRecommendation` payload | `tests/program/dashboard-adaptive-forecast.test.ts` | None specific | Moderate | Forecast card exists and is tested, but it depends on broader adaptive lifecycle correctness. |
| `PLAT-01` | Public site through Caddy and Compose | `docker-compose.yml`, `Dockerfile`, `infra/caddy/Caddyfile`, `infra/scripts/deploy.sh`, `infra/scripts/smoke-test-https.sh` | Containerized app/db/caddy topology | No deployment E2E in repo; indirect only | `docs/operations/vps-deploy.md`, `docs/operations/data-protection.md` | Weak | Repo contains deploy assets and runbook, but no automated live deployment verification in CI. |
| `PLAT-02` | Recovery is operator-facing, not user-facing | `infra/scripts/backup.sh`, `infra/scripts/restore.sh`, `infra/scripts/run-restore-drill.sh`, `infra/systemd/coach-restore-drill.*` | PostgreSQL backups and restore target DB | `tests/ops/restore-drill.test.ts` | `docs/operations/restore-drill-runbook.md`, `docs/operations/data-protection.md` | Strong | Backup/restore drill path is script-backed and has dedicated ops test coverage. |
| `PLAT-03` | In-transit and at-rest protections are infrastructure/system concerns | `infra/caddy/Caddyfile`, `docker-compose.yml`, `.env.example`, auth cookie config in `src/lib/auth/auth.ts`, encrypted backup scripts | Session cookie settings, DB credentials, encrypted backups | No dedicated full security suite; indirect auth/ops tests | `docs/operations/data-protection.md`, `docs/operations/vps-deploy.md` | Moderate | Controls are explicit, but proof is split between code, scripts, and docs rather than a single verification path. |

## Requirement-to-Surface Crosswalk

### Public/auth surfaces

- Pages: `src/app/(public)/login/page.tsx`, `src/app/(public)/signup/page.tsx`
- Routes: `src/app/api/auth/*`
- Core modules: `src/lib/auth/auth.ts`, `src/lib/auth/session-gate.ts`, `src/lib/auth/admin-reset.ts`
- Persistence: `User`, `Session`

Requirements covered:

- `AUTH-01`, `AUTH-02`, `AUTH-03`

### Athlete profile surfaces

- Pages: `src/app/(private)/onboarding/page.tsx`, `src/app/(private)/profile/page.tsx`
- Components: `src/components/profile/profile-form.tsx`
- Route: `src/app/api/profile/route.ts`
- Core modules: `src/lib/profile/contracts.ts`, `src/lib/profile/completeness.ts`, `src/server/dal/profile.ts`
- Persistence: `AthleteProfile`

Requirements covered:

- `PROF-01`, `PROF-02`, `PROF-03`, `PROF-04`

### Program planning and daily workout surfaces

- Page: `src/app/(private)/dashboard/page.tsx`
- Components: `today-workout-card.tsx`, `session-logger.tsx`
- Routes: `src/app/api/program/generate/route.ts`, `src/app/api/program/today/route.ts`, substitution routes
- Core modules: `src/lib/program/planner.ts`, `src/lib/program/substitution.ts`, `src/server/services/program-generation.ts`, `src/server/dal/program.ts`
- Persistence: `ProgramPlan`, `PlannedSession`, `PlannedExercise`

Requirements covered:

- `PROG-01`, `PROG-02`, `PROG-03`, `DASH-01`

### Session logging and history surfaces

- Components: `session-logger.tsx`, `session-history-card.tsx`
- Routes: session logging, skip, note, complete, duration, history list/detail
- Core modules: `src/server/services/session-logging.ts`, `src/lib/program/select-today-session.ts`, `src/server/dal/program.ts`
- Persistence: `LoggedSet`, execution metadata on `PlannedSession`, skip metadata on `PlannedExercise`

Requirements covered:

- `LOG-01`, `LOG-02`, `LOG-03`, `LOG-04`

### Adaptive coaching and forecast surfaces

- Components: `adaptive-confirmation-banner.tsx`, `adaptive-forecast-card.tsx`
- Routes: adaptation generate/confirm/reject
- Core modules: `src/lib/adaptive-coaching/*`, `src/server/services/adaptive-coaching.ts`, `src/server/services/adaptive-coaching-policy.ts`, `src/server/dal/adaptive-coaching.ts`
- Optional provider boundary: `src/server/llm/*`
- Persistence: `AdaptiveRecommendation`, `AdaptiveRecommendationDecision`

Requirements covered:

- `ADAP-01`, `ADAP-02`, `ADAP-03`, `SAFE-01`, `SAFE-02`, `SAFE-03`, `DASH-03`

### Trends and production-readiness surfaces

- Components: `trends-summary-card.tsx`, `trends-drilldown.tsx`
- Routes: `src/app/api/program/trends/route.ts`, `src/app/api/program/trends/[exerciseKey]/route.ts`
- Core modules: `src/lib/program/trends.ts`, `src/server/dal/program.ts`
- Ops/deploy controls: `infra/**`, `docs/operations/**`

Requirements covered:

- `DASH-02`, `PLAT-01`, `PLAT-02`, `PLAT-03`

## Coverage Gaps and Weak Evidence

### No browser-level E2E coverage across primary user journeys

Affected requirements:

- `PROG-03`
- `LOG-01` to `LOG-04`
- `ADAP-01` to `ADAP-03`
- `DASH-01` to `DASH-03`

Current evidence relies on route, service, contract, and component tests rather than full click-through flows.

### Deployment and production-hardening proof is mostly script/runbook based

Affected requirements:

- `PLAT-01`
- `PLAT-03`

The repo contains deploy controls and documentation, but no automated live-environment verification artifact in version control.

### Manual recovery requirement is intentionally non-self-service

Affected requirement:

- `AUTH-03`

The evidence is adequate for the chosen design, but the requirement is satisfied through privileged operator procedure rather than a user-facing product flow.

### Adaptive explanation and warning quality are mostly validated structurally

Affected requirements:

- `ADAP-02`
- `SAFE-02`
- `DASH-03`

The repo strongly validates data shape and lifecycle behavior, but user-facing explanation quality is only indirectly proven by surface/view-model tests.

## Priority Follow-up Areas For Later Audit Plans

1. Verify that each "Moderate" or "Weak" row is functionally correct end-to-end, not just structurally present.
2. Review whether route-level and component-level tests are sufficient for dashboard internal-fetch flows.
3. Reconcile operational requirements (`PLAT-*`) with actual deploy/recovery evidence available on a target VPS, not only in source-controlled docs and scripts.
4. Use this matrix as the baseline when classifying missing tests, missing controls, or release blockers in later Phase 07 plans.
