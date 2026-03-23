# Worker Corpus Dashboard Livrables-First Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the worker corpus dashboard so the default view shows concrete worker deliverables first, while moving the detailed operational surfaces into a secondary Supervision view.

**Architecture:** Add one server-side deliverables payload that fully owns livrables selection and ordering, then split the dashboard client into two explicit views: Livrables and Supervision. The Livrables view uses small focused components for deliverables, source/provenance, live activity, and blockers, while the Supervision view reuses the existing detailed panels with minimal churn.

**Tech Stack:** Next.js App Router, TypeScript, server-side dashboard services, React server/client components, node:test via `tsx --test`

---

## File map

### Existing files to modify
- `src/app/(private)/dashboard/worker-corpus/page.tsx`
  - Page assembly. Will load the new deliverables payload and pass it into the client shell.
- `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client.tsx`
  - Main dashboard client. Will be simplified into two views and become the primary consumer of deliverables-first data.
- `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard.module.css`
  - Layout and presentation updates for the simplified structure and new cards.
- `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client-shell.tsx`
  - Will forward the new deliverables payload.
- `src/lib/program/contracts.ts`
  - Add a parse-validated deliverables payload contract.
- `tests/program/worker-corpus-dashboard-page.test.tsx`
  - Update rendering expectations and add livrables-first coverage.
- `tests/program/worker-corpus-dashboard.test.ts`
  - Add page/shell wiring coverage if needed.
- `tests/program/worker-corpus-dashboard-routes.test.ts`
  - Preserve drilldown expectations if impacted.

### New files to create
- `src/server/services/worker-corpus-deliverables.ts`
  - Sole server-side owner of livrables selection and ordering.
- `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-deliverables-panel.tsx`
  - Primary panel for concrete outputs.
- `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-deliverable-list.tsx`
  - Shared list primitive for doctrine/questions/study extractions.
- `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-source-card.tsx`
  - Compact snapshot/run provenance card.
- `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-activity-card.tsx`
  - Simplified live activity card.
- `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-blockers-card.tsx`
  - Simplified backlog / blockers summary card.
- `tests/program/worker-corpus-deliverables.test.ts`
  - Tests for the new server-side deliverables payload and fallback behavior.

### Explicit server/client ownership
- `src/server/services/worker-corpus-deliverables.ts`
  - owns all Livrables-view composition and fallback decisions
- `worker-corpus-dashboard-client.tsx`
  - consumes already-composed view models; no business selection logic
- existing supervision services
  - remain owners of detailed operational data for the Supervision view

---

### Task 1: Add the deliverables contract and server payload

**Files:**
- Create: `src/server/services/worker-corpus-deliverables.ts`
- Modify: `src/lib/program/contracts.ts`
- Test: `tests/program/worker-corpus-deliverables.test.ts`

- [ ] **Step 1: Write the failing tests for the new deliverables service**

Add tests covering:
- active snapshot with doctrine + questions + study extractions + artifacts
- fallback with no doctrine but recent study extractions/questions
- fallback with no active snapshot
- source/provenance block fields present (`snapshotId`, `runId`, generation/promotion date, severity, quality-gate reasons)

- [ ] **Step 2: Run the new deliverables tests to verify they fail**

Run:

```bash
corepack pnpm test tests/program/worker-corpus-deliverables.test.ts --runInBand
```

Expected: FAIL because the service and contract do not exist yet.

- [ ] **Step 3: Add the deliverables contract in `src/lib/program/contracts.ts`**

Define strict schemas for:
- `source`
- `doctrine[]`
- `questions[]`
- `studyExtractions[]`
- `artifacts`
- `emptyReason`

Keep the payload fully presentation-ready.

- [ ] **Step 4: Implement `src/server/services/worker-corpus-deliverables.ts` minimally**

This service must own:
- snapshot selection
- doctrine selection/order
- notable question selection/order
- recent study extraction selection/order
- artifact availability
- fallback semantics without doctrine or without snapshot
- source/provenance metadata

It must not leave business composition to the client.

- [ ] **Step 5: Run the deliverables tests and make them pass**

Run:

```bash
corepack pnpm test tests/program/worker-corpus-deliverables.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/lib/program/contracts.ts src/server/services/worker-corpus-deliverables.ts tests/program/worker-corpus-deliverables.test.ts
git commit -m "feat: add worker corpus deliverables payload"
```

