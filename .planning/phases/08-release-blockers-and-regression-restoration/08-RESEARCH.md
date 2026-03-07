# Phase 08 Research: Release blockers and regression restoration

**Date:** 2026-03-06
**Scope:** `RB-01` to `RB-04` only
**Inputs used:** `08-CONTEXT.md`, phase 07 audit/report/backlog/ops notes, `REQUIREMENTS.md`, `STATE.md`

## Current evidence snapshot

- `corepack pnpm build` fails because `src/middleware.ts` imports `SESSION_COOKIE_NAME` from `src/lib/auth/auth.ts`, which pulls `node:crypto` into the Edge import path through `src/lib/auth/password.ts`.
- `corepack pnpm test` is red only on the two audited adaptive regressions:
  - `tests/program/adaptive-coaching-confirm-route.test.ts`
  - `tests/program/adaptive-coaching-service.test.ts`
- `corepack pnpm prisma:generate` succeeds and removes the stale `prisma.loggedSet` type error from the earlier `typecheck` output. Treat Prisma client generation as phase-08 preflight, not as a standalone remediation track.
- After regenerating Prisma, the remaining `typecheck` failures collapse into a few bounded source clusters instead of one monolithic repo-wide break.

## Phase guardrails

- Keep the approved backlog order: `RB-01` -> `RB-02` -> `RB-03` -> `RB-04`.
- Execute in bounded waves. Do not mix release-blocker work with `STAB-*` or cleanup items.
- Preserve current behavior except where the audit identified broken or unsafe behavior.
- Do not absorb non-blocking work such as the `middleware` -> `proxy` migration, `turbopack.root` warning cleanup, CI design, or env-contract consolidation into this phase.

## Recommended wave sequencing

### Wave 0: Baseline refresh

Purpose: remove stale generated-client noise before planning or implementation work starts.

- Run `corepack pnpm prisma:generate`.
- Re-run `corepack pnpm typecheck` to confirm the real RB-01 source clusters.
- Do not count this as a separate backlog item; it is a preflight for `RB-01`.

### Wave 1: RB-01 build unblock

Purpose: restore a trustworthy production-build path before touching security and adaptive fixes.

- Split the Edge-safe auth constants used by middleware away from Node-only auth/password code.
- Re-run `corepack pnpm build` immediately after this wave.

### Wave 2: RB-01 typecheck restoration

Purpose: finish compile health by fixing the remaining bounded clusters without broad refactors.

- Sync dashboard/program contracts.
- Reconcile profile completeness typing.
- Reconcile LLM/provider adapter typings.
- Update only the test fixtures that drifted because shared contracts tightened.
- Exit gate: `corepack pnpm typecheck`.

### Wave 3: RB-02 deploy secret hardening

Purpose: close the documented secret-exposure path while keeping the current deploy model.

- Harden ignore rules and Docker build context.
- Move the documented production env path outside the repo root by default.
- Exit gate: ignore/build-context proof plus deploy-script compatibility.

### Wave 4: RB-03 auth abuse protection

Purpose: add runtime-enforced login/signup throttling with operator visibility, without building a generic abuse platform.

- Add app-layer throttling on public auth routes.
- Add minimal structured logging for limit hits and repeated failures.
- Exit gate: repeated requests return `429` and operators can see the event.

### Wave 5: RB-04 adaptive contract restoration

Purpose: restore the two audited adaptive regressions after build and typecheck are trustworthy.

- Fix pending-confirmation lifecycle drift.
- Fix deterministic evidence `topK` behavior against the current runtime corpus.
- Exit gate: targeted adaptive tests, then `corepack pnpm test`.

## RB-01: Restore green compile and production build gates

### Hotspots

- Build/Edge import seam:
  - `src/middleware.ts`
  - `src/lib/auth/auth.ts`
  - `src/lib/auth/password.ts`
- Dashboard/program contract drift:
  - `src/app/api/program/today/route.ts`
  - `src/app/(private)/dashboard/page.tsx`
  - `src/app/(private)/dashboard/_components/today-workout-card.tsx`
  - `src/lib/program/contracts.ts`
  - `src/lib/program/types.ts`
  - `src/lib/program/select-today-session.ts`
  - `tests/program/dashboard-today-surface.test.ts`
  - `tests/program/dashboard-adaptive-forecast.test.ts`
