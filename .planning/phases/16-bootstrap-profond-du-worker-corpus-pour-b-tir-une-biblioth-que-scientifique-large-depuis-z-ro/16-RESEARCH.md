# Phase 16: Bootstrap profond du worker corpus pour bâtir une bibliothèque scientifique large depuis zéro - Research

**Researched:** 2026-03-12
**Domain:** transformation du worker corpus en moteur de bootstrap scientifique large, reprenable et publiable progressivement
**Confidence:** HIGH

## User Constraints

## Implementation Decisions

### Scope de phase
- La phase 16 ne doit pas optimiser le refresh incrémental existant uniquement; elle doit ajouter un vrai mode de bootstrap capable de travailler sur des heures, jours ou semaines.
- Le refresh rapide actuel doit être conservé, mais séparé explicitement du bootstrap afin d'éviter qu'un run profond ne dégrade le flux opérateur courant.
- Le résultat attendu n'est pas un unique run géant, mais un système de constitution progressive d'une bibliothèque scientifique large, sûre à reprendre et observable.

### Réalité du code actuel
- `scripts/adaptive-knowledge/pipeline-run.ts` orchestre encore un run court `discover -> ingest -> synthesize -> validate -> publish`.
- `scripts/adaptive-knowledge/discovery.ts` produit un petit plan borné de queries seedées; il n'existe ni pagination profonde, ni file d'attente durable, ni plan de backfill.
- `scripts/adaptive-knowledge/connectors/shared.ts` filtre immédiatement les résultats par fraîcheur, domaine et `alreadySeen`, puis ne conserve qu'un lot normalisé très réduit.
- `connector-state.json` ne stocke qu'une petite mémoire `seenRecordIds`, insuffisante pour un bootstrap massif.
- Les connecteurs `pubmed`, `crossref` et `openalex` sont aujourd'hui utilisés comme fetchers de lots légers, pas comme collecteurs profonds.
- Le dashboard et le contrôle opérateur existent déjà, ce qui donne une bonne base pour exposer jobs, files d'attente, checkpoints et publications progressives.

### Conclusion structurante
- Le worker actuel est un rafraîchisseur incrémental.
- Le worker cible doit devenir une plate-forme de traitement en plusieurs couches:
  - planification de collecte;
  - acquisition brute paginée;
  - normalisation/identité/déduplication;
  - triage/ranking;
  - acquisition full-text/abstract enrichie;
  - extraction structurée;
  - consolidation/synthèse;
  - quality gates;
  - publication progressive.

## Summary

Le dépôt a déjà les bonnes briques pour la fin de chaîne: lease, artefacts de run, publication atomique, dashboard et synthèse distante structurée. Ce qui manque n'est pas un meilleur prompt, mais un socle de bootstrap durable en amont. Tant que le pipeline travaille sur six requêtes et des petits lots éphémères, il ne peut pas bâtir une bibliothèque scientifique large depuis zéro.

Le changement de phase 16 doit donc être architectural. Il faut découpler la constitution du corpus de la synthèse finale, introduire des files d'attente et des checkpoints persistants, accepter que la bibliothèque se construise par accumulation progressive, puis rendre la promotion du snapshot active indépendante de la vitesse d'acquisition.

**Primary recommendation:** découper la phase en cinq plans: séparation bootstrap/refresh et état durable, acquisition profonde paginée, identité/déduplication/triage, extraction structurée budgétée, puis publication progressive et contrôle opérateur.

## What The Current Worker Is Missing

### 1. Distinction bootstrap vs refresh
- Le mode `refresh` est aujourd'hui le seul vrai mode opératoire.
- Un bootstrap sérieux doit avoir:
  - sa propre cadence;
  - ses propres checkpoints;
  - ses propres budgets;
  - sa propre politique de publication;
  - la possibilité de s'arrêter et reprendre.

