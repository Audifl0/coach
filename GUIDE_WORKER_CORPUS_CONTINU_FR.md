# Guide Worker Corpus Continu (FR)

## 1. Role du worker

Le worker corpus continu est le sous-systeme offline qui enrichit la bibliotheque de savoir scientifique utilisee par le modele hybride de creation de programme.

Son objectif n'est pas de repondre directement a une requete utilisateur. Il travaille en arriere-plan pour:

- rechercher du corpus scientifique lie au sport et a la musculation,
- filtrer et normaliser les evidences collectees,
- synthetiser une knowledge bible exploitable par le runtime,
- publier uniquement des snapshots valides,
- laisser un fallback prudent si un run echoue ou si le corpus est indisponible.

Dans le depot, ce sous-systeme vit principalement dans `scripts/adaptive-knowledge/*`.

## 2. Ce que le worker produit

Le resultat final attendu n'est pas un simple dump de documents.
Le worker produit un snapshot versionne dans `.planning/knowledge/adaptive-coaching/` avec plusieurs artefacts:

- `sources.json`
  - liste des evidences normalisees retenues pour le run;
- `principles.json`
  - principes synthetises a partir des evidences;
- `knowledge-bible.json`
  - version compacte et directement consommable par le runtime hybride;
- `manifest.json`
  - metadonnees du snapshot publie;
- `diff.json`
  - delta vis-a-vis du snapshot precedent;
- `run-report.json`
  - trace d'execution du run;
- `active.json`
  - pointeur vers le snapshot valide actuellement actif;
- `rollback.json`
  - pointeur de retour arriere vers le snapshot precedent.

Le runtime hybride lit ensuite cette bible via `src/lib/coach/knowledge-bible.ts`.

## 3. Composants principaux

### 3.1 Entree du worker

- `scripts/adaptive-knowledge/refresh-corpus.ts`

Ce fichier sert de point d'entree operateur.
Il encapsule l'execution du pipeline dans un worker safe et retourne un statut explicite:

- `completed`
- `failed`
- `blocked-by-lease`

### 3.2 Coordination et surete d'execution

- `scripts/adaptive-knowledge/worker-state.ts`

Ce module gere:

- le lease de run,
- le heartbeat,
- la detection d'un lease stale,
- la liberation propre en fin de run,
- l'etat persiste dans `worker-state.json`.

L'objectif est d'eviter deux runs concurrents silencieux et de garder une trace explicite du dernier etat du worker.

### 3.3 Orchestration du pipeline

- `scripts/adaptive-knowledge/pipeline-run.ts`

Ce fichier orchestre les etapes:

1. `discover`
2. `ingest`
3. `synthesize`
4. `validate`
5. `publish`

Il persiste aussi l'etat incremental minimal (`connector-state.json`) pour eviter de retraiter indefiniment les memes evidences.

### 3.4 Discovery et ingestion

- `scripts/adaptive-knowledge/discovery.ts`
- `scripts/adaptive-knowledge/connectors/*`
- `scripts/adaptive-knowledge/connectors/shared.ts`

La discovery construit un plan de requetes borne et deterministic.
Les connecteurs PubMed, Crossref et OpenAlex:

- recuperent les donnees source,
- appliquent allowlist + freshness,
- gerent retry et skip de source,
- normalisent les records,
- exposent une telemetry minimale et un curseur simple.

### 3.5 Curation et publication

- `scripts/adaptive-knowledge/synthesis.ts`
- `scripts/adaptive-knowledge/curation.ts`
- `scripts/adaptive-knowledge/quality-gates.ts`
- `scripts/adaptive-knowledge/publish.ts`

La synthese produit des principes.
La curation derive ensuite une `knowledge-bible.json` compacte.
La publication est protegee par:

- un quality gate,
- une promotion atomique du snapshot,
- un rollback possible,
- un manifest et un diff de snapshot.

## 4. Cycle d'un run

Cycle nominal:

