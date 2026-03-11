# Phase 15: Qualite scientifique du worker corpus - Research

**Researched:** 2026-03-11
**Domain:** amelioration de la valeur scientifique du corpus worker sans casser la frontiere de publication ni le contrat runtime
**Confidence:** HIGH

## User Constraints

## Implementation Decisions

### Scope de phase
- La phase doit augmenter la qualite scientifique du corpus publie, pas reconstruire l'infrastructure worker des phases 12 a 14.
- Les 4 axes a traiter explicitement sont:
  - richer discovery;
  - better scientific ranking;
  - structured per-study extraction;
  - stricter coverage/diversity quality gates.
- Le worker doit rester borne au perimetre sport/musculation/coaching et ne pas devenir un moteur de recherche web generaliste.

### Contrats et frontieres a preserver
- `scripts/adaptive-knowledge/pipeline-run.ts` reste l'orchestrateur canonique des etapes `discover -> ingest -> synthesize -> validate -> publish`.
- La publication doit rester strictement bloquee par des gates deterministes avant `promoteCandidateSnapshot(...)`.
- Le runtime continue a faire confiance uniquement au snapshot publie; la knowledge bible active reste la frontiere de confiance.
- La knowledge bible runtime ne doit pas changer de shape sans raison forte; toute evolution doit etre strictement compatible ou limitee aux artefacts intermediaires.
- Les artefacts doivent rester auditables: `sources.json`, `validated-synthesis.json`, `principles.json`, `manifest.json`, `diff.json`, `run-report.json`.

### Contraintes concretes du code actuel
- `discovery.ts` ne sait produire qu'une liste plate de requetes seed -> source; il n'y a ni taxonomie, ni expansion bornee, ni notion de trou de couverture.
- `contracts.ts` ne transporte aujourd'hui que des `NormalizedEvidenceRecord` tres maigres et des sorties de synthese orientees principes, pas d'extraction structuree par etude.
- `synthesis.ts` groupe les lots par `sourceType`, ce qui est trop grossier pour une extraction scientifique utile.
- `remote-synthesis.ts` a deja la discipline utile: prompts bornes + JSON schema strict + parsing Zod + erreurs typees. C'est la meilleure base pour inserer une etape d'extraction plus fine.
- `quality-gates.ts` ne score aujourd'hui que source class, recence et completude minimale; il manque les notions de couverture thematique, diversite des types d'evidence, richesse informative et solidite des principes.
- `pipeline-run.ts` ecrit deja assez d'artefacts pour supporter des gates plus stricts, mais il ne produit pas encore les meta intermediaires qui rendraient ces gates explicables.

## Summary

Le depot est deja bien structure pour cette phase: la publication atomique, les schemas stricts, la synthese distante et le dashboard operateur existent. Le probleme n'est pas d'ajouter un nouveau pipeline, mais d'enrichir le pipeline existant pour que les snapshots candidats deviennent scientifiquement plus representatifs, mieux classes et mieux auditables.

La principale limite actuelle est le niveau de granularite. La discovery reste quasi statique, les records normalises ne capturent pas assez de signaux scientifiques, la synthese opere par gros lots de `sourceType`, et les quality gates ne savent pas dire si un snapshot est monocorde, mal couvert ou scientifiquement pauvre. Phase 15 doit donc enrichir les contrats intermediaires et la validation, tout en gardant la publication et le runtime stables.

**Primary recommendation:** planifier la phase en 4 plans relies a la chaine existante: discovery guidee par taxonomie, ranking scientifique des records, extraction structuree par etude avant consolidation, puis quality gates renforcees de couverture/diversite/solidite.

## Reuse Opportunities

### Discovery
- Etendre `scripts/adaptive-knowledge/discovery.ts` plutot que creer un nouveau generateur.
- Reutiliser les connecteurs existants et le `maxQueriesPerRun` du pipeline pour garder l'expansion bornee.
- S'appuyer sur les tags/couverture deja presents dans `validatedSynthesis.coverage.coveredTags` et les snapshots precedents pour guider les trous de couverture.

### Ranking et extraction
- Etendre `scripts/adaptive-knowledge/contracts.ts` avec des metadonnees scientifiques intermediaires optionnelles plutot que casser `NormalizedEvidenceRecord` ou `CorpusPrinciple`.
- Reutiliser `remote-synthesis.ts` pour une nouvelle sortie JSON stricte de type extraction par etude/petit lot, puis une consolidation finale distincte.
- Reutiliser `synthesis.ts` comme orchestrateur de lots, mais remplacer le regroupement par `sourceType` par un regroupement plus semantique et plus petit.

### Validation et observabilite
- Etendre `scripts/adaptive-knowledge/quality-gates.ts` au lieu d'ajouter une deuxieme validation parallele.
- Reutiliser `run-report.json`, `validated-synthesis.json` et le dashboard phase 14 pour exposer les raisons de blocage sans changer la publication atomique.

## Contracts To Extend

### `NormalizedEvidenceRecord`
- Ajouter des champs optionnels de ranking/extraction, par exemple:
  - `scientificSignals`: type d'etude, population hints, intervention hints, outcome hints, abstract richness, recency bucket.
  - `discoveryMeta`: topic key, subtopic key, query family, source query.
  - `ranking`: score global, sous-scores, raisons de declassement.
- Garder ces champs optionnels pour ne pas casser les fixtures/tests existants d'ingestion.

### Synthesis contracts
- Ajouter un schema intermediaire de type `StructuredStudyExtraction` ou equivalent:
  - `recordId`, `topicKeys`, `population`, `intervention`, `context`, `outcomes`, `evidenceLevel`, `limitations`, `safetySignals`, `rejectionReason?`.
