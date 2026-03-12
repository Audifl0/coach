# Phase 16: Bootstrap profond du worker corpus pour bâtir une bibliothèque scientifique large depuis zéro - Research

**Researched:** 2026-03-12
**Domain:** transformation du worker corpus incremental actuel en systeme de bootstrap scientifique large, reprisable et exploitable en production
**Confidence:** HIGH

## User Constraints

## Implementation Decisions

### Scope de phase
- La phase doit permettre au worker de construire une bibliotheque scientifique large depuis zero sur plusieurs runs, pas seulement d'ameliorer un refresh ponctuel.
- Le systeme final doit distinguer deux modes:
  - `bootstrap`: mode long, profond, reprisable, capable de backfill multi-pages et de construire un backlog de travail;
  - `refresh`: mode court, borne, optimise pour entretenir un corpus deja bootstrape.
- La phase doit etendre le pipeline existant dans `scripts/adaptive-knowledge/` plutot que creer un deuxieme systeme parallele sans gouvernance partagee.

### Ce que le code actuel permet deja
- `pipeline-run.ts` orchestre deja `discover -> ingest -> synthesize -> validate -> publish`.
- `publish.ts` fournit deja une frontiere de promotion atomique utile a conserver.
- Le dashboard worker existe deja et peut devenir la surface operateur du bootstrap long.
- Les connecteurs PubMed/Crossref/OpenAlex sont deja integres, mais restent limites a:
  - quelques seeds par run;
  - un faible budget de pages;
  - un filtre de fraicheur/seenIds pense pour refresh, pas pour backfill profond.

### Limitations structurelles a corriger
- Le worker raisonne aujourd'hui en "petit lot candidat a publier immediatement", pas en "campagne de constitution de bibliotheque".
- `connector-state.json` ne stocke qu'une liste de `seenRecordIds`; c'est insuffisant pour reprendre un bootstrap multi-sources et multi-pages sur des semaines.
- Les connecteurs produisent directement des `NormalizedEvidenceRecord`; il manque un niveau intermediaire pour stocker:
  - metadata brutes;
  - statut d'acquisition;
  - statut d'extraction;
  - motifs de rejet ou d'attente.
- Le pipeline n'a ni file de travail persistante, ni notion de budgets inter-etapes, ni progression partielle publiable.
- Le dashboard montre des snapshots et runs, mais pas une campagne de bootstrap, sa profondeur, ni son etat de reprise.

### Architecture cible recommandee
- Introduire une separation explicite entre:
  - `search backlog`: requetes, curseurs, domaines, priorites, progression;
  - `raw evidence store`: metadata brutes et identites source-stables;
  - `document staging`: abstract/full-text/disponibilite documentaire;
  - `structured extraction store`: artefacts intermediaires par etude/document;
  - `publication snapshots`: vue compacte, gatee et runtime-safe.
- Garder `knowledge-bible.json` comme frontiere aval stable, mais ne plus forcer tout le bootstrap a converger en un seul run.
- Considerer le snapshot publie comme "vue active resumee" d'une bibliotheque en croissance, et non comme representation exhaustive du backlog.

### Mode split bootstrap versus refresh
- `bootstrap` doit:
  - elargir le budget de requetes et de pagination;
  - ignorer le filtre de fraicheur en tant que gate principal;
  - persister sa progression finement;
  - accepter des runs longs et reprises frequentes;
  - publier par increments scientifiquement utiles sans exiger que tout le backfill soit fini.
- `refresh` doit:
  - reutiliser la meme infrastructure;
  - cibler les updates recentes et les trous detectes;
  - rester borne, rapide et economique.

### Strategie de backfill et pagination
- Chaque connecteur doit exposer un state persistant plus riche qu'un simple curseur global:
  - `queryFamily`
  - `topicKey`
  - `cursor`
  - `pageBudgetConsumed`
  - `lastAttemptAt`
  - `lastSuccessAt`
  - `exhausted`