1. le worker tente d'acquerir un lease;
2. s'il existe deja un lease actif, le run est bloque avec `blocked-by-lease`;
3. sinon le worker marque l'etat `started`, puis `heartbeat`;
4. la discovery construit les requetes a lancer;
5. les connecteurs ingèrent et normalisent les evidences;
6. le pipeline dedupe et conserve une trace incrementale;
7. la synthese et la curation produisent la bible publiee;
8. le quality gate decide si le snapshot est publiable;
9. en mode `refresh`, le snapshot est promu vers `active.json` si tout est valide;
10. en mode `check`, aucun snapshot actif n'est promu;
11. le worker termine en `completed` ou `failed`.

## 5. Difference entre `refresh` et `check`

Le point d'entree supporte deux modes:

- mode normal
  - lance un run complet et peut promouvoir un nouveau snapshot actif;
- mode `--check`
  - execute le pipeline et les validations, mais ne publie jamais de nouveau snapshot actif.

Le mode `check` est utile pour:

- verifier que le worker est sain,
- valider un changement de code,
- tester un environnement sans muter la bible active.

## 6. Comment le lancer

### 6.1 Lancement manuel nominal

Depuis la racine du depot:

```bash
corepack pnpm tsx scripts/adaptive-knowledge/refresh-corpus.ts
```

Effet attendu:

- le worker tente d'acquerir le lease,
- execute le pipeline,
- publie un snapshot actif si le quality gate passe.

### 6.2 Lancement en mode verification

```bash
corepack pnpm tsx scripts/adaptive-knowledge/refresh-corpus.ts --check
```

Effet attendu:

- le worker execute discovery/ingestion/synthese/validation,
- aucun `active.json` nouveau n'est promu.

### 6.3 Installation de la cadence cron

```bash
infra/scripts/install-adaptive-corpus-cron.sh
```

Le script enregistre une entree cron qui pointe vers:

```bash
corepack pnpm tsx scripts/adaptive-knowledge/refresh-corpus.ts --worker
```

Note importante:
- dans l'etat actuel du code, `--worker` n'active pas un mode distinct; l'argument est simplement tolere et l'entree passe toujours par le worker-safe command path.

## 7. Comment verifier qu'il a bien tourne

Verifier d'abord l'etat du worker:

```bash
cat .planning/knowledge/adaptive-coaching/worker-state.json
```

Verifier ensuite le snapshot actif:

```bash
cat .planning/knowledge/adaptive-coaching/active.json
```

Verifier les artefacts du snapshot actif:

```bash
ls .planning/knowledge/adaptive-coaching/snapshots/<run-id>/validated
```

Artefacts attendus:

- `sources.json`
- `principles.json`
- `knowledge-bible.json`
- `manifest.json`
- `diff.json`
- `run-report.json`

### 7.1 Verification via dashboard web

Une surface web dediee est disponible pour eviter la lecture manuelle des JSON:

- route: `/dashboard/worker-corpus`
- acces: utilisateur authentifie uniquement
- rafraichissement: polling borne sur le statut live et les runs recents

Le dashboard expose:

- l'etat du worker (`started`, `heartbeat`, `completed`, `failed`, `blocked-by-lease`, `stale`);
- le dernier heartbeat et l'expiration du lease;
- le snapshot actif, le pointeur de rollback et la freshness;
- les runs recents avec issue finale, stage final et motifs de blocage;
- un detail run et un detail snapshot pour inspecter stages, diff, publication et metadata de synthese.

Interpretation rapide:

- `blocked-by-lease`
  - un autre run tient encore le lease, ou le verrou n'a pas expire;
- `stale`
  - un lease precedent a expire et a ete marque comme stale;
- `failed`
  - le pipeline a echoue avant la fin nominale;
- `publish blocked`
  - le quality gate ou une erreur de synthese/publish a empeche la promotion;
- `rollback missing`
  - aucun pointeur precedent disponible pour restauration rapide.

Limite importante:

