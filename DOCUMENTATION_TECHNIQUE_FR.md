# Documentation Technique (FR)

## Perimetre et approche repo-first

Ce document decrit le systeme tel qu'il existe dans le depot `coach`.
Chaque affirmation renvoie a des reperes de code ou d'infrastructure reels.
Il ne s'agit pas d'une architecture cible abstraite.

## Architecture et frontieres reelles

Le projet est une application Next.js App Router (`next@16`) avec frontieres explicites entre UI, routes API, logique metier, acces donnees et exploitation.

- Entrees HTTP/UI:
  - Pages publiques/privees: `src/app/(public)/*`, `src/app/(private)/*`
  - Layout prive dynamique: `src/app/(private)/layout.tsx`
  - Surface dashboard: `src/app/(private)/dashboard/page.tsx`
- Contrats d'API:
  - Routes auth/profile/program: `src/app/api/**`
  - Exemples: `src/app/api/auth/*`, `src/app/api/profile/*`, `src/app/api/program/*`
- Logique metier partagee:
  - Auth/session/profil/programme/adaptation: `src/lib/auth/*`, `src/lib/profile/*`, `src/lib/program/*`, `src/lib/adaptive-coaching/*`
- Services serveur et orchestration:
  - Services: `src/server/services/*`
  - Loader dashboard server-side: `src/server/dashboard/program-dashboard.ts`
  - Config runtime ops/LLM: `src/server/env/ops-config.ts`, `src/server/llm/config.ts`
- Acces donnees et isolation compte:
  - DAL: `src/server/dal/*`
  - Scope compte: `src/server/dal/account-scope.ts`
- Couche donnees:
  - Schema relationnel: `prisma/schema.prisma`
  - Migrations: `prisma/migrations/*`
- Exploitation/deploiement:
  - Stack container: `docker-compose.yml`, `Dockerfile`
  - Reverse proxy TLS: `infra/caddy/Caddyfile`
  - Scripts ops: `infra/scripts/*`
  - Runbooks: `docs/operations/*`

## Frontieres applicatives

### Frontiere UI / API (`src/app`)

Les pages clientes appellent principalement des routes internes `/api/*` pour manipuler le profil, le programme, les logs de seance, les recommandations adaptatives et les tendances.

### Frontiere routes API / logique metier (`src/app/api` -> `src/lib` + `src/server`)

Les route handlers valident les entrees, verifient la session, puis deleguent vers des services et DAL.
Exemples:
- Auth: `src/app/api/auth/handlers.ts` + `src/lib/auth/auth.ts`
- Generation programme: `src/app/api/program/generate/route-handlers.ts` + `src/server/services/program-generation.ts`
- Adaptation: `src/app/api/program/adaptation/route-handlers.ts` + `src/server/services/adaptive-coaching.ts`

### Frontiere metier / persistance (`src/server/services` -> `src/server/dal` -> Prisma)

Les services encapsulent les regles de sequence metier; les DAL encapsulent les acces Prisma avec isolation stricte par `userId`.
Exemples:
- `src/server/dal/program.ts`
- `src/server/dal/program/plan-lifecycle.ts`
- `src/server/dal/program/session-logging.ts`

## Donnees et modeles (`prisma/schema.prisma`)

Modeles principaux:
- Identite/session: `User`, `Session`
- Profil sportif: `AthleteProfile`
- Planification et execution: `ProgramPlan`, `PlannedSession`, `PlannedExercise`, `LoggedSet`
- Adaptation: `AdaptiveRecommendation`, `AdaptiveRecommendationDecision` + enums de statut/action

Invariants visibles:
- Unicite username/session token hash
- Relations cascade sur entites enfant
- Isolation des donnees par `userId` dans les modeles metier
- Historique de decisions adaptatives en append-only (`AdaptiveRecommendationDecision`)

## Frontieres exploitation et runtime (`infra/`, `docs/operations`, `tests/ops`)

Le chemin d'exploitation present dans le depot est axe Compose + Caddy:
- Deploiement: `infra/scripts/deploy.sh`
- Gate release: `infra/scripts/release-proof.sh`
- Sauvegarde/restauration: `infra/scripts/backup.sh`, `infra/scripts/restore.sh`, `infra/scripts/run-restore-drill.sh`
- Verifications ops/tests: `docs/operations/*`, `tests/ops/*`

## Scenarios metier de bout en bout

Les scenarios ci-dessous decrivent le fonctionnement reel en reliant points d'entree `src/app/api/*`, modules metier `src/lib/*`, et executions serveur `src/server/dal/*` + `src/server/services/*`.

### Scenario 1 - Authentification et session persistante

1. L'utilisateur cree un compte via `src/app/api/auth/signup/route.ts` (handler: `src/app/api/auth/handlers.ts`).
2. Les validations d'entree passent par `src/lib/auth/contracts.ts`; le service `src/lib/auth/auth.ts` applique la politique mot de passe et le hash.
3. La connexion passe par `src/app/api/auth/login/route.ts`, puis creation de session en base (`Session` dans `prisma/schema.prisma`) avec cookie HTTP-only secure.
4. Les routes privees et le dashboard s'appuient sur la validation de cookie/session (`src/lib/auth/session-gate.ts`) au lieu de la simple presence d'un cookie brut.
5. La deconnexion (`src/app/api/auth/logout/route.ts`) revoque la session courante via token hash.
6. Garde-fous: limitation de debit login/signup dans `src/lib/auth/rate-limit.ts` et logs auth via `src/lib/auth/auth-logger.ts`.

### Scenario 2 - Onboarding et profil