### 2. Backfill profond
- Les connecteurs doivent pouvoir itérer des milliers de résultats, pas seulement un premier lot.
- Les curseurs doivent être persistés par source, par query family, par topic, et par job.
- La fraîcheur ne peut plus être le premier filtre global pour le bootstrap; il faut distinguer:
  - `bootstrap lookback` large;
  - `refresh freshness window` courte.

### 3. Entrepôt intermédiaire
- Les records ne doivent plus passer directement de l'API source à `NormalizedEvidenceRecord[]` en mémoire.
- Il faut trois couches de stockage distinctes:
  - `raw-records`: réponse brute/compactée des fournisseurs et métadonnées source;
  - `normalized-records`: représentation typée, dédupliquée et enrichie;
  - `content-artifacts`: abstracts enrichis, full-text, extractions structurées, diagnostics.

### 4. Déduplication à l'échelle
- `seenRecordIds` sur 500 items n'est pas un mécanisme de bibliothèque.
- Il faut des identités stables et multi-clés:
  - DOI canonique;
  - PMID/PMCID;
  - OpenAlex ID;
  - URL canonique;
  - hash titre+auteur+année en fallback.
- La déduplication doit distinguer:
  - même oeuvre référencée par plusieurs sources;
  - même source revue dans plusieurs runs;
  - version enrichie du même record.

### 5. Triage avant coût LLM
- Tout ne doit pas partir en extraction distante.
- Il faut une étape de scoring/triage peu coûteuse pour sélectionner:
  - records à garder en bibliothèque brute;
  - records à enrichir via abstract/full-text;
  - records à extraire via LLM;
  - records à exclure du snapshot publiable.

### 6. Publication progressive
- Un bootstrap long ne doit pas retenir tout le système jusqu'à la fin.
- Il faut au moins trois notions:
  - état de bibliothèque accumulée;
  - snapshot candidat de travail;
  - snapshot actif publié pour le runtime.
- La promotion doit rester atomique et prudente, mais ne pas dépendre de l'achèvement total du bootstrap historique.

## Recommended Target Architecture

### A. Split explicite des modes
- `refresh`: petit lot récent, SLA court, publication opportuniste.
- `bootstrap`: exploration large, plusieurs jobs, reprise durable, budgets explicites.
- `check`: diagnostic sans promotion.

### B. Persistent job model
- Introduire des jobs persistés en JSON/artefacts locaux dans `.planning/knowledge/adaptive-coaching/` tant que le projet reste file-based.
- Chaque job de bootstrap doit porter:
  - `jobId`
  - `mode`
  - `scope`
  - `topic/query families`
  - `source cursors`
  - `queue counts`
  - `budget`
  - `status`
  - `lastCheckpointAt`
  - `operator notes`

### C. Queueing and resumability
- Créer des files logiques séparées:
  - `discovery-queue`
  - `fetch-queue`
  - `normalize-queue`
  - `enrichment-queue`
  - `extract-queue`
  - `synthesis-queue`
- Un run worker ne doit plus finir forcément tout le pipeline; il doit consommer un budget de travail puis checkpoint/reprendre.
- Les jobs doivent être idempotents: si un worker redémarre, la même unité de travail ne doit pas corrompre l'état.

### D. Storage layout
- Conserver le répertoire racine actuel, mais ajouter des sous-répertoires stables:
  - `jobs/`
  - `queues/`
  - `warehouse/raw/`
  - `warehouse/normalized/`
  - `warehouse/content/`
  - `snapshots/`
  - `state/`
  - `logs/`
- Tant que le projet reste sans nouvelle base dédiée pour le corpus, ce layout permet déjà une forte amélioration sans casser le runtime existant.

## Connector-Specific Research Notes

### PubMed
- C'est la meilleure source primaire actuelle du système pour le domaine biomédical/sport.
- Il faut supporter:
  - pagination profonde par `retstart`/history equivalent côté connector;
  - seeds thématiques et historiques;
  - lookback large en bootstrap;
  - persistance des PMIDs déjà rencontrés.