- Profile completeness typing drift:
  - `src/lib/profile/completeness.ts`
  - `src/server/services/program-generation.ts`
  - `src/app/(private)/dashboard/page.tsx`
- Provider/LLM typing drift:
  - `src/server/services/adaptive-coaching.ts`
  - `src/server/llm/client.ts`
  - `src/server/llm/providers/openai-client.ts`
  - `src/server/llm/providers/anthropic-client.ts`
  - `src/server/llm/schema.ts`
  - `src/server/llm/config.ts`
  - `src/lib/adaptive-coaching/evidence-corpus.ts`
  - `tests/program/adaptive-coaching-provider-config.test.ts`
- Test-only contract fallout that should be fixed after source contracts stabilize:
  - `tests/program/program-session-logging-route.test.ts`
  - `tests/program/program-dal.test.ts`
  - `tests/program/substitution.test.ts`

### Repo-specific implementation approach

#### 1. Edge-safe auth split

Preferred bounded fix:

- Extract `SESSION_COOKIE_NAME` and any other middleware-safe auth constants into a small Edge-safe module, for example `src/lib/auth/session-contract.ts`.
- Keep `src/middleware.ts` importing only that module.
- Do not import `hashSessionToken`, password helpers, or any file that touches `node:crypto` from middleware.

Why this is the right seam here:

- The build failure is not auth behavior drift; it is import-graph contamination from a constant living in a Node-only module.
- This keeps the current middleware behavior intact and avoids a broader auth redesign.

#### 2. Dashboard/program contract sync

Preferred bounded fix:

- Replace local route/component session-state literals with shared `SessionState` or `ProgramSessionSummary` shapes.
- Stop narrowing route deps to `'planned' | 'completed' | 'skipped'` when the shared contract still includes `'started'`.
- Tighten `toPendingConfirmationBannerData(...)` so its return value is statically narrowed to the banner contract instead of widening `actionType` to `string`.
- Resolve nullable-session handler warnings in dashboard helpers/components rather than suppressing them.

Why this is the right seam here:

- The failure cluster is contract drift between shared program types and local helper types, not a broken business rule.
- The affected test files mirror the same local drift, so source fixes should land before test-fixture repair.

#### 3. Profile completeness generalization

Preferred bounded fix:

- Change `isProfileComplete(...)` to accept the minimal profile shape it actually reads, rather than a full DAL record.
- Remove existing `as never` suppression at the dashboard and program-generation call sites.

Why this is the right seam here:

- Current callers already pass validated profile data.
- This is a small type-boundary repair and should not become a profile refactor.

#### 4. Provider/LLM typing reconciliation

Preferred bounded fix:

- In `src/server/llm/client.ts`, narrow `LlmAttemptResult` before reading `fallbackReason`.
- In `src/server/llm/providers/openai-client.ts`, normalize `_request_id` nullable handling to the actual SDK return type.
- In `src/server/llm/providers/anthropic-client.ts`, pass a mutable schema shape instead of a fully `as const` readonly object when the SDK expects mutable `required: string[]`.
- In `src/server/llm/config.ts`, accept test fixtures without requiring a fully populated `NodeJS.ProcessEnv`.
- In `src/lib/adaptive-coaching/evidence-corpus.ts`, give the legacy index reader a typed `version` field.
- In `src/server/services/adaptive-coaching.ts`, stop returning readonly array fields where mutable arrays are expected by downstream types.

Why this is the right seam here:

- These errors are adapter/config drift from stricter TS and SDK surfaces.
- They should stay isolated from `RB-04` behavior repairs.

### Validation strategy

- After the Edge-safe auth split: `corepack pnpm build`
- After the full RB-01 cluster: `corepack pnpm typecheck`
- Recommended targeted reruns before the final gate:
  - `corepack pnpm test -- tests/auth/session-lifecycle.test.ts`
  - `corepack pnpm test -- tests/program/dashboard-today-surface.test.ts`
  - `corepack pnpm test -- tests/program/dashboard-adaptive-forecast.test.ts`
  - `corepack pnpm test -- tests/program/adaptive-coaching-provider-config.test.ts`

