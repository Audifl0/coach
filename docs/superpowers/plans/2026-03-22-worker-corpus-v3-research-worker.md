# Worker Corpus V3 — Research Worker Conservateur Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the current adaptive knowledge worker from a refresh/snapshot pipeline into a continuous, conservative scientific research worker with persistent memory, explicit scientific questions, published doctrine, and a supervision dashboard.

**Architecture:** Evolve the existing `scripts/adaptive-knowledge/` pipeline incrementally instead of rewriting it. First introduce persistent registries and durable work queues, then layer scientific-question dossiers and conservative publication rules on top, and finally expose the system through a read-only supervision dashboard and doctrine-only runtime injection.

**Tech Stack:** TypeScript, Node.js, Zod, Prisma/JSON artifacts, Next.js server components/routes, OpenAI structured outputs, PubMed/Crossref/OpenAlex/PMC/Unpaywall connectors.

**Spec:** `docs/superpowers/specs/2026-03-22-worker-corpus-v3-research-worker-design.md`

---

## Scope Notes

This spec spans 4 coupled subsystems:
1. persistent scientific memory,
2. scientific-question workflows,
3. published doctrine/runtime injection,
4. worker supervision dashboard.

They are tightly linked, so this remains one implementation plan, but the tasks are structured so each one produces a meaningful, testable system upgrade on its own.

---

## File Map

### New files
- `scripts/adaptive-knowledge/registry/doc-library.ts` — persistent document registry read/write helpers
- `scripts/adaptive-knowledge/registry/study-dossiers.ts` — persistent study-card dossier registry
- `scripts/adaptive-knowledge/registry/scientific-questions.ts` — persistent scientific-question registry
- `scripts/adaptive-knowledge/registry/doctrine.ts` — persistent doctrine registry + revision metadata
- `scripts/adaptive-knowledge/registry/work-queues.ts` — durable queues for discovery/acquisition/extraction/question-linking/review/publication
- `scripts/adaptive-knowledge/question-linking.ts` — map studies to explicit scientific questions
- `scripts/adaptive-knowledge/contradiction-analysis.ts` — identify convergences, divergences, and blocking contradictions per question
- `scripts/adaptive-knowledge/conservative-publication.ts` — publication gate for robust doctrine principles only
- `src/lib/coach/published-doctrine.ts` — runtime doctrine loader dedicated to program generation
- `src/server/services/worker-corpus-supervision.ts` — aggregation service for worker supervision dashboard
- `tests/program/adaptive-knowledge-registries.test.ts`
- `tests/program/adaptive-knowledge-work-queues.test.ts`
- `tests/program/adaptive-knowledge-question-linking.test.ts`
- `tests/program/adaptive-knowledge-contradiction-analysis.test.ts`
- `tests/program/adaptive-knowledge-conservative-publication.test.ts`
- `tests/program/worker-corpus-supervision.test.ts`

### Modified files
- `scripts/adaptive-knowledge/contracts.ts` — registry contracts, queue contracts, scientific question contracts, doctrine revision contracts
- `scripts/adaptive-knowledge/pipeline-run.ts` — switch from transient-only run orchestration to registry-backed continuous workflow
- `scripts/adaptive-knowledge/curation.ts` — emit journal/dossiers/doctrine views from registries
- `scripts/adaptive-knowledge/publish.ts` — support published doctrine revision history and separate published doctrine payloads
- `scripts/adaptive-knowledge/quality-gates.ts` — conservative publication criteria at doctrine level
- `scripts/adaptive-knowledge/refresh-corpus.ts` — command entry remains but now drives durable queues and long-lived state
- `src/lib/coach/knowledge-bible.ts` — restrict runtime loading to published doctrine view, keep compatibility bridge
- `src/server/services/program-generation-hybrid.ts` — consume published doctrine only
- `tests/program/adaptive-knowledge-pipeline-run.test.ts`
- `tests/program/adaptive-knowledge-publish.test.ts`
- `tests/program/coach-knowledge-bible.test.ts`
- `tests/program/program-hybrid-generation.test.ts`
- `tests/program/worker-corpus-dashboard.test.ts`
- `tests/program/worker-corpus-dashboard-page.test.tsx`
- `tests/program/worker-corpus-dashboard-routes.test.ts`

