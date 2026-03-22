# Worker Dashboard Control Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lightweight operator controls to the worker dashboard so an authenticated user can start the worker and activate a soft pause using `/opt/coach/.env` as the only server-side env-file reference.

**Architecture:** Introduce a small persistent control-state file under the worker knowledge root, gate worker startup against that control state, and add private API actions plus a compact dashboard control block. Keep the behavior deliberately minimal: `running` vs `paused`, one soft-pause semantics, and no forced stop or advanced orchestration.

**Tech Stack:** TypeScript, Node.js, Next.js route handlers/server components, existing worker control/status routes, Docker Compose on VPS, JSON control artifact under `.planning/knowledge/adaptive-coaching/`.

**Spec:** `docs/superpowers/specs/2026-03-22-worker-dashboard-control-design.md`

---

## File Map

### New files
- `scripts/adaptive-knowledge/control-state.ts` — persistent `control.json` loader/writer and helper functions
- `tests/program/worker-corpus-control-state.test.ts` — control-state contract + behavior tests

### Modified files
- `scripts/adaptive-knowledge/contracts.ts` — control-state schema/type if kept with worker contracts
- `scripts/adaptive-knowledge/refresh-corpus.ts` — pause gate before starting a new run
- `src/app/api/worker-corpus/control/route-handlers.ts` — add `start` / `pause` action handling
- `src/app/api/worker-corpus/control/route.ts` — keep private route wiring intact
- `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client.tsx` — render operator control block
- `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard.module.css` — control block styling
- `src/app/(private)/dashboard/worker-corpus/page.tsx` or loader used by page — include control-state data in dashboard payload if needed
- `src/lib/program/contracts.ts` — add control-state fields to worker dashboard payload contracts if needed
- `tests/program/adaptive-knowledge-worker.test.ts` — worker respects pause state
- `tests/program/worker-corpus-dashboard-routes.test.ts` — private control API behavior
- `tests/program/worker-corpus-dashboard-page.test.tsx` — dashboard renders buttons + state
- `tests/program/worker-corpus-dashboard.test.ts` — dashboard payload/section expectations

---

## Task 1: Persistent worker control state + soft-pause gate

**Files:**
- Create: `scripts/adaptive-knowledge/control-state.ts`
- Modify: `scripts/adaptive-knowledge/contracts.ts`
- Modify: `scripts/adaptive-knowledge/refresh-corpus.ts`
- Create: `tests/program/worker-corpus-control-state.test.ts`
- Modify: `tests/program/adaptive-knowledge-worker.test.ts`

- [ ] **Step 1: Add control-state contract**

Add a schema/type for control state with fields:
- `mode: 'running' | 'paused'`
- `updatedAt: string`
- `reason: string | null`
- `lastCommand: 'start' | 'pause' | null`

If `contracts.ts` is the right home, add parse helpers there.

- [ ] **Step 2: Write failing control-state tests**

In `tests/program/worker-corpus-control-state.test.ts`, add:
- `missing control state defaults to running`
- `control state persists paused mode with metadata`
- `control state parser rejects invalid modes`

Run:
```bash
npx tsx --test tests/program/worker-corpus-control-state.test.ts
```
Expected: FAIL until implementation exists.

- [ ] **Step 3: Implement `control-state.ts`**

Create helpers:
- `loadWorkerControlState(outputRootDir)`
- `writeWorkerControlState(outputRootDir, state)`
- `setWorkerControlMode(outputRootDir, { mode, reason, lastCommand, now })`

File path:
- `${outputRootDir}/control.json`

Behavior:
- if file missing, default to `running`
- use atomic writes

- [ ] **Step 4: Gate worker startup on pause state**

Modify `scripts/adaptive-knowledge/refresh-corpus.ts` so before acquiring/starting a run it loads control state.

If paused:
- do not start a new run
- return a deterministic status such as `paused-by-operator`
- log a clear warning

Do **not** interrupt active runs. This gate only affects new starts.

- [ ] **Step 5: Add failing worker pause regression**

In `tests/program/adaptive-knowledge-worker.test.ts`, add:
- `worker command returns paused-by-operator when control state is paused`
- `worker command still runs normally when control state is running`

Run:
```bash
npx tsx --test tests/program/worker-corpus-control-state.test.ts tests/program/adaptive-knowledge-worker.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/adaptive-knowledge/control-state.ts \
  scripts/adaptive-knowledge/contracts.ts \
  scripts/adaptive-knowledge/refresh-corpus.ts \
  tests/program/worker-corpus-control-state.test.ts \
  tests/program/adaptive-knowledge-worker.test.ts

git commit -m "feat(worker): add persistent control state and soft pause gate"
```

---

## Task 2: Private dashboard control API using `/opt/coach/.env`

**Files:**
- Modify: `src/app/api/worker-corpus/control/route-handlers.ts`
- Modify: `src/app/api/worker-corpus/control/route.ts`
- Modify: `src/lib/program/contracts.ts`
- Test: `tests/program/worker-corpus-dashboard-routes.test.ts`

- [ ] **Step 1: Read existing control route implementation fully**

Before editing, inspect:
- `src/app/api/worker-corpus/control/route-handlers.ts`
- `src/app/api/worker-corpus/control/route.ts`

