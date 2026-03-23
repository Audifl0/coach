# Worker Corpus V4 — Backlog Scientifique Quasi Infini Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre le worker corpus pour qu’il consomme un backlog scientifique durable sur toute la chaîne, sans dépendre d’une fenêtre de fraîcheur bloquante, avec couverture de sources élargie et observabilité honnête du travail restant.

**Architecture:** Ajouter un registre racine de fronts de recherche, un scheduler unifié de work items, puis faire évoluer le worker pour consommer un budget d’items plutôt qu’un pipeline `refresh` étroit. Étendre ensuite le dashboard pour exposer backlog, productivité réelle et raisons de non-progression, tout en gardant la doctrine conservatrice et la séparation des niveaux de preuve.

**Tech Stack:** TypeScript, Next.js App Router, Node file-based runtime artifacts, existing adaptive-knowledge registries/queues, tsx test runner.

---

## File structure and responsibilities

### New files
- `scripts/adaptive-knowledge/registry/research-fronts.ts`
  - Persistent registry for discovery fronts, status transitions, exhaustion/cooldown metadata, and source-catalog attachments.
- `scripts/adaptive-knowledge/work-items.ts`
  - Normalized work-item model, scoring helpers, item factories from registries, and block/retry helpers.
- `scripts/adaptive-knowledge/scheduler.ts`
  - Unified scheduler that reads registries, builds candidate items, ranks them, and selects a run budget.
- `scripts/adaptive-knowledge/executors/discovery-executor.ts`
  - Executes `discover-front-page` / `revisit-front` items against connectors and persists front progress.
- `scripts/adaptive-knowledge/executors/document-executor.ts`
  - Executes document-stage items like full-text acquisition and study-card extraction.
- `scripts/adaptive-knowledge/executors/question-executor.ts`
  - Executes question-linking items and question maturation work.
- `scripts/adaptive-knowledge/executors/contradiction-executor.ts`
  - Executes contradiction analysis items and dossier refreshes.
- `scripts/adaptive-knowledge/executors/doctrine-executor.ts`
  - Executes doctrine publication / revision items under conservative gates.
- `scripts/adaptive-knowledge/source-catalog.ts`
  - Catalog of admissible sources, trust tier metadata, capabilities, and active/suspended status.
- `src/server/services/worker-corpus-backlog.ts`
  - Dashboard-facing projection service for backlog counts, queue health, and no-progress reasons.
- `tests/program/adaptive-knowledge-research-fronts.test.ts`
  - Registry behavior tests for research fronts.
- `tests/program/adaptive-knowledge-work-items.test.ts`
  - Work-item generation and scoring tests.
- `tests/program/adaptive-knowledge-scheduler.test.ts`
  - Scheduler selection and budget tests.
- `tests/program/adaptive-knowledge-source-catalog.test.ts`
  - Source-catalog policy tests.
- `tests/program/worker-corpus-backlog.test.ts`
  - Dashboard backlog projection tests.

### Existing files to modify
- `scripts/adaptive-knowledge/contracts.ts`
  - Add research-front, work-item, source-tier, scheduler-run, and backlog health contracts.
- `scripts/adaptive-knowledge/config.ts`
  - Remove freshness as a hard admissibility gate; repurpose freshness inputs into optional priority weighting and add scheduler budgets.
- `scripts/adaptive-knowledge/discovery.ts`
  - Generate durable research fronts instead of only per-run fixed query plans.
- `scripts/adaptive-knowledge/connectors/shared.ts`
  - Stop treating publication age as a hard drop reason; surface age metadata and richer skip reasons to scheduler/front logic.
- `scripts/adaptive-knowledge/connectors/pubmed.ts`
- `scripts/adaptive-knowledge/connectors/crossref.ts`
- `scripts/adaptive-knowledge/connectors/openalex.ts`
  - Preserve source result telemetry needed for front exhaustion/cooldown decisions.
- `scripts/adaptive-knowledge/pipeline-run.ts`
  - Replace monolithic refresh-first orchestration with scheduler-selected work-item execution.
- `scripts/adaptive-knowledge/refresh-corpus.ts`
  - Report work-item budget execution summary instead of only pipeline lifecycle.