---

### Task 2: Wire page and shell to the deliverables payload

**Files:**
- Modify: `src/app/(private)/dashboard/worker-corpus/page.tsx`
- Modify: `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client-shell.tsx`
- Test: `tests/program/worker-corpus-dashboard.test.ts`

- [ ] **Step 1: Add a failing wiring test**
- [ ] **Step 2: Run it to verify failure**
- [ ] **Step 3: Load `loadWorkerCorpusDeliverables()` in `page.tsx`**
- [ ] **Step 4: Thread `initialDeliverables` through the shell props**
- [ ] **Step 5: Re-run the wiring test**
- [ ] **Step 6: Commit**

Commands:

```bash
corepack pnpm test tests/program/worker-corpus-dashboard.test.ts --runInBand
```

```bash
git add src/app/(private)/dashboard/worker-corpus/page.tsx src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client-shell.tsx tests/program/worker-corpus-dashboard.test.ts
git commit -m "feat: wire worker dashboard deliverables payload"
```

---

### Task 3: Build the Livrables view components

**Files:**
- Create: `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-deliverables-panel.tsx`
- Create: `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-deliverable-list.tsx`
- Create: `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-source-card.tsx`
- Create: `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-activity-card.tsx`
- Create: `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-blockers-card.tsx`
- Modify: `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client.tsx`
- Modify: `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard.module.css`
- Test: `tests/program/worker-corpus-dashboard-page.test.tsx`

- [ ] **Step 1: Add failing component tests for the Livrables view**

Cover:
- default view is Livrables
- `Livrables produits` renders doctrine/questions/study extractions/artifacts concretely
- source/provenance card renders snapshot/run/date/status/severity/quality-gate reasons
- activity card renders worker state/stage/current item/live message/heartbeat freshness/simple progress metrics
- blockers card renders backlog summary/no-progress reasons/blocking contradictions/weak-or-immature questions

- [ ] **Step 2: Run the page tests and verify failure**

Run:

```bash
corepack pnpm test tests/program/worker-corpus-dashboard-page.test.tsx --runInBand
```

Expected: FAIL because the client has no deliverables-first UI yet.

- [ ] **Step 3: Build `worker-corpus-deliverable-list.tsx`**

Responsibility:
- shared compact list renderer for doctrine/question/extraction rows
- no business logic

- [ ] **Step 4: Build `worker-corpus-deliverables-panel.tsx`**

Responsibility:
- render the four deliverables sub-blocks
- doctrine
- questions
- study extractions
- artifacts

- [ ] **Step 5: Build `worker-corpus-source-card.tsx`**

Responsibility:
- render snapshot/run provenance fields required by spec

- [ ] **Step 6: Build `worker-corpus-activity-card.tsx`**

Responsibility:
- render current state, stage, item, message, heartbeat freshness, and simple progress metrics

- [ ] **Step 7: Build `worker-corpus-blockers-card.tsx`**

Responsibility:
- render backlog summary
- no-progress reasons
- blocking contradiction count
- weak/immature question signals

- [ ] **Step 8: Refactor `worker-corpus-dashboard-client.tsx` to default to the Livrables view**

Add a simple two-view switch:
- `Livrables`
- `Supervision`

No extra business logic beyond view selection.

- [ ] **Step 9: Update CSS only as needed for the new hierarchy**

Keep this bounded to layout simplification, not visual redesign.

- [ ] **Step 10: Re-run the page/component tests**

Run:

```bash
corepack pnpm test tests/program/worker-corpus-dashboard-page.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 11: Commit Task 3**

```bash
git add src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-deliverables-panel.tsx src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-deliverable-list.tsx src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-source-card.tsx src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-activity-card.tsx src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-blockers-card.tsx src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client.tsx src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard.module.css tests/program/worker-corpus-dashboard-page.test.tsx
git commit -m "feat: add deliverables-first worker dashboard view"
```

---

### Task 4: Move the detailed panels under Supervision and test the switch

**Files:**
- Modify: `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client.tsx`
- Test: `tests/program/worker-corpus-dashboard-page.test.tsx`

- [ ] **Step 1: Add failing tests for the view switch behavior**

Must prove:
- default render is Livrables
- Supervision view can be selected
- detailed workflow/document/question/doctrine panels are available under Supervision

- [ ] **Step 2: Run the page tests and verify failure**

Run:

```bash
corepack pnpm test tests/program/worker-corpus-dashboard-page.test.tsx --runInBand
```

- [ ] **Step 3: Move/gate the detailed panels into the Supervision branch**

Keep existing detailed panels, but render them only in Supervision.

- [ ] **Step 4: Re-run the page tests**

Run the same command.

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client.tsx tests/program/worker-corpus-dashboard-page.test.tsx
git commit -m "refactor: move detailed worker panels into supervision view"
```

