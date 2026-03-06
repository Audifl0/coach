# Phase 6: Trends and Operational Reliability - Research

**Researched:** 2026-03-05
**Domain:** Dashboard trend analytics + PostgreSQL backup/restore operational reliability
**Confidence:** MEDIUM-HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-02 | User can view trend summaries (volume/intensity/adherence) over recent sessions. | Server-side time-bucket aggregation (`date_trunc`/`date_bin` + `generate_series`), Recharts line rendering, Next.js server/client boundary pattern. |
| PLAT-02 | User data is backed up and can be restored in case of failure. | PostgreSQL dump/restore transaction safety flags, restore validation runbook, systemd timer/service for monthly drill cadence and missed-run catch-up. |
</phase_requirements>

## Summary

This phase should follow a split architecture: compute trend metrics server-side in PostgreSQL, expose a strict API projection, and render compact line charts in a client island on the dashboard. For operational reliability, keep PostgreSQL-native dump/restore primitives, but harden restore execution semantics and standardize monthly drill evidence with an executable runbook.

The highest-leverage unknowns are not library selection; they are reliability edge cases: sparse time-series buckets, timezone/daylight handling, stale dashboard cache behavior in App Router, and silent partial restores when `psql` error-stop/transaction flags are missing. These are common causes of misleading trend visuals and false confidence in backup readiness.

**Primary recommendation:** Use PostgreSQL-native time bucketing + Recharts 3 trend cards + systemd-timed restore drills with strict restore failure semantics (`ON_ERROR_STOP` + single transaction for SQL dumps, or custom-format + `pg_restore`).

## Standard Stack

### Core
| Library/Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 16.1.0 (project pinned) | Server-first dashboard composition + client islands for interactivity | Official App Router pattern keeps data fetch server-side and limits client JS surface. |
| React | 19.2.0 (project pinned) | Client components for chart interactivity | Required runtime for App Router client islands and chart rendering. |
| Recharts | 3.x | Mini line charts + synchronized drilldown interaction | Stable React chart stack; official API supports responsive containers and chart sync (`syncId`). |
| PostgreSQL tools (`pg_dump`, `psql`, `pg_restore`) | 18 docs/current | Backups, restores, and deterministic failure control | Official PostgreSQL backup/restore path with documented consistency and restore controls. |
| systemd timer/service | Linux systemd (man5) | Monthly drill scheduling + missed-run catchup | `Persistent=true` gives catch-up behavior after downtime; robust for VPS operations. |

### Supporting
| Library/Tool | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Prisma (`$queryRaw` where needed) | 7.4.0 (project pinned) | Access aggregate SQL for trend series from existing DAL boundaries | Use when Prisma query builder is awkward for bucket-filling queries. |
| Zod | 4.1.12 (project pinned) | Trend API response contracts | Use on every trend/drilldown payload to preserve deterministic contracts. |
| Existing scripts (`infra/scripts/backup.sh`, `infra/scripts/restore.sh`) | current repo | Operational base primitives | Keep as execution base; extend with runbook evidence, safer flags, and test-db restore target. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts 3 | Chart.js + react-chartjs-2 | More control/plugins, but heavier integration overhead for simple mini-line KPI cards. |
| SQL plain dump restore (`psql`) | Custom-format dump (`pg_dump -Fc`) + `pg_restore` | `pg_restore` gives selective and parallel restore capabilities; requires changing backup format/workflow. |

**Installation:**
```bash
pnpm add recharts
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/(private)/dashboard/
│   ├── page.tsx                         # Server composition; fetches trends summary
│   ├── _components/trends-summary-card.tsx    # Client: 3 mini charts + KPI values
│   └── _components/trends-drilldown.tsx       # Client: per-exercise load/reps charts
├── app/api/program/trends/route.ts      # Authenticated summary endpoint (7/30/90)
├── app/api/program/trends/[exerciseId]/route.ts # Authenticated drilldown endpoint
├── lib/program/trends-contracts.ts       # Zod contracts + parsers for trend payloads
├── lib/program/trends-projection.ts      # Pure projection mapping for dashboard payload
└── server/dal/program.ts                 # SQL bucket queries (generate_series/date_bin)
infra/
├── scripts/backup.sh
├── scripts/restore.sh
└── runbooks/restore-drill.md             # Timestamped monthly drill checklist
```

