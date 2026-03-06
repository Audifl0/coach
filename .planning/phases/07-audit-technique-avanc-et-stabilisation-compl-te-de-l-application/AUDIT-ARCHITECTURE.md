# Audit Architecture Map

Architecture baseline for Phase 07. This is a read-only map of how the repository is actually structured today, where trust boundaries sit, and how requests and data move through the stack.

## System Shape

The application is a single Next.js 16 App Router service backed by PostgreSQL via Prisma, deployed through Docker Compose with Caddy as the public TLS/reverse-proxy edge.

High-level runtime stack:

1. Browser -> Caddy (`infra/caddy/Caddyfile`)
2. Caddy -> Next.js app container (`docker-compose.yml`, `Dockerfile`)
3. Next.js pages and route handlers (`src/app/**`)
4. Shared contracts and domain logic (`src/lib/**`)
5. Server services and DAL (`src/server/**`)
6. Prisma client and PostgreSQL schema (`src/lib/db/prisma.ts`, `prisma/schema.prisma`)
7. Operational scripts and runbooks (`infra/**`, `docs/operations/**`)

## Layer Responsibilities

| Layer | Primary files | Responsibility | Depends on |
| --- | --- | --- | --- |
| Edge/network | `infra/caddy/Caddyfile`, `docker-compose.yml` | Public HTTPS termination, forwarded headers, service orchestration, health checks | Docker, app container, db container |
| App routing | `src/app/**`, `src/middleware.ts` | Pages, SSR composition, HTTP handlers, anonymous prefilter redirects | contracts, services, DAL, Next.js runtime |
| Shared domain logic | `src/lib/auth/**`, `src/lib/profile/**`, `src/lib/program/**`, `src/lib/adaptive-coaching/**` | Validation, planning, safety policy, response shaping, session rules, adaptive orchestration | Zod, shared types, occasionally server-side repos passed in |
| Server orchestration | `src/server/services/**` | Multi-step use cases combining profile/program/adaptive rules with persistence | `src/lib/**`, DAL |
| Data access layer | `src/server/dal/**` | Account-scoped Prisma reads/writes, ownership enforcement, transactional updates | Prisma client, account scope contract |
| Provider/integration boundary | `src/server/llm/**`, `scripts/adaptive-knowledge/**` | Outbound LLM calls and outbound scientific evidence ingestion | env config, external APIs |
| Persistence | `prisma/schema.prisma`, `prisma/migrations/*` | Storage model and migration history | PostgreSQL |
| Verification/ops | `tests/**`, `infra/scripts/**`, `infra/systemd/**`, `docs/operations/**` | Automated regression coverage and operator procedures | Runtime contracts, deploy topology |

## Dependency Direction

Observed dependency direction is mostly one-way and layered:

- `src/app/**` imports from `src/lib/**` and `src/server/**`.
- `src/server/services/**` imports from `src/lib/**` and `src/server/dal/**`.
- `src/server/dal/**` imports account-scope helpers and Prisma-facing types.
- `src/lib/**` is mostly domain-level and contract-level logic, intentionally reusable by routes, services, and tests.
- `tests/**` target all runtime layers directly.
- `infra/**` and `docs/operations/**` are external to the TypeScript import graph but are operational dependencies for production.

Important exception:

- `src/app/(private)/dashboard/page.tsx` performs internal authenticated fetches to the app's own API routes (`/api/program/today`, `/api/program/trends`) instead of calling DAL/service helpers directly. That creates an extra server-to-server seam inside the same deployment unit.

## Repository Seams

### 1. Public vs private app surface

| Zone | Files | Notes |
| --- | --- | --- |
| Public UI | `src/app/page.tsx`, `src/app/(public)/login/page.tsx`, `src/app/(public)/signup/page.tsx` | No authenticated session required. |
| Private UI | `src/app/(private)/dashboard/page.tsx`, `src/app/(private)/onboarding/page.tsx`, `src/app/(private)/profile/page.tsx` | User-facing authenticated surfaces. |
| Private-route prefilter | `src/middleware.ts` | Redirects anonymous access to login based on cookie presence only. |
| Authoritative auth gate | `src/lib/auth/session-gate.ts` | Validates cookie token against persisted, non-revoked, non-expired session record. |

