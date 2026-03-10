# Guide d'installation VPS Ubuntu (FR)

## Objectif

Deployer l'application Coach sur un VPS Ubuntu via le chemin canonique du depot:
`docker-compose.yml` + `Dockerfile` + `infra/caddy/Caddyfile` +
`infra/scripts/deploy.sh`.

Ce guide s'adresse a un exploitant et va jusqu'aux verifications post-deploiement
(services, HTTPS, smoke tests, logs et resultats attendus).

## 1) Prerequis

- VPS Ubuntu (22.04 LTS ou plus recent).
- DNS `A/AAAA` pointant vers le VPS (ex: `coach.example.com`).
- Ports 80 et 443 ouverts.
- Acces shell sudo.
- Git installe.

Hypothese locale: la machine dispose d'assez de RAM/CPU pour 3 services
(`app`, `db`, `caddy`). Le depot ne fixe pas un sizing strict.

## 2) Preparation systeme Ubuntu

### Mettre a jour le systeme

```bash
sudo apt-get update
sudo apt-get upgrade -y
```

### Installer Docker Engine + plugin Compose

```bash
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Verifier:

```bash
docker --version
docker compose version
```

Resultat attendu:

- commandes disponibles,
- pas d'erreur "command not found".

## 3) Recuperer le projet sur le VPS

```bash
sudo mkdir -p /opt/coach
sudo chown "$USER":"$USER" /opt/coach
git clone <URL_DU_REPO> /opt/coach
cd /opt/coach
```

Resultat attendu: `docker-compose.yml`, `Dockerfile`, `infra/` presents dans `/opt/coach`.

## 4) Creer le fichier d'environnement de production

Le chemin de reference est **hors repository**: `/opt/coach/.env.production`.

```bash
cat > /opt/coach/.env.production <<'ENV'
# Runtime app
DATABASE_URL=postgresql://coach:replace-with-strong-password@db:5432/coach
BETTER_AUTH_SECRET=replace-with-long-random-secret
BETTER_AUTH_URL=https://coach.example.com

# Reverse proxy / TLS
APP_DOMAIN=coach.example.com
ACME_EMAIL=ops@example.com

# PostgreSQL container
POSTGRES_DB=coach
POSTGRES_USER=coach
POSTGRES_PASSWORD=replace-with-strong-password

# Restore drill + smoke authentifie
RESTORE_TARGET_DB=coach_restore_drill
RESTORE_DRILL_BASE_URL=http://127.0.0.1:3000
OPS_SMOKE_USERNAME=release-smoke
OPS_SMOKE_PASSWORD=replace-with-smoke-password
OPS_SMOKE_EXPECTED_FOCUS_LABEL=Upper Body

# LLM (optionnel)
LLM_REAL_PROVIDER_ENABLED=false
ENV