---

## Task 1: Persistent scientific memory registries

**Files:**
- Create: `scripts/adaptive-knowledge/registry/doc-library.ts`
- Create: `scripts/adaptive-knowledge/registry/study-dossiers.ts`
- Create: `scripts/adaptive-knowledge/registry/work-queues.ts`
- Modify: `scripts/adaptive-knowledge/contracts.ts`
- Modify: `scripts/adaptive-knowledge/pipeline-run.ts`
- Test: `tests/program/adaptive-knowledge-registries.test.ts`
- Test: `tests/program/adaptive-knowledge-work-queues.test.ts`
- Test: `tests/program/adaptive-knowledge-pipeline-run.test.ts`

- [ ] **Step 1: Add registry contracts to `contracts.ts`**

Add Zod schemas for:
- `DocumentRegistryRecord`
- `StudyDossierRegistryRecord`
- `DurableWorkQueueItem`
- `DurableWorkQueueState`
- registry file containers with `version`, `generatedAt`, `items`

Include durable statuses such as:
- document: `discovered`, `metadata-ready`, `abstract-ready`, `full-text-ready`, `extractible`, `extracted`, `linked`
- study dossier: `draft`, `validated-structure`, `linked-to-question`, `needs-review`
- queue item: `pending`, `running`, `blocked`, `completed`, `failed`

- [ ] **Step 2: Write failing registry contract tests**

In `tests/program/adaptive-knowledge-registries.test.ts`, add tests:
- `document registry contract accepts stable document states`
- `study dossier registry contract accepts versioned dossiers`
- `queue contract accepts durable work items with timestamps and reasons`

Run:
```bash
npx tsx --test tests/program/adaptive-knowledge-registries.test.ts
```
Expected: FAIL until schemas exist.

- [ ] **Step 3: Implement document + dossier registry helpers**

Create `doc-library.ts` and `study-dossiers.ts` with read/write/upsert helpers:
- `loadDocumentRegistry(outputRootDir)`
- `upsertDocumentRegistryRecords(outputRootDir, records)`
- `loadStudyDossierRegistry(outputRootDir)`
- `upsertStudyDossiers(outputRootDir, dossiers)`

Use atomic JSON writes. Keep files under `.planning/knowledge/adaptive-coaching/registry/`.

- [ ] **Step 4: Implement durable queue helpers**

Create `work-queues.ts` with:
- `loadWorkQueues(outputRootDir)`
- `enqueueWorkItems(outputRootDir, queueName, items)`
- `claimNextWorkItem(outputRootDir, queueName, workerId)`
- `completeWorkItem(...)`
- `blockWorkItem(...)`

Queues to support now:
- `document-acquisition`
- `study-extraction`
- `question-linking`
- `contradiction-review`
- `doctrine-publication`

- [ ] **Step 5: Write failing queue behavior tests**

In `tests/program/adaptive-knowledge-work-queues.test.ts`, add:
- `enqueueWorkItems dedupes repeated logical work`
- `claimNextWorkItem marks item running and preserves order`
- `blocked work item retains reason and can be surfaced later`

Run:
```bash
npx tsx --test tests/program/adaptive-knowledge-work-queues.test.ts
```
Expected: PASS after implementation.

- [ ] **Step 6: Wire pipeline to persist documents and dossiers**

Modify `pipeline-run.ts` so each run:
- upserts discovered/normalized records into the document registry,
- upserts extracted study cards into the study dossier registry,
- enqueues downstream work instead of assuming everything is completed in one run.

The snapshot artifacts remain, but they become projections of registry state.

- [ ] **Step 7: Add pipeline regression for registry persistence**