Architectural implication:

- Middleware is a UX convenience seam.
- True authorization lives inside route handlers, server pages, and DAL scoping.

### 2. Route handler to service seam

There are two route styles in the repo:

- thin route -> service -> DAL
- thin route -> DAL directly -> projection helper

Examples:

- `src/app/api/program/generate/route.ts` -> `src/server/services/program-generation.ts` -> `src/server/dal/profile.ts` + `src/server/dal/program.ts`
- `src/app/api/program/adaptation/route.ts` -> `src/server/services/adaptive-coaching.ts` -> `src/server/dal/profile.ts` + `src/server/dal/program.ts` + `src/server/dal/adaptive-coaching.ts`
- `src/app/api/program/today/route.ts` -> `src/server/dal/program.ts` -> `src/lib/program/select-today-session.ts`
- `src/app/api/program/history/route.ts` -> `src/server/dal/program.ts` -> `src/lib/program/contracts.ts`

This indicates a pragmatic split:

- complex multi-step business rules get a service layer
- projection-heavy read routes frequently use DAL + projection helpers directly

### 3. Contract seam

Zod contracts are a core architectural pattern.

Key contract centers:

- `src/lib/auth/contracts.ts`
- `src/lib/profile/contracts.ts`
- `src/lib/program/contracts.ts`
- `src/lib/program/trends.ts`
- `src/lib/adaptive-coaching/contracts.ts`
- `scripts/adaptive-knowledge/contracts.ts`

These contracts define:

- request payload parsing
- response payload validation
- enum/value boundaries
- cross-layer type normalization for tests and routes

### 4. Account-scope seam

`src/server/dal/account-scope.ts` is the central trust seam for per-user isolation.

Functions:

- `requireAccountScope(...)`
- `assertAccountOwnership(...)`
- `buildAccountScopedWhere(...)`

This module is the architectural hinge between:

- session-derived identity from auth/session-gate
- DAL queries and mutations against Prisma

### 5. Offline knowledge pipeline seam

The adaptive knowledge pipeline is not part of the Next.js request path. It is a separate operational subsystem:

- entrypoint: `scripts/adaptive-knowledge/refresh-corpus.ts`
- config: `scripts/adaptive-knowledge/config.ts`
- connectors: `scripts/adaptive-knowledge/connectors/*`
- publish/rollback: `scripts/adaptive-knowledge/publish.ts`
- runtime reader: `src/lib/adaptive-coaching/evidence-corpus.ts`

This creates an explicit seam between:

- offline evidence curation and publication
- online recommendation-time evidence loading

## Trust Boundaries

### Boundary A: Browser to edge

Files:

- `infra/caddy/Caddyfile`
- `docker-compose.yml`

Trust assumptions:

- TLS terminates at Caddy.
- Forwarded headers (`X-Forwarded-Proto`, `X-Forwarded-Host`, `X-Forwarded-For`, `X-Real-IP`) are treated as trusted by the app because Caddy is the only intended public ingress.

### Boundary B: Edge to application runtime

Files:

- `src/app/**`
- `src/middleware.ts`
- `src/app/(private)/dashboard/page.tsx`

Trust assumptions:

- Next.js route handlers and server pages trust the container-local runtime and incoming forwarded headers.
- Dashboard SSR uses request headers to reconstruct origin for internal fetches.

### Boundary C: Session identity to account scope

Files:

- `src/lib/auth/session-gate.ts`
- `src/server/dal/account-scope.ts`
- route handlers using `validateSessionFromCookies(...)`

Trust assumptions:

- only persisted, active session rows create user identity
- user identity is not accepted from request payloads
- account ownership is re-asserted in DAL-facing access paths

### Boundary D: App to database

Files:

