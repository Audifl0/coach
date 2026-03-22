# Worker Corpus V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the worker corpus into a deep scientific library with full-text extraction, rich thematic synthesis, a French booklet, and enriched LLM program-generation prompts.

**Architecture:** Incremental 6-task evolution of the existing pipeline at `scripts/adaptive-knowledge/`. Each task builds on the previous, is independently testable, and deployable. The worker keeps running in prod between tasks.

**Tech Stack:** TypeScript, Node.js, GPT-4o-mini (OpenAI Responses API), PubMed E-utilities, PubMed Central OA, OpenAlex, Crossref, Unpaywall API, Zod schemas.

**Spec:** `docs/superpowers/specs/2026-03-22-worker-corpus-v2-design.md`

---

## File Map

### New files
- `scripts/adaptive-knowledge/connectors/pmc.ts` — PubMed Central full-text connector
- `scripts/adaptive-knowledge/connectors/unpaywall.ts` — Unpaywall OA detection connector
- `scripts/adaptive-knowledge/fulltext-acquisition.ts` — orchestrates PMC + Unpaywall to get full-text for a record
- `scripts/adaptive-knowledge/study-card-extraction.ts` — GPT-based structured StudyCard extraction per paper
- `scripts/adaptive-knowledge/thematic-synthesis.ts` — GPT-based thematic consolidation per topic
- `scripts/adaptive-knowledge/booklet-renderer.ts` — generates French markdown booklet from synthesis data
- `tests/program/adaptive-knowledge-fulltext.test.ts` — tests for PMC, Unpaywall, fulltext acquisition
- `tests/program/adaptive-knowledge-study-cards.test.ts` — tests for StudyCard extraction
- `tests/program/adaptive-knowledge-thematic-synthesis.test.ts` — tests for thematic synthesis
- `tests/program/adaptive-knowledge-booklet.test.ts` — tests for booklet rendering

### Modified files
- `scripts/adaptive-knowledge/discovery.ts` — expanded topics + sub-queries
- `scripts/adaptive-knowledge/connectors/pubmed.ts` — pagination support
- `scripts/adaptive-knowledge/connectors/crossref.ts` — pagination support
- `scripts/adaptive-knowledge/connectors/openalex.ts` — pagination support
- `scripts/adaptive-knowledge/connectors/shared.ts` — pagination types, fulltext status tracking
- `scripts/adaptive-knowledge/contracts.ts` — StudyCard schema, ThematicSynthesis schema, enriched types
- `scripts/adaptive-knowledge/config.ts` — new config fields (pages per query, fulltext budget, synthesis budget)
- `scripts/adaptive-knowledge/pipeline-run.ts` — wire fulltext acquisition, study card extraction, thematic synthesis, booklet into pipeline stages
- `scripts/adaptive-knowledge/curation.ts` — output enriched knowledge-bible.json with StudyCards + ThematicSynthesis
- `scripts/adaptive-knowledge/remote-synthesis.ts` — study card extraction prompts, thematic consolidation prompts
- `src/lib/coach/knowledge-bible.ts` — load enriched bible with ThematicSynthesis + StudyCards
- `src/server/services/program-generation-hybrid.ts` — enriched prompt with detailed principles + study takeaways

---

## Task 1: Discovery élargie + pagination

**Files:**
- Modify: `scripts/adaptive-knowledge/discovery.ts`
- Modify: `scripts/adaptive-knowledge/connectors/pubmed.ts`
- Modify: `scripts/adaptive-knowledge/connectors/crossref.ts`
- Modify: `scripts/adaptive-knowledge/connectors/openalex.ts`
- Modify: `scripts/adaptive-knowledge/connectors/shared.ts`
- Modify: `scripts/adaptive-knowledge/config.ts`
- Modify: `scripts/adaptive-knowledge/pipeline-run.ts`
- Test: `tests/program/adaptive-knowledge-connectors.test.ts`
- Test: `tests/program/adaptive-knowledge-pipeline-run.test.ts`

### Step 1: Expand discovery topics

- [ ] Add sub-queries to `DEFAULT_DISCOVERY_TOPICS` in `discovery.ts`. Expand from 6 topics × 2 subtopics (12 queries) to 8 topics × 3-4 subtopics (24-32 queries). New topics: `periodization` (linear, undulating, block), `rest-intervals` (hypertrophy rest, strength rest), `warmup-mobility` (warmup protocols, mobility for lifters). Existing topics get a third subtopic each.

