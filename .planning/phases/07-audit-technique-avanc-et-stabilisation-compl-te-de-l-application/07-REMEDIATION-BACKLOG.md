# Phase 07 Remediation Backlog

This backlog is deferred pending user validation of the audit package. It groups work by release impact so remediation can start from the highest-risk items instead of broad cleanup.

## Release Blockers

### RB-01: Restore green compile and production build gates

- **Maps to:** `AUD-01`
- **Goal:** return `typecheck` and `build` to clean green status
- **Why first:** release verification is not credible while compile and build are red
- **Validation:** `corepack pnpm typecheck` and `corepack pnpm build` exit `0`

### RB-02: Fix unsafe production secret handling in deploy workflow

- **Maps to:** `AUD-02`
- **Goal:** keep `.env.production` out of git history and Docker build context
- **Why first:** current documented deploy path can leak production secrets
- **Validation:** ignore rules and build context prove production env files are excluded

### RB-03: Add brute-force protection on public auth routes

- **Maps to:** `AUD-03`
- **Goal:** throttle or otherwise control repeated login/signup abuse
- **Why first:** public password auth is exposed without abuse resistance
- **Validation:** repeated attempts are blocked or rate-limited and visible to operators

### RB-04: Restore adaptive regression contracts

- **Maps to:** `AUD-04`
- **Goal:** fix pending-confirmation lifecycle drift and deterministic evidence top-k behavior
- **Why first:** the safety-sensitive recommendation surface is already failing under tests
- **Validation:** `corepack pnpm test` exits `0`

## Stabilization Items

### STAB-01: Remove request-derived internal dashboard fetch trust and explicit outage masking

- **Maps to:** `AUD-05`
- **Outcome:** dashboard authenticated data loading no longer depends on request-derived origin and degraded API states are explicit
- **Validation:** dashboard works behind intended proxy constraints and route outages surface clearly

### STAB-02: Tighten concurrency guarantees around plan generation, session logging, and adaptive decisions

- **Maps to:** `AUD-06`
- **Outcome:** duplicate submits and stale requests do not create partial or nondeterministic state
- **Validation:** race-oriented tests or repro cases prove deterministic outcomes

### STAB-03: Add a narrow release-proof workflow

- **Maps to:** `AUD-07`
- **Outcome:** one repeatable path covers compile, test, build, deploy smoke, and authenticated sanity
- **Validation:** release gate runs successfully on a known-good state

### STAB-04: Fix high-impact functional drift in dashboard and history flows

- **Maps to:** `AUD-09`
- **Outcome:** next-session selection, history drilldown, and workout-resume behavior are deterministic
- **Validation:** targeted regressions cover midnight scheduling, archived history detail, and refresh/reopen session state

### STAB-05: Deepen operator readiness

- **Maps to:** `AUD-10`
- **Outcome:** env contract is centralized, restore/deploy verification is authenticated, and app-level logs exist for critical failures
- **Validation:** operators can follow one documented setup and diagnose key failures from logs/evidence

## Cleanup and Refactor Candidates

### CLEAN-01: Reduce type-boundary erosion and cast-based drift

- **Maps to:** `AUD-08`
- **Outcome:** fewer `as never` seams and clearer adapter contracts between route, service, DAL, and Prisma layers
- **Validation:** compile remains green while casts are replaced incrementally

### CLEAN-02: Decompose large coupled modules behind stable interfaces

- **Maps to:** `AUD-08`
- **Outcome:** `program` DAL, dashboard server loader, and session logger logic become easier to change safely
- **Validation:** behavior stays unchanged and existing tests remain green after each bounded extraction

### CLEAN-03: Add browser hardening and secondary ops hardening

- **Maps to:** `AUD-10` and supporting security findings
- **Outcome:** CSP/header hardening, non-echo admin reset, and backup plaintext-window reduction
- **Validation:** security headers are present, reset flow stays functional, backups remain encrypted without plaintext residue

## Proposed Execution Order

1. `RB-01`
2. `RB-02`
3. `RB-03`
4. `RB-04`
5. `STAB-01`
6. `STAB-02`
7. `STAB-03`
8. `STAB-04`
9. `STAB-05`
10. cleanup items after the system is green and release-safe

## Approval Boundary

No backlog item in this document is approved for execution yet. The next action depends on explicit user validation of:

- the evidence in `AUDIT-TESTS-OPS.md`
- the prioritization in `07-AUDIT-REPORT.md`
- the remediation ordering in this backlog

