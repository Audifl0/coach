# Worker corpus V4 — backlog scientifique quasi infini

## Contexte

Le worker corpus actuel exécute correctement ses runs, mais son modèle de travail reste trop étroit par rapport au produit visé. En production, des runs `refresh` peuvent se terminer proprement tout en ne produisant aucun nouveau record sélectionné, aucune nouvelle synthèse, et aucune publication utile. Les connecteurs trouvent pourtant des résultats bruts, mais ceux-ci sont éliminés par une combinaison de fenêtre de fraîcheur, logique incrémentale locale, et couverture trop limitée des fronts de recherche.

Le besoin produit est plus fort : le worker doit se comporter comme un chercheur logiciel persistant. Tant qu’il existe des papiers non traités, des documents non extraits, des questions scientifiques incomplètes, des contradictions ouvertes, ou des révisions de doctrine à publier, il ne doit pas manquer de travail.

## Décision de design

Nous faisons évoluer l’architecture vers une **approche B** : un **ordonnanceur de backlog scientifique durable** couvrant toute la chaîne de travail, de la découverte documentaire jusqu’à la doctrine publiée.

Le worker n’est plus piloté par un mini pipeline `refresh` borné par une petite fenêtre de requêtes récentes. Il est piloté par le **prochain item scientifique utile non terminé**, choisi dans un backlog persistant et unifié.

## Objectifs

1. Garantir qu’un worker utile ne manque pas de travail tant qu’il reste du backlog scientifique réel.
2. Supprimer la fenêtre de fraîcheur comme filtre bloquant d’admissibilité.
3. Étendre le pilotage du worker à toute la chaîne : découverte, acquisition, extraction, liaison, contradictions, doctrine.
4. Augmenter fortement la couverture des sources admissibles.
5. Préserver la doctrine conservatrice / preuve forte en séparant strictement les niveaux de preuve.
6. Rendre le dashboard honnête sur la productivité réelle, les blocages, et l’état du backlog.

## Non-objectifs

- Réécrire entièrement les connecteurs existants.
- Remplacer le cadre conservateur de publication doctrine.
- Transformer immédiatement l’architecture en essaim de workers spécialisés distribués.
- Mélanger les sources professionnelles avec la doctrine preuve forte sans séparation explicite.

## Principes

### 1. Le worker ne manque jamais de travail sur toute la chaîne

Le système doit toujours préférer le meilleur travail scientifique restant, quel que soit son stade :

- découverte historique non épuisée,
- acquisition documentaire,
- extraction structurée,
- liaison étude → question,
- analyse de contradiction,
- publication ou révision de doctrine.

Un run n’est donc plus défini par “exécuter un pipeline complet”, mais par “consommer un budget de work items utiles”.

### 2. La fraîcheur n’est plus un filtre bloquant

Un document pertinent et non traité reste admissible quel que soit son âge. La date de publication peut influencer la priorité, mais pas l’existence du travail.

Conséquence :

- `freshnessWindowDays` cesse d’être une barrière d’entrée,
- la littérature historique reste disponible au backlog,
- le worker ne confond plus “pas de nouveauté récente” avec “pas de travail disponible”.

### 3. Le backlog scientifique est persistant et unifié

Le worker maintient un backlog durable composé d’items hétérogènes mais comparables par priorité.

Types d’items attendus :

- `discover-front-page`
- `revisit-front`
- `acquire-fulltext`
- `extract-study-card`
- `link-study-question`
- `analyze-contradiction`
- `publish-doctrine`

Chaque item possède au minimum :

- un identifiant durable,
- un type,
- un sujet / thème associé,
- un score de priorité,
- un état de blocage éventuel,
- un historique d’essais,
- un horodatage de création et de dernière mise à jour.

## Architecture proposée

### A. Registries persistants

Nous conservons les registries V3 existants, mais nous ajoutons un registre racine de découverte.

#### Nouveau registre : `research-fronts`

Il décrit les fronts de recherche persistants :

- source,
- famille de requêtes,
- requête exacte,
- thème / sous-thème,
- curseur ou pagination,
- métriques de progression,
- état (`active`, `cooldown`, `deferred`, `blocked`, `exhausted`, `archived`),
- raisons d’état,
- date de dernier essai,
- score de valeur attendue.

#### Registries conservés et renforcés

- document registry
- study dossiers
- scientific questions
- contradiction dossiers
- doctrine registry
- durable work queues

