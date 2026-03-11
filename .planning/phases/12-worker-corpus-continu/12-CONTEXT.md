# Phase 12: Worker corpus continu - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Construire un worker IA continu qui travaille en arriere-plan pour rechercher du corpus scientifique lie au sport et a la musculation, agreger les documents retenus, puis produire une knowledge bible structuree exploitable par le modele hybride de creation de programme.

Le scope couvre l'automatisation du cycle recherche -> filtration -> synthese -> publication de la bible, ainsi que le contrat stable entre ce worker et les consommateurs runtime du modele hybride. Le scope n'est pas de reinventer le pipeline 05.2, mais de l'etendre depuis les ebauches deja presentes dans `scripts/adaptive-knowledge/` afin d'alimenter un usage plus direct cote generation de programme.

</domain>

<decisions>
## Implementation Decisions

### Worker mission
- Le worker doit tourner de maniere continue/autonome plutot que comme un simple refresh manuel occasionnel.
- Sa mission principale est de construire une bibliotheque de savoir scientifique pour le modele hybride de creation de programme.
- Le corpus cible doit rester centre sur des sources scientifiques et sportives pertinentes pour la musculation, la progression, la fatigue, la recuperation, la securite et les contraintes physiques.

### Output contract
- La sortie attendue n'est pas un flux libre de documents bruts, mais une knowledge bible structuree avec principes, sources et provenance.
- La bible publiee doit rester stable et bornée pour les consommateurs runtime (`knowledge-bible`, generation hybride, coaching adaptatif si reutilisation).
- La publication doit conserver des garanties de snapshot valide/actif deja introduites par le pipeline 05.2.

### Integration constraints
- La phase doit reutiliser les ebauches et patterns existants dans `scripts/adaptive-knowledge/` au lieu de creer un second systeme parallele.
- Le worker doit nourrir explicitement `src/lib/coach/knowledge-bible.ts` et les services hybrides de generation de programme.
- Les comportements de degradation prudente doivent rester explicites si le corpus publie est absent, insuffisant ou invalide.

### Safety and quality
- Les sources retenues doivent rester traceables et filtrables; pas de knowledge bible opaque sans provenance.
- La synthese doit conserver des guardrails compatibles avec un produit safety-first.
- Le worker doit eviter qu'un run incomplet ou de mauvaise qualite pollue la bible active.

### Claude's Discretion
- Le mode exact d'execution continue: boucle interne, job cadence, file de travail, ou orchestration mixte.
- La granularite des artefacts intermediaires entre corpus brut, synthese scientifique et bible finale.
- La facon de specialiser le corpus pour la generation de programme tout en preservant un socle commun reutilisable.
- Le niveau d'autonomie accorde a l'agent de recherche par rapport aux allowlists, seeds, topics et heuristiques de ranking.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/adaptive-knowledge/pipeline-run.ts`: orchestration existante des stages `discover -> ingest -> synthesize -> validate -> publish`.
- `scripts/adaptive-knowledge/connectors/*`: connecteurs PubMed, Crossref et OpenAlex deja disponibles.
- `scripts/adaptive-knowledge/quality-gates.ts` et `publish.ts`: base de validation/promotion atomique du corpus.
- `src/lib/coach/knowledge-bible.ts`: charge le snapshot actif et transforme principes/sources en bible concise pour prompt runtime.
- `src/server/services/program-generation-hybrid.ts`: consomme la knowledge bible pour construire le prompt de generation hybride.

### Established Patterns
- Le pipeline 05.2 ecrit sous `.planning/knowledge/adaptive-coaching/` avec snapshots valides et pointeurs actifs.
- Les consommateurs runtime attendent un contrat borne et deterministic, pas une exploration libre a chaque requete.
- La provenance des principes et sources est deja une notion de premier rang dans les surfaces de prompt et de tests.

### Integration Points
- `loadCoachKnowledgeBible(...)` selectionne les principes/sources selon des tags de requete issus du profil.
- `renderCoachKnowledgeBibleForPrompt(...)` injecte la bible publiee dans le prompt du modele hybride.
- `buildDefaultHybridProgramDraftBuilder(...)` degrade deja vers `null` si le runtime LLM n'est pas configure; la phase 12 doit garder des modes de fallback compatibles.

</code_context>

<specifics>
## Specific Ideas

- Etendre la logique de corpus scientifique existante pour produire une bible orientee "generation de programme" plutot qu'un simple corpus adaptatif generique.
- Introduire un worker capable de faire tourner sans relache la recherche scientifique, de qualifier ce qui merite d'entrer dans la bible et de republier iterativement des snapshots meilleurs.
- Se servir des artefacts publies pour nourrir a la fois le choix des exercices, la structure hebdomadaire, les guardrails de progression et les justifications du modele hybride.
- Garder le systeme observable: runs, provenance, motifs de rejet, et etat du snapshot actif.

</specifics>

<deferred>
## Deferred Ideas

- Etendre le worker a des sujets hors musculation/sport ou a des sources non scientifiques.
- Donner au modele runtime le droit d'aller chercher du web en direct pendant une requete utilisateur.
- Remplacer les guardrails deterministes existants par un flux autonome sans controle.

</deferred>

---

*Phase: 12-worker-corpus-continu*
*Context gathered: 2026-03-11*
