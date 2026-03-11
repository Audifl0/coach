# Phase 12: Worker corpus continu - Research

**Researched:** 2026-03-11
**Domain:** worker IA continu de curation scientifique pour knowledge bible de generation hybride
**Confidence:** HIGH

## User Constraints

## Implementation Decisions

### Scope de phase
- La phase doit construire un worker IA continu qui recherche du corpus scientifique sport/musculation, l'agrege, puis nourrit une knowledge bible exploitable par le modele hybride de creation de programme.
- La phase doit partir des ebauches existantes dans `scripts/adaptive-knowledge/` et non ouvrir un second pipeline parallele.
- La cible principale est la generation hybride de programme; la reutilisation par le coaching adaptatif est acceptable si elle reste compatible et non cassante.

### Contrat aval a preserver
- Le worker doit conserver un contrat stable avec `src/lib/coach/knowledge-bible.ts`.
- La forme `CoachKnowledgeBible = { snapshotId, principles[], sources[] }` doit rester compatible.
- Le flux de generation hybride doit continuer a fonctionner en mode degrade prudent si le corpus ou le provider LLM est indisponible.
- La phase ne doit pas casser le merge contract actuel: le baseline planner reste la source structurelle, le draft hybride reste un overlay borne.

### Qualite et securite
- Le corpus publie doit rester traceable, versionne et publiable uniquement via snapshot valide.
- Les nouvelles capacites IA doivent rester enfermees dans des garde-fous explicites: allowlist de sources, provenance, seuils de qualite, rejection reasons, rollback.
- Un run incomplet, concurrent ou de faible qualite ne doit jamais polluer le snapshot actif.

### Claude's Discretion
- Le mecanisme exact d'execution continue: daemon, boucle avec heartbeat, ou orchestration recurrente idempotente.
- Le niveau d'autonomie pour la decouverte de sujets et la priorisation des recherches.
- Le niveau de validation humaine necessaire pour les deltas de corpus les plus risqués.
- Le decoupage precis entre corpus brut, synthese scientifique et bible orientee runtime.

## Summary

Le depot possede deja une base solide pour un pipeline de corpus scientifique, mais pas encore le "worker corpus continu" decrit pour la phase 12. Aujourd'hui, `scripts/adaptive-knowledge/pipeline-run.ts` orchestre un pipeline deterministe en 5 etapes (`discover -> ingest -> synthesize -> validate -> publish`) avec connecteurs PubMed/Crossref/OpenAlex, quality gate, promotion atomique et rollback. Les consommateurs runtime lisent deja les snapshots valides via `src/lib/adaptive-coaching/evidence-corpus.ts`, `src/lib/coach/knowledge-bible.ts`, `src/server/services/program-generation-hybrid.ts` et `src/server/services/adaptive-coaching.ts`.

Le vrai manque n'est donc pas "un corpus" mais "un systeme autonome de curation continue". Les limites actuelles sont claires: pas de worker/lease/concurrency guard, decouverte de sujets statique, synthese tres blueprintee, pas de dedup/citation graph inter-runs, pas de manifest persiste malgre le contrat, pas d'observabilite operateur, et pas de workflow explicite pour les deltas risqués. En parallele, la generation hybride attend deja une bible concise et stable, avec provenance exploitable dans le prompt et des fallbacks silencieux si la chaine hybride echoue.

La meilleure lecture de la phase 12 est donc: transformer le pipeline 05.2 en sous-systeme operationnel autonome qui produit une knowledge bible plus pertinente pour la generation de programme, sans casser les contrats runtime existants. Il faut renforcer le worker lui-meme, fiabiliser l'ingestion et la gouvernance de publication, puis specialiser la sortie pour les consommateurs hybrides plutot que de les obliger a ingerer un corpus trop brut.

**Primary recommendation:** planifier la phase en quatre axes: runtime worker idempotent, curation/synthese IA du corpus, publication/gouvernance observable, puis integration aval et compatibilite stricte avec `knowledge-bible` + generation hybride.

## Standard Stack

### Core
| Library / Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | >=22 | Runtime scripts/worker | Les scripts `adaptive-knowledge` existent deja dans ce runtime |
| TypeScript | 5.9.x | Contrats, worker, integration | Tout le pipeline actuel et les consommateurs aval sont types |
| pnpm + tsx | repo standard | Execution des scripts corpus | `refresh-corpus.ts` et les tests s'appuient deja dessus |
| OpenAI / Anthropic | runtime existant | Synthese/extraction IA | Le projet a deja une pile provider reelle pour les flux hybrides |

### Supporting
| Artifact | Purpose | When to Use |
|---------|---------|-------------|
| `scripts/adaptive-knowledge/pipeline-run.ts` | Orchestrateur existant du pipeline | Base a etendre pour le worker continu |
| `scripts/adaptive-knowledge/connectors/*` | Ingestion des sources | Point de depart pour normalisation/pagination/dedup |
| `scripts/adaptive-knowledge/synthesis.ts` | Synthese actuelle | Surface a faire evoluer vers une vraie curation IA |
| `scripts/adaptive-knowledge/quality-gates.ts` | Blocage des snapshots faibles/contradictoires | A conserver et enrichir |
| `scripts/adaptive-knowledge/publish.ts` | Promotion/rollback atomiques | Frontiere de securite incontournable |
| `src/lib/coach/knowledge-bible.ts` | Contrat aval de la bible | Doit rester backward-compatible |
| `src/server/services/program-generation-hybrid.ts` | Consommateur principal | Doit guider la structure de sortie finale |
| `tests/program/*knowledge*` | Couverture existante | A etendre pour verrouiller la compatibilite |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Etendre le pipeline 05.2 existant | Creer un nouveau worker/separate store | Duplique la gouvernance et augmente le risque de drift |
| Bible publiee hors-ligne | Recherche web a la volee a chaque requete | Trop instable, couteux et incompatible avec les garanties safety-first |
| Sortie runtime concise et compatible | Exposer le corpus brut au generateur hybride | Augmente bruit, latence et fragilite du prompt |