- `scripts/adaptive-knowledge/quality-gates.ts`
  - Accept enlarged source tiers without weakening doctrine publication rules.
- `scripts/adaptive-knowledge/curation.ts`
  - Support incremental updates from non-discovery work items.
- `scripts/adaptive-knowledge/question-linking.ts`
- `scripts/adaptive-knowledge/contradiction-analysis.ts`
- `scripts/adaptive-knowledge/conservative-publication.ts`
  - Expose item-ready signals for scheduler.
- `src/lib/program/contracts.ts`
  - Add dashboard contracts for backlog health, item kinds, and productive/no-progress run summaries.
- `src/server/dashboard/worker-dashboard.ts`
  - Load backlog projection alongside live run and supervision.
- `src/server/services/worker-corpus-live-run.ts`
  - Reflect current work-item kind and true productivity delta.
- `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client.tsx`
  - Render backlog and no-progress reasons.
- `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard.module.css`
  - Styles for backlog cards and reason badges.
- `tests/program/adaptive-knowledge-pipeline-run.test.ts`
- `tests/program/adaptive-knowledge-worker.test.ts`
- `tests/program/adaptive-knowledge-question-linking.test.ts`
- `tests/program/adaptive-knowledge-contradiction-analysis.test.ts`
- `tests/program/adaptive-knowledge-conservative-publication.test.ts`
- `tests/program/worker-corpus-dashboard.test.ts`
- `tests/program/worker-corpus-dashboard-page.test.tsx`
- `tests/program/worker-corpus-live-run.test.ts`
  - Update integration expectations to the new backlog-first model.

### Keep untouched
- `next-env.d.ts`
  - Local unrelated modification; do not stage or edit.

## Implementation sequence

### Task 1: Contracts and source catalog foundation

**Files:**
- Create: `scripts/adaptive-knowledge/source-catalog.ts`
- Modify: `scripts/adaptive-knowledge/contracts.ts`
- Modify: `src/lib/program/contracts.ts`
- Test: `tests/program/adaptive-knowledge-source-catalog.test.ts`
- Test: `tests/program/adaptive-knowledge-contracts.test.ts`

- [ ] **Step 1: Write failing source-catalog tests covering source tiers and admissibility**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { getActiveSourceCatalog, getDoctrineEligibleSourceTiers } from '../../scripts/adaptive-knowledge/source-catalog';

test('source catalog exposes academic and professional tiers separately', () => {
  const catalog = getActiveSourceCatalog();
  assert.ok(catalog.some((source) => source.tier === 'academic-primary'));
  assert.ok(catalog.some((source) => source.tier === 'professional-secondary'));
});

