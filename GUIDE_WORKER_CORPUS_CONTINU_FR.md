# Guide Worker Corpus Continu (FR)

## 1. Role du worker

Le worker corpus continu est le sous-systeme offline qui enrichit la bibliotheque de savoir scientifique utilisee par le modele hybride de creation de programme.

Il ne repond pas directement a une requete utilisateur. Il travaille en arriere-plan pour:

- rechercher du corpus scientifique lie au sport et a la musculation;
- filtrer, dedoublonner et normaliser les evidences collectees;
- faire une synthese distante via OpenAI;
- produire une `knowledge-bible.json` exploitable par le runtime;
- publier uniquement des snapshots valides;
- conserver un fallback prudent si un run echoue.

Le sous-systeme vit principalement dans `scripts/adaptive-knowledge/*`.

## 2. Etat reel de la version actuelle

La version actuelle du worker repose sur 3 briques:

- un worker lease-safe avec `worker-state.json`;
- un pipeline de corpus avec snapshots versionnes;
- un moteur de synthese distante OpenAI-only;
- un dashboard web prive `/dashboard/worker-corpus` pour suivre l'etat du worker et des snapshots.

Important pour le VPS:

- le worker lui-meme est executable facilement sur le VPS;
- le chemin de deploiement recommande aujourd'hui est **execution via `docker compose run --rm worker`** depuis le checkout du repo;
- le dashboard worker lit les artefacts de `.planning/knowledge/adaptive-coaching` **sur le filesystem du runtime applicatif**.

Limite actuelle a connaitre:

- l'infrastructure Docker ne planifie pas encore automatiquement le worker comme service periodique resident;
- le declenchement periodique repose sur cron + `docker compose run --rm worker`.

Autrement dit:

- pour faire tourner le worker sur VPS: oui, tout de suite;
- le dashboard web et le runtime applicatif lisent maintenant les memes artefacts via un volume Docker partage `adaptive_knowledge_data`;
- il reste surtout a orchestrer regulierement le lancement du worker.

## 3. Ce que le worker produit

Le worker produit un snapshot versionne dans `.planning/knowledge/adaptive-coaching/` avec plusieurs artefacts:

- `worker-state.json`
  - etat live du worker, du lease et du heartbeat;
- `active.json`
  - pointeur vers le snapshot valide actuellement actif;
- `rollback.json`
  - pointeur de retour arriere vers le snapshot precedent;
- `connector-state.json`
  - etat incremental minimal pour eviter de retraiter indefiniment les memes records;
- `snapshots/<run-id>/candidate/*`
  - artefacts ecrits avant promotion;
- `snapshots/<run-id>/validated/*`
  - artefacts d'un snapshot promu.

Dans un snapshot valide, on trouve principalement:

- `sources.json`
  - evidences normalisees retenues pour le run;
- `validated-synthesis.json`
  - synthese distante validee, coverage, contradictions, metadata provider/model;
- `principles.json`
  - principes derives de la synthese;
- `knowledge-bible.json`
  - version compacte consommee par le runtime;
- `manifest.json`
  - metadonnees du snapshot;
- `diff.json`
  - delta vis-a-vis du snapshot precedent;
- `run-report.json`
  - trace d'execution des stages et issue finale.

Le runtime hybride lit ensuite cette bible via `src/lib/coach/knowledge-bible.ts`.

## 4. Composants principaux

### 4.1 Entree du worker

- `scripts/adaptive-knowledge/refresh-corpus.ts`

Point d'entree operateur.
Il encapsule l'execution du pipeline dans un worker safe et retourne un statut explicite:

- `completed`
- `failed`
- `blocked-by-lease`

### 4.2 Coordination et surete d'execution

- `scripts/adaptive-knowledge/worker-state.ts`

Ce module gere:

- l'acquisition du lease;
- le heartbeat;
- la detection d'un lease stale;
- la liberation propre en fin de run;
- l'etat persiste dans `worker-state.json`.

### 4.3 Orchestration du pipeline

- `scripts/adaptive-knowledge/pipeline-run.ts`