- le "temps reel" du dashboard repose sur du polling HTTP pragmatique, pas sur websocket/SSE;
- les panneaux de detail sont SSR au chargement initial, puis les cartes live se rafraichissent surtout via `/api/worker-corpus/status` et `/api/worker-corpus/runs`.

## 8. Consommation par le runtime

Le worker n'est utile que parce qu'il alimente des consommateurs runtime.

Consommateurs principaux:

- `src/lib/coach/knowledge-bible.ts`
  - charge la bible publiee;
- `src/server/services/program-generation-hybrid.ts`
  - injecte la bible dans le prompt du modele hybride;
- `src/server/services/program-generation.ts`
  - expose un `meta.mode` (`baseline`, `hybrid`, `fallback_baseline`) et `knowledgeSnapshotId`;
- `src/server/services/adaptive-coaching.ts`
  - peut relire la meme bible sur son chemin provider.

En pratique, le worker fournit:

- une provenance de snapshot,
- une bible compacte,
- un signal plus observable sur la voie knowledge-enabled.

## 9. Resultat visible cote produit

Quand le chemin knowledge-enabled est utilise:

- la generation hybride peut s'appuyer sur une bible scientifique compacte,
- les preuves du draft hybride sont verifiees contre les IDs reelles de la bible chargee,
- la reponse expose le mode de generation et le `knowledgeSnapshotId`.

Si le chemin hybride ou la bible echoue:

- le systeme degrade vers `fallback_baseline`,
- le programme reste genere via la base deterministe,
- le produit conserve ses garanties prudentes.

## 10. Limites actuelles

- Le worker n'embarque pas encore de supervision externe ou d'alerting.
- La cadence cron existe, mais pas encore une pile complete de monitoring ops.
- La curation reste strictement encadree par le schema et les artefacts locaux; il ne s'agit pas d'un navigateur web autonome a chaud.
- Le flag `--worker` present dans le cron est aujourd'hui surtout documentaire; le point d'entree est deja worker-safe par defaut.

## 11. Commandes utiles

Run nominal:

```bash
corepack pnpm tsx scripts/adaptive-knowledge/refresh-corpus.ts
```

Run de verification:

```bash
corepack pnpm tsx scripts/adaptive-knowledge/refresh-corpus.ts --check
```

Installer le cron:

```bash
infra/scripts/install-adaptive-corpus-cron.sh
```

Suites de tests les plus utiles:

```bash
corepack pnpm test tests/program/adaptive-knowledge-worker.test.ts --runInBand
corepack pnpm test tests/program/adaptive-knowledge-connectors.test.ts --runInBand
corepack pnpm test tests/program/adaptive-knowledge-pipeline-run.test.ts --runInBand
corepack pnpm test tests/program/adaptive-knowledge-publish.test.ts --runInBand
corepack pnpm test tests/program/coach-knowledge-bible.test.ts --runInBand
corepack pnpm test tests/program/program-hybrid-generation.test.ts --runInBand
```

## 12. Fichiers a connaitre

- `scripts/adaptive-knowledge/refresh-corpus.ts`
- `scripts/adaptive-knowledge/worker-state.ts`
- `scripts/adaptive-knowledge/pipeline-run.ts`
- `scripts/adaptive-knowledge/discovery.ts`
- `scripts/adaptive-knowledge/connectors/shared.ts`
- `scripts/adaptive-knowledge/connectors/pubmed.ts`
- `scripts/adaptive-knowledge/connectors/crossref.ts`
- `scripts/adaptive-knowledge/connectors/openalex.ts`
- `scripts/adaptive-knowledge/synthesis.ts`
- `scripts/adaptive-knowledge/curation.ts`
- `scripts/adaptive-knowledge/quality-gates.ts`
- `scripts/adaptive-knowledge/publish.ts`
- `src/lib/coach/knowledge-bible.ts`
- `src/server/services/program-generation-hybrid.ts`
- `src/server/services/program-generation.ts`
