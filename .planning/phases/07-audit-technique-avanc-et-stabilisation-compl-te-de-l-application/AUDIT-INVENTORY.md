# Audit Inventory

Phase 07 baseline inventory for the full audit perimeter. This document is intentionally repo-specific and file-oriented so later audit findings can point back to concrete runtime, persistence, test, and operational surfaces.

## Inventory Method

- Enumerated executable and supporting surfaces under `src/`, `tests/`, `prisma/`, `infra/`, `docs/operations/`, and `scripts/`.
- Recorded entrypoints that affect production behavior, maintenance, deployment, recovery, or evidence collection.
- Grouped files by runtime seam so later audit plans can traverse UI/API -> contracts -> service -> DAL -> schema -> tests -> ops.

## Runtime Entrypoints

| Surface | Files | Notes |
| --- | --- | --- |
| Web pages | `src/app/page.tsx`, `src/app/(public)/*`, `src/app/(private)/*` | Next.js App Router public and authenticated UI surfaces. |
| API routes | `src/app/api/**/route.ts` | HTTP entrypoints for auth, profile, program, logging, adaptation, and trends. |
| Middleware | `src/middleware.ts` | Anonymous prefilter redirect for private pages; not authoritative auth. |
| Server domain logic | `src/lib/**`, `src/server/**` | Shared contracts, planners, safety rules, services, DAL, LLM integration. |
| Persistence | `prisma/schema.prisma`, `prisma/migrations/*` | PostgreSQL schema and migration history. |
| CLI/admin scripts | `scripts/**` | Admin reset and adaptive-knowledge pipeline entrypoints. |
| Deploy and recovery scripts | `infra/scripts/**` | Docker deploy, backup, restore, restore drill, cron install, HTTPS smoke checks. |
| Container/runtime config | `Dockerfile`, `docker-compose.yml`, `next.config.ts`, `package.json`, `.env.example`, `prisma.config.ts` | Build, runtime wiring, env contract, and package scripts. |
| Runbooks | `docs/operations/*.md` | Human procedures for deploy, data protection, auth recovery, and restore drills. |

## Root Runtime and Build Surfaces

| File | Role in audit perimeter |
| --- | --- |
| `package.json` | Defines `dev`, `build`, `start`, `typecheck`, `prisma:generate`, and `test` scripts plus Next.js, Prisma, Zod, OpenAI, Anthropic, Pino, and Recharts dependencies. |
| `pnpm-lock.yaml` | Locks dependency graph for reproducible builds and audits. |
| `next.config.ts` | Minimal Next.js config with `reactStrictMode` enabled. |
| `tsconfig.json` | TypeScript compiler contract for the codebase. |
| `prisma.config.ts` | Prisma config-driven datasource and migrations path. |
| `.env.example` | Baseline env contract for `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL`. |
| `Dockerfile` | Multi-stage Node 22 / pnpm build and runtime image for production deploys. |
| `docker-compose.yml` | Orchestrates `app`, `db`, and `caddy` services, health checks, networks, and named volumes. |

## Application Surface: Pages and Components

### App Router pages

| File | Responsibility |
| --- | --- |
| `src/app/layout.tsx` | Root HTML shell and metadata wrapper. |
| `src/app/page.tsx` | Minimal root landing/status page. |
| `src/app/(public)/login/page.tsx` | Public login UI entrypoint. |
| `src/app/(public)/signup/page.tsx` | Public account creation UI entrypoint. |
| `src/app/(private)/onboarding/page.tsx` | Private onboarding surface for initial athlete profile capture. |
| `src/app/(private)/profile/page.tsx` | Private profile management surface for editing constraints and limitations. |
| `src/app/(private)/dashboard/page.tsx` | Primary authenticated dashboard SSR surface; loads session, today/next workout, adaptive forecast, pending confirmations, and trends. |

### Dashboard-local components

| File | Responsibility |
| --- | --- |
| `src/app/(private)/dashboard/_components/today-workout-card.tsx` | Renders today/next workout session content and action surface. |
| `src/app/(private)/dashboard/_components/session-logger.tsx` | Client interaction surface for logging workout execution. |
| `src/app/(private)/dashboard/_components/session-history-card.tsx` | Dashboard history panel for recent sessions. |
| `src/app/(private)/dashboard/_components/trends-summary-card.tsx` | Dashboard trends summary visualization. |
| `src/app/(private)/dashboard/_components/trends-drilldown.tsx` | Per-exercise trends drilldown visualization. |
| `src/app/(private)/dashboard/components/adaptive-confirmation-banner.tsx` | UI for confirmation-required adaptive recommendations. |
| `src/app/(private)/dashboard/components/adaptive-forecast-card.tsx` | UI for forecasted next-session recommendation state. |
| `src/components/profile/profile-form.tsx` | Shared athlete profile form used by onboarding/profile flows. |

