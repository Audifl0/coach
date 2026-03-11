# Phase 15: Qualite scientifique du worker corpus - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Cette phase commence apres la mise en place du worker corpus, de sa synthese distante et de son dashboard operateur. Son objectif n'est pas d'etendre encore l'infrastructure, mais d'augmenter sensiblement la valeur scientifique du corpus publie.

Le scope couvre quatre axes precis:

- une discovery beaucoup plus riche que quelques seeds statiques;
- un ranking/scoring scientifique plus fin des evidences recuperees;
- une extraction structuree par etude ou petit lot avant la synthese finale;
- des quality gates renforces sur la couverture, la diversite et la solidite des snapshots.

La phase ne doit pas refaire le dashboard, ni changer le contrat runtime de la knowledge bible sans raison forte, ni transformer le worker en moteur de recherche web generaliste hors perimeteres sport/musculation.

</domain>

<decisions>
## Implementation Decisions

### Discovery plus intelligente mais bornee
- La discovery ne doit plus reposer uniquement sur une courte liste fixe de topics.
- Le worker doit couvrir les sous-domaines pertinents du coaching musculation: hypertrophie, force, fatigue, autoregulation, douleur/limitations, volume, frequence, progression, populations et contextes d'application.
- L'expansion des requetes doit rester bornee, observable et rejouable; pas de generation libre infinie de requetes.
- Les trous de couverture constates sur les snapshots precedents peuvent guider la generation de nouvelles requetes.

### Ranking scientifique
- Le quality gate ne doit plus se limiter surtout a la recence, au type de source et a la completude minimale.
- Les evidences doivent etre classees avec plus de granularite: type d'etude, proximite thematique, richesse informative, diversite de sources, signaux de fiabilite et utilite pour la synthese.
- La phase privilegie moins de records, mais mieux choisis, plutot qu'une accumulation large et peu exploitable.

### Extraction structuree avant synthese finale
- La synthese finale doit etre alimentee par une extraction structuree par etude ou petit lot, pas seulement par des records faiblement enrichis.
- Le schema intermediaire doit capturer au minimum population, intervention, contexte, outcomes utiles, niveau de preuve, limites et signaux de securite quand disponibles.
- Les motifs de rejet ou de declassement de certaines etudes doivent rester auditables.

### Quality gates plus exigeants
- La publication doit tenir compte de la couverture thematique, de la diversite des evidence types et de la provenance, pas seulement d'un score composite global.
- Un snapshot scientifiquement pauvre, trop homogene ou sur-cale sur quelques themes ne doit pas etre promu.
- Les nouveaux gates doivent rester lisibles pour l'operateur et explicables dans les artefacts et le dashboard.

### Claude's Discretion
- Taxonomie exacte des themes, tags et populations.
- Formule precise du score de ranking scientifique.
- Granularite exacte des lots d'extraction structuree.
- Seuils exacts de couverture/diversite necessaires au blocage de publication.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/adaptive-knowledge/discovery.ts`: point d'entree actuel de la construction de requetes, aujourd'hui encore tres borne et statique.
- `scripts/adaptive-knowledge/connectors/*`: collecte des evidences a enrichir sans casser la perimeterisation actuelle.
- `scripts/adaptive-knowledge/contracts.ts`: schemas stricts a etendre pour les metadonnees scientifiques intermediaires.
- `scripts/adaptive-knowledge/remote-synthesis.ts`: moteur de synthese distante deja structure et auditable, base ideale pour une etape d'extraction plus fine.
- `scripts/adaptive-knowledge/synthesis.ts`: orchestration de la synthese a faire evoluer vers un pipeline extraction puis consolidation.
- `scripts/adaptive-knowledge/quality-gates.ts`: endroit naturel pour les nouveaux gates couverture/diversite/solidite.
- `scripts/adaptive-knowledge/pipeline-run.ts` et `publish.ts`: orchestration/promotion a conserver strictes.
- `src/server/dashboard/worker-dashboard.ts`: surface a alimenter avec de meilleurs indicateurs qualitatifs si necessaire.

### Established Patterns
- Le projet prefere des contrats stricts, des artefacts auditables et des blocages deterministes de publication plutot que des heuristiques opaques.
- Les snapshots publies restent la frontiere de confiance du runtime.
- Les echecs qualitatifs doivent etre visibles comme raisons explicites de non-publication, pas comme simples erreurs techniques.

### Integration Points
- La discovery enrichie devra alimenter les connecteurs existants sans explosion de cout ni de volume.
- Les records normalises devront probablement porter plus de champs scientifiques avant d'etre passes au modele distant.
- Les quality gates mis a jour devront rester compatibles avec le dashboard de phase 14 et les meta de run existantes.
- La knowledge bible runtime doit idealement rester stable ou evoluer de facon strictement compatible.

</code_context>

<specifics>
## Specific Ideas

- Introduire une taxonomie de themes et sous-themes avec synonymes, populations et exclusions pour piloter la discovery.
- Ajouter un score de ranking scientifique qui combine type d'evidence, recence, richesse du resume, fiabilite percue et proximite aux besoins du coaching.
- Creer un artefact d'extraction structuree par etude avant la consolidation finale des principes.
- Ajouter des quality gates explicites sur:
  - couverture minimale par themes critiques;
  - diversite minimale des evidence types et domaines sources;
  - densite minimale de provenance par principe;
  - taux maximum de rejets ou contradictions non resolues.
- Exposer dans les run reports pourquoi un snapshot a ete classe faible ou bloque pour publication.

</specifics>

<deferred>
## Deferred Ideas

- Aller chercher le texte integral payant des articles ou faire du scraping agressif hors API/supports autorises.
- Introduire un second provider LLM ou une orchestration multi-provider de vote dans cette phase.
- Construire une interface d'edition humaine complete du corpus.

</deferred>

---
*Phase: 15-qualite-scientifique-du-worker-corpus*
*Context gathered: 2026-03-11*
