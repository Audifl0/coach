# Phase 10: Maintainability cleanup and operational hardening - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning
**Source:** Phase 07 audit report and approved remediation backlog

<domain>
## Phase Boundary

This phase closes the remaining cleanup and hardening items after phases 08 and 09 have restored release credibility and stabilized production-critical flows. Scope includes:

- reducing type-boundary erosion and cast-based drift
- decomposing large coupled modules behind stable interfaces
- secondary browser and operational hardening
- residual operator hardening not required for the earlier release-proof gate

This phase should remain explicitly post-stabilization work. It must not become the place where release blockers or critical runtime defects are discovered for the first time.
</domain>

<decisions>
## Implementation Decisions

### Locked priorities
- Cleanup comes last, after the system is green and release-safe.
- Every refactor must preserve behavior and keep compile/tests green.
- Favor incremental extraction behind stable interfaces over visible behavior changes.
- Hardening work should target concrete risks already identified by the audit, not generic best-practice expansion.

### Refactor guardrails
- Reduce `as never` and related cast drift incrementally.
- Split the highest-friction modules only where tests and stable contracts can contain risk.
- Keep operational hardening pragmatic and script-compatible.

### Claude's discretion
- Exact order between cast reduction, module decomposition, and secondary hardening.
- Whether some operator-readiness residue remains here after phase 09, as long as phase 09 already establishes a credible release-proof gate.
</decisions>

<specifics>
## Specific Ideas

- Map plans to `CLEAN-01` through `CLEAN-03`.
- Use bounded plans with explicit behavior-preserving verification to avoid a broad refactor blob.
- Expect this phase to contain more independent plans and fewer hard dependencies than phases 08 and 09.
</specifics>

<deferred>
## Deferred Ideas

None beyond future milestone work. This phase is already the deferred cleanup/hardening bucket created from the phase 07 audit.
</deferred>

---
*Phase: 10-maintainability-cleanup-and-operational-hardening*
*Context gathered: 2026-03-06 via approved remediation planning*