In `tests/program/adaptive-knowledge-pipeline-run.test.ts`, add:
- `pipeline persists discovered documents to document registry`
- `pipeline persists study cards to dossier registry when extraction succeeds`
- `pipeline enqueues downstream work items instead of losing unfinished work`

Run:
```bash
npx tsx --test tests/program/adaptive-knowledge-pipeline-run.test.ts tests/program/adaptive-knowledge-registries.test.ts tests/program/adaptive-knowledge-work-queues.test.ts
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/adaptive-knowledge/contracts.ts \
  scripts/adaptive-knowledge/registry/doc-library.ts \
  scripts/adaptive-knowledge/registry/study-dossiers.ts \
  scripts/adaptive-knowledge/registry/work-queues.ts \
  scripts/adaptive-knowledge/pipeline-run.ts \
  tests/program/adaptive-knowledge-registries.test.ts \
  tests/program/adaptive-knowledge-work-queues.test.ts \
  tests/program/adaptive-knowledge-pipeline-run.test.ts

git commit -m "feat(corpus): add persistent registries and durable work queues"
```

---

## Task 2: Scientific questions and study-to-question linking

**Files:**
- Create: `scripts/adaptive-knowledge/registry/scientific-questions.ts`
- Create: `scripts/adaptive-knowledge/question-linking.ts`
- Modify: `scripts/adaptive-knowledge/contracts.ts`
- Modify: `scripts/adaptive-knowledge/pipeline-run.ts`
- Test: `tests/program/adaptive-knowledge-question-linking.test.ts`
- Test: `tests/program/adaptive-knowledge-pipeline-run.test.ts`

- [ ] **Step 1: Add scientific question contracts**

Add schemas for:
- `ScientificQuestion`
- `ScientificQuestionStudyLink`
- `ScientificQuestionCoverage`
- `ScientificQuestionStatus`

Fields should include:
- `questionId`, `labelFr`, `promptFr`, `topicKeys`
- `inclusionCriteria`, `exclusionCriteria`
- `linkedStudyIds`
- `coverageStatus`: `empty`, `partial`, `developing`, `mature`, `blocked`
- `publicationStatus`: `not-ready`, `candidate`, `published`, `reopened`

- [ ] **Step 2: Write failing question contract tests**

In `tests/program/adaptive-knowledge-question-linking.test.ts`:
- `scientific question contract accepts explicit inclusion and exclusion criteria`
- `scientific question contract tracks linked studies and maturity`

Run and verify fail first.

- [ ] **Step 3: Implement scientific question registry**

Create `registry/scientific-questions.ts` with:
- `loadScientificQuestions(outputRootDir)`
- `upsertScientificQuestions(outputRootDir, questions)`
- `appendStudyLinksToQuestions(outputRootDir, links)`

Seed a minimal built-in catalogue of scientific questions derived from existing topics:
- volume/hypertrophy
- rest intervals/strength
- autoregulation/progression
- exercise selection/hypertrophy
- pain-safe load adaptation

- [ ] **Step 4: Implement study-to-question linking**

Create `question-linking.ts` with function:
- `linkStudiesToScientificQuestions({ studyDossiers, questions })`

The first version can be rule-based using topicKeys + study metadata + simple heuristics. Do not require an LLM in this task.

- [ ] **Step 5: Add failing linking behavior tests**

Tests:
- `volume-oriented study links to hypertrophy-volume question`
- `study can link to multiple compatible questions`
- `question remains partial when coverage is still thin`

Run and make them pass.

- [ ] **Step 6: Wire question linking into the pipeline**

Modify `pipeline-run.ts` so extracted study dossiers enqueue and/or perform question linking, then persist the updated question registry.

- [ ] **Step 7: Add pipeline regression**

Add test:
- `pipeline links study dossiers to scientific questions and persists question state`

