# Phase 07 Research: audit technique avance et stabilisation complete de l'application

## Repository Snapshot

This repository is small enough for a true exhaustive audit, but broad enough that the phase should be decomposed by architectural seam rather than by file type alone.

Current shape:
- `src/app/`: Next.js App Router UI pages plus HTTP route handlers for auth, profile, program generation, logging, adaptation, substitution, history, and trends.
- `src/lib/`: shared contracts, auth helpers, planner logic, adaptive-coaching orchestration, forecast shaping, and Prisma bootstrap.
- `src/server/`: DAL/account-scope enforcement, services, LLM provider clients, and runtime config.
- `prisma/`: single PostgreSQL schema with auth, profile, planning, logging, and adaptive recommendation lifecycle.
- `tests/`: focused `node:test` coverage for contracts, auth/session lifecycle, account isolation, program flows, adaptive coaching, trends, and restore drill logic.
- `infra/` + `docs/operations/`: Docker Compose deployment, Caddy TLS, backup/restore/restore-drill scripts, systemd timer, and operator runbooks.

Notable constraints from current state:
- Phase 06 is complete and ready for verification; Phase 07 should assume the latest codebase already includes trends, restore drills, and LLM/corpus operational paths.
- The locked phase rule forbids application code changes before explicit validation of the audit report and recommendations.
- There is no lint script today. Static audit work must therefore rely on `tsc`, `next build`, targeted repository scans, and explicit review criteria unless a later validated plan adds linting.
- The architecture uses strong account-scoping and contract parsing patterns already; the audit should verify those are consistently applied, not redesign them prematurely.

## Recommended Plan Decomposition

Phase 07 should be planned as an audit-first phase with report-producing plans only.
Do not mix findings and fixes in the same plan.

Recommended plans:

1. `07-01` Audit inventory, architecture map, and traceability baseline
- Produce a system map of runtime surfaces, trust boundaries, data flows, external dependencies, and requirement-to-surface traceability.
- Inventory all executable entrypoints: UI routes, API routes, services, DAL modules, Prisma schema/migrations, scripts, runbooks.
- Output: `AUDIT-ARCHITECTURE.md`, `AUDIT-INVENTORY.md`, `AUDIT-TRACEABILITY.md`.

2. `07-02` Static analysis and maintainability audit
- Review file-by-file complexity, dead code, naming drift, duplication, unused dependencies/imports, contract drift risk, and boundary violations.
- Focus on `src/lib`, `src/server`, route handlers, and app components that fetch internal APIs server-side.
- Output: `AUDIT-STATIC.md` with severity, file references, and refactor recommendations that preserve behavior.

3. `07-03` Functional flow and data integrity audit
- Validate the end-to-end flows for auth, onboarding/profile, program generation, session logging/history, adaptation/confirmation/rejection, dashboard trends, and recovery operations.
- For each flow, verify frontend action -> route handler -> service -> DAL -> Prisma shape -> response contract -> UI consumption.
- Output: `AUDIT-FLOWS.md` and a flow matrix listing happy path, error path, auth masking, and data invariants.

4. `07-04` Security and secrets audit
- Review authentication/session handling, authorization consistency, input validation, trust of request headers, route exposure, env handling, operational scripts, secret handling, backup/restore controls, and LLM/provider boundaries.
- Include checks for XSS/CSRF assumptions, injection risk, over-broad errors, production env leakage, and corpus/pipeline perimeter handling.
- Output: `AUDIT-SECURITY.md` plus a risk register of blockers for production.

5. `07-05` Performance, scalability, and concurrency audit
- Review SSR/internal fetch patterns, database query shapes/index use, plan replacement transactions, recommendation status transitions, session logging writes, restore drill runtime assumptions, and load-sensitive routes.
- Analyze likely bottlenecks under real usage even if current user count is low.
- Output: `AUDIT-RUNTIME.md` covering performance, scalability, and concurrency findings.

