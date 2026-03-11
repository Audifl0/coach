# Phase 13: Moteur de synthese IA distant du corpus scientifique - Research

**Researched:** 2026-03-11
**Domain:** moteur de synthese distant pour worker corpus scientifique avec publication strictement bloquee en cas d'echec
**Confidence:** HIGH

## User Constraints

- Produire un moteur de synthese distant pour le worker corpus, pas pour les flux live utilisateur.
- Conserver une provenance stricte et auditable a chaque niveau de synthese.
- Ne pas introduire de fallback vers un second provider distant.
- Bloquer strictement toute publication si la synthese est partielle, invalide ou incoherente.
- Rester compatible avec `PROG-01`, `PROG-02` et `SAFE-03`.
- Preserver le contrat des snapshots publies et des consommateurs hybrides existants.

## Implementation Decisions

### Scope de phase
- La phase doit remplacer la synthese blueprint actuelle de `scripts/adaptive-knowledge/synthesis.ts` par une chaine de synthese fondee sur un modele distant execute dans le worker corpus.
- La phase reste offline par rapport aux requetes utilisateur: aucun appel modele distant ne doit etre introduit dans le flow live de generation de programme.
- La sortie doit rester publiee sous forme de snapshot versionne et consommee via `src/lib/coach/knowledge-bible.ts`.

### Contraintes non negociables
- OpenAI est le provider de synthese pour cette phase.
- Il ne doit pas y avoir de fallback vers un second provider distant pour la synthese corpus.
- Un echec provider, un payload invalide, une incoherence de consolidation ou un quality gate insuffisant doivent bloquer toute promotion du snapshot.
- Le runtime doit continuer a servir le snapshot actif precedent tant qu'aucun nouveau snapshot valide n'est publie.
- La provenance doit etre explicite et exploitable: source IDs, evidence IDs, motifs de retention, motifs de rejet, metadata de run.

### Compatibilite produit
- `PROG-01` et `PROG-02` imposent que la knowledge bible publiee reste concise, stable et utile au generateur hybride sans rendre le plan structurel dependant d'un LLM live.
- `SAFE-03` impose que l'absence de synthese valide ou de snapshot publiable degrade vers le baseline/fallback prudent existant, jamais vers une publication partielle.
- Le contrat aval actuel `meta.mode` et `knowledgeSnapshotId` doit rester interpretable: une generation hybride n'utilise que des snapshots publies et validables.

### Claude's Discretion
- Schema detaille de l'artefact intermediaire valide entre draft LLM et bible runtime.
- Granularite exacte des lots de synthese primaire avant consolidation.
- Seuils exacts de coverage/coherence/contradiction qui bloquent la publication.
- Niveau de journalisation operateur a persister dans `run-report.json` ou artefact voisin.

## Summary

Le depot dispose deja des frontieres importantes qu'il faut conserver. `scripts/adaptive-knowledge/pipeline-run.ts` orchestre un pipeline `discover -> ingest -> synthesize -> validate -> publish`, `publish.ts` garantit une promotion atomique avec rollback pointer, `quality-gates.ts` bloque deja des snapshots insuffisants, et `src/lib/coach/knowledge-bible.ts` constitue la frontiere de confiance lue par les consommateurs runtime. En aval, `src/server/services/program-generation-hybrid.ts` force deja des evidence IDs valides contre la bible chargee, puis `src/server/services/program-generation.ts` replie vers `fallback_baseline` si la chaine hybride casse.

Le vrai travail de la phase 13 n'est donc pas d'ajouter "de l'IA" n'importe ou, mais de remplacer proprement la couche `synthesize` par un sous-pipeline distant, strictement typable et auditable, sans toucher au comportement de publication et de fallback deja conforme au produit. L'architecture cible doit rester: corpus normalise -> synthese distante par source/petit lot -> consolidation thematique -> validation deterministe -> publication atomique. Toute etape qui ne passe pas les garde-fous doit laisser le snapshot actif inchangé.

**Primary recommendation:** planifier la phase autour de quatre blocs: socle de client LLM corpus dedie sans fallback secondaire, artefacts intermediaires de synthese avec provenance complete, quality gates de consolidation/publish blocking, puis verification de compatibilite stricte avec `knowledge-bible` et generation hybride.