Run:
```bash
npx tsx --test tests/program/adaptive-knowledge-question-linking.test.ts tests/program/adaptive-knowledge-pipeline-run.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add scripts/adaptive-knowledge/contracts.ts \
  scripts/adaptive-knowledge/registry/scientific-questions.ts \
  scripts/adaptive-knowledge/question-linking.ts \
  scripts/adaptive-knowledge/pipeline-run.ts \
  tests/program/adaptive-knowledge-question-linking.test.ts \
  tests/program/adaptive-knowledge-pipeline-run.test.ts

git commit -m "feat(corpus): add scientific questions and study linking"
```

---

## Task 3: Contradiction analysis and conservative publication gate

**Files:**
- Create: `scripts/adaptive-knowledge/contradiction-analysis.ts`
- Create: `scripts/adaptive-knowledge/conservative-publication.ts`
- Create: `scripts/adaptive-knowledge/registry/doctrine.ts`
- Modify: `scripts/adaptive-knowledge/contracts.ts`
- Modify: `scripts/adaptive-knowledge/quality-gates.ts`
- Modify: `scripts/adaptive-knowledge/curation.ts`
- Modify: `scripts/adaptive-knowledge/publish.ts`
- Test: `tests/program/adaptive-knowledge-contradiction-analysis.test.ts`
- Test: `tests/program/adaptive-knowledge-conservative-publication.test.ts`
- Test: `tests/program/adaptive-knowledge-publish.test.ts`

- [ ] **Step 1: Add contradiction and doctrine contracts**

Add schemas for:
- `ScientificContradiction`
- `QuestionSynthesisDossier`
- `PublishedDoctrinePrinciple`
- `DoctrineRevisionEntry`
- `PublishedDoctrineSnapshot`

`PublishedDoctrinePrinciple` must include:
- `principleId`
- `statementFr`
- `conditionsFr`
- `limitsFr`
- `confidenceLevel`
- `questionIds`
- `studyIds`
- `revisionStatus`

- [ ] **Step 2: Write failing contradiction tests**

In `tests/program/adaptive-knowledge-contradiction-analysis.test.ts`:
- `contradiction analysis identifies divergent signals for the same question`
- `convergent studies do not create blocking contradictions`
- `question dossier records unresolved contradictions explicitly`

- [ ] **Step 3: Implement contradiction analysis**

Create `contradiction-analysis.ts` with functions:
- `analyzeQuestionContradictions({ question, linkedStudies })`
- `buildQuestionSynthesisDossier({ question, linkedStudies, contradictions })`

The first version can use rule-based divergence detection across:
- population/training level
- intervention differences
- outcome direction differences
- evidenceLevel mismatch

- [ ] **Step 4: Write failing conservative publication tests**

In `tests/program/adaptive-knowledge-conservative-publication.test.ts`:
- `candidate doctrine principle is rejected when unresolved contradiction is blocking`
- `candidate doctrine principle is rejected when too few studies support the question`
- `candidate doctrine principle is published when evidence, limits, and provenance are sufficient`
- `existing published principle can be reopened when new contradictions appear`

- [ ] **Step 5: Implement doctrine registry and publication gate**

Create `registry/doctrine.ts` and `conservative-publication.ts`.

Implement:
- persistent doctrine snapshot loader/writer
- revision history appends
- publication gate requiring explicit thresholds:
  - min relevant studies
  - explicit limitations
  - no unresolved blocking contradiction
  - confidence classification present

- [ ] **Step 6: Integrate with curation and publish flow**

Modify `curation.ts` and `publish.ts` so the published view now includes:
- research journal view
- scientific question dossiers view
- published doctrine view

Do not break existing `knowledge-bible.json` consumers yet; keep compatibility fields where needed.

- [ ] **Step 7: Add publish regressions**

In `tests/program/adaptive-knowledge-publish.test.ts`:
- `publish writes doctrine revision history alongside published doctrine snapshot`
- `publish can skip doctrine promotion while still preserving dossier outputs`
- `reopened doctrine principle stays out of active doctrine until reconsolidated`