### Pattern 1: Server-side Time-Series Projection
**What:** Compute volume/intensity/adherence buckets in SQL, then normalize shape in server projection before sending to UI.
**When to use:** Any 7/30/90 trend view and exercise drilldown.
**Why:** PostgreSQL provides native bucket/date functions and series generation; this avoids client-side date math drift.

### Pattern 2: Server Component + Client Chart Island
**What:** Keep dashboard page as Server Component and isolate chart UI in `'use client'` components.
**When to use:** Trend cards/drilldowns requiring toggles, tooltip interactions, and synchronized hover.
**Why:** Matches Next.js guidance to reduce JS bundle size by limiting `'use client'` scope.

### Pattern 3: Authenticated API Projection with `no-store`
**What:** Fetch trend data through authenticated route handlers with explicit dynamic rendering behavior.
**When to use:** Dashboard trend blocks that must reflect recent logs immediately.
**Why:** Next.js route output may be cached if not opted into dynamic behavior.

### Pattern 4: Drill-Runbook-as-Code
**What:** Keep restore drill as scripted execution plus timestamped evidence log (restore command, smoke checks, result).
**When to use:** Monthly PLAT-02 drills and incident rehearsals.
**Why:** Repeatable reliability requires deterministic, auditable execution, not ad-hoc shell history.

### Anti-Patterns to Avoid
- **Client-side metric computation from raw session rows:** leads to timezone drift and inconsistent formulas across UI surfaces.
- **One giant dashboard client component:** increases bundle size and weakens server rendering benefits.
- **Backup success assumed from dump creation alone:** violates PLAT-02 recoverability intent; restore drill must prove usability.
- **Restore without strict error/transaction flags:** can leave partially restored DB while scripts still appear operational.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Line chart rendering and tooltip sync | Custom SVG chart engine | Recharts 3 (`LineChart`, `ResponsiveContainer`, `syncId`) | Established API covers responsive rendering and chart synchronization. |
| Time bucket generation and gap filling | JS loops over dates for all periods | PostgreSQL `generate_series` + `date_bin`/`date_trunc` | Native DB semantics handle interval generation and timezone-aware timestamp forms. |
| Restore transaction semantics | Custom shell retry/error parser | PostgreSQL-native flags (`ON_ERROR_STOP`, `--single-transaction`, `pg_restore --exit-on-error`) | Official restore controls already cover all-or-nothing/error-stop behavior. |
| Monthly scheduling reliability | Ad-hoc manual reminders | systemd timer (`OnCalendar`, `Persistent=true`) + oneshot service | Native VPS scheduler supports missed-run catch-up and operational consistency. |
| Payload validation | Manual runtime `if` trees | Zod schemas/parsers | Existing project pattern; prevents contract drift and parse ambiguity. |

**Key insight:** The expensive failures here come from edge semantics (date math, restore consistency, schedule drift), not from missing custom code. Reuse native/database/framework primitives for those semantics.

## Common Pitfalls

### Pitfall 1: Sparse Trend Lines Misread as Drop-offs
**What goes wrong:** Missing days/weeks produce visual cliffs and false regressions.
**Why it happens:** Query returns only days with activity.
**How to avoid:** Always generate full period buckets first, then left-join session aggregates.
**Warning signs:** Tooltips skip dates; 7/30/90 views show inconsistent point counts.

### Pitfall 2: Timezone and DST Bucket Drift
**What goes wrong:** Session lands in wrong day/week bucket for user interpretation.
**Why it happens:** Naive UTC truncation without explicit timezone handling.
**How to avoid:** Use timezone-aware timestamp forms and explicit zone handling in SQL (`generate_series`/`AT TIME ZONE` as needed).
**Warning signs:** Day totals differ between detail list and trend chart near DST boundaries.

