# Checklist de deploiement et release (FR)

Checklist operationnelle courte pour piloter une release sans reconstituer tout le runbook.

References detaillees:
- `GUIDE_INSTALLATION_VPS_UBUNTU_FR.md` (installation/deploiement complet)
- `GUIDE_EXPLOITATION_MAINTENANCE_FR.md` (maintenance et incident)
- `docs/operations/release-proof.md` (contrat de preuve)

## 0) Conditions d'entree

- [ ] Acces shell au serveur (`/opt/coach`) et Docker Compose disponible.
- [ ] Fichier env present: `/opt/coach/.env.production`.
- [ ] Variables critiques verifiees: `APP_DOMAIN`, `POSTGRES_*`, `BETTER_AUTH_*`, `OPS_SMOKE_*`.
- [ ] Compte smoke operateur existant et compatible `OPS_SMOKE_EXPECTED_FOCUS_LABEL`.

## 1) Preparation avant release

- [ ] Mettre a jour le code cible: `git fetch --all` puis selection du commit/tag.
- [ ] Verifier le diff de release (pas de secret ajoute par erreur).
- [ ] Controler l'env:
  - [ ] `rg -n "APP_DOMAIN|OPS_SMOKE|POSTGRES_|BETTER_AUTH_" /opt/coach/.env.production`
- [ ] Valider rapidement la sante actuelle:
  - [ ] `docker compose --env-file /opt/coach/.env.production ps`
  - [ ] `docker compose --env-file /opt/coach/.env.production logs --tail=80 app caddy`

## 2) Verification locale pre-release (gate deterministe)

- [ ] Depuis la branche candidate, executer:
  - [ ] `corepack pnpm typecheck`
  - [ ] `corepack pnpm test`
  - [ ] `corepack pnpm build`
- [ ] Si un gate echoue: stopper la release, corriger, relancer depuis le debut.

## 3) Execution release/deploiement

Choisir un seul chemin selon le contexte:

- [ ] **Chemin A (recommande):**
  - [ ] `corepack pnpm release:proof -- /opt/coach/.env.production`
  - [ ] Verifier l'ordre des stages: `typecheck -> test -> build -> deploy -> https_smoke -> authenticated_smoke`
- [ ] **Chemin B (deploiement seul):**
  - [ ] `infra/scripts/deploy.sh /opt/coach/.env.production`
  - [ ] Puis executer manuellement les smokes (section 4).

## 4) Validation post-deploiement

- [ ] Services `db`, `app`, `caddy` en `Up`:
  - [ ] `docker compose --env-file /opt/coach/.env.production ps`
- [ ] Smoke HTTPS OK:
  - [ ] `infra/scripts/smoke-test-https.sh "https://${APP_DOMAIN}"`
- [ ] Smoke authentifie OK (donnee metier):
  - [ ] `node infra/scripts/smoke-authenticated-dashboard.mjs "https://${APP_DOMAIN}"`
  - [ ] Attendus: `smoke_login=ok`, `smoke_dashboard=ok`, `smoke_business_data=ok`
- [ ] Journaux sans boucle d'erreur critique:
  - [ ] `docker compose --env-file /opt/coach/.env.production logs --tail=120 app caddy`

## 5) Collecte de preuve de release

- [ ] Capturer la sortie `release:proof` dans un log horodate.
- [ ] Conserver les marqueurs:
  - [ ] `==> typecheck`
  - [ ] `==> test`
  - [ ] `==> build`
  - [ ] `==> deploy`
  - [ ] `==> https_smoke`
  - [ ] `==> authenticated_smoke`
  - [ ] `Release proof passed.`
- [ ] Archiver aussi les extraits de logs Compose (`app`, `caddy`) de la release.

## 6) Rollback initial (si echec)

- [ ] Identifier le premier stage en echec (`typecheck`, `test`, `build`, `deploy`, `smoke`).
- [ ] Revenir au commit/tag precedent stable sur le serveur.
- [ ] Relancer `infra/scripts/deploy.sh /opt/coach/.env.production`.
- [ ] Refaire `smoke` HTTPS + smoke authentifie.
- [ ] Documenter la cause et les commandes executees.

## 7) Diagnostic rapide (premier niveau)

- [ ] Erreur HTTPS: verifier DNS, certificat Caddy, et `APP_DOMAIN`.
- [ ] Erreur login smoke: verifier `OPS_SMOKE_USERNAME` / `OPS_SMOKE_PASSWORD`.
- [ ] Erreur business-data smoke: verifier `OPS_SMOKE_EXPECTED_FOCUS_LABEL` et les donnees du compte.
- [ ] Erreurs applicatives: inspecter logs `app` et connectivite Postgres (`DATABASE_URL`, `POSTGRES_*`).
- [ ] Si incident persistant: basculer vers `GUIDE_EXPLOITATION_MAINTENANCE_FR.md` pour escalade detaillee.

## Hypotheses et limites

- Hypothese: le chemin canonique de production reste `deploy.sh` + Caddy + Compose.
- Limite: le provisionnement du compte smoke n'est pas automatise dans le depot.
- Hypothese: cette checklist complete les guides; elle ne remplace pas les procedures detaillees.
