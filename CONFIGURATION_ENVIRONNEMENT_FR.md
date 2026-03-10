# Configuration d'environnement (FR)

## Objectif

Ce document reconcilie le contrat d'environnement reel du depot pour le runtime,
le deploiement VPS Ubuntu (Docker Compose + Caddy), les preuves operateur
(`release:proof`) et le restore drill.

Reference principale: les variables ne sont pas derivees d'une seule source.
Elles sont croisees depuis `.env.example`, `docker-compose.yml`,
`infra/caddy/Caddyfile`, `src/server/env/ops-config.ts`,
`src/server/llm/config.ts` et `infra/scripts/*`.

## Principes

- Secret en production: stocker dans `/opt/coach/.env.production` avec permissions restrictives.
- Pas de secret dans le repo, ni dans les logs de ticket.
- Le chemin de reference est `docker compose` + `caddy` + scripts `infra/scripts`.
- Les variables "conditionnelles" ne sont requises que pour leur cas d'usage.

## Matrice des variables

| Variable | Obligatoire pour | Exemple neutre | Usage reel | Source(s) de preuve |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Runtime app (`app`) | `postgresql://coach:***@db:5432/coach` | Connection Prisma/DB de l'app | `.env.example`, `docker-compose.yml`, `docs/operations/vps-deploy.md` |
| `BETTER_AUTH_SECRET` | Runtime app (`app`) | `replace-with-long-random-secret` | Signature/chiffrement auth | `.env.example`, `docker-compose.yml`, `docs/operations/vps-deploy.md` |
| `BETTER_AUTH_URL` | Runtime app (`app`) | `https://coach.example.com` | URL de base auth/cookies | `.env.example`, `docker-compose.yml`, `docs/operations/vps-deploy.md` |
| `APP_DOMAIN` | Deploiement VPS + Caddy + smoke HTTPS + release proof | `coach.example.com` | Domaine public HTTPS, cible smoke `https://$APP_DOMAIN` | `.env.example`, `docker-compose.yml`, `infra/caddy/Caddyfile`, `infra/scripts/smoke-test-https.sh`, `infra/scripts/release-proof.sh` |
| `ACME_EMAIL` | Caddy TLS (fortement recommande) | `ops@example.com` | Email ACME pour certificats | `infra/caddy/Caddyfile`, `docs/operations/vps-deploy.md` |
| `POSTGRES_DB` | Service `db` + garde-fou restore | `coach` | Nom DB principale, comparee a `RESTORE_TARGET_DB` | `.env.example`, `docker-compose.yml`, `src/server/env/ops-config.ts`, `infra/scripts/restore.sh` |
| `POSTGRES_USER` | Service `db`, backup/restore | `coach` | Utilisateur Postgres pour `pg_dump`/`psql` | `docker-compose.yml`, `infra/scripts/backup.sh`, `infra/scripts/restore.sh`, `docs/operations/restore-drill-runbook.md` |
| `POSTGRES_PASSWORD` | Service `db` | `replace-with-strong-password` | Mot de passe DB container | `docker-compose.yml`, `docs/operations/vps-deploy.md` |
| `RESTORE_TARGET_DB` | Restore drill (obligatoire) | `coach_restore_drill` | DB de restauration dediee, differente de la prod | `.env.example`, `src/server/env/ops-config.ts`, `infra/scripts/restore.sh`, `docs/operations/restore-drill-runbook.md` |
| `RESTORE_DRILL_BASE_URL` | Restore drill smoke (conditionnel, default interne) | `http://127.0.0.1:3000` | Base URL du smoke restaure | `.env.example`, `src/server/env/ops-config.ts`, `infra/scripts/run-restore-drill.sh`, `infra/scripts/smoke-authenticated-dashboard.mjs` |
| `RESTORE_DRILL_EVIDENCE_DIR` | Restore drill (optionnel) | `backups/restore-drills` | Emplacement des logs d'evidence | `infra/scripts/run-restore-drill.sh`, `docs/operations/restore-drill-runbook.md` |
| `RESTORE_DRILL_BACKUP_FILE` | Restore drill (optionnel) | `backups/coach-YYYYMMDDTHHMMSSZ.sql.enc` | Force un backup specifique | `infra/scripts/run-restore-drill.sh`, `docs/operations/restore-drill-runbook.md` |
| `OPS_SMOKE_USERNAME` | Smoke authentifie deploy/release/restore (obligatoire dans ces flux) | `release-smoke` | Login du compte de verification | `.env.example`, `src/server/env/ops-config.ts`, `infra/scripts/smoke-authenticated-dashboard.mjs`, `docs/operations/release-proof.md` |
| `OPS_SMOKE_PASSWORD` | Smoke authentifie deploy/release/restore (obligatoire dans ces flux) | `replace-with-smoke-password` | Password du compte de verification | `.env.example`, `src/server/env/ops-config.ts`, `infra/scripts/smoke-authenticated-dashboard.mjs`, `docs/operations/release-proof.md` |
| `OPS_SMOKE_EXPECTED_FOCUS_LABEL` | Smoke authentifie deploy/release/restore (obligatoire dans ces flux) | `Upper Body` | Assertion business-data sur `/api/program/today` | `.env.example`, `src/server/env/ops-config.ts`, `infra/scripts/smoke-authenticated-dashboard.mjs`, `docs/operations/release-proof.md` |
| `LLM_REAL_PROVIDER_ENABLED` | Mode provider LLM reel (conditionnel) | `false` | Active/desactive la config provider reelle | `src/server/llm/config.ts` |
| `LLM_PROVIDER_PRIMARY` | LLM reel (si enabled) | `openai` | Provider primaire | `src/server/llm/config.ts` |
| `LLM_PROVIDER_FALLBACK` | LLM reel (si enabled) | `anthropic` | Provider fallback | `src/server/llm/config.ts` |
| `LLM_OPENAI_MODEL` | LLM reel (si enabled) | `gpt-4o-mini` | Modele OpenAI primaire | `src/server/llm/config.ts` |
| `LLM_OPENAI_API_KEY` | LLM reel (si enabled) | `sk-...` | Cle API OpenAI | `src/server/llm/config.ts` |
| `LLM_ANTHROPIC_MODEL` | LLM reel (si enabled) | `claude-3-5-sonnet-latest` | Modele Anthropic fallback | `src/server/llm/config.ts` |
| `LLM_ANTHROPIC_API_KEY` | LLM reel (si enabled) | `sk-ant-...` | Cle API Anthropic | `src/server/llm/config.ts` |
| `LLM_PRIMARY_TIMEOUT_MS` | LLM reel (optionnel avec default) | `5000` | Timeout primaire (1000..15000) | `src/server/llm/config.ts` |
| `LLM_FALLBACK_TIMEOUT_MS` | LLM reel (optionnel avec default) | `5000` | Timeout fallback (1000..15000) | `src/server/llm/config.ts` |
| `LLM_GLOBAL_MAX_LATENCY_MS` | LLM reel (obligatoire si enabled) | `12000` | Latence max globale (1000..20000) | `src/server/llm/config.ts` |
| `LLM_PRIMARY_MAX_RETRIES` | LLM reel (optionnel avec default) | `1` | Retries primaire (0..1) | `src/server/llm/config.ts` |
| `LLM_FALLBACK_MAX_ATTEMPTS` | LLM reel (optionnel avec default forcee) | `1` | Tentatives fallback (=1) | `src/server/llm/config.ts` |

