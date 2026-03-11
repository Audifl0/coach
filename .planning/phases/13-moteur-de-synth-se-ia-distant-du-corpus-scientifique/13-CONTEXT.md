# Phase 13: Moteur de synthese IA distant du corpus scientifique - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Cette phase commence apres la mise en place du worker corpus continu de la phase 12. Son but est d'ajouter un vrai moteur de synthese fonde sur un modele distant, non local, pour transformer le corpus scientifique collecte en principes utilisables par la knowledge bible.

Le scope couvre la curation par LLM distant, l'extraction structuree, la consolidation de provenance, la gestion des erreurs/fallbacks, le budget d'appel, et les quality gates necessaires avant publication. Cette phase n'a pas vocation a refaire les connecteurs, ni a remplacer les garde-fous deterministes de publication et de consommation runtime deja poses.

</domain>

<decisions>
## Implementation Decisions

### Chaine modele
- La synthese doit utiliser un provider distant et non un modele local.
- OpenAI est le moteur principal de synthese du corpus.
- La phase ne prevoit pas de second provider distant de secours pour cette chaine de synthese.
- La priorite produit est la fiabilite et l'auditabilite du run, pas l'optimisation agressive du cout.

### Forme de synthese attendue
- Le moteur reste hors ligne par rapport a la requete utilisateur: il travaille dans le worker corpus, pas dans le flow live de generation.
- La synthese doit se faire en deux temps: une extraction/synthese source ou petit lot, puis une consolidation thematique avant publication.
- La sortie attendue doit etre structuree, typable et verifiable avant publication.
- Un niveau intermediaire valide entre le brouillon LLM brut et la knowledge bible finale est obligatoire pour audit et diagnostic.

### Contrat de sortie
- La knowledge bible reste un artefact publie, borne, versionne et consomme par les services runtime existants.
- La bible runtime reste en francais, avec conservation de traces source en anglais si elles sont utiles a l'audit.
- La phase privilegie peu de principes, mais tres solides, plutot qu'une couverture large et bruyante.
- La provenance doit rester explicite: sources, evidence IDs, raisons de retention et motifs de rejet.

### Politique de publication
- La synthese par modele ne doit jamais promouvoir directement un snapshot sans quality gate intermediaire.
- La politique de publication est stricte: si la synthese distante est partielle, invalide ou incoherente, le run ne promeut aucun nouveau snapshot.
- En cas de blocage, le runtime conserve le snapshot actif precedent.
- Apres un echec de synthese distante, le worker retente au cycle normal suivant plutot que de lancer une boucle de rattrapage agressive.

### Visibilite operateur
- Les sorties doivent etre deterministes autant que possible a l'echelle des contrats publies, meme si la generation du brouillon de synthese utilise un LLM.
- Un run bloque doit exposer explicitement si la cause vient du provider, de la validation structuree, de la consolidation ou de la publication.
- Les artefacts de synthese doivent rester suffisamment lisibles pour alimenter le futur dashboard operateur de la phase 14.

### Claude's Discretion
- Strategie de prompting exacte et schema detaille de l'artefact intermediaire valide.
- Granularite precise des lots de synthese dans la phase "source/petit lot" tant que le pipeline reste en deux temps.
- Niveau de memoire inter-runs conserve pour reduire le cout et stabiliser les deltas.
- Seuils exacts de validation structuree, coherence et couverture avant blocage de publication.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/adaptive-knowledge/synthesis.ts`: synthese actuelle basee sur des regles/templates, surface principale a faire evoluer.
- `scripts/adaptive-knowledge/curation.ts`: compacte les principes/sources retenus en bible publiee.
- `scripts/adaptive-knowledge/quality-gates.ts`: garde-fous de validation a enrichir pour la synthese distante.
- `scripts/adaptive-knowledge/pipeline-run.ts`: orchestration des etapes du worker existant.
- `src/server/services/program-generation-hybrid.ts`: consommateur aval qui impose un contrat de preuve et de fallback stable.
- `src/lib/coach/knowledge-bible.ts`: point de chargement runtime de la bible publiee.
- `src/lib/program/generation-client.ts` et `src/server/services/program-generation.ts`: surfaces a garder coherentes cote meta/observabilite.

### Established Patterns
- Le projet possede deja une pile provider distante pour les usages IA applicatifs; elle doit etre reutilisee plutot que dupliquer un nouveau client ad hoc.
- Les snapshots publies sous `.planning/knowledge/adaptive-coaching/` restent la frontiere de confiance du runtime.
- Les fallbacks prudents et deterministes sont deja une exigence produit sur les chemins hybrides.

### Integration Points
- Le futur moteur doit s'inserer entre l'ingestion du corpus et la publication de `knowledge-bible.json`.
- Les tests hybrides existants devront verifier que les IDs de preuve, la provenance et les meta runtime restent compatibles.
- Les artefacts intermediaires du worker devront probablement exposer davantage d'informations de synthese pour audit et futur dashboard.

</code_context>

<specifics>
## Specific Ideas

- Introduire une etape de synthese distante qui extrait claims, niveau de confiance, population cible, contexte d'application et guardrails.
- Distinguer clairement `raw synthesis draft`, `validated evidence synthesis` et `published runtime bible`.
- Ajouter une validation structuree stricte des sorties modele avant qu'elles alimentent `curation.ts`.
- Persister un rapport de synthese utile pour audit: provider, modele, version de prompt, compteurs, erreurs et motifs de rejet.
- Si OpenAI est indisponible ou retourne une sortie invalide, le worker bloque la promotion et conserve le snapshot precedent.
- Le futur artefact intermediaire doit etre lisible par un operateur humain avant meme l'arrivee du dashboard de phase 14.

</specifics>

<deferred>
## Deferred Ideas

- Faire de la recherche web en direct pendant la generation d'un programme utilisateur.
- Introduire un fine-tuning, RAG conversationnel live, ou un modele local sur machine.
- Donner au modele le dernier mot sans quality gate deterministe ni trace de provenance.

</deferred>

---
*Phase: 13-moteur-de-synth-se-ia-distant-du-corpus-scientifique*
*Context gathered: 2026-03-11*