- Le moteur de collecte doit travailler sur une file priorisee de jobs de collecte plutot que recalculer tout a chaque run.
- La priorisation doit combiner:
  - couverture thematique manquante;
  - valeur scientifique attendue;
  - profondeur restante;
  - cout estime par source.

### Acquisition documentaire
- La bibliotheque large ne doit pas dependre uniquement de titres/metadata.
- Il faut distinguer:
  - documents avec metadata seules;
  - documents avec abstract fiable;
  - documents avec full-text accessible/licite;
  - documents non extractibles mais gardes comme references.
- Le pipeline doit persister explicitement cette profondeur documentaire, sinon la qualite scientifique restera limitee.

### Extraction et synthese a grande echelle
- Les LLM ne doivent pas etre appeles sur tout le backlog brut.
- Il faut inserer un triage deterministe avant toute extraction couteuse:
  - ranking scientifique record-level;
  - regroupement thematique;
  - budget par lot;
  - retry state et motifs de blocage.
- La synthese finale runtime doit consommer des extractions deja structurees, pas des metadata brutes.

### Publication et quality gates
- Le gate de publication ne doit pas exiger la completion du bootstrap entier.
- Il doit verifier qu'un sous-ensemble de bibliotheque est:
  - suffisamment couvert sur les themes critiques;
  - assez diversifie en sources/types d'evidence;
  - auditable jusqu'aux extractions et documents sources;
  - compatible avec `knowledge-bible`.
- Il faut donc des gates progressifs:
  - gates de staging;
  - gates d'extraction;
  - gates de publication runtime.

### Ops et dashboard
- Le dashboard doit evoluer d'une vision "dernier run / dernier snapshot" a une vision de campagne:
  - progression bootstrap globale;
  - queue depth;
  - jobs actifs/bloques;
  - curseurs par source/query family;
  - throughput;
  - budgets temps/couts;
  - deltas verses vers le snapshot actif.
- L'operateur doit pouvoir:
  - lancer un bootstrap;
  - le mettre en pause;
  - le reprendre;
  - relancer seulement certaines families ou sources;
  - reinitialiser proprement un backlog si necessaire.

## Summary

Le worker actuel n'est pas "faux"; il est simplement concu comme un refresh incrémental borne, pas comme un moteur de constitution de bibliotheque scientifique a grande echelle. Sa vitesse actuelle vient de cette hypothese: peu de requetes, peu de pages, filtrage agressif, publication immediate. Pour atteindre l'objectif utilisateur, il faut changer l'unite de travail.

La bonne unite de travail n'est plus "un snapshot candidat par run" mais "une campagne de bootstrap persistante composee de jobs de collecte, de staging, d'extraction et de publication partielle". La bibliotheque doit donc avoir un etat propre au-dela du snapshot runtime: backlog, curseurs, artefacts documentaires, extractions structurees, statuts de traitement et budgets.

La recommandation centrale est de conserver les frontieres de confiance deja valides du systeme existant, en particulier `publish.ts`, `knowledge-bible.json` et le dashboard operateur, tout en intercalant un vrai moteur de backfill reprisables en amont. Autrement dit: ne pas jeter le pipeline, mais l'elever d'un worker de refresh a une plateforme de bootstrap continue.

**Primary recommendation:** decomposer la phase en cinq plans: fondations etat/contrats, backfill/pagination, staging documentaire et extraction, publication progressive et quality gates, puis dashboard/verification operateur.

## Reuse Opportunities

### Runtime et orchestration
- Reutiliser `refresh-corpus.ts` et `worker-state.ts` pour introduire de nouveaux modes d'execution, au lieu de creer un daemon parallele.
- Reutiliser le contrat `run-report.json` comme base, mais l'etendre avec des dimensions campagne/bootstrap.

