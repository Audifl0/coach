# Arborescence commentee (FR)

## Objectif

Cette arborescence est selective: elle pointe les reperes structurants pour comprendre, maintenir et exploiter le projet sans lister tous les fichiers.
Elle est alignee avec les frontieres de `DOCUMENTATION_TECHNIQUE_FR.md`.

## Vue d'ensemble

```text
.
├── src/
│   ├── app/
│   ├── lib/
│   └── server/
├── prisma/
├── infra/
├── docs/operations/
├── scripts/
├── tests/
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## src/app - surfaces UI et API (App Router)

- `src/app/(public)/login`, `src/app/(public)/signup`
  - Entrees publiques d'authentification.
- `src/app/(private)/dashboard`, `src/app/(private)/onboarding`, `src/app/(private)/profile`
  - Surfaces authentifiees (dashboard, gate onboarding, edition profil).
- `src/app/api/auth/*`
  - Contrats HTTP signup/login/logout, gestion session/cookie.
- `src/app/api/profile/*`
  - Lecture/mise a jour profil avec validation.
- `src/app/api/program/*`
  - Generation programme, seance du jour, journalisation, adaptation, tendances, historique.

## src/lib - logique metier partagee et contrats

- `src/lib/auth/*`
  - Auth service, session gate, rate limiting, contrat session cookie.
- `src/lib/profile/*`
  - Contrats profil et regle de completion onboarding.
- `src/lib/program/*`
  - Planner, contrats API program, selection today/next, tendances.
- `src/lib/adaptive-coaching/*`
  - Orchestrateur adaptation, politique SAFE, evidence/corpus, forecast.
- `src/lib/db/prisma.ts`
  - Point d'acces Prisma partage.

## src/server - DAL, services runtime, configuration serveur

- `src/server/dal/account-scope.ts`
  - Isolation multi-compte par `userId`, garde-fou d'ownership.
- `src/server/dal/profile.ts`
  - Persistance profil (get/upsert/patch).
- `src/server/dal/program.ts`
  - Facade DAL programme; compose plan lifecycle, logging, history, trends.
- `src/server/dal/program/plan-lifecycle.ts`
  - Remplacement du plan actif, session today/next, substitutions.
- `src/server/dal/program/session-logging.ts`
  - Mutations de seance (sets, skip, note, complete, correction duree) avec verrous transactionnels.
- `src/server/dal/program/history-read-model.ts`
  - Projection historique par plage temporelle.
- `src/server/dal/program/trends-read-model.ts`
  - Aggregats volume/intensite/adherence + drilldown exercice.
- `src/server/services/program-generation.ts`
  - Orchestration generation de plan hebdo.
- `src/server/services/session-logging.ts`
  - Invariants metier de journalisation.
- `src/server/services/adaptive-coaching.ts`
  - Generation/confirmation/rejet des recommandations adaptatives.
- `src/server/services/adaptive-coaching-policy.ts`
  - Application des regles de securite adaptation.
- `src/server/env/ops-config.ts`, `src/server/llm/config.ts`
  - Contrats d'environnement ops et providers LLM.
- `src/server/dashboard/program-dashboard.ts`
  - Chargement server-side des sections dashboard et gestion des chemins degrades.

## prisma - schema de donnees et evolution

- `prisma/schema.prisma`
  - Source de verite des modeles (`User`, `Session`, `AthleteProfile`, `ProgramPlan`, `PlannedSession`, `PlannedExercise`, `LoggedSet`, `AdaptiveRecommendation*`).
- `prisma/migrations/*`
  - Historique de migration (auth, profil, programme, logging, adaptation, garde-fous runtime).

## infra - deploiement, securite transport, operations

- `infra/caddy/Caddyfile`
  - Reverse proxy HTTPS, headers de hardening, forwarding vers `app:3000`.
- `infra/scripts/deploy.sh`
  - Deploiement Compose (pull/build/up) + smokes post-deploiement.
- `infra/scripts/release-proof.sh`
  - Pipeline operateur: typecheck -> test -> build -> deploy -> smokes.
- `infra/scripts/backup.sh`, `infra/scripts/restore.sh`, `infra/scripts/run-restore-drill.sh`
  - Sauvegarde chiffree, restauration guardrailee, exercice de reprise.
- `infra/systemd/coach-restore-drill.service|timer`
  - Planification periodique des restore drills.

## docs/operations - runbooks operateur existants

- `docs/operations/vps-deploy.md`
  - Procedure de deploiement VPS.
- `docs/operations/release-proof.md`
  - Evidence de release et checks.
- `docs/operations/restore-drill-runbook.md`
  - Procedure de reprise/restauration.
- `docs/operations/data-protection.md`
  - Mesures de protection des donnees.
- `docs/operations/auth-recovery.md`
  - Recuperation acces admin.

## tests - preuve de comportement

- `tests/auth/*`
  - Cycle de session, contrats auth, rate limit, reset admin.
- `tests/profile/*`
  - Gate onboarding et contrat profil.
- `tests/program/*`
  - Generation, substitutions, logging, adaptation, tendances, surfaces dashboard.
- `tests/ops/*`
  - Contrats deploiement/release-proof, restore drill, headers Caddy, smoke dashboard authentifie.
- `tests/security/*`
  - Isolation de compte.

## Zones volontairement non detaillees

- `node_modules/`, `.next/`: exclus (artefacts d'installation/build, non structurants pour la comprehension).
- `scripts/`: perimetre heterogene; a documenter au cas par cas selon besoin operateur specifique.
- Inventaire complet fichier-par-fichier: non vise dans ce document, pour garder un guide de navigation maintenable.