### Pitfall 3: Stale Dashboard Trends in App Router
**What goes wrong:** User logs a session but trend card does not update.
**Why it happens:** Route pre-render output cached when dynamic behavior is not explicitly set.
**How to avoid:** Use dynamic fetch behavior for trend endpoints (`cache: 'no-store'`) where freshness is required.
**Warning signs:** Hard refresh required to see recent logging changes.

### Pitfall 4: Oversized Client Bundle for Dashboard
**What goes wrong:** Slow dashboard interaction and hydration.
**Why it happens:** Large parent tree marked `'use client'` just to host charts.
**How to avoid:** Keep top-level dashboard server-rendered; isolate chart and toggle components as minimal client islands.
**Warning signs:** New chart work forces many server-only imports into client bundles.

### Pitfall 5: False-Positive Restore Success
**What goes wrong:** Restore command returns success path while DB is partially restored.
**Why it happens:** Default SQL restore behavior continues after errors without explicit stop semantics.
**How to avoid:** For SQL dumps, run `psql -X --set ON_ERROR_STOP=on --single-transaction`; for archive dumps, use `pg_restore --exit-on-error` and optionally `--single-transaction`.
**Warning signs:** Post-restore smoke login/dashboard checks fail despite script completion message.

### Pitfall 6: Drill Cadence Drift During Downtime
**What goes wrong:** Monthly drill silently skipped after VPS restart/outage.
**Why it happens:** Scheduler lacks missed-run catch-up behavior.
**How to avoid:** Use systemd timers with `Persistent=true` and evidence logging.
**Warning signs:** Gaps in monthly drill logs with no explicit failure records.

## Code Examples

Verified patterns from official and current-project-compatible sources:

### 1) SQL Trend Buckets (30d daily series + aggregation)
```sql
-- Source basis: PostgreSQL generate_series/date_bin/date_trunc docs
WITH buckets AS (
  SELECT generate_series(
    date_trunc('day', $1::timestamptz),
    date_trunc('day', $2::timestamptz),
    interval '1 day'
  ) AS bucket_start
),
agg AS (
  SELECT
    date_bin(interval '1 day', s.completed_at, $1::timestamptz) AS bucket_start,
    SUM(s.total_load) AS volume,
    AVG(s.avg_key_exercise_load) AS intensity,
    SUM(CASE WHEN s.completed THEN 1 ELSE 0 END)::float / NULLIF(SUM(1), 0) AS adherence
  FROM training_session_metrics s
  WHERE s.user_id = $3
    AND s.completed_at >= $1
    AND s.completed_at <= $2
  GROUP BY 1
)
SELECT
  b.bucket_start,
  COALESCE(a.volume, 0) AS volume,
  COALESCE(a.intensity, 0) AS intensity,
  COALESCE(a.adherence, 0) AS adherence
FROM buckets b
LEFT JOIN agg a USING (bucket_start)
ORDER BY b.bucket_start;
```

### 2) Next.js Server + Client Chart Island
```tsx
// app/(private)/dashboard/page.tsx (Server Component)
import { TrendsSummaryCard } from './_components/trends-summary-card';

export default async function DashboardPage() {
  const trends = await fetch('/api/program/trends?period=30d', {
    cache: 'no-store',
  }).then((r) => r.json());

  return <TrendsSummaryCard initialPeriod="30d" initialData={trends} />;
}
```

```tsx
// app/(private)/dashboard/_components/trends-summary-card.tsx
'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export function MiniTrendChart({ data, dataKey }: { data: Array<Record<string, number | string>>; dataKey: string }) {
  return (
    <ResponsiveContainer width="100%" height={84}>
      <LineChart data={data} syncId="dashboard-trends" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <XAxis dataKey="label" hide />
        <YAxis hide />
        <Tooltip />
        <Line type="monotone" dataKey={dataKey} dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### 3) Safe SQL-Dump Restore Command
```bash
# Source basis: PostgreSQL backup-dump docs (psql restore behavior)
psql -X --set ON_ERROR_STOP=on --single-transaction "$RESTORE_DB_URL" < dumpfile.sql
```

### 4) systemd Monthly Drill Timer
```ini
# /etc/systemd/system/coach-restore-drill.timer
[Unit]
Description=Monthly Coach restore drill

