# Phase 07 Final Audit Report

This report consolidates the phase 07 audit artifacts into one prioritized pre-production assessment. It is evidence-based, does not authorize remediation, and is intended to support a go/no-go and remediation-order decision.

## Executive Conclusion

**Production go/no-go:** no-go in the current state.

The repository has strong design intent in several areas: account-scoped DAL boundaries, broad route and service test coverage, disciplined provider schema validation, and meaningful backup/restore scripting. That foundation is offset by multiple release blockers:

- compile and build baselines are not green;
- adaptive coaching regressions are already failing under automated tests;
- production secret handling in the documented deploy flow is unsafe;
- public auth routes have no brute-force protection.

The application should not move to remediation-by-guesswork or production rollout until this audit package is reviewed and the remediation order is explicitly approved.

## Severity Summary

| Severity | Count | Findings |
| --- | --- | --- |
| Critical | 3 | `AUD-01`, `AUD-02`, `AUD-03` |
| Important | 5 | `AUD-04`, `AUD-05`, `AUD-06`, `AUD-07`, `AUD-08` |
| Moderate | 2 | `AUD-09`, `AUD-10` |

## Prioritized Findings

### AUD-01

- **Severity:** critical
- **Priority:** P0
- **Domain:** release-readiness
- **Surface:** `package.json`, dashboard runtime, program routes, adaptive coaching runtime, provider clients, related tests
- **Evidence:** `corepack pnpm typecheck` fails across runtime and test surfaces. `corepack pnpm build` exits non-zero and surfaces Edge Runtime incompatibility signals around auth code imported through `src/middleware.ts`.
- **Risk:** There is no trustworthy green compile/build baseline. Any later stabilization work inherits release uncertainty and can break production validation before it even starts.
- **Recommendation:** Restore clean `typecheck` and `build` status before treating the system as release-candidate quality.
- **Refactor note:** Fix bounded error clusters first; do not broaden this into speculative cleanup.
- **Required validation:** `corepack pnpm typecheck` and `corepack pnpm build` both succeed.

### AUD-02

- **Severity:** critical
- **Priority:** P0
- **Domain:** security / operations
- **Surface:** `docs/operations/vps-deploy.md`, `.gitignore`, `Dockerfile`, Docker build context
- **Evidence:** The deploy workflow instructs operators to create `.env.production` at repo root. `.gitignore` ignores `.env` but not `.env.production`, there is no `.dockerignore`, and `Dockerfile` uses `COPY . .`.
- **Risk:** Production secrets can enter git history, Docker build context, and build layers under the documented workflow.
- **Recommendation:** Block production rollout until production env files are kept out of repository history and image build context.
- **Refactor note:** Favor runtime-only env injection and explicit ignore rules over ad hoc local discipline.
- **Required validation:** `git check-ignore .env.production` confirms ignore coverage and Docker build context excludes production env files.

### AUD-03

- **Severity:** critical
- **Priority:** P0
- **Domain:** security / auth abuse resistance
- **Surface:** `src/app/api/auth/login/route.ts`, `src/app/api/auth/signup/route.ts`, `infra/caddy/Caddyfile`
- **Evidence:** Public auth routes expose username/password entry points with no app-level throttle, lockout, or reverse-proxy rate limiting.
- **Risk:** Credential stuffing and brute-force attacks remain practically unchecked on the public boundary.
- **Recommendation:** Add rate limiting and operator visibility for repeated auth abuse before public exposure.
- **Refactor note:** Start with bounded edge/app throttling on auth routes rather than a generalized abuse framework.
- **Required validation:** Repeated login or signup attempts are throttled and the events are visible to operators.

### AUD-04

- **Severity:** important
- **Priority:** P1
- **Domain:** adaptive coaching correctness
- **Surface:** adaptive recommendation runtime and tests
- **Evidence:** `corepack pnpm test` reports two failing adaptive tests. One shows `pending_confirmation` recommendations drifting to `fallback_applied`; the other shows deterministic evidence retrieval returning 2 snippets instead of 3.
- **Risk:** A safety-sensitive recommendation path is already out of contract. This weakens both user trust and release confidence.
- **Recommendation:** Restore adaptive lifecycle and evidence-selection behavior in the first approved stabilization tranche.
- **Refactor note:** Fix the contract drift before any larger adaptive refactor.
- **Required validation:** `corepack pnpm test` passes with adaptive regressions resolved.

### AUD-05

- **Severity:** important
- **Priority:** P1
- **Domain:** request-boundary trust and dashboard resilience
- **Surface:** `src/app/(private)/dashboard/page.tsx`, `src/app/api/program/today/route.ts`, `src/app/api/program/trends/route.ts`, `infra/caddy/Caddyfile`
- **Evidence:** The dashboard derives an origin from request headers, forwards cookies into same-service HTTP fetches, and treats `/api/program/today` failures like empty-state business outcomes.
- **Risk:** Host-header trust assumptions and degraded-path masking combine into a fragile authenticated landing page. Under proxy drift or route failure, the dashboard can both trust the wrong origin and hide outages as "no workout."
- **Recommendation:** Remove request-derived internal fetch trust where possible and make dashboard failure states explicit.
- **Refactor note:** Extract direct server loaders or pin the internal origin; preserve existing dashboard behavior otherwise.
- **Required validation:** Internal dashboard reads cannot be redirected by host spoofing and degraded API calls surface as errors rather than empty plans.

### AUD-06

