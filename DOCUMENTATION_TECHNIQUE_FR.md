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

## Hypotheses explicites

- Hypothese d'exploitation principale: la voie reference est `docker-compose.yml` + `infra/caddy/Caddyfile` + scripts `infra/scripts/*`.
- Hypothese de perimetre fonctionnel: les flux de reference sont ceux exposes dans `src/app/api/*` et implementes dans `src/server/services/*`.
- Hypothese de contrat d'environnement: les variables obligatoires varient selon le contexte (runtime, release proof, restore drill, LLM) et ne sont pas toutes centralisees dans un seul fichier.

## Limites connues

- Ce document ne remplace pas les runbooks detaillees (`docs/operations/*`) pour les procedures pas-a-pas.
- Certaines decisions d'exploitation sont contextualisees par des variables d'environnement et par l'etat des donnees (ex: compte de smoke authentifie ops).
- La preuve "en production" d'un chemin reel deploiement n'est pas encodee dans le depot; la documentation s'appuie sur les artefacts versionnes disponibles.