test('doctrine eligibility excludes lower-trust source tiers', () => {
  assert.deepEqual(getDoctrineEligibleSourceTiers(), ['academic-primary', 'academic-secondary']);
});
```

- [ ] **Step 2: Run source-catalog tests to verify failure**

Run: `npx tsx --test tests/program/adaptive-knowledge-source-catalog.test.ts`
Expected: FAIL because `source-catalog.ts` does not exist yet.

- [ ] **Step 3: Add contract tests for research fronts, work items, and backlog dashboard payloads**

```ts
test('adaptive knowledge contracts parse research fronts and work items', () => {
  const front = parseAdaptiveKnowledgeResearchFront({
    id: 'front-progression-load-pubmed',
    source: 'pubmed',
    queryFamily: 'progression-load',
    status: 'active',
    topicKey: 'progression',
    query: 'resistance training load progression hypertrophy strength',
    pageCursor: { page: 0, nextCursor: null },
    attempts: 0,
    evidence: { pagesVisited: 0, reformulationsTried: 0, sourcesVisited: 1 },
  });
  const item = parseAdaptiveKnowledgeWorkItem({
    id: 'discover:front-progression-load-pubmed:page-0',
    kind: 'discover-front-page',
    status: 'ready',
    topicKey: 'progression',
    priorityScore: 0.91,
    blockedBy: [],
    targetId: front.id,
  });
  assert.equal(item.kind, 'discover-front-page');
});
```

- [ ] **Step 4: Run contract tests to verify failure**

Run: `npx tsx --test tests/program/adaptive-knowledge-contracts.test.ts`
Expected: FAIL because the new parsers/types are missing.

- [ ] **Step 5: Implement minimal source catalog and contract additions**

Add:
- source tiers (`academic-primary`, `academic-secondary`, `professional-secondary`)
- source capabilities (`metadata`, `abstract`, `fulltext`)
- doctrine-eligible tier helper
- parsers/types for research fronts, work items, backlog health summaries

- [ ] **Step 6: Run targeted tests to verify pass**

Run: `npx tsx --test tests/program/adaptive-knowledge-source-catalog.test.ts tests/program/adaptive-knowledge-contracts.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/adaptive-knowledge/source-catalog.ts scripts/adaptive-knowledge/contracts.ts src/lib/program/contracts.ts tests/program/adaptive-knowledge-source-catalog.test.ts tests/program/adaptive-knowledge-contracts.test.ts
git commit -m "feat(corpus): add source catalog and backlog contracts"
```

### Task 2: Research-front registry

**Files:**
- Create: `scripts/adaptive-knowledge/registry/research-fronts.ts`
- Modify: `scripts/adaptive-knowledge/discovery.ts`
- Test: `tests/program/adaptive-knowledge-research-fronts.test.ts`

- [ ] **Step 1: Write failing registry tests for front lifecycle**

```ts
test('research fronts persist cursor progress and cooldown metadata', async () => {
  const front = buildResearchFront({
    id: 'front-1',
    source: 'pubmed',
    queryFamily: 'progression-load',
    topicKey: 'progression',
    query: 'load progression resistance training',
  });

  await upsertResearchFronts(root, [front]);
  await markResearchFrontCooldown(root, {
    id: 'front-1',
    reason: 'duplicate-heavy',
    until: '2026-03-30T00:00:00.000Z',
  });

  const fronts = await loadResearchFronts(root);
  assert.equal(fronts[0]?.status, 'cooldown');
  assert.equal(fronts[0]?.cooldownReason, 'duplicate-heavy');
});
```

- [ ] **Step 2: Run the registry tests to verify failure**

Run: `npx tsx --test tests/program/adaptive-knowledge-research-fronts.test.ts`
Expected: FAIL because the registry module does not exist.

- [ ] **Step 3: Implement research-front registry with explicit status reasons**

Required behaviors:
- create/update fronts
- load and sort fronts deterministically
- mark `active`, `cooldown`, `deferred`, `blocked`, `exhausted`, `archived`
- persist page/cursor and evidence counters
- preserve reason strings like `duplicate-heavy`, `source-temporarily-cold`

- [ ] **Step 4: Update discovery helpers to emit durable fronts instead of only run-local query plans**

Minimal implementation target:
- seed fronts from current discovery families
- avoid regenerating duplicate fronts
- mark source/tier metadata for each front

- [ ] **Step 5: Run tests to verify pass**

Run: `npx tsx --test tests/program/adaptive-knowledge-research-fronts.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/adaptive-knowledge/registry/research-fronts.ts scripts/adaptive-knowledge/discovery.ts tests/program/adaptive-knowledge-research-fronts.test.ts
git commit -m "feat(corpus): add persistent research fronts registry"
```

### Task 3: Work-item model and scheduler selection

**Files:**
- Create: `scripts/adaptive-knowledge/work-items.ts`
- Create: `scripts/adaptive-knowledge/scheduler.ts`
- Modify: `scripts/adaptive-knowledge/config.ts`
- Test: `tests/program/adaptive-knowledge-work-items.test.ts`
- Test: `tests/program/adaptive-knowledge-scheduler.test.ts`

- [ ] **Step 1: Write failing tests for work-item generation across the full chain**

```ts
test('work items are generated from fronts, documents, questions, contradictions, and doctrine', () => {
  const items = buildAdaptiveKnowledgeWorkItems({
    researchFronts: [activeFront],
    documents: [extractibleDocument],
    questions: [undercoveredQuestion],
    contradictions: [openContradiction],
    doctrineCandidates: [publishableDoctrineCandidate],
    now: new Date('2026-03-23T00:00:00.000Z'),
  });

  assert.ok(items.some((item) => item.kind === 'discover-front-page'));
  assert.ok(items.some((item) => item.kind === 'extract-study-card'));
  assert.ok(items.some((item) => item.kind === 'link-study-question'));
  assert.ok(items.some((item) => item.kind === 'analyze-contradiction'));
  assert.ok(items.some((item) => item.kind === 'publish-doctrine'));
});
```

- [ ] **Step 2: Run work-item tests to verify failure**

Run: `npx tsx --test tests/program/adaptive-knowledge-work-items.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write failing scheduler tests for priority and budget**

