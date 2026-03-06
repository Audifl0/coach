# Test, Build, and Operational Readiness Audit

Phase 07 plan 07-06 audit of repository test posture, release gates, deployment runbooks, environment contracts, and production operations. This document is evidence-based and does not authorize remediation work.

## Evidence Base

- `corepack pnpm typecheck`
  - Result: failed with broad runtime and test TypeScript errors across dashboard, program routes, adaptive coaching, provider clients, and tests.
- `corepack pnpm test`
  - Result: 203 passing tests, 2 failing tests, 205 total.
  - Current failing tests:
    - `tests/program/adaptive-coaching-confirm-route.test.ts`: expected `pending_confirmation`, got `fallback_applied`
    - `tests/program/adaptive-coaching-service.test.ts`: expected 3 evidence snippets, got 2
- `corepack pnpm build`
  - Result: failed.
  - Observed signals:
    - Next.js warns that the workspace root is inferred from `/home/flo/package-lock.json` instead of the repo root.
    - Next.js warns that `middleware` is deprecated in favor of `proxy`.
    - Turbopack reports `node:crypto` imports from auth code as unsupported in the Edge Runtime import path.
    - Build exits non-zero after the compile/typecheck phase.
- Repository reads:
  - `package.json`, `.env.example`, `Dockerfile`, `docker-compose.yml`
  - `docs/operations/vps-deploy.md`, `docs/operations/restore-drill-runbook.md`, `docs/operations/data-protection.md`, `docs/operations/auth-recovery.md`
  - `infra/scripts/deploy.sh`, `backup.sh`, `restore.sh`, `run-restore-drill.sh`, `smoke-test-https.sh`
  - prior phase artifacts: `AUDIT-STATIC.md`, `AUDIT-FLOWS.md`, `AUDIT-SECURITY.md`, `AUDIT-RUNTIME.md`
- Repository inventory:
  - No `.github/workflows/`
  - No `tests/e2e/`, Playwright, or Cypress assets
  - No app-level logger or metrics pipeline beyond LLM provider attempt envelopes

## Coverage Snapshot

| Area | Evidence present | Posture |
| --- | --- | --- |
| Auth and session lifecycle | `tests/auth/*`, `tests/security/account-isolation.test.ts` | Strong unit and route coverage |
| Profile and onboarding | `tests/profile/*` | Good contract and route coverage |
| Program generation, logging, trends, substitution | `tests/program/*` | Broad service and route coverage |
| Adaptive coaching and provider boundaries | many `tests/program/adaptive-*` suites | Broad but currently drifting in critical paths |
| Restore drill scripts | `tests/ops/restore-drill.test.ts` | Script-level coverage only |
| Build and release gates | `typecheck`, `build`, smoke scripts | Weak, currently red |
| Browser flow verification | none found | Missing |
| Load, soak, concurrency, and real DB integration | none found | Missing |
| Authenticated post-deploy verification | none found | Missing |
| App observability and alerting | none found beyond provider attempt envelope | Missing |

## Findings

### TEST-OPS-01

- **Severity:** critical
- **Priority:** P0
- **Domain:** testing / release-readiness
- **Surface:** `package.json`, `src/app/(private)/dashboard/*`, `src/app/api/program/*`, `src/lib/adaptive-coaching/*`, `src/server/llm/*`, related tests
- **Evidence:** `corepack pnpm typecheck` fails across runtime and test surfaces, and `corepack pnpm build` exits non-zero. Build output also surfaces Edge Runtime incompatibility warnings for `node:crypto` imports flowing through `src/middleware.ts`.
- **Risk:** The repository does not have a trustworthy green compile or production build baseline. That makes every later remediation risky and blocks safe release validation.
- **Recommendation:** Treat clean `typecheck` and clean `build` as release gates before any production go/no-go. Build health must be restored ahead of broader cleanup.
- **Refactor note:** Keep this as bounded correctness work, not a redesign. Fix the broken type and runtime boundary clusters first, then re-evaluate secondary refactors.
- **Required validation:** `corepack pnpm typecheck` and `corepack pnpm build` both exit `0`.

### TEST-OPS-02

- **Severity:** important
- **Priority:** P1
- **Domain:** testing / regression control
- **Surface:** `tests/program/adaptive-coaching-confirm-route.test.ts`, `tests/program/adaptive-coaching-service.test.ts`, adaptive coaching runtime surfaces
- **Evidence:** `corepack pnpm test` reports 203 pass / 2 fail / 205 total. Both failures are in adaptive recommendation behavior: pending-confirmation lifecycle handling and deterministic evidence top-k retrieval.
- **Risk:** The most safety-sensitive domain already shows behavior drift under automated regression coverage. Passing the rest of the suite does not offset active failures in recommendation flow.
- **Recommendation:** Keep adaptive lifecycle and evidence retrieval fixes in the first stabilization tranche once the audit package is approved.
- **Refactor note:** Restore the tested contract first. Avoid mixing this with a broader adaptive rewrite.
- **Required validation:** `corepack pnpm test` exits `0` with these regressions resolved.

### TEST-OPS-03