- `src/lib/db/prisma.ts`
- `src/server/dal/profile.ts`
- `src/server/dal/program.ts`
- `src/server/dal/adaptive-coaching.ts`
- `prisma/schema.prisma`

Trust assumptions:

- Prisma is the only write path to PostgreSQL
- DAL is expected to enforce account scoping and transaction boundaries before writes

### Boundary E: App to external LLM providers

Files:

- `src/server/llm/config.ts`
- `src/server/llm/client.ts`
- `src/server/llm/providers/openai-client.ts`
- `src/server/llm/providers/anthropic-client.ts`

Trust assumptions:

- real-provider mode is env-gated
- primary/fallback chain is bounded and deterministic
- structured output is re-validated before acceptance
- observability metadata is allowlisted

### Boundary F: Pipeline to external scientific sources

Files:

- `scripts/adaptive-knowledge/connectors/pubmed.ts`
- `scripts/adaptive-knowledge/connectors/openalex.ts`
- `scripts/adaptive-knowledge/connectors/crossref.ts`
- `scripts/adaptive-knowledge/config.ts`

Trust assumptions:

- sources are restricted to an approved-domain allowlist
- pipeline failures should not corrupt active runtime corpus
- candidate artifacts are promoted atomically via active/rollback pointers

### Boundary G: Operator to production controls

Files:

- `infra/scripts/deploy.sh`
- `infra/scripts/backup.sh`
- `infra/scripts/restore.sh`
- `infra/scripts/run-restore-drill.sh`
- `infra/systemd/coach-restore-drill.*`
- `docs/operations/*.md`

Trust assumptions:

- operators run scripts with correct env files and secrets
- backup passphrase stays outside source control
- restore drills target a dedicated non-production database

## Major Data Flows

### Auth lifecycle

1. Browser submits signup/login payload.
2. Route handler parses request JSON (`src/app/api/auth/*/route.ts`).
3. `src/lib/auth/auth.ts` validates payload, hashes password/session token, and builds cookie metadata.
4. Prisma user/session records are created via route-local repository functions.
5. Later requests resolve identity through `src/lib/auth/session-gate.ts`.
6. Logout revokes the persisted session by hashed token and clears cookie.

### Onboarding/profile flow

1. Private onboarding/profile UI submits profile payload.
2. `src/app/api/profile/route.ts` resolves current session and validates onboarding or edit payload with `src/lib/profile/contracts.ts`.
3. `src/server/dal/profile.ts` performs upsert or merged patch write keyed by `userId`.
4. `src/lib/profile/completeness.ts` feeds routing decisions for onboarding vs dashboard.

### Program generation flow

1. User triggers plan generation.
2. `src/app/api/program/generate/route.ts` parses `ProgramGenerateInput`.
3. `src/server/services/program-generation.ts` loads profile, validates completeness, and calls `buildWeeklyProgramPlan(...)`.
4. `src/server/dal/program.ts` replaces active plan/session/exercise records.
5. Result is returned as structured plan/session payload.

### Dashboard read flow

1. `src/app/(private)/dashboard/page.tsx` validates session and route state.
2. The page fetches `/api/program/today` and `/api/program/trends?period=30d` using reconstructed origin plus forwarded cookies.
3. Program DAL resolves today/next session and trends summary.
4. Dashboard page also directly loads latest adaptive recommendation via adaptive DAL.
5. Page composes today workout, adaptive forecast/banner, trends summary, and history section order.

### Session logging flow

1. Dashboard client actions hit mutation routes under `src/app/api/program/sessions/**`.
2. Routes validate request contracts and session ownership.
3. `src/server/services/session-logging.ts` enforces lifecycle invariants:
   - session must exist
   - completed session cannot be mutated
   - first logged set can mark session started
   - duration corrections are limited to a 24-hour window
4. `src/server/dal/program.ts` persists set rows, skip flags, notes, completion metadata, and duration corrections.

### Adaptive coaching flow