- Le bootstrap peut commencer par PubMed car la qualité moyenne y est meilleure pour le domaine.

### Crossref
- Utile pour élargir la couverture DOI et capter du contenu hors PubMed.
- Bruit plus fort: beaucoup de résultats hors sujet.
- Nécessite un triage plus agressif en amont et une normalisation canonique DOI plus solide.

### OpenAlex
- Bon pour enrichir les graphes de références et compléter les métadonnées.
- Doit probablement servir davantage comme source de liaison/enrichissement que comme source principale de publication brute.
- Les curseurs et identifiants OpenAlex doivent être reliés à DOI/PMID lorsqu'ils existent.

## Raw vs Normalized vs Extracted

### Raw records
- Conserver le payload minimal nécessaire à l'audit et à la reprise.
- Ne pas republier ces blobs dans les snapshots actifs runtime.
- Objectif: reproductibilité, debugging et réingestion sans rappeler systématiquement les API.

### Normalized records
- Étendre `NormalizedEvidenceRecord` ou créer un record warehouse voisin pour porter:
  - identités canoniques;
  - provenance multi-source;
  - classification thématique;
  - score de triage;
  - statut d'enrichissement;
  - flags d'éligibilité à extraction/publication.

### Extracted content artifacts
- Distinguer:
  - `abstract-only enrichment`
  - `full-text availability`
  - `structured study extraction`
  - `final principle synthesis`
- Les artefacts d'extraction doivent être traçables au record canonique.

## Full-Text and Legal Constraints

### Practical constraints
- Le projet ne doit pas supposer un accès universel aux PDFs payants.
- La stratégie raisonnable est:
  - abstract et métadonnées par défaut;
  - full-text seulement si URL explicitement accessible et domaine approuvé;
  - capture du statut `fullTextAvailable` sans bloquer la bibliothèque quand absent.

### Legal/ops constraints
- Respecter la whitelist de domaines approuvés.
- Ne pas ajouter de scraping opportuniste de domaines non approuvés sans décision explicite.
- Garder une séparation claire entre métadonnées indexées et contenu textuel extrait pour limiter les risques de stockage inapproprié.

## Cost and Time Budgeting

### Principle
- Le coût LLM doit être déclenché tard, après triage.
- L'extraction distante est chère; la synthèse finale l'est encore plus si elle porte trop de contenu.

### Recommended control knobs
- budget par job:
  - max fetched records
  - max normalized records
  - max enriched abstracts/full texts
  - max extraction batches
  - max synthesis batches
  - max runtime minutes
- arrêt propre avec checkpoint quand le budget est atteint.

### Suggested policy
- bootstrap:
  - budgets larges mais bornés;
  - priorisation par topic gaps et quality targets;
  - publication possible par tranches.
- refresh:
  - budgets faibles;
  - recent-only;
  - exploitation de la bibliothèque existante.

## Quality Gates For A From-Zero Bootstrap

### Candidate library gates
- Le bootstrap ne doit pas attendre une bibliothèque parfaite pour produire de la valeur.
- Introduire des gates à deux niveaux:
  - `library accumulation gates`: qualité minimale pour retenir des records dans la bibliothèque de travail;
  - `publication gates`: qualité plus stricte pour promotion vers snapshot actif.

### Publication gates to add
- couverture minimale par thèmes critiques;
- diversité minimale des domaines/types de preuves;
- densité minimale de provenance pour les principes publiés;
- ratio maximal de records trop faibles ou trop incomplets;
- absence de contradictions critiques non résolues;
- fraîcheur ou justification explicite quand la preuve est ancienne mais encore pertinente.

## Operator Controls and Dashboard Implications

### New dashboard needs
- Vue distincte bootstrap vs refresh.
- Création, reprise, pause et annulation de jobs bootstrap.
- Queue depths et throughput par étape.
- Cursors par source/query family.
- Budget consommé vs budget restant.
- Warehouse growth: raw / normalized / extracted / published.
- Diagnostics d'éligibilité à publication.
- Vue des records canonisés et raisons de rejet.