## Contrat minimal selon contexte

### 1) Runtime application (indispensable)

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`

Sans ces variables, le service `app` ne respecte pas son contrat de runtime.

### 2) Deploiement VPS Ubuntu avec Caddy (indispensable pour la voie canonique)

- `APP_DOMAIN`
- `ACME_EMAIL`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- + contrat runtime application ci-dessus

### 3) Release proof et verifications post-deploiement (indispensable pour la preuve complete)

- `APP_DOMAIN`
- `OPS_SMOKE_USERNAME`
- `OPS_SMOKE_PASSWORD`
- `OPS_SMOKE_EXPECTED_FOCUS_LABEL`

`infra/scripts/release-proof.sh` echoue si `APP_DOMAIN` est absent.
Le smoke authentifie echoue si `OPS_SMOKE_*` est incomplet.

### 4) Restore drill (indispensable pour recuperabilite prouvee)

- `POSTGRES_DB`
- `POSTGRES_USER`
- `RESTORE_TARGET_DB`
- `OPS_SMOKE_USERNAME`
- `OPS_SMOKE_PASSWORD`
- `OPS_SMOKE_EXPECTED_FOCUS_LABEL`

Conditionnels restore:

- `RESTORE_DRILL_BASE_URL` (defaut script/code: `http://127.0.0.1:3000`)
- `RESTORE_DRILL_EVIDENCE_DIR`
- `RESTORE_DRILL_BACKUP_FILE`

