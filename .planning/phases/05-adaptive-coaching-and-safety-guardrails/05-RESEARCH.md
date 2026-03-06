# Phase 05: Adaptive Coaching and Safety Guardrails - Research

**Researched:** 2026-03-05
**Domain:** Adaptive coaching orchestration, LLM decision governance, and safety guardrails in a Next.js + Prisma monolith
**Confidence:** MEDIUM-HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Cerveau coaching (LLM-first)
- Le **LLM est le decideur principal** des recommandations (exercices, reps, charge, action progress/hold/deload/substitution).
- Les decisions doivent etre **interconnectees**: profil athlete, contraintes, limitations/douleurs, historique recent, adherence, feedback fatigue/readiness.
- Le systeme conserve une posture prudente: recommandations conservatrices par defaut en cas d'incertitude.

### Gouvernance scientifique
- La logique coaching doit etre fondee sur une documentation scientifique reconnue du milieu sport/sport science.
- Politique retenue: **mix large** (consensus/guidelines + revues/travaux de reference + expertise pratique reputee) avec tracabilite des principes utilises.
- Le savoir scientifique/expertise est stocke dans un **dossier local versionne** (Markdown/JSON) pour auditabilite et reproductibilite.
- Alimentation du corpus via **agent dedie**: recherche web de litterature sport pertinente, synthese structuree, et controles de coherence.
- Gouvernance retenue: **mise a jour automatique** avec verification reguliere de la qualite du corpus.

### Confirmations utilisateur (ADAP-03)
- Confirmation obligatoire pour changements a fort impact: **deload** et **substitution**.
- Les progressions standards dans les bornes SAFE-01 ne sont pas traitees comme "fort impact".
- Validite de confirmation: **seance suivante uniquement**.
- Surface dashboard: **banniere explicite** avec raison, impact, et actions Accepter/Refuser.

### Garde-fous securite (SAFE-01/02/03 + DASH-03)
- SAFE-01: bornes de progression **strictes moderees** (pas de saut agressif).
- SAFE-02: en conflit limitation/douleur, **alerter mais autoriser** la decision utilisateur.
- SAFE-03: si sortie LLM invalide/indisponible ou confiance insuffisante, fallback: **conserver la derniere recommandation appliquee uniquement si elle reste conservative (SAFE-01), sinon hold conservateur**.
- DASH-03: afficher une **carte "Prevision prudente"** quand warning/fallback est actif.

### Acces connaissance et explications
- Acces du LLM au corpus via **RAG top-k** contraint par regles de priorite et garde-fous.
- Les explications utilisateur doivent inclure **2-3 raisons** et une **source abregee** (guide/revue/expertise) pour transparence.

### Claude's Discretion
- Seuils numeriques exacts des bornes "strictes moderees" tant qu'ils restent prudents.
- Microcopy exacte des raisons/alertes et du message "Prevision prudente".
- Modele de presentation des justifications (2-3 raisons actionnables) dans le dashboard.

### Deferred Ideas (OUT OF SCOPE)
- Recommandation 100% autonome sans garde-fous de securite.
- Extension hors perimetre phase 5 (tendances avancees phase 6, nutrition, social, etc.).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ADAP-01 | User can receive next-session recommendation (progress, hold, deload, or substitution) based on latest logs. | Recommends an event-driven adaptive engine that assembles latest profile + logs + history, retrieves evidence snippets, gets typed LLM proposal, then applies deterministic policy checks before persistence. |
| ADAP-02 | User can see an explicit reason for each recommended change. | Defines mandatory explanation payload (`2-3` reasons + short evidence provenance tags) as part of recommendation contract, not optional UI text. |
| ADAP-03 | User must confirm high-impact recommendation changes before they are applied. | Introduces risk-tiered action model where `deload` and `substitution` become `pending_confirmation` with session-scoped TTL and explicit accept/reject workflow. |
| SAFE-01 | User cannot receive recommendations exceeding configured conservative progression bounds. | Adds policy clamp layer that enforces hard numeric bounds after LLM output and before persistence/apply. |
| SAFE-02 | User receives warning when recommendation conflicts with declared limitation/pain flags. | Adds deterministic limitation conflict detector producing warning metadata while keeping user override path. |
| SAFE-03 | User falls back to conservative default plan when recommendation confidence is insufficient. | Adds confidence gate + invalid-output gate, with deterministic fallback precedence (reuse last conservative recommendation else hold). |
| DASH-03 | User can view upcoming session forecast after adaptation. | Adds dashboard forecast view model driven by latest recommendation state, including explicit "Prevision prudente" card when warning/fallback flags are active. |
</phase_requirements>