### Controls to add
- `Start bootstrap`
- `Resume bootstrap`
- `Pause bootstrap`
- `Promote candidate if gates pass`
- `Reset specific cursor scope`
- `Requeue failed extraction batches`

## Failure Modes To Plan For

### Technical
- timeouts API source;
- rate limiting fournisseur;
- crash process pendant un lot;
- corruption d'un cursor ou checkpoint;
- explosion du volume disque;
- temps de synthèse/extraction dépassant les budgets.

### Product-quality
- bibliothèque large mais bruitée;
- records majoritairement anciens ou hors sujet;
- duplication massive multi-sources;
- trop peu de full-text exploitables;
- principes actifs trop pauvres malgré une bibliothèque grossissante.

### Mitigations
- états de job idempotents;
- checkpoints fréquents;
- budgets d'étape;
- warehouse auditable;
- gates de publication indépendants de l'accumulation brute;
- rollback conservant le snapshot actif précédent.

## Recommended 5-Plan Decomposition

### Plan 1: Bootstrap architecture, mode split, and persistent job state
- Introduire un vrai mode `bootstrap` séparé de `refresh/check`.
- Poser le modèle de job, les checkpoints durables et le layout de stockage.
- Étendre le contrôle worker et l'état opérateur à cette nouvelle mécanique.

### Plan 2: Deep source acquisition, pagination, and raw warehouse
- Refaire les connecteurs pour supporter pagination profonde, backfill historique et curseurs persistants.
- Stocker les réponses brutes compactes et les métadonnées d'acquisition.
- Alimenter des files de travail plutôt qu'un seul tableau mémoire.

### Plan 3: Canonical identity, deduplication, and triage
- Introduire l'identité canonique multi-source et la déduplication à l'échelle.
- Construire la couche normalized warehouse et le scoring/triage peu coûteux.
- Préparer les lots d'enrichissement/extraction à partir des records les plus prometteurs.

### Plan 4: Enrichment, structured extraction, and cost-governed synthesis
- Ajouter acquisition abstract/full-text quand disponible.
- Structurer l'extraction par étude/lot avec budgets et reprise.
- Réduire la synthèse finale à un consommateur d'extractions déjà qualifiées.

### Plan 5: Progressive publication, dashboard operations, and end-to-end verification
- Permettre la publication progressive depuis une bibliothèque en croissance.
- Exposer jobs, queues, budgets, warehouse et publications dans le dashboard.
- Vérifier le comportement de reprise, de blocage qualité et de compatibilité runtime.

## Verification Implications

### Tests à prévoir
- tests unitaires sur curseurs/job states/queues;
- tests connecteurs paginés avec curseurs et backfill;
- tests identity/dedup multi-source;
- tests pipeline bootstrap sur reprise après interruption;
- tests quality gates publication vs accumulation;
- tests dashboard sur statuts de jobs bootstrap et compteurs de warehouse;
- tests runtime pour prouver qu'un snapshot actif partiel mais valide reste consommable.

### Verification functional goals
- Démarrer un bootstrap from scratch sans publication immédiate obligatoire.
- Reprendre un bootstrap interrompu sans reprocesser massivement les mêmes unités.
- Construire progressivement une bibliothèque nettement plus large que le pipeline actuel.
- Promouvoir un snapshot actif seulement quand les gates de publication sont satisfaits.

## Planning Notes

- Ne pas essayer de livrer "la bibliothèque parfaite" en un seul plan; commencer par le mode bootstrap et la persistance.
- Garder la publication active et le runtime hybrides comme frontière de confiance inchangée.
- Préserver l'ergonomie opérateur: un long bootstrap doit rester visible, contrôlable et explicable depuis le dashboard.
- Préférer des artefacts intermédiaires explicitement typés à des heuristiques implicites en mémoire.