Garde-fou critique: `RESTORE_TARGET_DB` doit etre different de `POSTGRES_DB`.

### 5) LLM providers reels (strictement conditionnel)

Quand `LLM_REAL_PROVIDER_ENABLED=true`, le parseur exige la totalite du bloc LLM
(provider, modeles, cles API, latences et politiques retry).

Quand `LLM_REAL_PROVIDER_ENABLED` est absent ou different de `true`,
`parseLlmRuntimeConfig(...)` retourne `null` et ce bloc n'est pas requis.

## Exemple `.env.production` unifie (neutre)

```env
# Runtime app
DATABASE_URL=postgresql://coach:replace-with-strong-password@db:5432/coach
BETTER_AUTH_SECRET=replace-with-long-random-secret
BETTER_AUTH_URL=https://coach.example.com

# Deploy / Caddy / DB
APP_DOMAIN=coach.example.com
ACME_EMAIL=ops@example.com
POSTGRES_DB=coach
POSTGRES_USER=coach
POSTGRES_PASSWORD=replace-with-strong-password

# Release proof + restore drill smoke
RESTORE_TARGET_DB=coach_restore_drill
RESTORE_DRILL_BASE_URL=http://127.0.0.1:3000
OPS_SMOKE_USERNAME=release-smoke
OPS_SMOKE_PASSWORD=replace-with-smoke-password
OPS_SMOKE_EXPECTED_FOCUS_LABEL=Upper Body

# LLM (optionnel)
LLM_REAL_PROVIDER_ENABLED=false
```

## Verifications rapides du contrat

```bash
# Presence des variables principales
rg -n "DATABASE_URL|BETTER_AUTH_SECRET|BETTER_AUTH_URL|APP_DOMAIN|ACME_EMAIL|POSTGRES_|RESTORE_|OPS_SMOKE_|LLM_" /opt/coach/.env.production

# Validation de base du flux ops (si stack deployee)
corepack pnpm release:proof -- /opt/coach/.env.production
```

## Hypotheses et limites (visibles localement)

- Hypothese: `ACME_EMAIL` est traitee comme obligatoire pour l'exploitation
  VPS, car le `Caddyfile` la reference explicitement, meme si l'echec exact
  sans valeur depend du runtime Caddy.
- Limite: le depot prouve le contrat de parsing/runtime pour `ops-config` et
  `llm/config`, mais ne fournit pas un unique fichier "schema env" global.
  Cette consolidation reste donc documentaire (repo-first), pas un parseur unique.
- Hypothese operationnelle: le compte `OPS_SMOKE_*` et ses donnees metier
  (focus label attendu) doivent etre prepares hors scripts. Le depot valide
  l'usage de ce compte, pas son provisionnement automatique.