## HTTP API Surface

### Authentication

| File | Method(s) | Responsibility |
| --- | --- | --- |
| `src/app/api/auth/signup/route.ts` | `POST` | Parses signup payload, creates user and initial session, returns created identity. |
| `src/app/api/auth/login/route.ts` | `POST` | Validates credentials, returns generic auth failure on invalid credentials, sets secure session cookie on success. |
| `src/app/api/auth/logout/route.ts` | `POST` | Revokes current session by hashed cookie token and clears the cookie idempotently. |

### Profile

| File | Method(s) | Responsibility |
| --- | --- | --- |
| `src/app/api/profile/route.ts` | `GET`, `PUT` | Authenticated profile read, onboarding upsert, and edit-mode patch flow. |

### Program planning and dashboard

| File | Method(s) | Responsibility |
| --- | --- | --- |
| `src/app/api/program/generate/route.ts` | `POST` | Authenticated weekly plan generation from profile and anchor date. |
| `src/app/api/program/today/route.ts` | `GET` | Authenticated today/next session projection for dashboard. |
| `src/app/api/program/history/route.ts` | `GET` | Authenticated session history list with strict period parsing. |
| `src/app/api/program/sessions/[sessionId]/route.ts` | `GET` | Authenticated detailed session history/drilldown payload. |

### Session logging and mutation routes

| File | Method(s) | Responsibility |
| --- | --- | --- |
| `src/app/api/program/sessions/[sessionId]/exercises/[plannedExerciseId]/sets/route.ts` | `POST`, `PATCH` | Log or adjust performed sets for a planned exercise. |
| `src/app/api/program/sessions/[sessionId]/exercises/[plannedExerciseId]/skip/route.ts` | `POST`, `DELETE` | Mark exercise skipped with reason or revert skip state. |
| `src/app/api/program/sessions/[sessionId]/note/route.ts` | `PATCH` | Persist session note text. |
| `src/app/api/program/sessions/[sessionId]/complete/route.ts` | `POST` | Complete session with readiness/fatigue feedback and duration derivation. |
| `src/app/api/program/sessions/[sessionId]/duration/route.ts` | `PATCH` | Correct completed session duration within the allowed window. |

### Exercise substitution and adaptation

| File | Method(s) | Responsibility |
| --- | --- | --- |
| `src/app/api/program/exercises/[plannedExerciseId]/substitutions/route.ts` | `GET` | Returns valid substitution candidates for a planned exercise. |
| `src/app/api/program/exercises/[plannedExerciseId]/substitute/route.ts` | `POST` | Applies a chosen substitution to a planned exercise. |
| `src/app/api/program/adaptation/route.ts` | `POST` | Generates next-session adaptive recommendation. |
| `src/app/api/program/adaptation/[recommendationId]/confirm/route.ts` | `POST` | Confirms high-impact adaptive recommendation. |
| `src/app/api/program/adaptation/[recommendationId]/reject/route.ts` | `POST` | Rejects recommendation and records fallback behavior. |

### Trends

| File | Method(s) | Responsibility |
| --- | --- | --- |
| `src/app/api/program/trends/route.ts` | `GET` | Authenticated volume/intensity/adherence summary by period. |
| `src/app/api/program/trends/[exerciseKey]/route.ts` | `GET` | Authenticated drilldown trend series for a specific exercise key. |

## Shared Domain Library Surface

### Auth library

| File | Responsibility |
| --- | --- |
| `src/lib/auth/auth.ts` | Core auth service, session token hashing, cookie policy, rolling-session logic, and generic auth error handling. |
| `src/lib/auth/contracts.ts` | Zod contracts for signup, login, and session context parsing. |
| `src/lib/auth/password.ts` | Password policy plus deterministic hash/verify helpers. |
| `src/lib/auth/session-gate.ts` | Authoritative persisted-session validation from cookies or explicit token. |
| `src/lib/auth/admin-reset.ts` | Manual admin reset flow with generic-response behavior. |

### Profile library

| File | Responsibility |
| --- | --- |
| `src/lib/profile/contracts.ts` | Zod schemas for profile onboarding/edit payloads and constraint enums. |
| `src/lib/profile/completeness.ts` | Profile completeness gate used by routing and generation. |

### Program library