- [ ] Add `pagesPerQuery` field to `AdaptiveKnowledgePipelineConfig` in `config.ts`, default `5`. Add env key `PIPELINE_PAGES_PER_QUERY`.

- [ ] Write test in `adaptive-knowledge-connectors.test.ts`: "discovery plan with expanded topics covers at least 8 distinct topic keys". Verify `buildAdaptiveKnowledgeDiscoveryPlan({ maxQueries: 30 })` returns queries spanning 8+ topic keys.

- [ ] Run test, verify it fails (current plan only has 6 topic keys).

- [ ] Implement the expanded topics in `discovery.ts`.

- [ ] Run test, verify pass.

- [ ] Commit: `feat: expand discovery to 8+ topics with 24-32 sub-queries`

### Step 2: Add pagination to connectors

- [ ] Add `ConnectorPaginationInput` to `shared.ts`:
```typescript
export type ConnectorPaginationInput = {
  page?: number;
  pagesPerQuery?: number;
  cursor?: string;
};
```
Add `pagination?: ConnectorPaginationInput` to `ConnectorFetchInput`. Add `nextCursor` and `hasMore` to `ConnectorFetchResult.telemetry`.

- [ ] Update `pubmed.ts`: use `retstart` param in esearch URL = `page * 20`. After fetching, set `telemetry.hasMore = ids.length === 20` and `telemetry.nextCursor = String((page + 1) * 20)`.

- [ ] Update `crossref.ts`: add `offset` param = `page * 20` to Crossref URL. Set `telemetry.hasMore = result.value.length === 20`.

- [ ] Update `openalex.ts`: add `page` param = `page + 1` (1-indexed). Set `telemetry.hasMore = result.value.length === 25`.

- [ ] Write test: "connectors respect pagination page parameter and report hasMore". Mock fetch to return 20 results, call with `pagination: { page: 2 }`, verify the URL includes the offset/page param.

- [ ] Run test, verify pass.

- [ ] Commit: `feat: add pagination support to all three connectors`

### Step 3: Wire pagination into pipeline

- [ ] Modify `runAdaptiveKnowledgePipeline` in `pipeline-run.ts`: for each discovery query, loop from page 0 to `config.pagesPerQuery - 1`, calling the connector with `pagination: { page }`. Accumulate results. Stop early if `telemetry.hasMore === false` or if connector returns 0 records.

- [ ] Write test in `adaptive-knowledge-pipeline-run.test.ts`: "pipeline fetches multiple pages per query up to configured limit". Provide connectors that return `hasMore: true` for pages 0-2 and `hasMore: false` for page 3. Verify total records = sum of all pages. Verify connector was called 4 times (pages 0,1,2,3).

- [ ] Run test, verify pass.

- [ ] Commit: `feat: pipeline paginates connectors up to pagesPerQuery depth`

---

## Task 2: Connecteurs PMC + Unpaywall

**Files:**
- Create: `scripts/adaptive-knowledge/connectors/pmc.ts`
- Create: `scripts/adaptive-knowledge/connectors/unpaywall.ts`
- Create: `scripts/adaptive-knowledge/fulltext-acquisition.ts`
- Modify: `scripts/adaptive-knowledge/connectors/shared.ts`
- Modify: `scripts/adaptive-knowledge/contracts.ts`
- Modify: `scripts/adaptive-knowledge/config.ts`
- Modify: `scripts/adaptive-knowledge/pipeline-run.ts`
- Create: `tests/program/adaptive-knowledge-fulltext.test.ts`

### Step 1: PMC connector

- [ ] Write test in `adaptive-knowledge-fulltext.test.ts`: "PMC connector extracts full-text sections from XML response". Provide a mock PMC XML response with `<body><sec>` sections. Verify the connector returns structured sections (abstract, methods, results, discussion, conclusion) as plain text.

- [ ] Run test, verify fail.

- [ ] Create `connectors/pmc.ts`. Function `fetchPmcFullText(input: { pmcId: string; fetchImpl?: ... }): Promise<PmcFullTextResult>`. Calls `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id={pmcId}&rettype=full&retmode=xml`. Parses XML with regex to extract sections. Returns `{ sections: { abstract, methods, results, discussion, conclusion }, fullText: string, wordCount: number }`. Returns `null` sections gracefully when not found.