## Reusable Assets

| Asset | Role in Phase 13 | Why Reuse |
|-------|------------------|-----------|
| `scripts/adaptive-knowledge/pipeline-run.ts` | Point d'insertion du moteur distant dans l'etape `synthesize` | Le pipeline, les stages et le blocage publish existent deja |
| `scripts/adaptive-knowledge/contracts.ts` | Base de schemas pour records, principles, manifest, run-report | Le projet attend deja des artefacts stricts via Zod |
| `scripts/adaptive-knowledge/quality-gates.ts` | Base des quality gates de publication | Permet d'ajouter coherence/provenance sans reouvrir la frontiere publish |
| `scripts/adaptive-knowledge/curation.ts` | Derniere transformation vers `knowledge-bible.json` | C'est le point naturel pour conserver le contrat runtime |
| `scripts/adaptive-knowledge/publish.ts` | Promotion atomique candidate -> validated -> active pointer | Ne doit pas etre contourne |
| `scripts/adaptive-knowledge/refresh-corpus.ts` | Worker entrypoint avec lease/heartbeat/release | Le comportement ops et le strict blocking existent deja |
| `src/server/llm/providers/openai-client.ts` | Pattern de client OpenAI JSON schema, timeout, payload parsing | Evite un client ad hoc incoherent |
| `src/server/llm/contracts.ts` | Taxonomie d'echec provider/payload/timeout | Bon point de depart pour raisonner les erreurs corpus |
| `src/server/llm/observability.ts` | Envelope minimale d'audit provider | Reutilisable pour journaliser les tentatives corpus |
| `src/server/services/program-generation-hybrid.ts` | Contrat aval de preuves et validation d'IDs | C'est la contrainte principale de compatibilite runtime |
| `src/lib/coach/knowledge-bible.ts` | Loader et ranking du snapshot publie | Le format publie doit rester backward-compatible |

## Recommended Architecture

### Pattern 1: Two-Step Remote Synthesis Inside Existing Pipeline
**What:** remplacer `synthesizeCorpusPrinciples(records)` par un orchestrateur distant en deux temps:
1. extraction structuree par source ou petit lot homogene;
2. consolidation thematique qui fusionne, rejette ou reformule les claims retenus.

**Why:** le contexte de phase exige explicitement une synthese en deux temps, et la synthese actuelle par `sourceType` est trop pauvre pour produire des principes auditables et stables.

**Recommended shape:**
```text
normalized records
  -> source synthesis drafts[]
  -> validated source syntheses[]
  -> thematic consolidation draft
  -> validated evidence synthesis
  -> curated runtime bible
```

### Pattern 2: Dedicated Corpus LLM Module, Not Reuse of Primary/Fallback Client
**What:** creer un module dedie cote worker, par exemple `scripts/adaptive-knowledge/remote-synthesis.ts`, qui reutilise les patterns OpenAI existants mais sans contrat de fallback secondaire.

**Why:** `src/server/llm/client.ts` est construit pour le live path avec `primary + fallback`. La phase 13 interdit justement ce pattern pour la synthese corpus. Reprendre les helpers OpenAI/schema/normalisation d'erreur est souhaitable, reprendre le chainage fallback ne l'est pas.

**Recommended responsibilities:**
- construire prompts corpus-specific;
- appeler OpenAI avec `json_schema` strict;
- retourner `ok/error` avec metadata provider/model/requestId/latency;
- persister les erreurs de lot sans promouvoir de snapshot.

### Pattern 3: Intermediate Validated Artifact as Trust Boundary
**What:** introduire un artefact intermediaire valide entre le draft LLM brut et `knowledge-bible.json`, par exemple `validated-synthesis.json`.

**Why:** le contexte de phase demande explicitement un niveau intermediaire obligatoire pour audit et diagnostic. Aujourd'hui, `principles.json` est trop pres de la sortie finale et pas assez riche pour la consolidation distante.

**Recommended contract fields:**
- `principles[]`: id stable, title, summaryFr, guidanceFr, guardrail, evidenceLevel, targetPopulation, applicationContext, confidence, provenanceRecordIds.
- `rejectedClaims[]`: source ids, rejection code, explanation.
- `coverage`: domaines/source types/tags couverts.
- `contradictions[]`: record ids impliques, severity, resolution status.
- `modelRun`: provider, model, promptVersion, requestId(s), latencyMs aggregate.