chmod 600 /opt/coach/.env.production
```

Verification:

```bash
rg -n "DATABASE_URL|BETTER_AUTH_SECRET|BETTER_AUTH_URL|APP_DOMAIN|ACME_EMAIL|POSTGRES_|RESTORE_|OPS_SMOKE_" /opt/coach/.env.production
```

Resultat attendu: toutes les lignes critiques sont presentes.

Limite locale: le depot impose l'usage des variables `OPS_SMOKE_*` dans les
smokes authentifies, mais ne fournit pas un script de provisionnement automatique
du compte de smoke.

## 5) Deployer la stack (chemin canonique)

Depuis `/opt/coach`:

```bash
infra/scripts/deploy.sh /opt/coach/.env.production
```

Ce script:

- charge l'env cible,
- execute `docker compose pull`, `docker compose build --pull`, `docker compose up -d --remove-orphans`,
- lance `smoke-test-https` et le smoke authentifie si `APP_DOMAIN` est defini
  (sauf si `DEPLOY_SKIP_POST_DEPLOY_SMOKE=1`).

Resultat attendu:

- sortie finale `Deployment complete.`
- pas de code de retour non-zero.

## 6) Verifier les services et la sante immediate

### Statut des conteneurs

```bash
docker compose --env-file /opt/coach/.env.production ps
```

Resultat attendu:

- `db`, `app`, `caddy` en etat `Up`.

### Logs utiles

```bash
docker compose --env-file /opt/coach/.env.production logs --tail=100 app caddy
```

Resultat attendu:

- pas de boucle de crash,
- pas d'erreur de connexion DB repetee,
- Caddy demarre sans erreur de configuration.

## 7) Verifier HTTPS et reverse proxy Caddy

### Smoke HTTPS

```bash
infra/scripts/smoke-test-https.sh https://coach.example.com
```

Resultat attendu:

- `Smoke test passed with HTTP 2xx/3xx`.

### Controle en-tetes de hardening

```bash
curl -sSI https://coach.example.com | rg -n "X-Content-Type-Options|Referrer-Policy|Permissions-Policy|X-Frame-Options|Content-Security-Policy-Report-Only"
```

Resultat attendu: en-tetes retournes par Caddy (politique report-only pour CSP).

## 8) Verifier le smoke authentifie (preuve metier)

```bash
node infra/scripts/smoke-authenticated-dashboard.mjs https://coach.example.com
```

Resultat attendu dans la sortie:

- `smoke_login=ok`
- `smoke_dashboard=ok`
- `smoke_business_data=ok expected_focus_label=...`

Interpretation: le deploiement est valide sur authentification + donnees metier,
pas seulement sur reachability HTTPS.

Hypothese locale critique: le compte `OPS_SMOKE_USERNAME` doit exister et disposer
de donnees dashboard compatibles avec `OPS_SMOKE_EXPECTED_FOCUS_LABEL`.
Limite locale: le script peut utiliser `RESTORE_DRILL_BASE_URL` dans d'autres
contextes (restore drill), mais dans ce tutoriel de deploiement la reference est
`https://${APP_DOMAIN}`.

## 9) Executer la preuve de release complete

```bash
corepack pnpm release:proof -- /opt/coach/.env.production
```

Etapes attendues (ordre fixe):

1. `==> typecheck`
2. `==> test`
3. `==> build`
4. `==> deploy`
5. `==> https_smoke`
6. `==> authenticated_smoke`

Resultat attendu final: `Release proof passed.`

Scripts effectivement impliques dans cette preuve:

- `infra/scripts/deploy.sh`
- `infra/scripts/smoke-test-https.sh`
- `infra/scripts/smoke-authenticated-dashboard.mjs`
- `infra/scripts/release-proof.sh` (via `corepack pnpm release:proof`)

## 10) Procedure de mise a jour

```bash
cd /opt/coach
git pull
infra/scripts/deploy.sh /opt/coach/.env.production
```

Pour une release candidate, preferer:

```bash
corepack pnpm release:proof -- /opt/coach/.env.production
```

## 11) Diagnostic rapide (pannes frequentes)

- HTTPS KO:
  - verifier DNS vers le VPS,
  - verifier ports 80/443,
  - verifier logs `caddy`.
- App KO:
  - verifier logs `app`,
  - verifier `DATABASE_URL` vers `db:5432`.
- DB KO:
  - verifier coherence `POSTGRES_*` vs credentials dans `DATABASE_URL`.
- Smoke authentifie KO:
  - verifier `OPS_SMOKE_*`,
  - verifier que le compte smoke existe et possede les donnees attendues.

## 12) Hypotheses et limites visibles

- Hypothese: ce guide est la voie de reference de production car le depot porte
  explicitement les artefacts Docker Compose + Caddy + scripts ops associes.
- Limite: ce document ne presente pas de chemin alternatif principal (systemd
  `next start`, Nginx, Traefik), car ces voies ne sont pas le contrat ops central
  prouve par les artefacts mentionnes.
- Limite: la creation initiale du compte smoke est une operation manuelle/hors
  scripts; elle doit etre prise en charge dans le processus d'exploitation local.