Run:
```bash
npx tsx --test tests/program/adaptive-knowledge-contradiction-analysis.test.ts tests/program/adaptive-knowledge-conservative-publication.test.ts tests/program/adaptive-knowledge-publish.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add scripts/adaptive-knowledge/contracts.ts \
  scripts/adaptive-knowledge/contradiction-analysis.ts \
  scripts/adaptive-knowledge/conservative-publication.ts \
  scripts/adaptive-knowledge/registry/doctrine.ts \
  scripts/adaptive-knowledge/quality-gates.ts \
  scripts/adaptive-knowledge/curation.ts \
  scripts/adaptive-knowledge/publish.ts \
  tests/program/adaptive-knowledge-contradiction-analysis.test.ts \
  tests/program/adaptive-knowledge-conservative-publication.test.ts \
  tests/program/adaptive-knowledge-publish.test.ts

git commit -m "feat(corpus): add contradiction dossiers and conservative doctrine publication"
```

---

## Task 4: Published doctrine runtime boundary for program generation

**Files:**
- Create: `src/lib/coach/published-doctrine.ts`
- Modify: `src/lib/coach/knowledge-bible.ts`
- Modify: `src/server/services/program-generation-hybrid.ts`
- Test: `tests/program/coach-knowledge-bible.test.ts`
- Test: `tests/program/program-hybrid-generation.test.ts`

- [ ] **Step 1: Write failing runtime boundary tests**

In `tests/program/coach-knowledge-bible.test.ts`:
- `runtime doctrine loader reads published doctrine principles only`
- `runtime doctrine loader excludes unresolved question dossiers and raw study dossiers`
- `legacy knowledge-bible snapshots still load through compatibility bridge`

- [ ] **Step 2: Implement published doctrine loader**

Create `src/lib/coach/published-doctrine.ts` with:
- `loadPublishedDoctrine()`
- `renderPublishedDoctrineForPrompt()`

This loader should consume the published doctrine view, not the broader research registries.

- [ ] **Step 3: Keep compatibility layer in `knowledge-bible.ts`**

Modify `knowledge-bible.ts` so:
- old snapshots still work,
- new snapshots prefer published doctrine when present,
- raw study dossiers and question dossiers are not injected directly into the generation prompt.

- [ ] **Step 4: Update hybrid generation defaults and payload**

Modify `program-generation-hybrid.ts` so the generation request uses:
- doctrine principles,
- compact conditions,
- compact limits,
- compact provenance,
- no raw dossier injection.

- [ ] **Step 5: Add failing generation boundary tests**

In `tests/program/program-hybrid-generation.test.ts`:
- `program generation uses published doctrine and ignores unresolved dossier content`
- `program generation still works when only legacy knowledge-bible exists`

- [ ] **Step 6: Run runtime regression suite**

Run:
```bash
npx tsx --test tests/program/coach-knowledge-bible.test.ts tests/program/program-hybrid-generation.test.ts tests/program/adaptive-coaching-service.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/coach/published-doctrine.ts \
  src/lib/coach/knowledge-bible.ts \
  src/server/services/program-generation-hybrid.ts \
  tests/program/coach-knowledge-bible.test.ts \
  tests/program/program-hybrid-generation.test.ts

git commit -m "feat(runtime): enforce published doctrine boundary for program generation"
```

---

## Task 5: Supervision dashboard — read-only scientific observability

**Files:**
- Create: `src/server/services/worker-corpus-supervision.ts`
- Modify: `tests/program/worker-corpus-dashboard.test.ts`
- Modify: `tests/program/worker-corpus-dashboard-page.test.tsx`
- Modify: `tests/program/worker-corpus-dashboard-routes.test.ts`
- Modify: existing dashboard page/route files found during implementation

- [ ] **Step 1: Inspect existing dashboard entrypoints**

Before editing, identify the exact worker corpus dashboard files currently rendering:
- page loader
- server route(s)
- presentational components

Document them in the implementation diff / task notes before coding.

- [ ] **Step 2: Write failing supervision service tests**