```ts
test('scheduler prefers blocking downstream work over additional discovery', () => {
  const plan = scheduleAdaptiveKnowledgeWork({
    items: [discoverItem, extractItem, doctrineItem],
    limits: { maxItems: 2 },
  });

  assert.deepEqual(plan.selectedItems.map((item) => item.kind), ['extract-study-card', 'publish-doctrine']);
});
```

- [ ] **Step 4: Run scheduler tests to verify failure**

Run: `npx tsx --test tests/program/adaptive-knowledge-scheduler.test.ts`
Expected: FAIL.

- [ ] **Step 5: Implement work-item factories and scoring**

Minimum behaviors:
- generate typed items from each registry
- calculate `priorityScore`
- expose `blockedBy`
- include freshness as optional bonus only
- allow cooldown/deferred exclusion from ready set

- [ ] **Step 6: Implement scheduler with fixed per-run item budget**

Minimum behaviors:
- sort by priority descending
- skip blocked items
- return selected items and skipped reasons
- expose no-progress summary when no ready items exist

- [ ] **Step 7: Update config to add scheduler budgets and de-emphasize freshness gate**

Add config fields like:
- `maxWorkItemsPerRun`
- per-kind optional caps
- `freshnessPriorityWeight`

Do not keep freshness as an ingest drop rule.

- [ ] **Step 8: Run tests to verify pass**

Run: `npx tsx --test tests/program/adaptive-knowledge-work-items.test.ts tests/program/adaptive-knowledge-scheduler.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add scripts/adaptive-knowledge/work-items.ts scripts/adaptive-knowledge/scheduler.ts scripts/adaptive-knowledge/config.ts tests/program/adaptive-knowledge-work-items.test.ts tests/program/adaptive-knowledge-scheduler.test.ts
git commit -m "feat(corpus): add unified scheduler and work items"
```

### Task 4: Discovery executor and connector policy shift

**Files:**
- Create: `scripts/adaptive-knowledge/executors/discovery-executor.ts`
- Modify: `scripts/adaptive-knowledge/connectors/shared.ts`
- Modify: `scripts/adaptive-knowledge/connectors/pubmed.ts`
- Modify: `scripts/adaptive-knowledge/connectors/crossref.ts`
- Modify: `scripts/adaptive-knowledge/connectors/openalex.ts`
- Modify: `scripts/adaptive-knowledge/pipeline-run.ts`
- Test: `tests/program/adaptive-knowledge-pipeline-run.test.ts`

- [ ] **Step 1: Add failing pipeline tests proving old refresh emptiness is no longer terminal**

```ts
test('pipeline keeps useful work when discovery returns only old or already-seen records', async () => {
  const result = await runAdaptiveKnowledgePipeline({
    mode: 'refresh',
    outputRootDir,
    connectors: staleButRelevantConnectors,
  });

  assert.notEqual(result.runReport.stageReports.find((stage) => stage.stage === 'publish')?.message, 'blocked:no_library_progress');
  assert.ok(result.runReport.scheduler.itemsExecuted >= 1);
});
```

- [ ] **Step 2: Run the targeted pipeline test to verify failure**