**Installation:** aucune dependance nouvelle n'est imposee par la recherche; la phase peut partir des briques deja presentes.

## Architecture Patterns

### Pattern 1: Worker Continu Idempotent
**What:** un runtime de worker qui execute des runs repetables avec lock/lease, heartbeat et reprise saine.
**When to use:** pour remplacer le simple declenchement ponctuel CLI par un sous-systeme autonome fiable.
**Example:**
```text
worker tick
  -> acquire lock
  -> discover topics / fetch sources
  -> synthesize candidate bible
  -> validate + publish
  -> persist report + release lock
```

### Pattern 2: Corpus Brut -> Synthese Scientifique -> Bible Runtime
**What:** separer clairement les trois niveaux d'artefacts.
**When to use:** pour eviter que les consommateurs runtime dependent des details du pipeline.
**Example:**
```text
normalized evidence records
  -> curated principles / contradictions / provenance
  -> compact runtime bible (principles + sources + tags)
```

### Pattern 3: Backward-Compatible Consumer Contract
**What:** enrichir la quality/provenance sans casser `CoachKnowledgeBible` ni les schemas hybrides existants.
**When to use:** pour toute evolution cote worker.
**Example:**
```text
keep:
  snapshotId
  principles[].id/title/description/guardrail/tags
  sources[].id/title/summary/sourceClass/tags

extend only with optional metadata if necessary
```

### Pattern 4: Publish Safety Before Intelligence
**What:** toute curation IA passe derriere les barriers de validation/promotion atomique.
**When to use:** avant toute mise en production du worker.
**Example:**
```text
AI synthesis -> quality gate -> validated snapshot -> active pointer swap
```

### Anti-Patterns to Avoid
- **Repartir de zero:** le pipeline 05.2 couvre deja les frontieres critiques de publication.
- **Casser la bible runtime:** les consommateurs hybrides attendent un format borne et stable.
- **Mettre l'IA en ligne dans la requete utilisateur:** la phase concerne un worker offline/async, pas un navigateur autonome a chaud.
- **Ignorer les runs concurrents:** un worker continu sans lease/lock cassera rapidement l'etat de snapshot.
- **Confondre corpus et decision moteur:** la knowledge bible nourrit le modele hybride, elle ne remplace pas les guardrails deterministes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Publication du corpus | Ecriture in-place de fichiers actifs | `publish.ts` + pointeurs atomiques | C'est deja la frontiere de securite du systeme |
| Chargement runtime | Nouveau format opaque cote service | `knowledge-bible.ts` sur snapshots valides | Les consommateurs existent deja |
| Execution initiale | Nouveau binaire ops ad hoc | `refresh-corpus.ts` / `pipeline-run.ts` comme base | Moins de drift et meilleure reutilisation |
| Fallback | Hard fail quand le corpus manque | Degradation prudente deja en place | Le produit doit rester exploitable |

**Key insight:** la phase 12 doit d'abord rendre le pipeline autonome et utile pour le modele hybride, pas rendre le runtime plus "intelligent" au prix de perdre les garanties de publication.

## Common Pitfalls

### Pitfall 1: Confondre worker continu et simple cron
**What goes wrong:** on ajoute juste une cadence, sans lock, heartbeat, reprise ni observabilite.
**Why it happens:** le depot a deja un script et un installateur cron, ce qui peut donner l'illusion qu'il ne manque presque rien.
**How to avoid:** planifier explicitement lease/lock, etat de run, telemetry et recovery.
**Warning signs:** deux runs peuvent se chevaucher ou un run bloque laisse l'etat ambigu.

### Pitfall 2: Garder une synthese trop pauvre
**What goes wrong:** le worker publie toujours une bible tres generique issue de templates `sourceType`.
**Why it happens:** `synthesis.ts` produit aujourd'hui une synthese rudimentaire, suffisante pour 05.2 mais pas pour un worker de curation IA.
**How to avoid:** introduire une couche de curation/extraction plus riche, tout en preservant le quality gate.
**Warning signs:** les principes publies changent peu, restent trop generiques, ou ne collent pas aux besoins du generateur hybride.

### Pitfall 3: Casser le contrat aval
**What goes wrong:** la nouvelle bible change de shape ou d'IDs et le generateur hybride devient fragile.
**Why it happens:** tentation de modeler la sortie selon les besoins internes du worker plutot que selon les consommateurs.
**How to avoid:** verrouiller des tests de compatibilite autour de `knowledge-bible` et des schemas hybrides.
**Warning signs:** les services doivent ajouter des `if` multiples ou parser de nouveaux formats.

### Pitfall 4: Oublier la traceabilite
**What goes wrong:** le worker synthétise mieux, mais on ne sait plus quelles sources ont nourri les principes.
**Why it happens:** la synthese IA peut rapidement masquer la provenance si elle n'est pas forcee dans les artefacts.
**How to avoid:** conserver provenance IDs, source IDs, reason codes, et diffs de snapshots.
**Warning signs:** la bible est plus lisible mais plus auditable.

### Pitfall 5: Trop de confiance dans les fallbacks silencieux
**What goes wrong:** le systeme "marche" toujours, mais le worker peut etre casse longtemps sans signal operateur.
**Why it happens:** les consommateurs actuels degradent silencieusement vers baseline/default.
**How to avoid:** ajouter observabilite et verification explicite du chemin "knowledge-enabled".
**Warning signs:** aucune alerte n'indique qu'on tourne en fallback depuis plusieurs jours.