Le `research-fronts` devient l’alimentation racine de la découverte historique; les autres registries portent l’état aval.

### B. Unified scheduler

Un scheduler central lit l’ensemble des registries et génère une vue unifiée du travail restant. Son rôle est de :

1. collecter les work items candidats,
2. calculer leur priorité,
3. éliminer les items actuellement bloqués,
4. choisir le meilleur item exécutable,
5. consommer un budget d’items par run,
6. persister les transitions d’état.

Le scheduler orchestre; il n’implémente pas la logique métier fine des connecteurs ou extracteurs.

### C. Executors spécialisés

Chaque work item est exécuté par un exécuteur spécialisé :

- discovery executor
- document executor
- question executor
- contradiction executor
- doctrine executor

Cette séparation permet :

- des tests ciblés,
- une observabilité plus lisible,
- moins de couplage,
- une évolution incrémentale sans réécriture totale.

## Politique de priorité

Le score de priorité doit favoriser, dans cet ordre général :

1. le travail qui débloque l’aval,
2. les trous scientifiques majeurs,
3. les contradictions bloquantes,
4. les publications doctrine prêtes,
5. la découverte historique profonde,
6. la fraîcheur récente comme bonus uniquement.

Facteurs de score possibles :

- caractère bloquant,
- déficit de couverture par thème,
- valeur attendue du travail,
- coût estimé,
- vieillissement de l’item dans la file,
- diversité des sources,
- bonus de récence,
- état de retry / saturation.

## Politique de non-épuisement

### Règle générale

Un front de recherche ne devient pas `exhausted` après un seul run stérile.

Les issues faibles doivent être distinguées :

- `empty-page`
- `duplicate-heavy`
- `off-topic-heavy`
- `source-temporarily-cold`
- `cursor-exhausted`
- `front-needs-reformulation`

Ces issues entraînent typiquement :

- `cooldown`,
- `deferred`,
- `revisit`,
- ou reformulation,

mais pas automatiquement `exhausted`.

### États métier proposés pour les fronts

- `active`
- `warming`
- `deferred`
- `blocked`
- `cooldown`
- `exhausted`
- `archived`

### Quand un front peut être réellement `exhausted`

Seulement après accumulation de preuves suffisantes, par exemple :

- plusieurs pages consommées,
- plusieurs tentatives espacées,
- plusieurs reformulations testées,
- plusieurs sources associées explorées,
- absence durable de nouveaux documents utiles au-delà d’un seuil.

Même un front `exhausted` peut être rouvert si :

- une contradiction l’exige,
- une question reste sous-couverte,
- une nouvelle source rejoint le catalogue,
- une reformulation plus riche est générée,
- un signal métier demande un backfill ciblé.

## Politique de retry

Les work items doivent avoir une politique de retry explicite :

- **hard failure** → retry borné + journalisation,
- **soft empty** → cooldown puis revisit,
- **duplicate flood** → avancement du curseur ou reformulation,
- **off-topic flood** → baisse de score ou suspension du front,
- **blocked downstream** → hausse du score du prérequis.

Le système doit éviter les boucles stériles silencieuses.

## Politique de sources

### Objectif

Le worker doit couvrir **le plus de sources admissibles possible**, sans dilution du niveau de preuve.

### Modèle cible

Les sources sont gérées comme un **catalogue de sources versionné et extensible**, non comme une petite whitelist fermée.

Chaque source doit décrire :

- son type,
- son niveau de confiance,
- ses capacités (metadata, abstract, full text),
- sa politique de déduplication,
- sa robustesse opérationnelle,
- son statut (`active`, `experimental`, `suspended`).

### Choix produit validé

Le système vise un **maximum élargi** :

- sources académiques strictes en priorité,
- sources professionnelles sérieuses admises aussi,
- mais séparation explicite du niveau de preuve.

### Niveaux de preuve

Exemple de structuration :

- **Niveau A** : sources académiques / biomédicales / sport-science robustes
- **Niveau B** : archives, portails, éditeurs ou sources professionnelles sérieuses exploitables
- **Niveau C** : éventuelles sources annexes, si un jour explicitement admises

La doctrine conservatrice publiée ne consomme que les niveaux autorisés par le mode preuve forte. Les niveaux plus faibles peuvent enrichir le backlog, les questions, les pistes, ou les contrastes, mais ne doivent pas contaminer les principes publiés sans arbitrage explicite.