6. `07-06` Test strategy, operational readiness, and final synthesis
- Audit current test coverage versus requirements and high-risk flows; identify missing integration/E2E/build/ops verification.
- Evaluate deployment, backup/restore, smoke checks, health checks, env contract completeness, observability gaps, and release readiness.
- Consolidate all prior findings into the final prioritized audit report.
- Output: `07-AUDIT-REPORT.md`, `07-REMEDIATION-BACKLOG.md`, and a user checkpoint for validation before any code-change phase.

## Recommended Waves

Use waves inside plans so the audit stays executable and reviewable.

### Wave A: Read-only inventory and mapping
- Enumerate files and responsibilities.
- Build requirement-to-runtime traceability.
- Record architectural seams and trust boundaries.
- No judgments without evidence yet.

### Wave B: Evidence collection by risk domain
- Static/maintainability evidence.
- Functional evidence.
- Security evidence.
- Runtime/performance/concurrency evidence.
- Test/ops evidence.

### Wave C: Cross-cutting synthesis
- Merge duplicate findings.
- Convert observations into severity-ranked issues.
- Separate release blockers from maintainability debt and secondary improvements.

### Wave D: Validation checkpoint
- Present the full report and remediation backlog.
- Ask for explicit user validation before any plan that edits code, schema, infra, or tests.

## Repo-Specific Audit Hotspots

### 1. Internal server-side fetch loops in dashboard surfaces
`src/app/(private)/dashboard/page.tsx` fetches internal API routes using request-derived origin and cookie forwarding. Audit:
- whether this creates unnecessary SSR latency,
- whether origin/header trust assumptions are production-safe behind Caddy,
- whether failures degrade correctly,
- whether some server-to-server calls should be direct service/DAL calls in later remediation.

### 2. Account-scoped DAL enforcement consistency
`src/server/dal/account-scope.ts` establishes a strong pattern. Audit every protected route/service/DAL path for:
- scope derivation only from authenticated session,
- masked not-found behavior,
- absence of caller-controlled `userId`,
- consistent ownership assertions across all mutations and reads.

### 3. Program and adaptation mutation concurrency
High-risk write areas:
- `replaceActivePlan` flows in program generation,
- session logging start/complete/correct duration,
- recommendation creation and status transitions,
- confirm/reject paths for pending recommendations.

Audit for non-atomic sequences, stale-read assumptions, double-submit handling, and race conditions between concurrent browser tabs or retries.

### 4. Adaptive coaching trust boundaries
Adaptive coaching spans local orchestration, corpus evidence, real provider env config, fallback logic, and persisted recommendation lifecycle. Audit:
- contract validation at every provider boundary,
- observability metadata allowlisting,
- fallback safety behavior,
- evidence tag provenance,
- failure modes when env is partially configured or providers are slow.

### 5. Operational readiness is script-driven, not platform-managed
Production controls currently live in Bash scripts, Docker Compose, Caddy, and runbooks. Audit:
- env completeness and operator error paths,
- backup encryption and restore drill safety,
- deployment idempotency,
- smoke test depth,
- missing monitoring/alerting/log retention assumptions.

### 6. Test suite concentration and likely blind spots
The repository has strong unit/service coverage, but the audit should assume gaps in:
- full-stack browser flows,
- `next build` regressions,
- performance/load behavior,
- real Postgres integration behavior,
- real deployment/runtime verification beyond script logic.

## Planning Guidance Per Domain

## Architecture Patterns
- Audit by vertical slice: auth, profile, planning, logging, adaptation, trends, operations.
- Within each slice, traverse `UI/API -> contracts -> service -> DAL -> Prisma -> ops/docs/tests`.
- Preserve the current architectural intent during analysis: strict parse/validate patterns, account-scoped DAL, deterministic safety-first business logic, and script-based operations.