Le pipeline enchaine:

1. `discover`
2. `ingest`
3. `synthesize`
4. `validate`
5. `publish`

Il persiste aussi `connector-state.json` pour limiter le retraitement.

### 4.4 Discovery et ingestion

- `scripts/adaptive-knowledge/discovery.ts`
- `scripts/adaptive-knowledge/connectors/*`
- `scripts/adaptive-knowledge/connectors/shared.ts`

La discovery construit un plan de requetes borne.
Les connecteurs PubMed, Crossref et OpenAlex:

- recuperent les donnees source;
- appliquent allowlist + freshness;
- gerent retry, timeout et skip de source;
- normalisent les records;
- exposent une telemetry minimale.

### 4.5 Synthese distante

- `scripts/adaptive-knowledge/remote-synthesis.ts`
- `scripts/adaptive-knowledge/synthesis.ts`

La synthese ne repose plus seulement sur des blueprints statiques.
Le worker utilise un client OpenAI dedie au corpus avec:

- schema strict;
- lot synthesis + consolidation;
- erreurs deterministes (`timeout`, `rate_limited`, `provider_error`, `transport_error`, `invalid_payload`);
- metadata provider/model/request id;
- artefact intermediaire `validated-synthesis.json`.

### 4.6 Curation, quality gate et publication

- `scripts/adaptive-knowledge/curation.ts`
- `scripts/adaptive-knowledge/quality-gates.ts`
- `scripts/adaptive-knowledge/publish.ts`

La curation derive `knowledge-bible.json`.
La publication est protegee par:

- un quality gate;
- une promotion atomique du snapshot;
- un rollback possible;
- un manifest et un diff de snapshot.

## 5. Variables d'environnement importantes

Le worker peut fonctionner avec les variables suivantes.

### 5.1 OpenAI pour la synthese distante

Variables supportees:

- `ADAPTIVE_KNOWLEDGE_OPENAI_API_KEY`
- `ADAPTIVE_KNOWLEDGE_OPENAI_MODEL`
- `ADAPTIVE_KNOWLEDGE_OPENAI_TIMEOUT_MS`
- `ADAPTIVE_KNOWLEDGE_OPENAI_PROMPT_VERSION`

Fallbacks supportes:

- `LLM_OPENAI_API_KEY`
- `LLM_OPENAI_MODEL`
- `PIPELINE_REQUEST_TIMEOUT_MS`

Recommandation pratique:

- definir explicitement `ADAPTIVE_KNOWLEDGE_OPENAI_API_KEY`;
- definir explicitement `ADAPTIVE_KNOWLEDGE_OPENAI_MODEL`;
- garder `ADAPTIVE_KNOWLEDGE_OPENAI_PROMPT_VERSION=corpus-v1` sauf besoin de versionner un prompt.

### 5.2 Parametres pipeline

Variables utiles:

- `PIPELINE_ALLOWED_DOMAINS`
- `PIPELINE_FRESHNESS_WINDOW_DAYS`
- `PIPELINE_BACKFILL_MAX_DAYS`
- `PIPELINE_MAX_RETRIES`
- `PIPELINE_REQUEST_TIMEOUT_MS`
- `PIPELINE_MAX_QUERIES_PER_RUN`
- `PIPELINE_SCHEDULE_CRON`
- `PIPELINE_SCHEDULE_TIMEZONE`

Defaults importants:

- timeout par defaut: `8000`
- retries pipeline par defaut: `2`
- cron par defaut dans la config: `0 4 * * 1`

## 6. Cycle d'un run

Cycle nominal:

1. le worker tente d'acquerir un lease;
2. si un lease actif existe deja, le run sort en `blocked-by-lease`;
3. sinon le worker marque l'etat `started`, puis `heartbeat`;
4. la discovery construit les requetes;
5. les connecteurs ingerent et normalisent les evidences;
6. le pipeline dedupe et applique l'incremental;
7. la synthese distante produit un `validated-synthesis.json`;
8. la curation derive `knowledge-bible.json`;
9. le quality gate decide si le snapshot est publiable;
10. en mode `refresh`, le snapshot est promu vers `active.json` si tout est valide;
11. en mode `check`, aucun snapshot actif n'est promu;
12. le worker termine en `completed` ou `failed`.