| File | Responsibility |
| --- | --- |
| `src/lib/program/types.ts` | Program movement, equipment, and session state enumerations. |
| `src/lib/program/catalog.ts` | Static exercise catalog and indexed lookup map. |
| `src/lib/program/planner.ts` | Deterministic weekly program generation logic. |
| `src/lib/program/contracts.ts` | Request/response contracts for program, history, session logging, substitution, and trends. |
| `src/lib/program/substitution.ts` | Substitution candidate evaluation and application helpers. |
| `src/lib/program/select-today-session.ts` | Projection builders for dashboard today, history list, and session detail payloads. |
| `src/lib/program/trends.ts` | Trend query parsing and trends response contracts. |

### Adaptive coaching library

| File | Responsibility |
| --- | --- |
| `src/lib/adaptive-coaching/types.ts` | Adaptive recommendation enum/value definitions. |
| `src/lib/adaptive-coaching/contracts.ts` | Zod contracts for proposals, recommendations, and confirmation inputs. |
| `src/lib/adaptive-coaching/policy.ts` | Safety bounds, limitation conflict detection, and safety policy application. |
| `src/lib/adaptive-coaching/confidence.ts` | Confidence evaluation and conservative fallback selection. |
| `src/lib/adaptive-coaching/evidence.ts` | Evidence retrieval and explanation envelope shaping. |
| `src/lib/adaptive-coaching/evidence-corpus.ts` | Runtime loading of active validated evidence corpus snapshots. |
| `src/lib/adaptive-coaching/orchestrator.ts` | Deterministic adaptive recommendation pipeline before persistence. |
| `src/lib/adaptive-coaching/forecast.ts` | Dashboard forecast view-model shaping. |

### Shared infra

| File | Responsibility |
| --- | --- |
| `src/lib/db/prisma.ts` | Shared Prisma client bootstrap used by routes, services, and scripts. |

## Server-side Services, DAL, and Provider Integrations

### Server services

| File | Responsibility |
| --- | --- |
| `src/server/services/program-generation.ts` | Combines validated profile input, planner output, and active-plan replacement. |
| `src/server/services/session-logging.ts` | Session lifecycle rules for start, logging, skip, completion, and duration correction. |
| `src/server/services/adaptive-coaching.ts` | High-level recommendation generation, provider wiring, status transitions, confirm/reject flows. |
| `src/server/services/adaptive-coaching-policy.ts` | Recommendation status/policy resolution layer. |

### Data access layer

| File | Responsibility |
| --- | --- |
| `src/server/dal/account-scope.ts` | Account-scope derivation and ownership assertion primitives. |
| `src/server/dal/profile.ts` | Athlete profile persistence and patch merge semantics. |
| `src/server/dal/program.ts` | Program/session/logging/history/trends persistence and projections. |
| `src/server/dal/adaptive-coaching.ts` | Adaptive recommendation persistence, reads, and decision trace writes. |

### LLM/provider boundary

| File | Responsibility |
| --- | --- |
| `src/server/llm/config.ts` | Parses env-driven OpenAI/Anthropic runtime configuration. |
| `src/server/llm/contracts.ts` | Typed provider client contracts. |
| `src/server/llm/schema.ts` | Structured output schema boundary for provider responses. |
| `src/server/llm/client.ts` | Provider chain runtime orchestration. |
| `src/server/llm/observability.ts` | Allowlisted provider attempt metadata shaping. |
| `src/server/llm/providers/openai-client.ts` | OpenAI proposal client integration. |
| `src/server/llm/providers/anthropic-client.ts` | Anthropic proposal client integration. |

## Script Surface

### Admin and maintenance scripts

| File | Responsibility |
| --- | --- |
| `scripts/admin-reset-password.ts` | Interactive admin password reset CLI using Prisma and generic-response reset service. |

### Adaptive knowledge pipeline

| File | Responsibility |
| --- | --- |
| `scripts/adaptive-knowledge/refresh-corpus.ts` | CLI entrypoint for refresh or `--check` corpus pipeline execution. |
| `scripts/adaptive-knowledge/config.ts` | Env/override parsing for approved-domain pipeline config. |
| `scripts/adaptive-knowledge/contracts.ts` | Strict contracts for normalized evidence, principles, manifests, and run reports. |
| `scripts/adaptive-knowledge/pipeline-run.ts` | Main stage runner orchestration for discover/ingest/synthesize/validate/publish. |
| `scripts/adaptive-knowledge/synthesis.ts` | FR synthesis of evidence into principle artifacts. |
| `scripts/adaptive-knowledge/quality-gates.ts` | Candidate snapshot quality gate logic before publish. |
| `scripts/adaptive-knowledge/publish.ts` | Atomic active/rollback pointer promotion and rollback behavior. |
| `scripts/adaptive-knowledge/connectors/shared.ts` | Shared connector fetch/retry helpers. |
| `scripts/adaptive-knowledge/connectors/pubmed.ts` | PubMed evidence source connector. |
| `scripts/adaptive-knowledge/connectors/openalex.ts` | OpenAlex evidence source connector. |
| `scripts/adaptive-knowledge/connectors/crossref.ts` | Crossref evidence source connector. |