Run: `npx tsx --test tests/program/adaptive-knowledge-pipeline-run.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement discovery executor that updates fronts instead of only run-local results**

Behavior:
- execute page/cursor work for one front
- persist raw skip reason stats
- mark front `cooldown`, `revisit`, or `exhausted` based on evidence thresholds
- emit new documents into registry flow

- [ ] **Step 4: Remove freshness as a hard admissibility drop in connector/shared filtering**

Minimal behavior:
- preserve publication age metadata
- keep `stalePublication` as telemetry / scoring signal, not discard reason
- continue to filter truly invalid/off-topic/disallowed items

- [ ] **Step 5: Update pipeline orchestration to call scheduler + discovery executor**

Initial scope for this task:
- scheduler selects discovery/document items
- pipeline executes selected discovery items first
- run report records executed items and no-progress reasons

- [ ] **Step 6: Run targeted tests to verify pass**

Run: `npx tsx --test tests/program/adaptive-knowledge-pipeline-run.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/adaptive-knowledge/executors/discovery-executor.ts scripts/adaptive-knowledge/connectors/shared.ts scripts/adaptive-knowledge/connectors/pubmed.ts scripts/adaptive-knowledge/connectors/crossref.ts scripts/adaptive-knowledge/connectors/openalex.ts scripts/adaptive-knowledge/pipeline-run.ts tests/program/adaptive-knowledge-pipeline-run.test.ts
git commit -m "feat(corpus): make discovery backlog-driven and non-freshness-blocking"
```

### Task 5: Document and question-chain executors

**Files:**
- Create: `scripts/adaptive-knowledge/executors/document-executor.ts`
- Create: `scripts/adaptive-knowledge/executors/question-executor.ts`
- Modify: `scripts/adaptive-knowledge/question-linking.ts`
- Modify: `scripts/adaptive-knowledge/pipeline-run.ts`
- Test: `tests/program/adaptive-knowledge-worker.test.ts`
- Test: `tests/program/adaptive-knowledge-question-linking.test.ts`

- [ ] **Step 1: Write failing tests for document-stage work items**

```ts
test('document executor acquires and extracts when extractible documents remain', async () => {
  const outcome = await executeDocumentWorkItem(extractStudyCardItem, context);
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.delta.studyCards, 1);
});
```

- [ ] **Step 2: Run document/question tests to verify failure**

Run: `npx tsx --test tests/program/adaptive-knowledge-worker.test.ts tests/program/adaptive-knowledge-question-linking.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement document executor**

Behavior:
- full-text acquisition items
- study-card extraction items
- document state transitions
- useful deltas in executor result

- [ ] **Step 4: Implement question executor**

Behavior:
- link study cards to scientific questions
- promote question maturity signals
- expose “undercovered question” as backlog reason

- [ ] **Step 5: Integrate executors into scheduler-driven pipeline**

Behavior:
- selected items of kinds `acquire-fulltext`, `extract-study-card`, `link-study-question`
- update run report with actual deltas
- keep run useful even if no discovery item produced novelty

- [ ] **Step 6: Run tests to verify pass**

Run: `npx tsx --test tests/program/adaptive-knowledge-worker.test.ts tests/program/adaptive-knowledge-question-linking.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/adaptive-knowledge/executors/document-executor.ts scripts/adaptive-knowledge/executors/question-executor.ts scripts/adaptive-knowledge/question-linking.ts scripts/adaptive-knowledge/pipeline-run.ts tests/program/adaptive-knowledge-worker.test.ts tests/program/adaptive-knowledge-question-linking.test.ts
git commit -m "feat(corpus): execute document and question backlog items"
```

### Task 6: Contradiction and doctrine executors

**Files:**
- Create: `scripts/adaptive-knowledge/executors/contradiction-executor.ts`
- Create: `scripts/adaptive-knowledge/executors/doctrine-executor.ts`
- Modify: `scripts/adaptive-knowledge/contradiction-analysis.ts`
- Modify: `scripts/adaptive-knowledge/conservative-publication.ts`
- Modify: `scripts/adaptive-knowledge/quality-gates.ts`
- Modify: `scripts/adaptive-knowledge/pipeline-run.ts`
- Test: `tests/program/adaptive-knowledge-contradiction-analysis.test.ts`
- Test: `tests/program/adaptive-knowledge-conservative-publication.test.ts`

- [ ] **Step 1: Write failing tests for contradiction backlog work**

```ts
test('contradiction executor refreshes open blocking contradiction dossiers', async () => {
  const outcome = await executeContradictionWorkItem(analyzeContradictionItem, context);
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.delta.contradictionsAnalyzed, 1);
});
```

- [ ] **Step 2: Write failing tests for doctrine publication work items honoring proof tiers**

```ts
test('doctrine executor refuses publication from professional-only evidence', async () => {
  const outcome = await executeDoctrineWorkItem(publishDoctrineItem, context);
  assert.equal(outcome.status, 'blocked');
  assert.match(outcome.reason ?? '', /insufficient-proof-tier/i);
});
```