### Pattern 4: Deterministic Publish Gate After LLM, Never Inside LLM
**What:** le modele propose, le code decide. Les quality gates doivent verifier l'artefact valide, pas faire confiance au fait que le schema JSON a ete respecte.

**Required gates beyond the current composite score:**
- provenance completeness: chaque principe publie reference des `provenanceRecordIds` existants et non vides;
- evidence coverage minimum: pas de principe sans nombre minimal de records ou sans diversite suffisante;
- contradiction blocking: contradictions critiques ou non resolues bloquent;
- consolidation consistency: pas de duplication de principe, pas d'IDs instables, pas de champs requis manquants;
- output compactness: borne max de principes/source IDs pour conserver un prompt runtime utile.

### Pattern 5: Keep Runtime Bible Backward-Compatible, Extend Only Optionally
**What:** conserver `knowledge-bible.json` lisible par `src/lib/coach/knowledge-bible.ts` sans obligation de migration simultanee des consommateurs.

**Recommended rule:**
- garder `principles[].id/title/description/guardrail/tags/provenanceRecordIds`;
- garder `sources[].id/title/summary/sourceClass/tags/provenanceIds`;
- si de nouvelles metadonnees sont utiles, les ajouter de maniere optionnelle et sans changer le parsing permissif actuel.

**Why:** `program-generation-hybrid.ts` valide les IDs contre le snapshot actif. Casser les IDs ou remodeler la bible augmenterait directement le risque sur `PROG-01` et `PROG-02`.

## Standard Stack

### Core
| Library / Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | >=22 | Runtime worker/scripts | C'est deja le runtime du pipeline corpus |
| TypeScript | 5.9.x | Contrats, orchestration, validation | Le pipeline et les services aval sont deja types |
| Zod | repo standard | Validation stricte d'artefacts et payloads | Deja utilise pour contrats corpus et runtime |
| OpenAI Responses API | runtime existing stack | Synthese distante JSON schema stricte | Le projet a deja un pattern solide dans `openai-client.ts` |

### Supporting
| Tooling | Purpose | When to Use |
|---------|---------|-------------|
| `json_schema` strict mode | Forcer des sorties structurees | Extraction source et consolidation thematique |
| `run-report.json` | Audit operateur et diagnostic | Persister erreurs provider, invalidations et blocages |
| `manifest.json` + `diff.json` | Observabilite de snapshot | Comparer couverture et deltas avant promotion |

### Don't Hand-Roll
| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Promotion du snapshot | Ecriture directe de `active.json` | `publish.ts` | Frontiere de confiance deja prouvee |
| Contrats runtime | Nouveau format de bible opaque | `curation.ts` + `knowledge-bible.ts` | Conserve la compatibilite aval |
| Provider client | Nouveau wrapper HTTP artisanal | Pattern `openai-client.ts` | Garde la gestion timeout/schema/requestId coherente |
| Fallback de disponibilite | Second provider automatique | Strict blocking + retry cycle suivant | C'est une contrainte explicite de phase |

## Risks

### Risk 1: Importer le pattern de fallback secondaire du live path
**Impact:** moyen a eleve. La phase deviendrait contraire au contexte et masquerait les vraies indisponibilites provider.
**Mitigation:** client corpus dedie avec OpenAI seulement; erreurs marquees terminales pour le run, pas reroutees vers Anthropic.

### Risk 2: Schema JSON valide mais synthese inutilisable
**Impact:** eleve. Le modele peut renvoyer un JSON conforme mais des principes trop vagues, contradictoires ou sans support.
**Mitigation:** quality gates post-LLM centres sur provenance, coverage, contradiction, compacite et stabilite des IDs.

### Risk 3: IDs ou shape de bible instables
**Impact:** eleve sur `PROG-01`/`PROG-02`. Le generateur hybride peut referencer des preuves invalides ou degrader silencieusement trop souvent.
**Mitigation:** stabiliser les IDs de principes, valider `knowledge-bible.json` contre les attentes de `knowledge-bible.ts`, et tester `validateHybridDraftEvidenceIds`.