- **Severity:** important
- **Priority:** P1
- **Domain:** data integrity / concurrency
- **Surface:** `src/server/dal/program.ts`, `src/server/services/adaptive-coaching.ts`, adaptive DAL
- **Evidence:** Prior runtime audit found no single-active-plan persistence guarantee, stale read-then-write session mutation windows, and non-atomic adaptive rejection fallback handling.
- **Risk:** Duplicate requests or multi-tab races can leave active-plan state nondeterministic, allow post-completion writes, or partially apply recommendation decisions.
- **Recommendation:** Prioritize persistence-level or transactional guards around the highest-risk write paths once remediation is approved.
- **Refactor note:** Keep current business rules; tighten atomicity and stale-state handling first.
- **Required validation:** Concurrent plan generation, session completion, and adaptive decision races produce deterministic outcomes without partial state.

### AUD-07

- **Severity:** important
- **Priority:** P1
- **Domain:** testing and operational readiness
- **Surface:** repository root, `package.json`, `infra/scripts/*`, docs under `docs/operations/`
- **Evidence:** There is no CI workflow, no lint gate, no browser E2E suite, no authenticated post-deploy smoke test, and no real load/integration harness. Build/test signals are currently red.
- **Risk:** The repository has broad unit coverage but no release-proof layer that demonstrates the app works when built and deployed.
- **Recommendation:** After red gates are fixed, add one explicit pre-release verification path covering compile, tests, build, deploy smoke, and authenticated product sanity.
- **Refactor note:** Start narrow and deterministic; do not overbuild the testing stack.
- **Required validation:** A release gate exists and proves the deployed app can authenticate and load account-scoped dashboard data.

### AUD-08

- **Severity:** important
- **Priority:** P2
- **Domain:** maintainability / type-boundary erosion
- **Surface:** dashboard, profile routes, adaptive service wiring, program DAL, session logger
- **Evidence:** Static audit found repeated `as never` suppression, large coupled modules (`src/server/dal/program.ts`, `session-logger.tsx`), and type drift that now surfaces in failing compile output.
- **Risk:** Future changes remain expensive and failure-prone because module boundaries are too broad and types no longer enforce the intended contracts reliably.
- **Recommendation:** Defer structural cleanup until after release blockers are resolved, then extract the highest-friction seams behind stable contracts.
- **Refactor note:** Prefer internal decomposition behind existing APIs rather than behavior changes.
- **Required validation:** Compile stays green and existing route/service tests remain green after each bounded extraction.

### AUD-09

- **Severity:** moderate
- **Priority:** P2
- **Domain:** functional correctness
- **Surface:** `src/server/dal/program.ts`, `src/app/api/program/sessions/[sessionId]/route.ts`, dashboard session logger and history UI
- **Evidence:** Prior flow audit found next-session midnight selection risk, archived-session drilldown mismatch, masked today-route outages, and missing hydration of saved in-progress workout state after refresh.
- **Risk:** Core workout and history journeys can behave inconsistently even when the underlying data exists.
- **Recommendation:** Handle these as targeted stabilization fixes after release blockers and major security/data-integrity issues.
- **Refactor note:** Preserve current UX and response contracts while closing the identified correctness gaps.
- **Required validation:** Dashboard today/next selection, history drilldown, and workout resume flows remain deterministic under regression coverage.

### AUD-10

- **Severity:** moderate
- **Priority:** P2
- **Domain:** operations / observability and recovery depth
- **Surface:** `.env.example`, deploy and restore runbooks, `src/server/llm/observability.ts`, `infra/scripts/backup.sh`, `infra/scripts/run-restore-drill.sh`
- **Evidence:** Env documentation is fragmented, observability is limited to provider attempt envelopes, backup still writes a temporary plaintext dump, and restore drill verification is anonymous and status-code based.
- **Risk:** Deploy and incident response remain too dependent on manual operator intuition. Recovery proof is better than nothing but still shallow.
- **Recommendation:** Consolidate env documentation, add minimal structured app logging, and deepen restore/deploy verification once higher-priority blockers are addressed.
- **Refactor note:** Keep the current script-driven operational model but harden the critical operator seams first.
- **Required validation:** Operators can verify env completeness, see critical app failures, and prove restored authenticated behavior with business-data checks.

## Cross-Domain Themes

### Strong foundations worth preserving

- Server-derived account scope and ownership enforcement.
- Widespread schema validation on route boundaries.
- Deterministic, safety-first adaptive design intent.
- Scripted backup/restore posture with explicit production-target guardrails.

### Risks that should shape remediation order

- Release blockers are not abstract debt; they are active failures in compile, build, security posture, and adaptive behavior.
- Dashboard trust and degradation issues cut across security, functionality, and runtime behavior.
- Concurrency and persistence guarantees need targeted hardening before cleanup refactors.
- Test breadth is real, but release proof is incomplete without build/deploy/authenticated verification.

## Go/No-Go Frame

### Go conditions not yet met

- Clean compile baseline.
- Clean production build.
- Clean full test run.
- Secret-safe deploy workflow.
- Auth abuse controls.

### What this report does authorize

- Review and challenge the evidence and prioritization.
- Approve or re-order remediation backlog items.
- Explicitly decide whether remediation should start with release blockers only or include selected stabilization items in the first wave.

### What this report does not authorize

- Application code changes before user approval.
- Broad refactors that are not mapped to a validated finding.
- Production rollout in the current state.