- **Severity:** important
- **Priority:** P1
- **Domain:** testing / release process
- **Surface:** `package.json`, repository root
- **Evidence:** The repo exposes `test`, `typecheck`, `build`, and Prisma generate scripts, but no lint script, no CI workflow directory, and no release checklist automation were found.
- **Risk:** Release quality depends on manual discipline. Broken compile/build status can linger because there is no enforced automation layer to stop drift before deployment work begins.
- **Recommendation:** After compile/test health is restored, add one minimal automated release gate that runs the required checks on each change and before deployment.
- **Refactor note:** Start with lightweight gating around existing commands instead of introducing a large tooling migration.
- **Required validation:** A documented or automated pre-release gate exists and runs the agreed checks consistently.

### TEST-OPS-04

- **Severity:** important
- **Priority:** P1
- **Domain:** testing / end-to-end assurance
- **Surface:** repository test tree, `infra/scripts/run-restore-drill.sh`, `infra/scripts/smoke-test-https.sh`
- **Evidence:** No browser E2E suite or authenticated post-deploy smoke flow was found. Operational smoke checks only verify anonymous reachability (`/`, `/login`, `/dashboard` redirect semantics), and restore drill verification stops at HTTP status codes.
- **Risk:** The repository has strong unit and route tests, but it cannot currently prove that the full authenticated product journey works in a built and deployed environment.
- **Recommendation:** Add authenticated smoke coverage for login, dashboard load, and at least one account-scoped data assertion before production rollout.
- **Refactor note:** Prefer a narrow, deterministic smoke path over a large UI automation suite as the first step.
- **Required validation:** A deployed environment can log in, load dashboard data, and prove restored data is queryable after drill execution.

### TEST-OPS-05

- **Severity:** important
- **Priority:** P1
- **Domain:** ops / environment contract
- **Surface:** `.env.example`, `docs/operations/vps-deploy.md`, `docs/operations/restore-drill-runbook.md`, `src/server/llm/config.ts`
- **Evidence:** `.env.example` documents only `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL`, while deployment and restore documentation require additional production variables such as `APP_DOMAIN`, `ACME_EMAIL`, `POSTGRES_*`, `RESTORE_TARGET_DB`, and `BACKUP_PASSPHRASE`. Real-provider mode also depends on multiple `LLM_*` variables that are not documented in the example env contract.
- **Risk:** Production setup knowledge is fragmented across runbooks and code. Operators can miss required variables or discover them only during deployment or incident handling.
- **Recommendation:** Consolidate the full env contract for local, production, backup/restore, and optional provider mode into one source of truth after audit approval.
- **Refactor note:** Keep optional provider variables clearly marked as conditional so the default contract stays readable.
- **Required validation:** One canonical env contract exists and covers deploy, restore drill, and optional provider enablement.

### TEST-OPS-06

- **Severity:** important
- **Priority:** P2
- **Domain:** ops / observability
- **Surface:** `src/server/llm/observability.ts`, repository-wide logging and metrics surfaces
- **Evidence:** Observability currently exists only for allowlisted LLM provider attempt metadata. No application logger wiring, metrics export, alert routing, or request/error audit surface was found. `pino` is declared in `package.json` but not used in runtime code.
- **Risk:** Operators can detect build or route failure only after manual inspection. Production triage for auth abuse, degraded dashboard fetches, restore anomalies, and release regressions will be slow and incomplete.
- **Recommendation:** Add minimal app-level structured logging and failure visibility for auth, critical API routes, deploy/restore operations, and release gates once remediation starts.
- **Refactor note:** Begin with a thin shared logger and a few critical signals rather than a full monitoring platform rollout.
- **Required validation:** Operators can see structured logs or equivalent telemetry for auth failures, major route errors, and deploy/restore outcomes.

### TEST-OPS-07

- **Severity:** moderate
- **Priority:** P2
- **Domain:** ops / deployment readiness
- **Surface:** `infra/scripts/deploy.sh`, `docker-compose.yml`, `docs/operations/vps-deploy.md`
- **Evidence:** Deployment automation performs `pull`, `build`, `up -d`, and an optional HTTPS smoke test. No explicit database migration step, rollback procedure, or post-deploy authenticated verification step is embedded in the script or runbook.
- **Risk:** Deployment can appear healthy while schema drift, authenticated route failures, or business-flow regressions remain undetected.
- **Recommendation:** Define an explicit release sequence that includes migration handling, rollback expectations, and authenticated verification before production promotion.
- **Refactor note:** Keep the current script-driven model, but make release checkpoints explicit and reproducible.
- **Required validation:** Deploy procedure documents schema/update/rollback steps and proves authenticated app behavior after deployment.

## Release Readiness Assessment

### What is already strong

- Unit and route-level test coverage is broad across auth, profile, program, adaptive, trends, and restore-drill logic.
- Docker Compose includes container health checks for `app` and `db`.
- Backup, restore, and restore-drill runbooks exist and are more disciplined than typical early-stage projects.

### What still blocks safe production rollout

- `typecheck` is red.
- `build` is red.
- `test` is red in adaptive coaching.
- There is no authenticated end-to-end or post-deploy smoke proof.
- The environment contract is fragmented across docs and code.
- App-level observability is too thin for confident incident response.

## Recommended Readiness Order

1. Restore green compile, test, and build status.
2. Close release blockers already identified in the security and runtime audits.
3. Establish one explicit pre-release gate using existing commands.
4. Add authenticated smoke verification for deploy and restore workflows.
5. Consolidate env documentation and minimal observability.