## Dashboard et observabilité

Le dashboard doit décrire honnêtement le travail scientifique.

### Surfaces attendues

#### 1. Backlog global

Compteurs par type :

- discovery fronts (`active`, `cooldown`, `exhausted`),
- documents en attente d’acquisition / extraction / liaison,
- questions sous-alimentées,
- contradictions ouvertes,
- doctrine candidates.

#### 2. Travail du run courant

Afficher :

- type d’item en cours,
- dernier item terminé,
- nombre d’items traités dans le run,
- delta utile produit :
  - nouveaux documents,
  - nouvelles extractions,
  - nouvelles liaisons,
  - contradictions traitées,
  - doctrine publiée ou révisée.

#### 3. Raisons de non-progression

Si un run apporte peu ou rien, le dashboard doit l’expliquer explicitement :

- `duplicate-heavy`
- `source-cold`
- `blocked-by-downstream`
- `no-extractable-documents`
- `contradiction-backlog-only`
- `publication-not-yet-justified`

#### 4. Santé du backlog

Signaux attendus :

- trop de fronts en cooldown,
- trop de documents bloqués au même stade,
- réapprovisionnement discovery insuffisant,
- doctrine stagnante malgré accumulation amont.

## Définition de “plus de travail”

Le système ne peut déclarer “plus de travail” que si :

- tous les fronts discovery sont `exhausted`, `archived`, ou bloqués sans issue utile,
- tous les documents sont dans un état terminal acceptable,
- toutes les extractions attendues sont faites,
- toutes les questions ont atteint un état stable ou explicitement bloqué,
- toutes les contradictions ouvertes ont été traitées ou classées,
- toute doctrine candidate a été publiée, rejetée, ou ajournée explicitement.

Dans un domaine scientifique vivant, cet état doit rester rare.

## Migration incrémentale recommandée

### Étape 1
Ajouter le registre `research-fronts` et les structures de work items, sans casser le pipeline existant.

### Étape 2
Introduire un scheduler unifié qui sélectionne des work items à partir des registries existants et du nouveau registre racine.

### Étape 3
Faire évoluer le worker pour consommer un budget d’items par run, plutôt qu’un pipeline monolithique rigide.

### Étape 4
Remplacer la logique `refresh` bloquante par une logique de sélection de backlog scientifique.

### Étape 5
Étendre le dashboard pour afficher backlog réel, productivité effective, et raisons de non-progression.

### Étape 6
Ajouter les garde-fous anti-boucles, cooldown/revisit, et signaux de saturation.

## Risques

### 1. Scheduler central opaque

Risque : créer un ordonnanceur trop difficile à comprendre.

Réponse :

- work items simples,
- raisons d’état explicites,
- score lisible,
- transitions persistées,
- journal compact et inspectable.

### 2. Explosion du backlog

Risque : trop d’items, trop tôt.

Réponse :

- budgets par run,
- scoring,
- cooldown,
- front archiving,
- quotas par type d’item.

### 3. Pollution du niveau de preuve

Risque : sources élargies contaminant la doctrine conservatrice.

Réponse :

- séparation explicite des niveaux de preuve,
- politiques d’usage strictes,
- doctrine publiée bornée par les règles conservatrices existantes.

## Critères de succès

### Fonctionnels

- plusieurs runs successifs ne tombent plus à “zéro travail” tant qu’un backlog scientifique réel existe,
- un run peut rester utile même si la découverte locale du moment est vide,
- les documents anciens pertinents restent admissibles.

### Produit

- le dashboard différencie clairement run terminé, run utile, run stérile mais expliqué,
- l’opérateur voit où se trouve le backlog et pourquoi le worker avance ou non.

### Scientifiques

- croissance durable de la bibliothèque documentaire,
- hausse du nombre de study cards,
- maturation progressive des questions,
- traitement des contradictions,
- republications doctrine issues d’un flux continu plutôt que d’un bootstrap ponctuel.

## Recommandation finale

Nous adoptons l’approche **B** : un backlog scientifique durable, unifié, persistant, couvrant toute la chaîne. La fraîcheur devient un bonus de priorité, jamais un filtre bloquant. Le worker ne se contente plus de surveiller quelques requêtes récentes : il avance continûment dans l’univers documentaire et analytique restant, avec couverture maximale des sources admissibles et séparation stricte des niveaux de preuve.