- [ ] Run test, verify pass.

- [ ] Commit: `feat: PMC full-text connector with section extraction`

### Step 2: Unpaywall connector

- [ ] Write test: "Unpaywall connector returns OA location for known open-access DOI". Mock the Unpaywall API response with `best_oa_location.url_for_landing_page` and `is_oa: true`.

- [ ] Run test, verify fail.

- [ ] Create `connectors/unpaywall.ts`. Function `checkUnpaywallAccess(input: { doi: string; email?: string; fetchImpl?: ... }): Promise<UnpaywallResult>`. Calls `https://api.unpaywall.org/v2/{doi}?email={email}`. Returns `{ isOa: boolean, oaUrl: string | null, pmcId: string | null }`. Email defaults to env `UNPAYWALL_EMAIL` or `'coach-app@localhost'`.

- [ ] Run test, verify pass.

- [ ] Commit: `feat: Unpaywall OA detection connector`

### Step 3: Full-text acquisition orchestrator

- [ ] Write test: "fulltext acquisition tries PMC first, falls back to Unpaywall, degrades to abstract-only". Provide a record with a DOI. Mock PMC to return full-text. Verify result has `source: 'pmc'` and sections. Then mock PMC to fail and Unpaywall to return an OA URL. Verify result has `source: 'unpaywall'`. Then mock both to fail. Verify result has `source: 'abstract-only'`.

- [ ] Run test, verify fail.

- [ ] Create `fulltext-acquisition.ts`. Function `acquireFullText(input: { record: NormalizedEvidenceRecord; pmcFetch?: ...; unpaywallCheck?: ... }): Promise<FullTextAcquisitionResult>`. Extracts PMID from record URL for PMC lookup. Falls back to Unpaywall via DOI. Falls back to abstract-only. Returns `{ source: 'pmc' | 'unpaywall' | 'abstract-only', sections?: ..., fullText?: string, wordCount: number }`.

- [ ] Run test, verify pass.

- [ ] Add `fulltextBudgetPerRun` to config (default: 20). Add env `PIPELINE_FULLTEXT_BUDGET_PER_RUN`.

- [ ] Commit: `feat: full-text acquisition orchestrator with PMC + Unpaywall + fallback`

### Step 4: Wire into pipeline

- [ ] Modify `pipeline-run.ts`: after ranking, before synthesis, run `acquireFullText` on top N selected records (up to `config.fulltextBudgetPerRun`). Update `record.documentary.status` to `full-text-ready` when full-text is acquired. Store full-text content in a `fulltext-cache/` subdirectory of the snapshot.

- [ ] Write test: "pipeline acquires full-text for top ranked records and updates documentary status". Verify records that got full-text have `documentary.status === 'full-text-ready'`.

- [ ] Run test, verify pass.

- [ ] Commit: `feat: pipeline acquires full-text before synthesis stage`

---

## Task 3: Extraction GPT structurée (StudyCards)

**Files:**
- Create: `scripts/adaptive-knowledge/study-card-extraction.ts`
- Modify: `scripts/adaptive-knowledge/contracts.ts`
- Modify: `scripts/adaptive-knowledge/remote-synthesis.ts`
- Modify: `scripts/adaptive-knowledge/pipeline-run.ts`
- Create: `tests/program/adaptive-knowledge-study-cards.test.ts`

### Step 1: StudyCard schema

- [ ] Add `StudyCard` Zod schema to `contracts.ts` matching the spec's `StudyCard` type. Include all fields: recordId, title, authors, year, journal, doi, studyType, population, protocol, results, practicalTakeaways, limitations, safetySignals, evidenceLevel, topicKeys, extractionSource, langueFr. Export `parseStudyCard` and `type StudyCard`.

- [ ] Write test in `adaptive-knowledge-study-cards.test.ts`: "StudyCard schema validates a well-formed card and rejects incomplete ones". Build a valid StudyCard object, verify `parseStudyCard` passes. Remove required fields, verify it throws.

- [ ] Run test, verify pass.

- [ ] Commit: `feat: StudyCard Zod schema and parser`

### Step 2: GPT extraction prompt + client

- [ ] Create `study-card-extraction.ts`. Function `extractStudyCards(input: { records: NormalizedEvidenceRecord[]; fullTextMap: Map<string, string>; client: CorpusRemoteSynthesisClient; runId: string }): Promise<StudyCard[]>`.