[Timer]
OnCalendar=monthly
Persistent=true
AccuracySec=1h
Unit=coach-restore-drill.service

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/coach-restore-drill.service
[Unit]
Description=Coach restore drill execution

[Service]
Type=oneshot
ExecStart=/opt/coach/infra/scripts/run-restore-drill.sh
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Large client-rendered dashboard trees for all sections | App Router server-first rendering with focused client islands | Next.js App Router era (current docs) | Better freshness/perf control and lower client bundle pressure. |
| Ad-hoc chart internals relying on legacy Recharts state assumptions | Recharts 3 rewritten internal state with maintained migration path | Recharts 3 migration guide edited 2025-10-30 | Safer foundation for synchronized chart behavior and bugfixability. |
| Backup considered done once dump file exists | Reliability posture expects repeatable restore validation drills | Current ops/SRE practice + PLAT-02 scope | Moves from backup artifact confidence to recoverability confidence. |

**Deprecated/outdated:**
- Restore flows that ignore SQL errors by default behavior: outdated for reliability-critical drills; enforce explicit error-stop + transaction semantics.
- Client-side-only trend computation from sparse event rows: outdated for deterministic analytics; use database-native bucketing.

## Open Questions

1. **Exact definition of “key exercises” for intensity metric**
   - What we know: Must be deterministic and explainable; discretion is allowed.
   - What's unclear: Final key-exercise selection logic and tie-break rule for users with sparse logs.
   - Recommendation: Lock a deterministic rule in contracts (e.g., top N primary compounds by frequency over last 90d).

2. **Whether to migrate backup format from plain SQL to custom archive in this phase**
   - What we know: Current scripts use SQL dumps + OpenSSL encryption; PostgreSQL docs show custom/archive enables richer restore controls and selective restore.
   - What's unclear: Expected DB size growth and restore time targets for v1 production horizon.
   - Recommendation: If restore time target is strict, migrate to `pg_dump -Fc` + `pg_restore`; otherwise keep SQL dump but enforce strict flags and drill verification.

## Sources

### Primary (HIGH confidence)
- PostgreSQL docs (current v18): https://www.postgresql.org/docs/current/backup-dump.html (SQL dump/restore semantics, error-stop, single-transaction, custom format, parallel notes)
- PostgreSQL docs: https://www.postgresql.org/docs/current/app-pgrestore.html (`--exit-on-error`, `--single-transaction`, `--jobs` semantics)
- PostgreSQL docs: https://www.postgresql.org/docs/current/functions-srf.html (`generate_series` including timestamptz + timezone form)
- PostgreSQL docs: https://www.postgresql.org/docs/current/functions-datetime.html (`date_trunc`, `date_bin`, timezone operators)
- Next.js docs: https://nextjs.org/docs/app/getting-started/server-and-client-components (server/client boundary, `'use client'`, serializable props)
- Next.js docs: https://nextjs.org/docs/app/getting-started/fetching-data (`cache: 'no-store'` for dynamic rendering behavior)
- Recharts API docs: https://recharts.github.io/en-US/api/LineChart/ (LineChart data model, `ResponsiveContainer`, `syncId`)

### Secondary (MEDIUM confidence)
- Recharts migration guide (maintainer wiki): https://github.com/recharts/recharts/wiki/3.0-migration-guide (v3 state rewrite, breaking-change scope, edited 2025-10-30)
- systemd man pages mirror: https://man7.org/linux/man-pages/man5/systemd.timer.5.html (`OnCalendar`, `Persistent`, `AccuracySec`)
- systemd man pages mirror: https://man7.org/linux/man-pages/man5/systemd.service.5.html (`Type=oneshot` behavior)

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM-HIGH - PostgreSQL/Next.js/systemd guidance is high confidence; Recharts as standard choice is medium.
- Architecture: HIGH - strongly aligned to existing repo layering + official App Router and PostgreSQL capabilities.
- Pitfalls: MEDIUM-HIGH - major failure modes are doc-verified for restore/caching/time-bucketing; some UI perception pitfalls rely on practitioner inference.

**Research date:** 2026-03-05
**Valid until:** 2026-04-04