## Summary

Phase 05 should be implemented as a constrained LLM decision pipeline, not a free-form chat feature. The current codebase already has strong prerequisites for this approach: strict Zod contracts, account-scoped DAL patterns, and route/service separation. The fastest reliable path is to add one `adaptive-coaching` domain that composes existing session/profile/program data, asks the LLM for a structured proposal, then runs mandatory deterministic guardrails before writing any recommendation.

For evidence governance, the locked decision of a local versioned corpus is strong and should be formalized as an auditable ingest pipeline with quality gates. The corpus should distinguish source classes (guideline/review/expert), store provenance metadata, and assign evidence confidence and freshness. This keeps coaching behavior explainable and reviewable when recommendations are challenged.

The key planning risk is letting safety logic spread across routes/UI. Keep all recommendation validity, progression bounds, confidence/fallback, and confirmation-state transitions in one server-side policy engine with contract-tested outputs. UI surfaces should only render state.

**Primary recommendation:** Implement an LLM-first but policy-governed recommendation state machine (`proposed -> validated -> pending_confirmation|applied|fallback`) with typed contracts, auditable evidence links, and deterministic safety enforcement.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | `16.1.0` (repo) | Route handlers + dashboard integration | Already the project runtime; minimizes infra drift. |
| `@prisma/client` + `prisma` | `7.4.0` (repo) | Recommendation state persistence + history joins | Existing account-scoped DAL patterns already depend on Prisma. |
| `zod` | `^4.1.12` (repo) | LLM output contract validation + API payload parsing | Current boundary-validation standard in codebase. |
| Provider LLM API with strict structured output | Provider capability, no new SDK required in Phase 05 | Typed recommendation proposal generation | Structured JSON outputs reduce parser fragility and fallback churn. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pino` | `^10.1.0` (repo) | Audit logs for recommendation decision trace | Log policy decisions, fallback reasons, confirmation events. |
| `tsx --test` (`node:test`) | existing | Unit/integration coverage | Keep test harness consistent with current suite. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-process orchestration in monolith | Queue/worker pipeline | Queue improves decoupling but adds Redis/ops before Phase 05 value is validated. |
| Direct free-form LLM text output | Tool-call/JSON-schema strict outputs | Free-form is faster initially but causes unstable parsing and unsafe edge cases. |
| Runtime web retrieval per request | Local versioned corpus + periodic ingest | Live retrieval improves freshness but reduces reproducibility and auditability. |

**Installation:**
```bash
# No mandatory new dependency for Phase 05 baseline.
# Reuse current stack and add provider client via native fetch if needed.
pnpm install
```

## Architecture Patterns

### Recommended Project Structure
```text
src/
├── lib/adaptive-coaching/
│   ├── contracts.ts              # Zod schemas for recommendation proposal/validated output
│   ├── policy.ts                 # SAFE-01/02/03 enforcement and action clamping
│   ├── orchestrator.ts           # context assembly + retrieval + LLM call + policy pipeline
│   ├── evidence.ts               # corpus retrieval and provenance formatting
│   └── confidence.ts             # confidence thresholds and fallback gates
├── server/services/
│   └── adaptive-coaching.ts      # service entry points for generate/confirm/reject
├── server/dal/
│   └── adaptive-coaching.ts      # recommendation persistence + state transitions
└── app/api/program/adaptation/
    ├── route.ts                  # generate recommendation endpoint
    └── [recommendationId]/confirm/route.ts