- [ ] For each record, build a prompt with the full-text (if available) or abstract. Use the OpenAI Responses API with `json_schema` strict mode and the StudyCard schema. Group records in lots of 2-3 to reduce API calls.

- [ ] The system prompt instructs GPT to: extract structured fields from the paper, translate title and summary to French, identify practical takeaways for a strength training coach, flag safety signals, and rate evidence level.

- [ ] Write test: "extractStudyCards produces valid cards from mock records with abstracts". Provide a mock OpenAI client that returns a valid StudyCard JSON. Verify the output passes `parseStudyCard`.

- [ ] Write test: "extractStudyCards uses full-text when available in fullTextMap". Verify the prompt sent to the mock client includes the full-text content, not just the abstract.

- [ ] Run tests, verify pass.

- [ ] Commit: `feat: GPT-based StudyCard extraction with full-text support`

### Step 3: Wire into pipeline

- [ ] Modify `pipeline-run.ts`: after full-text acquisition and before thematic synthesis, call `extractStudyCards` on selected records. Store StudyCards in `study-cards.json` in the snapshot. Pass StudyCards to the synthesis stage.

- [ ] Write test: "pipeline produces study-cards.json in snapshot with valid StudyCard entries".

- [ ] Run test, verify pass.

- [ ] Commit: `feat: pipeline produces StudyCards via GPT extraction stage`

---

## Task 4: Synthèse thématique GPT

**Files:**
- Create: `scripts/adaptive-knowledge/thematic-synthesis.ts`
- Modify: `scripts/adaptive-knowledge/contracts.ts`
- Modify: `scripts/adaptive-knowledge/pipeline-run.ts`
- Modify: `scripts/adaptive-knowledge/curation.ts`
- Create: `tests/program/adaptive-knowledge-thematic-synthesis.test.ts`

### Step 1: ThematicSynthesis schema

- [ ] Add `ThematicSynthesis` Zod schema to `contracts.ts` matching the spec. Fields: topicKey, topicLabel, principlesFr (array with id, title, statement, conditions, guardrail, evidenceLevel, sourceCardIds), summaryFr, gapsFr, studyCount, lastUpdated. Export `parseThematicSynthesis` and type.

- [ ] Write test in `adaptive-knowledge-thematic-synthesis.test.ts`: "ThematicSynthesis schema validates well-formed synthesis and rejects incomplete".

- [ ] Run test, verify pass.

- [ ] Commit: `feat: ThematicSynthesis Zod schema and parser`

### Step 2: GPT thematic consolidation

- [ ] Create `thematic-synthesis.ts`. Function `synthesizeThematicPrinciples(input: { topicKey: string; topicLabel: string; studyCards: StudyCard[]; client: CorpusRemoteSynthesisClient; runId: string }): Promise<ThematicSynthesis>`.

- [ ] System prompt instructs GPT to: consolidate study cards into 2-4 actionable principles per topic in French, identify conditions where each principle applies or doesn't, flag knowledge gaps, and rate evidence strength. Output must match ThematicSynthesis JSON schema (strict mode).

- [ ] Write test: "synthesizeThematicPrinciples produces valid ThematicSynthesis from mock study cards". Provide a mock client. Verify output has principlesFr with guardrails and sourceCardIds pointing to input cards.

- [ ] Run test, verify pass.

- [ ] Commit: `feat: GPT thematic synthesis per topic with rich French principles`

### Step 3: Wire into pipeline + enrich curation

- [ ] Modify `pipeline-run.ts`: after StudyCard extraction, group cards by topicKey. Call `synthesizeThematicPrinciples` for each topic. Store all `ThematicSynthesis` in `thematic-synthesis.json` in the snapshot.

- [ ] Modify `curation.ts`: `curateAdaptiveKnowledgeBible` now includes `thematicSyntheses: ThematicSynthesis[]` and `studyCards: StudyCard[]` in the output `knowledge-bible.json`, alongside the existing `principles` and `sources`.

- [ ] Write test: "pipeline produces thematic-synthesis.json and enriched knowledge-bible.json".

- [ ] Run test, verify pass.

- [ ] Commit: `feat: pipeline produces thematic synthesis and enriched knowledge bible`

---