## Persistence Surface

### Prisma schema

| File | Responsibility |
| --- | --- |
| `prisma/schema.prisma` | Single PostgreSQL schema covering auth, athlete profile, program plans/sessions/exercises, logged sets, adaptive recommendations, and decision traces. |

### Migration history

| File | Responsibility |
| --- | --- |
| `prisma/migrations/0001_init_auth/migration.sql` | Initial auth/user/session schema. |
| `prisma/migrations/0002_athlete_profile_constraints/migration.sql` | Athlete profile and constraints tables/fields. |
| `prisma/migrations/0003_program_planning_init/migration.sql` | Program plan, planned session, and planned exercise foundations. |
| `prisma/migrations/0004_session_logging_init/migration.sql` | Logged sets and session execution metadata. |
| `prisma/migrations/0005_adaptive_recommendation_foundation/migration.sql` | Adaptive recommendation lifecycle and decision trace schema. |

### Schema entity perimeter

- `User`, `Session`: account and persistent session model.
- `AthleteProfile`: goal, schedule, equipment, duration, and limitations state.
- `ProgramPlan`, `PlannedSession`, `PlannedExercise`: generated programming plus execution anchors.
- `LoggedSet`: performed set records tied to planned exercise and session.
- `AdaptiveRecommendation`, `AdaptiveRecommendationDecision`: recommendation lifecycle, fallback, and traceability.

## Test Surface

### Auth tests

| File | Coverage focus |
| --- | --- |
| `tests/auth/contracts.test.ts` | Auth request/session contract parsing. |
| `tests/auth/session-gate.test.ts` | Persisted-session validation and cookie gate behavior. |
| `tests/auth/session-lifecycle.test.ts` | Signup/login/logout/session persistence lifecycle. |
| `tests/auth/admin-reset.test.ts` | Admin reset semantics and generic response behavior. |
| `tests/auth/schema-auth-model.test.mjs` | Prisma auth schema expectations. |

### Profile tests

| File | Coverage focus |
| --- | --- |
| `tests/profile/profile-contracts.test.ts` | Profile contract parsing and validation. |
| `tests/profile/profile-route.test.ts` | Profile route behavior for onboarding/edit/auth. |
| `tests/profile/onboarding-gate.test.ts` | Onboarding completeness and route gating. |

### Program, dashboard, trends, and logging tests

| File | Coverage focus |
| --- | --- |
| `tests/program/contracts.test.ts` | Program contracts baseline. |
| `tests/program/planner.test.ts` | Deterministic planner behavior. |
| `tests/program/substitution.test.ts` | Exercise substitution rules and application. |
| `tests/program/program-dal.test.ts` | Program DAL reads/writes and ownership-sensitive behavior. |
| `tests/program/program-generate-route.test.ts` | Program generation route behavior. |
| `tests/program/dashboard-today-surface.test.ts` | Dashboard today/next workout surface. |
| `tests/program/program-session-logging-route.test.ts` | Session logging mutation route behavior. |
| `tests/program/session-history-surface.test.ts` | Session history list/detail behavior. |
| `tests/program/program-dal-trends.test.ts` | Trends aggregation DAL logic. |
| `tests/program/program-trends-contracts.test.ts` | Trends contracts. |
| `tests/program/program-trends-route.test.ts` | Trends route behavior. |
| `tests/program/dashboard-trends-surface.test.ts` | Dashboard trends summary/drilldown presentation logic. |
| `tests/program/dashboard-adaptive-forecast.test.ts` | Adaptive forecast dashboard surface. |

### Adaptive coaching and provider tests

| File | Coverage focus |
| --- | --- |
| `tests/program/adaptive-coaching-contracts.test.ts` | Adaptive recommendation contracts. |
| `tests/program/adaptive-coaching-policy.test.ts` | Safety policy and recommendation policy behavior. |
| `tests/program/adaptive-coaching-service.test.ts` | Adaptive coaching service orchestration. |
| `tests/program/adaptive-coaching-fallback.test.ts` | Conservative fallback behavior. |
| `tests/program/adaptive-coaching-confirm-route.test.ts` | Confirmation route semantics. |
| `tests/program/adaptive-coaching-provider-config.test.ts` | Provider env/runtime config parsing. |
| `tests/program/adaptive-coaching-provider-contracts.test.ts` | Provider request/response contracts. |
| `tests/program/adaptive-coaching-provider-observability.test.ts` | Allowlisted observability payloads. |
| `tests/program/adaptive-coaching-provider-retry.test.ts` | Primary retry behavior. |
| `tests/program/adaptive-coaching-provider-fallback.test.ts` | Anthropic fallback behavior. |
| `tests/program/adaptive-coaching-provider-integration.test.ts` | Provider integration path. |