### Risk 4: Prompt creep et budget explosion
**Impact:** moyen. Une synthese par lot trop large peut depasser temps/cout et augmenter le taux de payload invalide.
**Mitigation:** lots bornes, prompts versionnes, consolidation separee, et metriques `records_in`, `records_retained`, `tokens/cost if available`.

### Risk 5: Publication partielle ou artefacts incomplets
**Impact:** critique. Un snapshot actif corrompu affaiblit `SAFE-03` et les contrats hybrides.
**Mitigation:** aucune promotion tant que `validated-synthesis.json`, `knowledge-bible.json`, `manifest.json`, `run-report.json` et quality gates ne sont pas tous complets et coherents.

## Validation Strategy

### Contract Tests
- Ajouter des tests unitaires sur le schema des artefacts intermediaires et des principles consolides.
- Verrouiller que chaque `provenanceRecordIds` publie pointe vers un `NormalizedEvidenceRecord.id` existant.
- Verrouiller que les rejection reasons et contradiction severities sont typables et serialisables.

### Pipeline Tests
- Simuler succes OpenAI avec payload strict valide -> `publish` autorise seulement si tous les gates passent.
- Simuler timeout/provider error/invalid payload -> `publish` reste `skipped` ou `failed`, `active.json` ne change pas.
- Simuler consolidation contradictoire ou provenance incomplete -> pas de promotion, rapport explicite dans `run-report.json`.
- Simuler `--check` -> generation d'artefacts et gates, sans promotion.

### Consumer Compatibility Tests
- Conserver des tests sur `src/lib/coach/knowledge-bible.ts` avec snapshot publie issu du nouveau moteur.
- Ajouter un test `program-generation-hybrid` ou `program-generation` qui prouve:
  - les evidence IDs du draft hybride restent validables;
  - `knowledgeSnapshotId` correspond au snapshot publie;
  - en absence de snapshot valide, la generation replie vers `fallback_baseline`.

### Ops Validation
- Verifier qu'un run bloque expose explicitement une cause: `provider`, `schema_validation`, `consolidation`, `quality_gate`, `publish`.
- Verifier qu'un echec n'entraine ni boucle de retry agressive ni mutation du snapshot actif.

## Anti-Patterns

- Brancher la synthese distante directement dans `program-generation-hybrid.ts` ou un autre flow live utilisateur.
- Reutiliser `src/server/llm/client.ts` tel quel et conserver le fallback OpenAI -> Anthropic.
- Laisser le modele produire directement `knowledge-bible.json` sans artefact intermediaire valide.
- Utiliser des IDs de principes non deterministes a chaque run.
- Publier un snapshot "partiellement bon" parce que seule une partie des lots a reussi.
- Masquer les rejets et contradictions pour rendre la bible plus jolie mais moins auditable.
- Elargir le scope vers recherche web live, RAG runtime ou fine-tuning local.

## Planning Recommendation

Planifier la phase en 4 plans max, dans cet ordre:

1. **Socle synthese distante**
   Implementer un module corpus OpenAI dedie, ses schemas JSON stricts, le versioning de prompt, et les erreurs de lot sans fallback secondaire.

2. **Artefacts intermediaires + consolidation**
   Ajouter la synthese par source/petit lot, la consolidation thematique, et persister `validated-synthesis.json` avec provenance/rejets/metadata de run.

3. **Quality gates et strict publish blocking**
   Etendre `quality-gates.ts`, brancher les nouveaux blocs dans `pipeline-run.ts`, et garantir qu'aucun snapshot n'est promu si un gate ou un lot critique echoue.

4. **Compatibilite runtime et verification**
   Mettre a jour `curation.ts` si necessaire sans casser `knowledge-bible.ts`, puis ajouter les tests de compatibilite avec generation hybride et les scenarios `SAFE-03`.

**Recommended planning stance:** traiter la phase comme un remplacement interne de l'etape `synthesize`, pas comme une refonte globale du pipeline. Le succes n'est pas "le modele produit du texte convaincant", mais "le worker publie seulement des snapshots prouvables que les consommateurs hybrides peuvent utiliser sans affaiblir `PROG-01`, `PROG-02` et `SAFE-03`."