Note the current auth pattern and payload shape.

- [ ] **Step 2: Add failing route tests for start/pause**

In `tests/program/worker-corpus-dashboard-routes.test.ts`, add:
- `control route rejects unauthenticated start/pause requests`
- `pause action writes paused control state`
- `start action writes running control state`
- `start action reports already-running instead of launching a duplicate`
- `control route uses /opt/coach/.env as env-file when shelling to docker compose`

The last test should assert the invoked shell command string includes `/opt/coach/.env`.

- [ ] **Step 3: Implement bounded control actions**

Extend route handlers so only two actions exist:
- `start`
- `pause`

Behavior:
- `pause` updates control state to paused
- `start` updates control state to running, then tries to launch a worker run
- if a run is already active, return a non-fatal `already-running`

Keep shell execution bounded and explicit. No arbitrary commands.

- [ ] **Step 4: Force `.env` usage in server-side launch command**

When `start` launches Docker Compose, use a hardcoded/reference path:
- `docker compose --env-file /opt/coach/.env ...`

Not `.env.production`.

- [ ] **Step 5: Run route regression suite**

Run:
```bash
npx tsx --test tests/program/worker-corpus-dashboard-routes.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/worker-corpus/control/route-handlers.ts \
  src/app/api/worker-corpus/control/route.ts \
  src/lib/program/contracts.ts \
  tests/program/worker-corpus-dashboard-routes.test.ts

git commit -m "feat(dashboard): add private start and pause control actions"
```

---

## Task 3: Dashboard UI control block

**Files:**
- Modify: `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client.tsx`
- Modify: `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard.module.css`
- Modify: `src/app/(private)/dashboard/worker-corpus/page.tsx` and/or related loader files if payload changes are needed
- Modify: `tests/program/worker-corpus-dashboard-page.test.tsx`
- Modify: `tests/program/worker-corpus-dashboard.test.ts`

- [ ] **Step 1: Add failing dashboard rendering tests**

In `tests/program/worker-corpus-dashboard-page.test.tsx`, add assertions for:
- control block renders operator state `En marche` / `En pause`
- `Démarrer` button is visible
- `Mettre en pause` button is visible
- pause message renders when paused

In `tests/program/worker-corpus-dashboard.test.ts`, add payload/overview expectations for control state.

- [ ] **Step 2: Extend dashboard payload with control state**

If current dashboard loaders/contracts do not carry control-state data, add the minimal fields needed:
- `operatorMode`
- `operatorUpdatedAt`
- `runActive` (or reuse existing worker state)

- [ ] **Step 3: Implement control block UI**

Add a compact section near the top of the worker dashboard showing:
- operator mode badge
- explanatory paused message when relevant
- start button
- pause button

Rules:
- if paused: `Démarrer` active, `Mettre en pause` disabled
- if running and worker active: `Démarrer` disabled or no-op with clear label
- if running and worker inactive: `Mettre en pause` active, `Démarrer` can remain available as relaunch

- [ ] **Step 4: Hook buttons to private API**

Use the existing dashboard client pattern to submit start/pause requests.
Keep feedback simple:
- success message
- failure message
- immediate UI refresh or local optimistic update

- [ ] **Step 5: Run dashboard UI regression suite**

Run:
```bash
npx tsx --test tests/program/worker-corpus-dashboard.test.ts tests/program/worker-corpus-dashboard-page.test.tsx tests/program/worker-corpus-dashboard-routes.test.ts tests/program/worker-corpus-control-state.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client.tsx \
  src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard.module.css \
  src/app/(private)/dashboard/worker-corpus/page.tsx \
  [any loader files touched] \
  tests/program/worker-corpus-dashboard.test.ts \
  tests/program/worker-corpus-dashboard-page.test.tsx \
  tests/program/worker-corpus-dashboard-routes.test.ts \
  tests/program/worker-corpus-control-state.test.ts

git commit -m "feat(dashboard): add worker start and soft pause controls"
```

---

## Task 4: Verification on real worker flow

**Files:**
- Modify tests only if verification reveals missing coverage

- [ ] **Step 1: Run targeted application/build verification**

Run:
```bash
pnpm build
```
Expected: PASS.

- [ ] **Step 2: Run targeted worker/dashboard regression sweep**

Run:
```bash
npx tsx --test tests/program/adaptive-knowledge-worker.test.ts tests/program/worker-corpus-control-state.test.ts tests/program/worker-corpus-dashboard-routes.test.ts tests/program/worker-corpus-dashboard.test.ts tests/program/worker-corpus-dashboard-page.test.tsx
```
Expected: PASS.

- [ ] **Step 3: Manual local behavior verification**

Using a temp worker output root, verify:
1. set control state to `paused`
2. run worker command → should return `paused-by-operator`
3. set control state to `running`
4. run worker command → should start normally

Record the exact commands used in task notes or commit message body if helpful.

- [ ] **Step 4: Commit any verification-only test fixups**

If verification required small test corrections, commit them:
```bash
git add [files]
git commit -m "test(dashboard): verify worker control start and pause flow"
```

- [ ] **Step 5: Deployment note**

When deploying this extension, all dashboard-triggered worker actions must continue to use:
- `/opt/coach/.env`

That is part of the acceptance criteria and should be rechecked during prod rollout.