## 7. Difference entre `refresh` et `check`

Le point d'entree supporte deux modes:

- mode normal
  - lance un run complet et peut promouvoir un nouveau snapshot actif;
- mode `--check`
  - execute le pipeline et les validations, mais ne publie jamais de nouveau snapshot actif.

Le mode `check` est utile pour:

- verifier que le worker est sain;
- valider un changement de code;
- tester un environnement sans muter la bible active.

## 8. Comment le lancer localement ou sur un shell VPS

### 8.1 Run nominal

Depuis la racine du depot:

```bash
corepack pnpm tsx scripts/adaptive-knowledge/refresh-corpus.ts
```

Effet attendu:

- tentative d'acquisition du lease;
- execution du pipeline;
- publication d'un snapshot actif si le quality gate passe.

### 8.2 Run de verification

```bash
corepack pnpm tsx scripts/adaptive-knowledge/refresh-corpus.ts --check
```

Effet attendu:

- discovery/ingestion/synthese/validation s'executent;
- aucun `active.json` nouveau n'est promu.

### 8.3 Codes de sortie utiles

- `0`
  - run complete;
- `1`
  - echec pipeline;
- `3`
  - worker bloque par lease actif.

## 9. Deploiement simple sur VPS

### 9.1 Ce que je recommande aujourd'hui

La voie la plus simple et la plus fiable aujourd'hui est:

1. deployer l'application normalement avec `infra/scripts/deploy.sh`;
2. utiliser le service Compose `worker` pour les runs corpus;
3. partager les artefacts avec l'app via le volume Docker `adaptive_knowledge_data`;
4. installer un cron host-level qui lance `docker compose run --rm worker`.

### 9.2 Prerequis VPS

- Docker et Docker Compose disponibles sur le VPS;
- checkout du repo present sur le VPS;
- fichier env de production present, en pratique `/opt/coach/.env.production`;
- cle OpenAI configuree;
- acces reseau sortant vers OpenAI, PubMed, Crossref, OpenAlex.

### 9.3 Fichier d'environnement conseille

Le projet utilise deja `/opt/coach/.env.production` pour le deploiement Docker.
Le plus simple est d'y ajouter aussi les variables worker, par exemple:

```env
ADAPTIVE_KNOWLEDGE_OPENAI_API_KEY=...
ADAPTIVE_KNOWLEDGE_OPENAI_MODEL=gpt-5-mini
ADAPTIVE_KNOWLEDGE_OPENAI_TIMEOUT_MS=12000
ADAPTIVE_KNOWLEDGE_OPENAI_PROMPT_VERSION=corpus-v1
PIPELINE_REQUEST_TIMEOUT_MS=8000
PIPELINE_MAX_RETRIES=2
PIPELINE_MAX_QUERIES_PER_RUN=6
PIPELINE_SCHEDULE_TIMEZONE=UTC
```

### 9.4 Procedure VPS pas a pas

Depuis le checkout du repo sur le VPS:

1. verifier le deploiement applicatif standard:

```bash
infra/scripts/deploy.sh /opt/coach/.env.production
```

2. tester un run manuel sans publication:

```bash
docker compose --profile worker --env-file /opt/coach/.env.production run --rm worker --check
```

3. si le check est bon, tester un vrai run:

```bash
docker compose --profile worker --env-file /opt/coach/.env.production run --rm worker
```

4. installer ensuite le cron **depuis la racine du repo**:

```bash
infra/scripts/install-adaptive-corpus-cron.sh "0 3 * * 1" /opt/coach/.env.production
```

### 9.5 Point d'attention sur le cron

`infra/scripts/install-adaptive-corpus-cron.sh` capture le chemin du repo et le fichier env.

Donc:

- il faut l'executer depuis la racine du repo;
- il faut lui donner le bon env file si tu n'utilises pas `/opt/coach/.env.production`.

Le cron installe aujourd'hui une commande de la forme:

```bash
cd /chemin/vers/le/repo && docker compose --profile worker --env-file /opt/coach/.env.production run --rm worker
```

Note:

- le service `worker` utilise deja `pnpm tsx scripts/adaptive-knowledge/refresh-corpus.ts --worker`;
- le volume `adaptive_knowledge_data` est partage avec l'app, donc le dashboard et le runtime voient les snapshots produits.

### 9.6 Limite residuelle de cette voie VPS

Cette voie partage maintenant correctement les artefacts entre worker et app.

La limite residuelle est surtout operationnelle:

- le worker n'est pas un service long-lived orchestre nativement par Compose;
- on le lance a la demande ou via cron `docker compose run --rm worker`;
- si tu veux une orchestration plus riche, il faudra plus tard systemd timer, scheduler infra ou pipeline dedie.

## 10. Comment verifier qu'il a bien tourne

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
- `validated-synthesis.json`
- `principles.json`
- `knowledge-bible.json`
- `manifest.json`
- `diff.json`
- `run-report.json`

Verifier rapidement le dernier run:

```bash
cat .planning/knowledge/adaptive-coaching/snapshots/<run-id>/validated/run-report.json
```

## 11. Verification via dashboard web

Une surface web dediee existe pour eviter la lecture manuelle des JSON:

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

- le "temps reel" repose sur du polling HTTP pragmatique, pas sur websocket/SSE;
- la surface lit les artefacts du volume partage et ne remplace pas encore un vrai systeme d'alerting.

## 12. Consommation par le runtime

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

- une provenance de snapshot;
- une bible compacte;
- un signal plus observable sur la voie knowledge-enabled.

## 13. Resultat visible cote produit

Quand le chemin knowledge-enabled est utilise:

- la generation hybride peut s'appuyer sur une bible scientifique compacte;
- les preuves du draft hybride sont verifiees contre les IDs reelles de la bible chargee;
- la reponse expose le mode de generation et le `knowledgeSnapshotId`.

Si le chemin hybride ou la bible echoue:

- le systeme degrade vers `fallback_baseline`;
- le programme reste genere via la base deterministe;
- le produit conserve ses garanties prudentes.

## 14. Limites actuelles

- Le worker n'embarque pas encore de supervision externe ou d'alerting.
- La cadence cron existe, mais pas encore une pile complete de monitoring ops.
- Le declenchement periodique repose encore sur cron ou orchestration externe, pas sur un scheduler applicatif integre.

## 15. Commandes utiles

Run nominal:

```bash
docker compose --profile worker --env-file /opt/coach/.env.production run --rm worker
```

Run de verification:

```bash
docker compose --profile worker --env-file /opt/coach/.env.production run --rm worker --check
```

Installation cron:

```bash
infra/scripts/install-adaptive-corpus-cron.sh "0 3 * * 1" /opt/coach/.env.production
```

Deploiement applicatif:

```bash
infra/scripts/deploy.sh /opt/coach/.env.production
```

Suites de tests les plus utiles:

```bash
corepack pnpm test tests/program/adaptive-knowledge-worker.test.ts --runInBand
corepack pnpm test tests/program/adaptive-knowledge-connectors.test.ts --runInBand
corepack pnpm test tests/program/adaptive-knowledge-pipeline-run.test.ts --runInBand
corepack pnpm test tests/program/adaptive-knowledge-publish.test.ts --runInBand
corepack pnpm test tests/program/adaptive-knowledge-remote-synthesis.test.ts --runInBand
corepack pnpm test tests/program/coach-knowledge-bible.test.ts --runInBand
corepack pnpm test tests/program/program-hybrid-generation.test.ts --runInBand
corepack pnpm test tests/program/worker-corpus-dashboard.test.ts tests/program/worker-corpus-dashboard-page.test.tsx tests/program/worker-corpus-dashboard-routes.test.ts --runInBand
```