- [ ] **Step 3: Run contradiction/doctrine tests to verify failure**

Run: `npx tsx --test tests/program/adaptive-knowledge-contradiction-analysis.test.ts tests/program/adaptive-knowledge-conservative-publication.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement contradiction executor**

Behavior:
- refresh contradiction dossiers
- promote unresolved blockers
- emit scheduler-usable deltas and reasons

- [ ] **Step 5: Implement doctrine executor with source-tier enforcement**

Behavior:
- publish/revise doctrine only when eligible tiers satisfy proof-strong rules
- surface blocked reasons when lower-trust tiers cannot support doctrine publication

- [ ] **Step 6: Run tests to verify pass**

Run: `npx tsx --test tests/program/adaptive-knowledge-contradiction-analysis.test.ts tests/program/adaptive-knowledge-conservative-publication.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/adaptive-knowledge/executors/contradiction-executor.ts scripts/adaptive-knowledge/executors/doctrine-executor.ts scripts/adaptive-knowledge/contradiction-analysis.ts scripts/adaptive-knowledge/conservative-publication.ts scripts/adaptive-knowledge/quality-gates.ts scripts/adaptive-knowledge/pipeline-run.ts tests/program/adaptive-knowledge-contradiction-analysis.test.ts tests/program/adaptive-knowledge-conservative-publication.test.ts
git commit -m "feat(corpus): add contradiction and doctrine backlog execution"
```

### Task 7: Run reporting and worker command semantics

**Files:**
- Modify: `scripts/adaptive-knowledge/pipeline-run.ts`
- Modify: `scripts/adaptive-knowledge/refresh-corpus.ts`
- Modify: `scripts/adaptive-knowledge/worker-state.ts`
- Test: `tests/program/adaptive-knowledge-worker.test.ts`
- Test: `tests/program/adaptive-knowledge-pipeline-run.test.ts`

- [ ] **Step 1: Write failing tests for productive vs non-productive run reporting**

```ts
test('run report distinguishes technical completion from scientific productivity', async () => {
  const result = await runAdaptiveKnowledgePipeline({ mode: 'refresh', outputRootDir, connectors: emptyConnectors });
  assert.equal(result.runReport.productivity.usefulDelta.documents, 0);
  assert.ok(result.runReport.productivity.noProgressReasons.length > 0);
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `npx tsx --test tests/program/adaptive-knowledge-worker.test.ts tests/program/adaptive-knowledge-pipeline-run.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extend run report and worker-state semantics**

Add:
- executed work-item counts
- useful deltas by class
- no-progress reasons
- top backlog shortages
- current item kind / last completed item

- [ ] **Step 4: Update refresh command logging to reflect backlog execution**

Expected messages like:
- `executed=12; documents=4; studyCards=3; contradictions=1`
- or `completed without useful delta; reasons=duplicate-heavy,blocked-by-downstream`

- [ ] **Step 5: Run tests to verify pass**

Run: `npx tsx --test tests/program/adaptive-knowledge-worker.test.ts tests/program/adaptive-knowledge-pipeline-run.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/adaptive-knowledge/pipeline-run.ts scripts/adaptive-knowledge/refresh-corpus.ts scripts/adaptive-knowledge/worker-state.ts tests/program/adaptive-knowledge-worker.test.ts tests/program/adaptive-knowledge-pipeline-run.test.ts
git commit -m "feat(worker): report scientific productivity and no-progress reasons"
```

### Task 8: Dashboard backlog and observability

**Files:**
- Create: `src/server/services/worker-corpus-backlog.ts`
- Modify: `src/server/dashboard/worker-dashboard.ts`
- Modify: `src/server/services/worker-corpus-live-run.ts`
- Modify: `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client.tsx`
- Modify: `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard.module.css`
- Test: `tests/program/worker-corpus-backlog.test.ts`
- Test: `tests/program/worker-corpus-dashboard.test.ts`
- Test: `tests/program/worker-corpus-dashboard-page.test.tsx`
- Test: `tests/program/worker-corpus-live-run.test.ts`

- [ ] **Step 1: Write failing backlog projection tests**

```ts
test('backlog service projects research fronts, document work, questions, contradictions, and doctrine counts', async () => {
  const backlog = await getWorkerCorpusBacklog(root);
  assert.equal(backlog.discovery.active, 4);
  assert.equal(backlog.documents.extractStudyCard, 7);
  assert.equal(backlog.contradictions.open, 2);
});
```

- [ ] **Step 2: Run dashboard/backlog tests to verify failure**

Run: `npx tsx --test tests/program/worker-corpus-backlog.test.ts tests/program/worker-corpus-dashboard.test.ts tests/program/worker-corpus-dashboard-page.test.tsx tests/program/worker-corpus-live-run.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement backlog projection service**

Behavior:
- aggregate counts by item class
- expose queue health
- expose no-progress reasons and last useful delta

- [ ] **Step 4: Update dashboard loader and live-run service**

Behavior:
- include backlog projection in page model
- show current work-item kind and last completed item
- distinguish active run from technically completed but scientifically empty run

- [ ] **Step 5: Update client rendering and styles**

Render:
- backlog cards by work class
- no-progress reason badges
- useful delta summary
- current item kind / last item kind

- [ ] **Step 6: Run dashboard/backlog tests to verify pass**

Run: `npx tsx --test tests/program/worker-corpus-backlog.test.ts tests/program/worker-corpus-dashboard.test.ts tests/program/worker-corpus-dashboard-page.test.tsx tests/program/worker-corpus-live-run.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/services/worker-corpus-backlog.ts src/server/dashboard/worker-dashboard.ts src/server/services/worker-corpus-live-run.ts 'src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client.tsx' 'src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard.module.css' tests/program/worker-corpus-backlog.test.ts tests/program/worker-corpus-dashboard.test.ts tests/program/worker-corpus-dashboard-page.test.tsx tests/program/worker-corpus-live-run.test.ts
git commit -m "feat(dashboard): expose scientific backlog and productivity"
```

### Task 9: Full regression, production-safety verification, and docs touch-up

**Files:**
- Modify: `docs/superpowers/specs/2026-03-23-worker-infinite-backlog-design.md` (only if implementation realities require clarifying notes)
- Test: `tests/program/adaptive-knowledge-*.test.ts`
- Test: `tests/program/worker-corpus-*.test.ts`

- [ ] **Step 1: Run the full targeted regression suite**

Run:
```bash
npx tsx --test tests/program/adaptive-knowledge-*.test.ts tests/program/worker-corpus-*.test.ts tests/program/coach-knowledge-bible.test.ts tests/program/program-hybrid-generation.test.ts
```
Expected: PASS.

- [ ] **Step 2: Run production build verification**

Run: `pnpm build`
Expected: Next.js build succeeds with no TypeScript regressions.

- [ ] **Step 3: Verify no accidental changes to unrelated files**

Run:
```bash
git status --short
```
Expected:
- `next-env.d.ts` remains untouched/un-staged.
- only intended files are modified.

- [ ] **Step 4: If spec wording needs a post-implementation clarification, update it minimally**

Only update the spec if the shipped behavior differs in a meaningful, user-visible way.

- [ ] **Step 5: Commit final regression-safe state**

```bash
git add .
git restore --staged next-env.d.ts || true
git commit -m "test(corpus): verify infinite backlog scheduler regression suite"
```

## Verification checklist

Before claiming completion, verify all of the following:

- scheduler selects useful work when discovery is locally cold,
- old-but-relevant documents are no longer excluded by freshness alone,
- work-item backlog spans discovery, document, question, contradiction, and doctrine work,
- doctrine publication still enforces proof-tier separation,
- dashboard distinguishes technical completion from scientific productivity,
- operator can see real backlog counts and no-progress reasons,
- production build passes,
- `next-env.d.ts` remains untouched.

## Notes for implementation agents

- Use @superpowers:test-driven-development before each implementation task.
- Use @superpowers:verification-before-completion before claiming any task done.
- Keep commits small and task-local.
- Do not batch unrelated refactors.
- Do not touch VPS deployment files while implementing this plan unless a later user instruction explicitly asks for deployment.
- Do not weaken conservative doctrine publication rules to make tests easier.