Create `tests/program/worker-corpus-supervision.test.ts` with:
- `supervision service summarizes queue depth and blocked items`
- `supervision service summarizes document-state distribution`
- `supervision service summarizes scientific question maturity and contradiction counts`
- `supervision service summarizes published doctrine revisions`

- [ ] **Step 3: Implement supervision aggregation service**

Create `worker-corpus-supervision.ts` that reads registries and returns a read-only summary object with sections:
- `workflow`
- `documents`
- `questions`
- `doctrine`
- `recentResearchJournal`

- [ ] **Step 4: Add failing dashboard UI tests**

Extend worker corpus dashboard tests to require:
- queue summary cards
- document-state distribution
- question maturity list/table
- doctrine revision summary
- recent journal/research activity list

- [ ] **Step 5: Implement dashboard read-only views**

Update the worker dashboard page so it exposes 4 major read-only views:
- workflow status
- document library status
- scientific questions
- published doctrine

Keep the surface diagnostic-focused. No editing controls in this phase.

- [ ] **Step 6: Run dashboard regression suite**

Run:
```bash
npx tsx --test tests/program/worker-corpus-supervision.test.ts tests/program/worker-corpus-dashboard.test.ts tests/program/worker-corpus-dashboard-page.test.tsx tests/program/worker-corpus-dashboard-routes.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/server/services/worker-corpus-supervision.ts \
  tests/program/worker-corpus-supervision.test.ts \
  tests/program/worker-corpus-dashboard.test.ts \
  tests/program/worker-corpus-dashboard-page.test.tsx \
  tests/program/worker-corpus-dashboard-routes.test.ts \
  [dashboard page/route files found during implementation]

git commit -m "feat(dashboard): add scientific supervision views for worker corpus"
```

---

## Task 6: End-to-end research-worker verification

**Files:**
- Modify: `tests/program/adaptive-knowledge-worker.test.ts`
- Modify: `tests/program/adaptive-knowledge-pipeline-run.test.ts`
- Modify: docs if runbook updates are needed

- [ ] **Step 1: Add end-to-end regression test for persistent research-worker behavior**

Add a test covering:
- first run persists registries,
- second run reuses registry state instead of starting from zero,
- question dossiers remain open when doctrine is not yet publishable,
- published doctrine updates only when thresholds are met.

- [ ] **Step 2: Add worker command regression for long-lived state**

In `tests/program/adaptive-knowledge-worker.test.ts`, add:
- `worker command preserves registries across runs`
- `worker command can complete with open scientific questions and no new doctrine publication`

- [ ] **Step 3: Run full worker corpus regression suite**

Run:
```bash
npx tsx --test tests/program/adaptive-knowledge-*.test.ts tests/program/coach-knowledge-bible.test.ts tests/program/program-hybrid-generation.test.ts tests/program/worker-corpus-*.test.ts
```
Expected: all targeted suites pass.

- [ ] **Step 4: Run a local end-to-end worker command**

With local env loaded if needed:
```bash
set -a && source .env.local && set +a
ADAPTIVE_KNOWLEDGE_OUTPUT_ROOT_DIR=$(mktemp -d /tmp/coach-research-worker-XXXXXX) \
PIPELINE_MAX_QUERIES_PER_RUN=2 \
PIPELINE_PAGES_PER_QUERY=1 \
PIPELINE_FULLTEXT_BUDGET_PER_RUN=2 \
PIPELINE_REQUEST_TIMEOUT_MS=60000 \
npx tsx scripts/adaptive-knowledge/refresh-corpus.ts --bootstrap
```
Verify:
- registries exist under `registry/`
- scientific questions exist
- doctrine view exists
- dashboard service can read the output root

- [ ] **Step 5: Commit**

```bash
git add tests/program/adaptive-knowledge-worker.test.ts \
  tests/program/adaptive-knowledge-pipeline-run.test.ts \
  [docs updated during task, if any]

git commit -m "test(corpus): verify persistent research-worker behavior end to end"
```