1. User triggers recommendation generation via `src/app/api/program/adaptation/route.ts`.
2. Service loads profile, today/next target session, recent history, and latest recommendation.
3. Proposal source is chosen:
   - deterministic local default
   - or real-provider chain through `src/server/llm/*`
4. `src/lib/adaptive-coaching/orchestrator.ts` applies confidence, evidence, SAFE bounds, limitation conflicts, and confirmation-window logic.
5. `src/server/dal/adaptive-coaching.ts` persists recommendation and decision trace.
6. Confirm/reject routes transition status and may create conservative fallback recommendation.

### Trends flow

1. Dashboard or client drilldown calls summary/drilldown trends routes.
2. Routes parse bounded period query.
3. `src/server/dal/program.ts` aggregates summary metrics and exercise series from completed session data.
4. Response is validated before UI rendering.

### Recovery flow

1. Operator runs `infra/scripts/backup.sh` to create encrypted dump.
2. Operator or timer runs `infra/scripts/run-restore-drill.sh`.
3. Wrapper locates or creates encrypted backup, invokes `infra/scripts/restore.sh`, then performs smoke checks against `/login` and `/dashboard`.
4. Timestamped evidence log is written for audit history.

## Enforcement Zones

| Concern | Primary enforcement zone | Supporting files |
| --- | --- | --- |
| Anonymous/private route split | `src/middleware.ts` plus server-page redirects | `src/app/(private)/dashboard/page.tsx` |
| Authoritative session validity | `src/lib/auth/session-gate.ts` | auth routes, profile/program routes |
| Request validation | `src/lib/*/contracts.ts`, `src/lib/program/trends.ts` | route handlers |
| Account ownership | `src/server/dal/account-scope.ts` | program/adaptive DAL and masked route errors |
| Recommendation safety | `src/lib/adaptive-coaching/policy.ts`, `src/lib/adaptive-coaching/confidence.ts`, `src/lib/adaptive-coaching/orchestrator.ts` | adaptive service, confirm/reject routes |
| Persistence lifecycle | `src/server/services/session-logging.ts`, `src/server/dal/program.ts`, `src/server/dal/adaptive-coaching.ts` | Prisma schema |
| External provider gating | `src/server/llm/config.ts`, `src/server/llm/client.ts` | provider clients, service wiring |
| Recovery guardrails | `infra/scripts/restore.sh`, `infra/scripts/run-restore-drill.sh` | systemd timer, runbook |

## Architectural Hotspots For Later Audit Plans

### Dashboard internal API loop

`src/app/(private)/dashboard/page.tsx` is both a page-composition seam and a performance/trust hotspot because it:

- reconstructs origin from forwarded headers
- forwards cookies into server-side internal fetches
- mixes direct DAL access with route round-trips inside the same app

### DAL-centric account isolation

The codebase depends heavily on DAL scoping rather than only route-level checks. Later audits should treat `src/server/dal/account-scope.ts` and its callers as a release-critical seam.

### Recommendation lifecycle transitions

`src/server/services/adaptive-coaching.ts` and `src/server/dal/adaptive-coaching.ts` own the most stateful workflow in the app:

- proposal selection
- safety transformation
- persistence
- confirm/reject transition rules
- fallback recommendation creation

### Script-driven operations

Production controls are expressed in Bash, Compose, Caddy, and runbooks, not in a managed platform. That means production readiness depends on code and operator procedure remaining aligned.

## Architecture Summary

- The repo uses a clear vertical architecture with Next.js routes/pages on top, reusable contract/domain logic in `src/lib`, explicit service and DAL seams in `src/server`, and Prisma-backed persistence underneath.
- Auth and account isolation are intentionally layered: cookie presence for UX, persisted session validation for authority, and DAL scoping for data ownership.
- Adaptive coaching and adaptive knowledge ingestion are separate subsystems connected by a published evidence-corpus boundary.
- The two most cross-cutting seams are:
  - dashboard SSR composition with internal authenticated fetches
  - adaptive recommendation lifecycle with provider, policy, and persistence coordination