### Sequencing notes

- Run `prisma generate` before spending time on any Prisma-related type errors.
- Do not touch `src/app/api/program/sessions/[sessionId]/route.ts` for the stale `loggedSet` issue unless it persists after regeneration.
- Keep test-harness cleanup last inside RB-01 so source contracts settle first.

## RB-02: Fix unsafe production secret handling in deploy workflow

### Hotspots

- `.gitignore`
- `.dockerignore` (currently missing)
- `Dockerfile`
- `docker-compose.yml`
- `docs/operations/vps-deploy.md`
- `docs/operations/data-protection.md`
- `docs/operations/restore-drill-runbook.md`
- `infra/scripts/deploy.sh`
- `infra/scripts/backup.sh`
- `infra/scripts/restore.sh`
- `infra/scripts/run-restore-drill.sh`
- `infra/systemd/coach-restore-drill.service`

### Repo-specific implementation approach

Preferred bounded fix:

- Change the documented default production env path from repo-root `.env.production` to a server-only path outside the checkout, preferably `/opt/coach/.env.production`.
- Add `.gitignore` coverage for `.env.production` and related production env variants as a safety net.
- Add a `.dockerignore` that excludes `.env*` and other secret-bearing local artifacts from the build context.
- Keep `Dockerfile` as-is if the build context is properly filtered. Phase 08 does not need a broader Dockerfile redesign.
- Keep scripts parameterized by `ENV_FILE`; update docs/examples to pass the external absolute path explicitly.

Why this is the right seam here:

- The scripts already accept an env-file argument, so the repo can be hardened without changing the deploy model.
- The systemd restore-drill service already points to `/opt/coach/.env.production`, so the docs should align with the safer existing operational path.

### Validation strategy

- `git check-ignore .env.production`
- Create a temporary sentinel `.env.production` in the repo root and prove it is not present in the built image after `docker build`.
- Verify deploy/backup/restore examples still work with an explicit external env path:
  - `infra/scripts/deploy.sh /opt/coach/.env.production`
  - `infra/scripts/backup.sh /opt/coach/.env.production`
  - `infra/scripts/restore.sh <backup> /opt/coach/.env.production`

### Sequencing notes

- Do not expand this wave into full env-contract consolidation. That belongs to later operational hardening.
- The key release proof is safety against git history and Docker context leakage, not broader doc cleanup.

## RB-03: Add brute-force protection on public auth routes

### Hotspots

- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/signup/route.ts`
- `src/app/(public)/login/page.tsx`
- `src/app/(public)/signup/page.tsx`
- `infra/caddy/Caddyfile`
- `package.json` (`pino` is already available but unused)
- `tests/auth/session-lifecycle.test.ts`

### Repo-specific implementation approach

Preferred bounded fix:

- Add a small app-layer auth limiter module, scoped only to login/signup.
- Key login throttling by normalized username + client IP and signup throttling by client IP.
- Read client identity from forwarded headers already supplied by Caddy (`X-Forwarded-For`, `X-Real-IP`).
- Inject limiter and logging dependencies into `createLoginHandler(...)` and `createSignupHandler(...)` so route tests can cover the behavior without DB or proxy wiring.
- Return `429` with `Retry-After` on enforcement, while preserving the existing generic invalid-credentials behavior for non-limited failures.
- Emit a minimal structured log event for limit hits and repeated failures. A thin `pino` logger is acceptable here because the dependency already exists.

Why this is the right seam here:

- The current deploy target is a single VPS/container, so a process-local limiter is acceptable for this phase.
- Caddy already forwards the needed headers and logs to stdout; adding a Caddy rate-limit plugin would broaden blast radius and deployment complexity.
- The signup page auto-signs users in after account creation, so limiter policy should be narrow and failure-focused rather than a global auth throttle.

### Validation strategy

- Add targeted route tests for:
  - repeated failed login attempts returning `429`
  - repeated signup attempts returning `429`
  - successful login clearing or bypassing the failure bucket
  - generic `401` behavior remaining unchanged before the threshold
  - operator log event emission on throttle
- Manual verification with repeated `curl` requests carrying a fixed `X-Forwarded-For` value against `/api/auth/login` and `/api/auth/signup`

### Sequencing notes

- Keep this wave app-layer only unless implementation proves impossible.
- Do not build a shared abuse platform, account lockout UX, or user-facing login history in this phase.

## RB-04: Restore adaptive regression contracts

### Hotspots

- `src/server/services/adaptive-coaching.ts`
- `src/lib/adaptive-coaching/orchestrator.ts`
- `src/lib/adaptive-coaching/evidence.ts`
- `src/lib/adaptive-coaching/evidence-corpus.ts`
- `.planning/knowledge/adaptive-coaching/index.json`
- `tests/program/adaptive-coaching-confirm-route.test.ts`
- `tests/program/adaptive-coaching-service.test.ts`

### Repo-specific implementation approach

#### 1. Pending-confirmation lifecycle drift

Observed repo-specific cause:

- The local proposal path still allows extra transport fields to reach strict proposal parsing.
- In the failing confirm-route test, that causes the parsed proposal to fail contract validation and the orchestration path to fall back to `fallback_applied` instead of `pending_confirmation`.

Preferred bounded fix:

- Sanitize all proposal inputs before strict parsing, not only provider proposals.
- Keep `modelConfidence` as separate transport metadata and feed only contract fields into the parser.
- Preserve the current rule that `deload` and `substitution` land in `pending_confirmation`.

#### 2. Deterministic evidence `topK` drift

Observed repo-specific cause:

- Runtime evidence now prefers `.planning/knowledge/adaptive-coaching/index.json`.
- The current runtime corpus has only two overlap hits for the audited `fatigue/adherence/readiness` query set, so `retrieveAdaptiveEvidence(..., topK: 3)` returns only two refs.

Preferred bounded fix:

- Change evidence selection to a two-pass deterministic strategy:
  - pass 1: matching entries ordered by current score/source-priority rules
  - pass 2: fill remaining slots from the same active corpus in deterministic order
- Only fall back to the built-in default corpus when the runtime corpus is empty or unusable.
- Do not re-open the adaptive knowledge pipeline or corpus-publish logic in this phase.

Why this is the right seam here:

- The failing contract is about deterministic `topK` behavior at runtime, not about re-curating the knowledge base.
- Filling from the same active corpus is smaller and safer than editing planning assets or pipeline logic.

### Validation strategy

- Targeted reruns:
  - `corepack pnpm test -- tests/program/adaptive-coaching-confirm-route.test.ts`
  - `corepack pnpm test -- tests/program/adaptive-coaching-service.test.ts`
- Adjacent confidence/provider sanity after the fix:
  - `corepack pnpm test -- tests/program/adaptive-coaching-provider-contracts.test.ts`
  - `corepack pnpm test -- tests/program/adaptive-coaching-provider-integration.test.ts`
- Final gate: `corepack pnpm test`

### Sequencing notes

- Run RB-04 only after RB-01 is green enough that test failures are trustworthy.
- Keep the fix anchored to the two audited contracts; do not redesign adaptive orchestration or corpus management.

## Cross-track risks and planning notes

- The highest-leverage sequencing boundary is between RB-01 and everything else. Until build/typecheck are green, later fixes are harder to trust.
- `RB-02` and `RB-03` touch different surfaces and can become separate plans inside the phase without increasing blast radius.
- `RB-04` should stay after RB-01 even if the implementation itself is small; otherwise adaptive fixes can be obscured by unrelated red compile noise.
- The Next warnings about inferred workspace root and deprecated `middleware` are useful follow-up items, but they are not phase-08 blockers unless they directly prevent the release gates from passing.

## Recommended planning split

Use one bounded plan per wave:

1. `RB-01A`: build unblock + Prisma preflight
2. `RB-01B`: typecheck restoration across dashboard/program/profile/provider clusters
3. `RB-02`: deploy secret hardening
4. `RB-03`: auth abuse protection
5. `RB-04`: adaptive regression restoration

This split matches the approved backlog, keeps validation local to each track, and avoids turning phase 08 into a general stabilization pass.