1. L'acces dashboard prive passe par `src/app/(private)/dashboard/loaders/dashboard-access.ts`, qui decide login/onboarding/dashboard.
2. Le parcours onboarding lit puis met a jour le profil via `src/app/(private)/onboarding/page.tsx` et `/api/profile`.
3. Les handlers profil (`src/app/api/profile/route-handlers.ts`) valident payload complet ou patch (`src/lib/profile/contracts.ts`).
4. La persistance passe par `src/server/dal/profile.ts` (get/upsert/patch profile).
5. Le critere de completion (gate onboarding) est calcule par `src/lib/profile/completeness.ts`.

### Scenario 3 - Generation du programme

1. Le point d'entree est `src/app/api/program/generate/route.ts`.
2. Le handler parse le payload (`src/lib/program/contracts.ts`) puis appelle `src/server/services/program-generation.ts`.
3. Le service charge le profil, verifie sa completion, produit un plan hebdo via `src/lib/program/planner.ts`.
4. Le remplacement atomique du plan actif passe par `src/server/dal/program.ts` + `src/server/dal/program/plan-lifecycle.ts` (`replaceActivePlan`).
5. Donnees produites: `ProgramPlan` + `PlannedSession` + `PlannedExercise` dans `prisma/schema.prisma`.
6. Garde-fou de concurrence: conflit de plan actif mappe vers erreur explicite de regeneration.

### Scenario 4 - Seance du jour et journalisation

1. Le dashboard charge la carte du jour via `src/app/(private)/dashboard/loaders/today-workout.ts`.
2. La route `/api/program/today` (`src/app/api/program/today/route.ts`) s'appuie sur `selectTodayWorkoutProjection` (`src/lib/program/select-today-session.ts`) pour choisir today/next.
3. Les mutations de seance utilisent les routes `src/app/api/program/sessions/**` (sets, skip, note, duration, complete).
4. L'orchestration metier est dans `src/server/services/session-logging.ts`: debut implicite de seance, interdiction de modifier une seance deja complete, correction de duree limitee a 24h.
5. La persistance est geree par `src/server/dal/program/session-logging.ts` avec verrous transactionnels et controles d'etat.
6. Les vues historiques utilisent `src/app/api/program/history/route.ts` et `src/server/dal/program/history-read-model.ts`.

### Scenario 5 - Adaptation et recommandations

1. Le point d'entree est `src/app/api/program/adaptation/route.ts`.
2. Le service `src/server/services/adaptive-coaching.ts` recupere profil + session cible + historique 30 jours via DAL.
3. La proposition passe par l'orchestrateur `src/lib/adaptive-coaching/orchestrator.ts`, puis application de politique de securite `src/server/services/adaptive-coaching-policy.ts`.
4. Les statuts (proposed, pending_confirmation, applied, rejected, fallback_applied) sont portes par `AdaptiveRecommendation` dans `prisma/schema.prisma`.
5. Pour deload/substitution, la confirmation utilisateur est geree via routes `/api/program/adaptation/[recommendationId]/confirm|reject`.
6. En cas de rejet, un fallback conservateur est applique et trace dans `AdaptiveRecommendationDecision`.
7. Si `LLM_REAL_PROVIDER_ENABLED=true`, la chaine provider utilise `src/server/llm/*` (OpenAI primaire, Anthropic fallback) selon `src/server/llm/config.ts`.

### Scenario 6 - Tendances et dashboard

1. Le dashboard charge les tendances via `src/app/(private)/dashboard/loaders/trends-summary.ts`.
2. L'API resume est `src/app/api/program/trends/route.ts`; le detail exercice est `src/app/api/program/trends/[exerciseKey]/route.ts`.
3. Le read model `src/server/dal/program/trends-read-model.ts` calcule volume, intensite, adherence sur periodes 7d/30d/90d.
4. L'intensite s'appuie sur l'exercice cle (orderIndex minimal) avec agrat de charge moyenne.
5. En mode degrade (echec chargement), le dashboard expose explicitement un etat d'erreur plutot qu'un faux "OK".

### Scenario 7 - Fiabilite ops et preuve de release

1. Le deploiement passe par `infra/scripts/deploy.sh` (pull/build/up compose, smokes HTTPS et dashboard authentifie si domaine present).
2. La gate de release (`infra/scripts/release-proof.sh`) execute en sequence: typecheck, test, build, deploy, smoke HTTPS, smoke authentifie.
3. La sauvegarde est chiffree (stream `pg_dump` -> `openssl`) dans `infra/scripts/backup.sh`.
4. La restauration impose une base cible differente de la base production (`RESTORE_TARGET_DB != POSTGRES_DB`) dans `infra/scripts/restore.sh`.
5. L'exercice de reprise `infra/scripts/run-restore-drill.sh` produit des preuves horodatees et execute des smokes post-restore.
6. La configuration runtime ops stricte est parsee dans `src/server/env/ops-config.ts`.

## Hypotheses explicites

- Hypothese d'exploitation principale: la voie reference est `docker-compose.yml` + `infra/caddy/Caddyfile` + scripts `infra/scripts/*`.
- Hypothese de perimetre fonctionnel: les flux de reference sont ceux exposes dans `src/app/api/*` et implementes dans `src/server/services/*`.
- Hypothese de contrat d'environnement: les variables obligatoires varient selon le contexte (runtime, release proof, restore drill, LLM) et ne sont pas toutes centralisees dans un seul fichier.

## Limites connues

- Ce document ne remplace pas les runbooks detaillees (`docs/operations/*`) pour les procedures pas-a-pas.
- Certaines decisions d'exploitation sont contextualisees par des variables d'environnement et par l'etat des donnees (ex: compte de smoke authentifie ops).
- La preuve "en production" d'un chemin reel deploiement n'est pas encodee dans le depot; la documentation s'appuie sur les artefacts versionnes disponibles.