## Task 5: Livret Markdown FR

**Files:**
- Create: `scripts/adaptive-knowledge/booklet-renderer.ts`
- Modify: `scripts/adaptive-knowledge/pipeline-run.ts`
- Create: `tests/program/adaptive-knowledge-booklet.test.ts`

### Step 1: Booklet renderer

- [ ] Write test in `adaptive-knowledge-booklet.test.ts`: "booklet renderer produces valid markdown with sections for each topic, study tables, and bibliography". Provide 2 ThematicSynthesis and 4 StudyCards. Verify output contains `# Bibliothèque Scientifique`, topic headings, principle bullets, study table rows, and bibliography entries.

- [ ] Run test, verify fail.

- [ ] Create `booklet-renderer.ts`. Function `renderBookletMarkdown(input: { thematicSyntheses: ThematicSynthesis[]; studyCards: StudyCard[]; generatedAt: string; snapshotId: string }): string`. Produces a structured markdown document per the spec's template: title, date, study count, then per-topic sections (synthèse, principes with conditions, études table), then bibliographie complète.

- [ ] Run test, verify pass.

- [ ] Commit: `feat: French scientific booklet markdown renderer`

### Step 2: Wire into pipeline

- [ ] Modify `pipeline-run.ts`: after thematic synthesis, call `renderBookletMarkdown`. Write output to `booklet-fr.md` in the snapshot directory.

- [ ] Write test: "pipeline writes booklet-fr.md to snapshot directory".

- [ ] Run test, verify pass.

- [ ] Commit: `feat: pipeline generates French booklet in snapshot`

---

## Task 6: Enrichissement prompt génération programmes

**Files:**
- Modify: `src/lib/coach/knowledge-bible.ts`
- Modify: `src/server/services/program-generation-hybrid.ts`
- Modify: `tests/program/coach-knowledge-bible.test.ts`

### Step 1: Load enriched bible

- [ ] Modify `loadCoachKnowledgeBible` in `knowledge-bible.ts`: when `knowledge-bible.json` contains `thematicSyntheses` and `studyCards`, load them. Map `ThematicSynthesis.principlesFr` to `CoachKnowledgePrinciple` (using `statement` as `description`, preserving `conditions`, `evidenceLevel`, `sourceCardIds`). Map `StudyCard` to `CoachKnowledgeSource` (using `langueFr.resumeFr` as `summary`, adding `practicalTakeaways`).

- [ ] Increase default limits: `principleLimit: 6`, `sourceLimit: 8`.

- [ ] Write test in `coach-knowledge-bible.test.ts`: "loadCoachKnowledgeBible loads enriched thematic principles and study card sources". Create a `knowledge-bible.json` with thematic syntheses and study cards. Verify loaded bible has principles with conditions and sources with practicalTakeaways.

- [ ] Run test, verify pass.

- [ ] Commit: `feat: knowledge bible loads enriched thematic principles and study cards`

### Step 2: Enrich program generation prompt

- [ ] Modify `renderCoachKnowledgeBibleForPrompt` in `knowledge-bible.ts`: for principles that have `conditions`, append `conditions: [list]` to the prompt line. For sources that have `practicalTakeaways`, append takeaways as sub-bullets.

- [ ] Modify `resolveProgramKnowledgeBible` in `program-generation-hybrid.ts`: increase `principleLimit` to 6 and `sourceLimit` to 8.

- [ ] Write test: "renderCoachKnowledgeBibleForPrompt includes conditions and takeaways for enriched entries". Build a bible with enriched data, render the prompt, verify conditions and takeaways appear in output.

- [ ] Run test, verify pass.

- [ ] Commit: `feat: program generation prompt includes conditions and practical takeaways`

### Step 3: Full regression

- [ ] Run all worker corpus tests:
```bash
npx tsx --test tests/program/adaptive-knowledge-*.test.ts tests/program/coach-knowledge-bible.test.ts tests/program/adaptive-evidence-corpus-loader.test.ts
```
Verify all pass.

- [ ] Run a manual pipeline execution to verify end-to-end:
```bash
npx tsx scripts/adaptive-knowledge/refresh-corpus.ts
```
Verify `knowledge-bible.json` contains `thematicSyntheses` and `studyCards`. Verify `booklet-fr.md` exists and is readable.

- [ ] Commit: `chore: full regression pass for worker corpus v2`