### Adaptive knowledge pipeline tests

| File | Coverage focus |
| --- | --- |
| `tests/program/adaptive-knowledge-contracts.test.ts` | Pipeline contract validation. |
| `tests/program/adaptive-knowledge-config.test.ts` | Pipeline config/env parsing. |
| `tests/program/adaptive-knowledge-connectors.test.ts` | Connector behavior and error handling. |
| `tests/program/adaptive-knowledge-pipeline-run.test.ts` | Stage runner orchestration. |
| `tests/program/adaptive-knowledge-publish.test.ts` | Atomic publish/rollback behavior. |
| `tests/program/adaptive-evidence-corpus-loader.test.ts` | Runtime corpus loading fallback chain. |

### Security and ops tests

| File | Coverage focus |
| --- | --- |
| `tests/security/account-isolation.test.ts` | Cross-account access masking and ownership enforcement. |
| `tests/ops/restore-drill.test.ts` | Restore drill script and recoverability logic. |

## Infrastructure and Operations Surface

### Infra configuration and executable ops assets

| File | Responsibility |
| --- | --- |
| `infra/caddy/Caddyfile` | HTTPS termination, forwarding headers, and app reverse proxy behavior. |
| `infra/scripts/deploy.sh` | Docker Compose deployment wrapper with optional HTTPS smoke test. |
| `infra/scripts/backup.sh` | Encrypted PostgreSQL dump creation using OpenSSL AES-256. |
| `infra/scripts/restore.sh` | Guardrailed restore into dedicated target DB using decrypted backup and single-transaction `psql`. |
| `infra/scripts/run-restore-drill.sh` | End-to-end monthly drill wrapper with evidence log and smoke checks. |
| `infra/scripts/smoke-test-https.sh` | External HTTPS reachability smoke test. |
| `infra/scripts/install-adaptive-corpus-cron.sh` | Weekly cron installation for adaptive knowledge refresh. |
| `infra/systemd/coach-restore-drill.service` | VPS service unit for monthly restore drill. |
| `infra/systemd/coach-restore-drill.timer` | Monthly persistent timer for restore drill scheduling. |

### Human runbooks

| File | Responsibility |
| --- | --- |
| `docs/operations/vps-deploy.md` | VPS deployment, env setup, health verification, and update procedure. |
| `docs/operations/data-protection.md` | In-transit, at-rest, secret handling, and restore drill baseline controls. |
| `docs/operations/auth-recovery.md` | Manual admin password reset procedure and security notes. |
| `docs/operations/restore-drill-runbook.md` | Restore drill prerequisites, procedure, evidence markers, and failure handling. |

## Trust-Boundary-Relevant Surfaces

- `src/middleware.ts`: first browser-facing redirect boundary for private routes.
- `src/lib/auth/session-gate.ts`: authoritative persisted-session validation boundary.
- `src/server/dal/account-scope.ts`: central account-scope and ownership assertion boundary.
- `src/app/(private)/dashboard/page.tsx`: SSR page that performs internal authenticated fetches to app API routes.
- `src/server/llm/config.ts`, `src/server/llm/client.ts`, `src/server/llm/providers/*`: outbound provider boundary.
- `scripts/adaptive-knowledge/connectors/*`: outbound scientific-source ingestion boundary.
- `docker-compose.yml`, `infra/caddy/Caddyfile`, `infra/scripts/*.sh`: deploy, secret, and recovery boundary.

## Inventory Notes for Later Audit Plans

- The repo contains a small but complete vertical stack: UI, authenticated APIs, domain services, DAL, Prisma, tests, deploy scripts, and operations runbooks.
- The dashboard page is a notable orchestration surface because it mixes server-side session resolution, internal API fetches, and adaptive/trends composition.
- The adaptive subsystem has two distinct execution paths that later audits should treat separately:
  - runtime recommendation generation in `src/lib` and `src/server`
  - offline/administrative evidence pipeline in `scripts/adaptive-knowledge`
- Operational readiness is script- and runbook-driven rather than platform-managed, so later audit plans must evaluate executable scripts and operator docs together.