## Standard Stack
- Next.js 16 App Router + React 19 for UI and route handlers.
- Prisma 7 + PostgreSQL for persistence.
- Zod 4 for request/response/domain contracts.
- `node:test` + `tsx --test` for tests.
- Docker Compose + Caddy + Bash/systemd for operations.
- Optional real-provider OpenAI/Anthropic integration behind strict env gating.

## Don't Hand-Roll
- Do not invent a parallel audit taxonomy that ignores existing requirement and phase boundaries.
- Do not propose code fixes inside research or audit report plans.
- Do not replace evidence with generic best-practice checklists; every finding should reference repo surfaces.
- Do not recommend broad architectural rewrites unless a concrete blocker clearly justifies them.

## Common Pitfalls
- Mixing remediation work into audit plans and violating the locked checkpoint rule.
- Treating passing unit tests as proof of production readiness.
- Reviewing only `src/` and under-auditing `infra/`, runbooks, env contracts, and restore procedures.
- Missing concurrency hazards because the app is “single-user”; recommendation and session lifecycle writes can still race.
- Missing build/runtime issues because there is no current lint layer and limited E2E coverage.
- Overlooking the LLM/corpus path because it is optional; production readiness must still assess disabled and enabled modes.

## Checkpoints

1. After `07-01`
- Validate audit perimeter and artifact structure.
- Confirm requirement traceability covers all v1 requirements and all runtime surfaces.

2. After `07-03`
- Validate that every major user flow has an explicit evidence trail and issue list.
- Confirm whether any immediate release blockers have already been found.

3. After `07-05`
- Validate runtime-risk classification before final synthesis.
- Confirm which issues are critical blockers versus optimization candidates.

4. After `07-06`
- Mandatory user validation checkpoint.
- No corrective implementation planning until the user accepts the audit report and remediation priorities.

## Expected Artifacts

Minimum artifact set for the phase:
- `AUDIT-INVENTORY.md`: file/system inventory and entrypoint map.
- `AUDIT-ARCHITECTURE.md`: architecture seams, trust boundaries, dependency map, data-flow map.
- `AUDIT-TRACEABILITY.md`: requirements to routes/services/tests/ops coverage matrix.
- `AUDIT-STATIC.md`: static analysis and maintainability findings.
- `AUDIT-FLOWS.md`: functional flow verification matrix.
- `AUDIT-SECURITY.md`: security findings and production blockers.
- `AUDIT-RUNTIME.md`: performance, scalability, and concurrency findings.
- `AUDIT-TESTS-OPS.md`: test gap analysis and production-readiness review.
- `07-AUDIT-REPORT.md`: final merged report with severity, priority, impact, and recommendations.
- `07-REMEDIATION-BACKLOG.md`: grouped follow-up work items, explicitly deferred until validation.

## Final Report Structure

Use one consistent finding template throughout the final report:
- `ID`
- `Severity`: critical / important / minor
- `Priority`: P0 / P1 / P2 / P3
- `Domain`: architecture / static / functional / security / runtime / tests / ops / cleanup
- `Surface`: exact files, routes, scripts, or runbooks involved
- `Evidence`: concise factual observation
- `Risk`: what can fail and under what condition
- `Recommendation`: concrete next action
- `Refactor note`: if applicable, behavior-preserving cleanup/refactor guidance
- `Validation needed`: test/build/ops proof required before closing the finding

Close the final report with:
- release blockers,
- must-fix-before-production items,
- should-fix stabilization items,
- cleanup/refactor items,
- explicit request for user validation before remediation planning.

## Special Planning Constraints

- The phase should remain documentation/report heavy until the user approves findings.
- Plan tasks should include build/test execution as evidence gathering, but not code changes.
- Because there is no lint script, the planning should explicitly decide which static commands and manual review heuristics substitute for linting.
- Because operational controls are Bash- and runbook-based, audit tasks must review executable scripts and docs together rather than separately.
- Because account isolation and contract parsing are central design decisions, findings should distinguish true inconsistencies from intentional strictness.
- Because the repository is still manageable in size, the audit can and should remain exhaustive rather than sample-based.