- Etendre ensuite `SourceSynthesisBatch` ou `ValidatedSynthesis` pour referencer ces extractions, pas seulement les principes consolides.
- Versionner les prompts/schema names dans `remote-synthesis.ts` plutot que muter silencieusement `corpus-v1`.

### Quality gate result
- Etendre le resultat de `evaluateCorpusQualityGate(...)` avec des details lisibles:
  - couverture par themes critiques;
  - diversite des `sourceType` et des domaines;
  - densite de provenance par principe;
  - taux de records classes faibles/rejetes;
  - raisons precises de blocage.
- Garder `publishable` et `reasons` comme contrat simple aval, mais enrichir les details pour le dashboard et l'audit.

## Risks and Regressions

### Risque 1: casser la compatibilite runtime
- Si les contrats runtime ou la knowledge bible changent brutalement, le generateur hybride et les services de coaching deviennent fragiles.
- Mitigation: limiter les nouveaux champs aux artefacts intermediaires et garder la sortie runtime strictement compatible.

### Risque 2: explosion de volume/cout
- Une richer discovery mal bornee peut multiplier les requetes et records, puis allonger la synthese distante.
- Mitigation: taxonomie finie, budgets par theme, regroupement deterministe, top-N ranking avant extraction distante.

### Risque 3: faux sentiment de qualite
- Un meilleur `compositeScore` seul ne prouve pas une meilleure couverture scientifique.
- Mitigation: separer ranking des records et gates de snapshot; les gates doivent verifier la distribution et la provenance, pas seulement une moyenne.

### Risque 4: pipeline trop couple a l'LLM
- Si toute la valeur depend d'une extraction distante fragile, on fragilise la publication.
- Mitigation: conserver schemas stricts, erreurs typees, lots reduits, et raisons de rejet auditables; ne pas rendre le publish dependant d'heuristiques opaques.

### Risque 5: explication operateur insuffisante
- Des gates plus stricts sans details actionnables rendront le dashboard moins utile.
- Mitigation: produire des metriques explicables et des motifs de blocage stables dans les artefacts.

## Recommended 4-Plan Decomposition

### Plan 1: Richer Discovery
- Introduire une taxonomie de themes/sous-themes/populations/exclusions dans `discovery.ts`.
- Produire un plan de discovery borne, rejouable et observable: `topicKey`, `queryFamily`, `source`, `query`.
- Reutiliser le coverage des snapshots precedents pour prioriser les trous sans generation libre infinie.
- Sortie attendue: discovery plan plus riche, sans changement du publish flow.

### Plan 2: Better Scientific Ranking
- Etendre la normalisation/contrats pour calculer un ranking scientifique record-level avant synthese.
- Integrer des sous-scores explicites: type d'etude, proximite thematique coaching, richesse informative, signaux de fiabilite, recence, diversite de provenance.
- Utiliser ce ranking pour filtrer/ordonner les records et composer de meilleurs lots d'extraction.
- Sortie attendue: moins de records, mais mieux choisis et mieux motives.

### Plan 3: Structured Per-Study Extraction
- Inserer entre ingest et consolidation une extraction structuree par etude ou petit lot dans `remote-synthesis.ts` / `synthesis.ts`.
- Ajouter un contrat intermediaire auditable avec population, intervention, contexte, outcomes, niveau de preuve, limites, signaux de securite, motifs de rejet.
- Consolider ensuite les principes depuis ces extractions plutot que directement depuis des records peu enrichis.
- Sortie attendue: `validated-synthesis.json` plus riche et plus explicable, sans casser `principles.json`.

### Plan 4: Stricter Coverage/Diversity Quality Gates
- Etendre `quality-gates.ts` pour verifier couverture thematique, diversite des evidence types/domaines, densite de provenance et contradictions non resolues.
- Ajouter des details de gate exploitables dans `run-report.json` et les artefacts candidats.
- Garder la promotion strictement bloquee tant que les seuils de couverture/diversite/solidite ne sont pas atteints.
- Sortie attendue: snapshots faibles ou trop homogenes bloques avant publication, avec motifs clairs.

## Verification Implications

### Tests a prevoir
- Tests unitaires sur `discovery.ts` pour prouver le bornage, la stabilite et la couverture minimale de la taxonomie.
- Tests de contrats Zod dans `contracts.ts` pour tous les nouveaux schemas intermediaires et compatibilites backward.
- Tests de `synthesis.ts` / `remote-synthesis.ts` pour verifier la nouvelle extraction structuree, les lots plus fins et le parsing strict.
- Tests de `quality-gates.ts` pour les cas de blocage: sous-couverture, manque de diversite, provenance insuffisante, contradictions en attente.
- Tests pipeline de `pipeline-run.ts` pour verifier que les nouveaux artefacts sont ecrits et que `publish` reste bloque de facon deterministe.

### Verifications fonctionnelles
- Comparer un run "ancien style" et un run phase 15 pour montrer une meilleure repartition thematique et une meilleure diversite de sources.
- Verifier qu'un snapshot scientifiquement pauvre reste non publiable meme si la synthese ne plante pas.
- Verifier que les raisons de blocage sont lisibles dans les artefacts, puis remontables au dashboard operateur.
- Verifier explicitement que `knowledge-bible.json` et les consommateurs runtime restent compatibles.

## Planning Notes

- Commencer par les contrats et la taxonomie avant de toucher aux prompts de synthese; sinon les schemas et gates deriveront.
- Ne pas fusionner ranking et quality gates dans une seule formule; le premier sert a choisir les records, les seconds servent a bloquer la publication.
- Garder les nouveaux champs majoritairement optionnels tant que les fixtures/tests de pipeline n'ont pas ete migres.
- Favoriser des artefacts intermediaires explicites plutot que des heuristiques cachees dans le code.
