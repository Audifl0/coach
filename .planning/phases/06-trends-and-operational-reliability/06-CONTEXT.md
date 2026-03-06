# Phase 6: Trends and Operational Reliability - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver two outcomes inside Phase 6 scope only:
1) dashboard trend summaries for recent training evolution (DASH-02),
2) operational backup/restore drill readiness with validated restore procedure on VPS data (PLAT-02).

This phase clarifies implementation of trend visibility and restore validation. It does not add new product capabilities beyond trend summaries and recovery readiness.

</domain>

<decisions>
## Implementation Decisions

### Trends surface on dashboard
- Use a compact trends block with **3 mini line charts + KPI values** (volume, intensity, adherence).
- Place the trends block **below adaptive forecast** and above history.
- Default trend horizon on first load: **30 days**.
- User can switch horizon inline with **7/30/90 toggles**.
- Trend interpretation is **visual only** (line + value), with no extra arrow badges or computed delta labels.

### Trend metric definitions
- **Volume**: total tonnage across the selected period.
- **Intensity**: average load on key exercises.
- **Adherence**: completed sessions / planned sessions over selected period.

### Exercise-level detail behavior
- Reps and load evolution per exercise are required.
- These per-exercise charts are shown in a **trends drilldown view**, not directly on the main dashboard surface.

### Backup/restore drill policy (PLAT-02)
- Drill target: **same VPS environment** using a dedicated test database for restore validation.
- Drill cadence: **monthly**.
- Drill success proof: restore completed + smoke verification for login and dashboard access.
- Runbook deliverable: **timestamped step-by-step checklist** designed for incident execution.

### Claude's Discretion
- Final visual style details of trend cards/charts (spacing, labeling density, microcopy).
- Exact set of “key exercises” used in intensity tracking, as long as logic remains deterministic and explainable.
- Exact runbook template structure and naming conventions for monthly evidence logs.

</decisions>

<specifics>
## Specific Ideas

- "Le graphique doit être sous forme de ligne."
- "Il est important d'avoir un graphique du nombre de reps et de l'évolution du poids sous chaque exercice."
- Exercise-level charts should be accessible via drilldown from trends, while keeping the main dashboard concise.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/(private)/dashboard/page.tsx`: existing assembly point for dashboard sections (today workout, adaptive forecast, history) where trends block can be inserted in-order.
- `src/app/(private)/dashboard/_components/session-history-card.tsx`: established client-side history loading/filter behavior (7/30/90/custom) that trends can align with.
- `src/server/services/session-logging.ts`: lifecycle source for completed sessions and effective duration used in adherence and trend computations.
- `infra/scripts/backup.sh` and `infra/scripts/restore.sh`: existing encrypted backup and restore primitives for PLAT-02 drill execution.

### Established Patterns
- Dashboard remains action-first and compact with progressive detail.
- Data contracts are validated and deterministic across API/service boundaries.
- Operational scripts are shell-first, explicit, and environment-driven.

### Integration Points
- Add trends data projection endpoint(s) under existing authenticated dashboard/program API patterns.
- Extend dashboard page composition with a trends summary component and drilldown entry path.
- Add runbook documentation and drill evidence flow around existing `backup.sh` / `restore.sh` operations.

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-trends-and-operational-reliability*
*Context gathered: 2026-03-05*