---

### Task 5: Finalize fallback behavior and preserve drilldowns

**Files:**
- Modify: `src/server/services/worker-corpus-deliverables.ts`
- Modify: `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client.tsx`
- Test: `tests/program/worker-corpus-deliverables.test.ts`
- Test: `tests/program/worker-corpus-dashboard-page.test.tsx`
- Test: `tests/program/worker-corpus-dashboard-routes.test.ts`

- [ ] **Step 1: Add failing tests for fallback semantics and drilldowns**

Cover:
- no doctrine still shows useful outputs
- no active snapshot shows honest empty copy
- existing run/snapshot detail panels remain available

- [ ] **Step 2: Run the fallback/drilldown tests and verify failure**

Run:

```bash
corepack pnpm test tests/program/worker-corpus-deliverables.test.ts tests/program/worker-corpus-dashboard-page.test.tsx tests/program/worker-corpus-dashboard-routes.test.ts --runInBand
```

- [ ] **Step 3: Finalize the fallback and drilldown behavior**

Keep drilldowns intact. Do not widen scope into route redesign.

- [ ] **Step 4: Re-run the fallback/drilldown tests**

Run the same command.

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/server/services/worker-corpus-deliverables.ts src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client.tsx tests/program/worker-corpus-deliverables.test.ts tests/program/worker-corpus-dashboard-page.test.tsx tests/program/worker-corpus-dashboard-routes.test.ts
git commit -m "fix: preserve worker dashboard drilldowns and livrable fallbacks"
```

---

### Task 6: Run the full dashboard verification suite

**Files:**
- Modify if needed: whichever files fail verification
- Test:
  - `tests/program/worker-corpus-dashboard.test.ts`
  - `tests/program/worker-corpus-dashboard-page.test.tsx`
  - `tests/program/worker-corpus-dashboard-routes.test.ts`
  - `tests/program/worker-corpus-live-run.test.ts`
  - `tests/program/worker-corpus-backlog.test.ts`
  - `tests/program/worker-corpus-supervision.test.ts`
  - `tests/program/worker-corpus-deliverables.test.ts`

- [ ] **Step 1: Run the full dashboard suite**

Run:

```bash
corepack pnpm test tests/program/worker-corpus-dashboard.test.ts tests/program/worker-corpus-dashboard-page.test.tsx tests/program/worker-corpus-dashboard-routes.test.ts tests/program/worker-corpus-live-run.test.ts tests/program/worker-corpus-backlog.test.ts tests/program/worker-corpus-supervision.test.ts tests/program/worker-corpus-deliverables.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 2: If anything fails, fix the minimum necessary code and re-run only the failing test first**
- [ ] **Step 3: Re-run the full suite**
- [ ] **Step 4: Commit final verification**

```bash
git add src/app/(private)/dashboard/worker-corpus src/server/services/worker-corpus-deliverables.ts src/lib/program/contracts.ts tests/program/worker-corpus-*.test.*
git commit -m "test: verify deliverables-first worker dashboard"
```

---

## Final verification checklist

- [ ] Default view is `Livrables`
- [ ] `Supervision` view is reachable and renders detailed panels
- [ ] Livrables view shows doctrine/questions/study extractions/artefacts concretely
- [ ] Source/provenance block shows snapshot/run/date/status/severity/reasons
- [ ] Activity card shows state/stage/item/message/heartbeat/progress
- [ ] Blockers card shows backlog/no-progress/blocking contradictions/weak questions
- [ ] No-doctrine fallback remains useful
- [ ] No-active-snapshot fallback is explicit and honest
- [ ] Run/snapshot drilldowns remain intact
- [ ] Full dashboard suite passes

---

## Review notes

This revision narrows the scope to the exact design: one new server payload, one default livrables view, one secondary supervision view, and bounded UI simplification. Detailed operational panels are reused rather than redesigned, and all business selection logic for deliverables remains server-owned.
