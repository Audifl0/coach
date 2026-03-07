# Phase 08: Release blockers and regression restoration - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning
**Source:** Phase 07 audit report and approved remediation backlog

<domain>
## Phase Boundary

This phase exists to clear the approved release blockers from the phase 07 audit before any broader stabilization or cleanup work. Scope is limited to:

- restoring green `typecheck` and `build`
- fixing the unsafe production secret handling in the documented deploy path
- adding brute-force protection on public auth routes
- restoring the failing adaptive regression contracts

This phase should not absorb broader dashboard, concurrency, or maintainability cleanup unless it is strictly required to unblock one of the four blocker tracks above.
</domain>

<decisions>
## Implementation Decisions

### Locked priorities
- Execute the remediation in bounded waves, not as one monolithic change set.
- Treat `RB-01` through `RB-04` as mandatory scope for this phase.
- Prefer the smallest coherent fix that restores release credibility; avoid opportunistic refactors.
- Keep application behavior stable except where the audit explicitly identified broken or unsafe behavior.

### Release gates
- The phase is not complete until `corepack pnpm typecheck`, `corepack pnpm build`, and `corepack pnpm test` are green for the affected blocker areas.
- Secret handling fixes must prove `.env.production` stays out of git history and Docker build context.
- Auth abuse protection must be operator-visible and enforceable at runtime.

### Architecture guardrails
- Do not redesign authentication or adaptive orchestration wholesale in this phase.
- Fix compile/build errors by resolving bounded error clusters first.
- Favor runtime env injection and explicit ignore/build-context rules over process-only discipline.
- Keep rate limiting focused on login/signup boundaries instead of introducing a generic abuse platform.

### Claude's discretion
- Exact grouping of plans and waves inside the phase.
- Whether brute-force protection is enforced at app layer, reverse proxy layer, or both, provided the behavior is measurable and operator-visible.
- How to cluster compile/build fixes without broadening scope.
</decisions>

<specifics>
## Specific Ideas

- Map plans directly to the approved backlog items `RB-01` to `RB-04`.
- Separate build/typecheck restoration from security hardening if doing both in one plan would create excessive blast radius.
- Keep adaptive regression restoration anchored to the failing tests identified in phase 07.
</specifics>

<deferred>
## Deferred Ideas

- Dashboard internal fetch trust and degraded-state behavior
- Concurrency hardening for program/session/adaptive writes
- Release-proof workflow, authenticated smoke checks, and deeper operational readiness
- Maintainability cleanup, cast reduction, module decomposition, and secondary hardening
</deferred>

---
*Phase: 08-release-blockers-and-regression-restoration*
*Context gathered: 2026-03-06 via approved remediation planning*