```

### Pattern 1: Guarded LLM Decision Pipeline
**What:** LLM proposes; deterministic policy validates/clamps/flags before apply.
**When to use:** Every recommendation generation and regeneration event.
**Example:**
```typescript
const proposal = parseLlmProposal(rawLlmJson);
const validated = applySafetyPolicy({ proposal, athleteContext, bounds });
const outcome = gateByConfidence(validated, athleteContext);
return persistRecommendation(outcome);
```

### Pattern 2: Explicit Recommendation State Machine
**What:** Persist recommendation status transitions (`validated`, `pending_confirmation`, `applied`, `rejected`, `fallback_applied`).
**When to use:** ADAP-03 confirmation and SAFE-03 fallback traceability.
**Example:**
```typescript
if (isHighImpact(action)) {
  return save({ status: 'pending_confirmation', expiresAt: nextSessionDate });
}
return save({ status: 'applied' });
```

### Pattern 3: Evidence-Backed Explanation Envelope
**What:** Recommendation contains reason codes + short evidence references from local corpus.
**When to use:** ADAP-02 and dashboard rendering.
**Example:**
```typescript
explanation: {
  reasons: ['fatigue_up', 'adherence_drop'],
  userText: ['Fatigue elevee sur 2 seances', 'RPE au-dessus de la cible'],
  evidenceRefs: ['GUIDE-ACSM-RT-2009', 'REVIEW-load-management-2024']
}
```

### Anti-Patterns to Avoid
- **Policy checks in UI route handlers:** Causes divergence and weak testability; keep checks in one domain service.
- **Applying high-impact actions immediately:** Violates ADAP-03.
- **Treating missing evidence as neutral:** Must lower confidence and increase fallback likelihood.
- **Single confidence scalar from LLM only:** Blend model confidence with deterministic data-quality/rule-confidence signals.

## Evidence Governance (Scientific Corpus)

### Corpus Design
- Use a versioned local folder (locked decision) like `.planning/knowledge/adaptive-coaching/` with:
  - `sources/*.md` (normalized notes)
  - `index.json` (id, source_type, title, url, date, evidence_level, freshness_days)
  - `principles.json` (machine-readable coaching principles consumed by retrieval)
- Enforce immutable source IDs and prompt-level citation by ID to keep recommendations auditable.

### Ingestion and Quality Gates
- Dedicated ingestion agent proposes updates as PR-ready diffs.
- Required checks before accepting new source:
  - metadata completeness (url/date/type)
  - duplicate/contradiction detection against existing principles
  - evidence-level labeling (`guideline > systematic_review > narrative_review > expert_opinion`)
  - freshness rule (e.g., auto-review after 180 days for fast-moving topics)
- Reject source updates that cannot be traced to primary publication.

### Governance Policy
- Define "evidence budget" for recommendations: at least one high- or medium-strength source must support each reason code used in ADAP-02 explanations.
- Maintain change log mapping corpus updates to recommendation behavior changes.
- Add a rollback mechanism: pin corpus snapshot hash per deployment.

## LLM Decision Orchestration with Guardrails

### Recommended Flow
1. Trigger on relevant event (`session completed`, manual regenerate, profile constraints changed).
2. Build account-scoped context bundle (profile limitations, latest logs, adherence trend, previous recommendation outcome).
3. Retrieve top-k evidence snippets from local corpus by reason/action intent.
4. Request structured LLM proposal (action + progression params + reasons + cited evidence IDs + confidence fields).
5. Validate schema strictly with Zod.
6. Run policy engine:
   - SAFE-01: clamp progression deltas
   - SAFE-02: compute limitation conflict warning
   - SAFE-03: confidence/data validity gate -> fallback decision
7. Determine confirmation state for high-impact actions (ADAP-03).
8. Persist recommendation and dashboard forecast projection.

### Guardrail Ordering (must be fixed)
1. Structural validity (schema parse)
2. Data integrity (context completeness + stale detection)
3. Safety bounds (SAFE-01)
4. Limitation conflict warning tagging (SAFE-02)
5. Confidence gate + fallback (SAFE-03)
6. Confirmation gate for high impact (ADAP-03)

### Fallback Policy (SAFE-03)
- If output invalid/unavailable/low confidence:
  - try last applied recommendation only if re-check passes SAFE-01
  - otherwise produce deterministic `hold` conservative action
- Always annotate fallback reason for dashboard (`prevision_prudente: true`).

## Data Model and API Advice

### Proposed Persistence Additions
- `AdaptiveRecommendation`
  - `id`, `userId`, `plannedSessionId`, `status`, `actionType`
  - `deltaLoadPct`, `deltaRep`, `substitutionExerciseKey`
  - `confidenceModel`, `confidencePolicy`, `fallbackUsed`, `warningLimitationConflict`
  - `reasonsJson`, `evidenceRefsJson`, `expiresAt`, `createdAt`, `updatedAt`
- `AdaptiveRecommendationDecision`
  - append-only decision trace (policy steps + clamp/fallback reasons)

### API Surface
- `POST /api/program/adaptation` -> generate/regenerate next-session recommendation
- `POST /api/program/adaptation/:id/confirm` -> accept high-impact recommendation
- `POST /api/program/adaptation/:id/reject` -> reject high-impact recommendation (forces conservative hold/substitution fallback as configured)
- Extend dashboard read path to include forecast payload + prudence card state.

## Don’t Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Free-form parser for LLM output | Regex/string parsing heuristics | Structured JSON schema + Zod parse | Safer failure modes and deterministic fallback path. |
| Ad-hoc confidence formula in UI | Inline front-end scoring logic | Server-side policy confidence module | Keeps SAFE-03 deterministic and testable. |
| Per-endpoint safety checks | Duplicated route-level guards | Central policy engine function | Prevents policy drift and regressions. |
| Untracked knowledge updates | Manual copy-paste docs | Versioned corpus + metadata manifest + audit log | Supports reproducibility and incident review. |

**Key insight:** The complexity is governance and failure handling, not raw model invocation. Centralize decisions server-side.

## Common Pitfalls

### Pitfall 1: Hidden Policy Drift
**What goes wrong:** Different endpoints apply different bounds/confidence thresholds.
**Why it happens:** Safety logic duplicated in route handlers.
**How to avoid:** Single exported policy module + contract tests for every action type.
**Warning signs:** Same input context yields different outcomes across endpoints.

### Pitfall 2: Over-Trusting Model Confidence
**What goes wrong:** Low-quality context still produces aggressive recommendation.
**Why it happens:** Confidence treated as model-only scalar.
**How to avoid:** Blend model confidence with deterministic data quality and rule validation checks.
**Warning signs:** Recommendation confidence high while required context fields are missing/stale.

### Pitfall 3: Evidence-Provenance Gaps
**What goes wrong:** ADAP-02 reasons cannot be traced to corpus references.
**Why it happens:** Explanations generated post-hoc without evidence ID contract.
**How to avoid:** Make `evidenceRefs[]` mandatory in recommendation schema.
**Warning signs:** UI shows explanation text but no source tag.

### Pitfall 4: Confirmation Race Conditions
**What goes wrong:** Stale high-impact confirmation applies to later sessions.
**Why it happens:** No explicit expiry/session scoping.
**How to avoid:** Bind confirmation token to target planned session and expire at next-session boundary.
**Warning signs:** Confirm endpoint can apply after session date changed.

## Code Examples

Verified implementation patterns adapted to current codebase:

### Pattern A: Contract-first parse at boundaries
```typescript
export function parseAdaptiveRecommendation(input: unknown): AdaptiveRecommendation {
  return adaptiveRecommendationSchema.parse(input);
}
```

### Pattern B: Deterministic clamp before persistence
```typescript
function clampDeltaLoadPct(delta: number): number {
  return Math.max(-0.05, Math.min(0.05, delta));
}
```

### Pattern C: Session-scoped confirmation
```typescript
if (recommendation.status !== 'pending_confirmation' || recommendation.plannedSessionId !== targetSessionId) {
  throw new Error('Recommendation confirmation is no longer valid for this session');
}
```

## Test Strategy

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` via `tsx --test` |
| Config file | none (script-driven) |
| Quick run command | `pnpm test -- tests/program/adaptive-coaching-policy.test.ts` |
| Full suite command | `pnpm test` |

### Requirement -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADAP-01 | Generate next-session action from latest logs/context | service integration | `pnpm test -- tests/program/adaptive-coaching-service.test.ts` | ❌ Wave 0 |
| ADAP-02 | Explanations include explicit reasons + source refs | contract/unit | `pnpm test -- tests/program/adaptive-coaching-contracts.test.ts` | ❌ Wave 0 |
| ADAP-03 | Deload/substitution require confirm before apply | route + service | `pnpm test -- tests/program/adaptive-coaching-confirm-route.test.ts` | ❌ Wave 0 |
| SAFE-01 | Recommendations never exceed conservative bounds | policy unit | `pnpm test -- tests/program/adaptive-coaching-policy.test.ts` | ❌ Wave 0 |
| SAFE-02 | Limitation conflicts generate warning metadata | policy/service | `pnpm test -- tests/program/adaptive-coaching-policy.test.ts` | ❌ Wave 0 |
| SAFE-03 | Invalid/low-confidence output triggers conservative fallback | service integration | `pnpm test -- tests/program/adaptive-coaching-fallback.test.ts` | ❌ Wave 0 |
| DASH-03 | Dashboard shows upcoming forecast + prudent card on warning/fallback | route/UI integration | `pnpm test -- tests/program/dashboard-adaptive-forecast.test.ts` | ❌ Wave 0 |

### Sampling Rate
- Per task commit: targeted test file(s) for touched module.
- Per wave merge: all Phase 05 test files + existing `tests/program/*.test.ts` impacted by contracts.
- Phase gate: full `pnpm test` green.

### Wave 0 Gaps
- [ ] `tests/program/adaptive-coaching-contracts.test.ts`
- [ ] `tests/program/adaptive-coaching-policy.test.ts`
- [ ] `tests/program/adaptive-coaching-service.test.ts`
- [ ] `tests/program/adaptive-coaching-confirm-route.test.ts`
- [ ] `tests/program/adaptive-coaching-fallback.test.ts`
- [ ] `tests/program/dashboard-adaptive-forecast.test.ts`

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Safety policy too permissive | High | Hard clamps + test matrix over edge deltas + blocked deployment on failures. |
| Evidence corpus quality regression | High | Metadata gates, freshness policy, and corpus snapshot rollback. |
| LLM provider latency/failure | Medium | Timeout + fallback path + stale recommendation reuse checks. |
| Confirmation UX confusion | Medium | Explicit high-impact banner with impact summary and one-session scope text. |
| Schema drift between LLM output and UI | Medium | Shared contracts package + contract tests in CI. |

## Phased Execution Advice

1. **Wave 0: Contracts and persistence skeleton**
   - Add adaptive contracts, DB schema, DAL scaffolding, and empty recommendation state machine.
2. **Wave 1: Policy engine and deterministic fallback**
   - Implement SAFE-01/02/03 fully without external LLM call; test thoroughly.
3. **Wave 2: LLM orchestration and evidence retrieval**
   - Add structured LLM proposal generation + local corpus retrieval + reason/evidence mapping.
4. **Wave 3: Confirmation flow + dashboard forecast**
   - Implement ADAP-03 endpoints and DASH-03 rendering including prudence card.
5. **Wave 4: Hardening**
   - Add audit logging, failure-injection tests, and corpus governance automation checks.

## Open Questions

1. **Conservative bounds exact numbers (SAFE-01)**
   - What we know: Must be strict and moderate.
   - What's unclear: Exact load/rep/set delta caps per action type.
   - Recommendation: Lock constants in one policy module and tune with historical logs in Phase 05 verification.

2. **Confidence composition formula (SAFE-03)**
   - What we know: Confidence must gate fallback.
   - What's unclear: Weighting between model confidence vs context quality signals.
   - Recommendation: Start with explicit thresholds + reason flags; calibrate with observed recommendation outcomes.

3. **Corpus update cadence**
   - What we know: Auto updates with regular quality verification are locked.
   - What's unclear: Daily vs weekly cadence and acceptance gates for conflicting new evidence.
   - Recommendation: Weekly update window + manual review for conflicting high-impact principle changes.

## Sources

### Primary (HIGH confidence)
- OpenAI Structured Outputs announcement (strict schema adherence context): https://openai.com/index/introducing-structured-outputs-in-the-api/
- OpenAI model spec (instruction hierarchy and agentic safety behaviors): https://model-spec.openai.com/2025-09-12.html
- Prisma transactions guide (transaction patterns and cautions): https://www.prisma.io/docs/orm/prisma-client/queries/transactions
- Next.js Route Handlers docs: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- Node.js test runner docs: https://nodejs.org/api/test.html
- Zod documentation: https://zod.dev/

### Secondary (MEDIUM confidence)
- OWASP Top 10 for LLM Applications (threat taxonomy for prompt injection/output risks): https://genai.owasp.org/llm-top-10/
- NIST AI Risk Management Framework: https://www.nist.gov/itl/ai-risk-management-framework
- PRISMA 2020 statement and resources: https://www.prisma-statement.org/

### Tertiary (LOW confidence)
- ACSM progression models reference context discovered via aggregate web indexing (needs exact citation pinning during implementation): https://pubmed.ncbi.nlm.nih.gov/

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (repository-verified versions and existing conventions)
- Architecture: MEDIUM-HIGH (strong alignment with current monolith patterns; queue choice intentionally deferred)
- Pitfalls: MEDIUM (derived from verified LLM safety frameworks + project-specific failure modes)

**Research date:** 2026-03-05
**Valid until:** 2026-04-04