### Connecteurs
- Conserver les connecteurs PubMed/Crossref/OpenAlex, mais les faire travailler via une file de jobs et des curseurs persistants par requete.
- Reutiliser la normalisation et les domaines allowlistes, tout en deplacant les decisions de triage plus loin dans la chaine.

### Publication runtime
- Garder `manifest.json`, `knowledge-bible.json`, `diff.json`, `active.json` et la promotion atomique comme frontiere stable.
- Produire en plus des artefacts amont non runtime-safe, mais auditables.

## Risks and Regressions

### Risque 1: explosion de volume disque
- Un bootstrap large va accumuler metadata, documents et extractions.
- Mitigation: separer stores, politiques de retention et compression; ne pas tout copier dans chaque snapshot publie.

### Risque 2: cout LLM ingouvernable
- Si l'extraction distante voit trop de records trop tot, la phase devient non viable.
- Mitigation: ranking/triage deterministe, budgets de lots, caps journaliers, files de retry.

### Risque 3: confusion entre bibliotheque et snapshot actif
- Si les artefacts bootstrap et runtime sont melanges, le systeme devient illisible.
- Mitigation: garder des zones de stockage et des contrats distincts.

### Risque 4: reprise bancale apres crash
- Sans checkpointing fin, un bootstrap long sera inutilisable en prod.
- Mitigation: persister l'avancement par job/source/stage, pas seulement par run global.

### Risque 5: dashboard trompeur
- Une simple vue "completed/failed" n'est pas suffisante pour un bootstrap sur plusieurs jours.
- Mitigation: introduire progression, queue depth, throughput et blocages structurés.

## Recommended 5-Plan Decomposition

### Plan 1: Contrats bootstrap, etat persistant, mode split
- Introduire les contrats et stores du bootstrap.
- Definir `bootstrap` versus `refresh`.
- Persister file de jobs, curseurs et progression.

### Plan 2: Backfill profond et pagination
- Remplacer la collecte par run statique par un moteur de jobs pagines.
- Prioriser queries/families/sources selon couverture et profondeur.
- Rendre la collecte reprisable et budgetee.

### Plan 3: Staging documentaire et extraction structuree
- Ajouter le niveau metadata -> abstract/full-text -> extraction.
- Persister les artefacts documentaires et les motifs de rejet.
- Decoupler collecte et extraction LLM.

### Plan 4: Publication progressive et quality gates
- Construire une vue publiable depuis la bibliotheque accumulee.
- Gate progressifs et publication incrementale sure.
- Compatibilite stricte runtime.

### Plan 5: Dashboard et verification longue duree
- Faire du dashboard une vraie surface d'operations bootstrap.
- Ajouter controles pause/reprise/reset scope.
- Verifier le comportement end-to-end sur bootstrap long, reprise, blocage et promotion.

## Verification Implications

### Tests a prevoir
- Tests de contrats/stores pour les nouvelles structures persistantes bootstrap.
- Tests de collecteurs pagines et reprise de curseurs.
- Tests de staging documentaire et d'extraction partielle avec budgets.
- Tests de publication progressive garantissant la compatibilite runtime.
- Tests dashboard/API sur queue depth, progression, pause/reprise et erreur de campagne.

### Verifications fonctionnelles
- Simuler un bootstrap a froid sur plusieurs ticks sans perte d'etat.
- Verifier qu'un redeploiement ou timeout ne force pas de repart a zero.
- Verifier qu'un sous-ensemble utile peut etre publie avant la fin du bootstrap complet.
- Verifier que `refresh` continue de fonctionner rapidement une fois la bibliotheque amorcee.

## Planning Notes

- Commencer par les contrats et l'etat persistant; sans cela, tout le reste restera jetable.
- Ne pas mettre le full-text ou les LLM dans le chemin critique du collecteur brut.
- Faire de la bibliotheque un store cumulatif et du snapshot actif une projection gatee.
- Preserver strictement la compatibilite `knowledge-bible` et le fallback deterministic.
