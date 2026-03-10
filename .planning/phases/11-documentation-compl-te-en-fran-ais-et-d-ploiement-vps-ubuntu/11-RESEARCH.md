# Phase 11: Documentation complete en francais et deploiement VPS Ubuntu - Research

**Researched:** 2026-03-10
**Domain:** documentation technique et d'exploitation d'une application Next.js auto-hebergee sur VPS Ubuntu
**Confidence:** HIGH

## User Constraints

## Implementation Decisions

### Structure documentaire
- Le livrable doit prioriser l'exploitant VPS comme lecteur principal.
- `README_FR.md` doit rester un portail synthétique, propre et orienté navigation vers les guides détaillés.
- `ARBORESCENCE_COMMENTEE_FR.md` doit documenter les dossiers et fichiers cles, sans chercher l'exhaustivite fichier par fichier.
- Les renvois entre documents doivent rester limites et cibles ; chaque document doit rester largement autonome.

### Positionnement du guide VPS Ubuntu
- Le guide principal doit suivre en priorite le chemin de deploiement reel suggere par le repository.
- Docker/Compose doit etre traite comme approche principale si l'analyse du code confirme que c'est bien le chemin supporte par le projet.
- Caddy doit etre documente comme reverse proxy de reference, car le depot contient deja une configuration dediee et des scripts de deploiement associes.
- Le guide VPS doit aller jusqu'aux verifications post-deploiement concretes : HTTPS, sante applicative, logs, smoke tests, verification des services et diagnostics de base.

### Niveau de precision documentaire
- `DOCUMENTATION_TECHNIQUE_FR.md` doit etre detaillee et concrete, centree sur les modules, points d'entree, flux et interactions reels plutot que sur une vue trop abstraite.
- Les flux de donnees et flux fonctionnels doivent etre presentes au travers des scenarios metier cles de bout en bout.
- Les explications doivent citer regulierement les fichiers et repertoires source qui fondent les affirmations, sans transformer la documentation en index brut.
- Les dettes techniques, limites connues et zones sensibles doivent apparaitre dans une section dediee, franche et directement exploitable.

### Traitement des hypotheses et informations manquantes
- Lorsqu'une information n'est pas clairement prouvee par le code ou les documents existants, il faut l'indiquer explicitement.
- Dans ces cas, la documentation peut proposer une hypothese prudente, a condition qu'elle soit clairement signalee comme hypothese.
- Les exemples de configuration et de variables d'environnement doivent etre realistes mais neutres, sans secret reel ni copier-coller dangereux.
- Si plusieurs indices d'exploitation existent sans preuve absolue du chemin de production exact, la documentation doit recommander le chemin le mieux supporte par le depot, citer sa base de preuve, et signaler ce qui reste une hypothese.
- Les hypotheses et limites doivent etre visibles a la fois dans des sections dediees et par rappels locaux dans les sections sensibles.

### Claude's Discretion
- Le decoupage exact entre plans d'analyse, de synthese technique, de documentation d'exploitation et de verification finale.
- La facon la plus maintenable de repartir le contenu entre les sept documents demandes, tant que leurs roles restent nets et complementaires.
- Le niveau exact de granularite des references de fichiers dans chaque document, tant qu'il reste utile et lisible.
- La facon de structurer les scenarios metier choisis pour representer les flux importants du produit.

## Specific Ideas

- Toute la documentation finale doit etre redigee en francais, avec un ton professionnel, pedagogique, precis et structure.
- Le contenu doit rester concret, actionnable et strictement ancre dans le code reel du projet.
- Les documents explicitement attendus sont :
  - `README_FR.md`
  - `DOCUMENTATION_TECHNIQUE_FR.md`
  - `GUIDE_INSTALLATION_VPS_UBUNTU_FR.md`
  - `GUIDE_EXPLOITATION_MAINTENANCE_FR.md`
  - `CONFIGURATION_ENVIRONNEMENT_FR.md`
  - `ARBORESCENCE_COMMENTEE_FR.md`
  - `DEPLOIEMENT_CHECKLIST_FR.md`
- Le guide d'installation doit se lire comme un tutoriel operationnel pas a pas avec commandes shell, explications, verifications et resultats attendus.
- La documentation technique doit privilegier les scenarios metier cles plutot qu'un simple catalogue brut d'endpoints.

## Deferred Ideas

None — la discussion est restee dans le perimetre de la phase.

## Summary

Cette phase doit etre planifiee comme une phase de synthese guidee par les preuves du depot, pas comme une phase de redaction libre. Le repository confirme deja un chemin de deploiement principal coherent pour un VPS Ubuntu: `docker-compose.yml` orchestre `app` + `db` + `caddy`, `Dockerfile` construit l'application Next.js auto-hebergee, `infra/caddy/Caddyfile` fournit la terminaison TLS et le reverse proxy, et `infra/scripts/*.sh|*.mjs` couvrent deploiement, smoke tests, release proof, sauvegarde, restauration et restore drill.

Le plan doit donc separer clairement quatre travaux: inventaire factuel du systeme reel, modelisation des flux fonctionnels a partir du code, harmonisation de la documentation ops existante en francais, et verification finale que les nouveaux documents restent coherents entre eux et avec les scripts/tests. La documentation francaise devra s'appuyer sur les fichiers source et sur les tests ops existants, tout en rendant visibles les hypotheses residuelles, en particulier autour du contrat d'environnement complet et de la preparation du compte de smoke test.

Le risque principal de planification n'est pas technique au sens "implementation", mais documentaire: le depot contient deja plusieurs verites partielles. Par exemple, `.env.example` ne couvre qu'une partie du contrat runtime/ops, alors que `docker-compose.yml`, `infra/caddy/Caddyfile`, `src/server/env/ops-config.ts` et `src/server/llm/config.ts` exposent des besoins plus larges. Le plan doit donc inclure explicitement une tache de reconciliation des sources, sinon la documentation finale sera proprement redigee mais incompletement exploitable.

**Primary recommendation:** planifier la phase comme un audit documentaire repo-first, avec Docker Compose + Caddy + scripts existants comme chemin VPS canonique, et une tache explicite de reconciliation du contrat d'environnement et des hypotheses d'exploitation.

## Standard Stack

### Core
| Library / Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.1.0 | Serveur web applicatif App Router | Le depot est deja auto-heberge via `next build` + `next start`; la doc officielle confirme que Node.js et Docker supportent toutes les fonctionnalites en self-hosting. |
| React | 19.2.0 | UI applicative | Fait partie du runtime reel du projet; la doc technique doit expliquer les surfaces utilisateur a partir des pages/components existants. |
| TypeScript | 5.9.3 | Typage applicatif et contrats | Les frontieres applicatives et ops sont deja formalisees par types/Zod; la doc doit suivre ces contrats. |
| Prisma | 7.4.0 | Acces PostgreSQL et schema de donnees | Le schema reel du produit est dans `prisma/schema.prisma`; c'est la source de verite de la couche donnees. |
| PostgreSQL | `postgres:18-alpine` | Base applicative en production Compose | Deploiement VPS deja modele dans `docker-compose.yml`. |
| Docker Compose | Compose v2 / spec actuelle | Orchestration `app` + `db` + `caddy` | Le repo est deja structure pour ce chemin; Docker recommande Compose comme format standard multi-conteneurs. |
| Caddy | `caddy:2.10-alpine` | Reverse proxy HTTPS et headers | Le repo embarque deja `infra/caddy/Caddyfile`; Caddy gere le TLS automatiquement a partir du domaine. |
| pnpm | 10.16.0 | Gestionnaire de paquets et scripts de release | Tous les scripts projets (`build`, `test`, `release:proof`) passent par `pnpm`. |
| Node.js | >=22 | Runtime applicatif et scripts ops | `package.json` l'impose; `Dockerfile` utilise `node:22-bookworm-slim`. |

### Supporting
| Artifact | Purpose | When to Use |
|---------|---------|-------------|
| `docs/operations/vps-deploy.md` | Runbook de deploiement existant | Source primaire a traduire, restructurer et completer |
| `docs/operations/release-proof.md` | Gate de release operateur | Reference pour le chapitre "preuve de release" et les verifications post-deploiement |
| `docs/operations/restore-drill-runbook.md` | Runbook de restauration | Base du guide maintenance/reprise |
| `docs/operations/data-protection.md` | Controls transit/at-rest | Source pour securite ops et sauvegarde |
| `docs/operations/auth-recovery.md` | Reset mot de passe admin | Source pour support/exploitation |
| `infra/scripts/deploy.sh` | Deploiement Compose + smokes | Canonique pour le tutoriel VPS |
| `infra/scripts/release-proof.sh` | Typecheck/test/build/deploy/smokes | Canonique pour la checklist de release |
| `infra/scripts/backup.sh` / `restore.sh` / `run-restore-drill.sh` | Sauvegarde, restauration, exercice de reprise | Canoniques pour le guide exploitation/maintenance |
| `tests/ops/*.test.ts` | Contrat de comportement ops/documentaire | Verification forte des affirmations ops deja attendues par le projet |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Docker Compose + Caddy comme chemin principal | systemd + `next start` directement expose | Non soutenu par les artefacts existants; augmenterait les hypotheses et la dette documentaire |
| 7 documents specialises + portail | un manuel unique monolithique | Plus difficile a maintenir et a consommer pour un exploitant VPS |
| Arborescence commentee selective | index exhaustif de tous les fichiers | Bruit eleve, maintenance couteuse, faible valeur operationnelle |

**Installation:** aucune nouvelle dependance n'est necessaire pour cette phase. Le plan doit reutiliser les artefacts et scripts existants.

## Architecture Patterns

### Recommended Project Structure
```text
src/app/           pages Next.js App Router et routes API
src/lib/           contrats, logique metier pure, auth, profil, programme, adaptation
src/server/        DAL, services runtime, observabilite, config serveur
prisma/            schema et migrations PostgreSQL
infra/             Caddy, scripts de deploiement/backup/restore, units systemd
docs/operations/   runbooks ops existants a harmoniser
scripts/           CLIs operateur et pipeline de connaissance adaptative
tests/             contrats auth, programme, ops, securite
```

### Pattern 1: Documentation Basee Sur Les Frontieres Reelles
**What:** structurer la documentation technique selon les frontieres runtime du code, pas selon des chapitres generiques.
**When to use:** pour `DOCUMENTATION_TECHNIQUE_FR.md` et `ARBORESCENCE_COMMENTEE_FR.md`.
**Example:**
```text
1. Entrees HTTP/UI
   - pages: src/app/(public)/*, src/app/(private)/*
   - API: src/app/api/**
2. Logique metier
   - auth: src/lib/auth/*, src/app/api/auth/*
   - profil: src/lib/profile/*, src/server/dal/profile.ts, src/app/api/profile/*
   - programme: src/lib/program/*, src/server/dal/program*, src/server/services/*
   - adaptation: src/lib/adaptive-coaching/*, src/server/services/adaptive-coaching.ts, src/server/llm/*
3. Infra et exploitation
   - prisma/, docker-compose.yml, Dockerfile, infra/**
```

### Pattern 2: Scenarios Metier De Bout En Bout
**What:** expliquer le systeme a travers quelques scenarios utilisateur et operateur.
**When to use:** pour la documentation technique detaillee.
**Example:**
```text
Scenario 1: inscription -> login -> cookie de session -> middleware/private layout
Scenario 2: onboarding profil -> validation -> persistance AthleteProfile
Scenario 3: generation programme -> planner -> replaceActivePlan -> dashboard today
Scenario 4: journalisation seance -> logged sets / skip / completion -> tendances
Scenario 5: adaptation -> recommandation -> confirmation/fallback -> forecast dashboard
Scenario 6: release -> deploy.sh -> smoke HTTPS -> smoke authentifie -> release proof
Scenario 7: backup -> restore drill -> preuves de recuperabilite
```

### Pattern 3: Contrat D'Environnement En Couches
**What:** documenter l'environnement en separant clairement variables obligatoires par contexte.
**When to use:** pour `CONFIGURATION_ENVIRONNEMENT_FR.md`.
**Example:**
```text
Couche 1 - runtime app:
DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL

Couche 2 - deploy VPS / proxy:
APP_DOMAIN, ACME_EMAIL, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB

Couche 3 - release proof / restore drill:
RESTORE_TARGET_DB, RESTORE_DRILL_BASE_URL,
OPS_SMOKE_USERNAME, OPS_SMOKE_PASSWORD, OPS_SMOKE_EXPECTED_FOCUS_LABEL

Couche 4 - optionnelle LLM / observabilite:
LLM_REAL_PROVIDER_ENABLED, LLM_PROVIDER_PRIMARY, LLM_PROVIDER_FALLBACK,
LLM_OPENAI_MODEL, LLM_OPENAI_API_KEY, LLM_ANTHROPIC_MODEL, LLM_ANTHROPIC_API_KEY,
LLM_*_TIMEOUT_MS, LLM_GLOBAL_MAX_LATENCY_MS, APP_LOG_LEVEL
```

### Pattern 4: Verification Operationnelle Adossee Aux Scripts
**What:** faire reposer le guide VPS et la checklist sur les commandes qui existent deja.
**When to use:** pour `GUIDE_INSTALLATION_VPS_UBUNTU_FR.md`, `GUIDE_EXPLOITATION_MAINTENANCE_FR.md` et `DEPLOIEMENT_CHECKLIST_FR.md`.
**Example:**
```bash
infra/scripts/deploy.sh /opt/coach/.env.production
corepack pnpm release:proof -- /opt/coach/.env.production
infra/scripts/backup.sh /opt/coach/.env.production
infra/scripts/run-restore-drill.sh /opt/coach/.env.production backups
```

### Anti-Patterns to Avoid
- **Inventer un chemin de production alternatif:** ne pas documenter `systemd + next start` ou une exposition directe du port 3000 comme voie principale.
- **Melanger faits et suppositions:** toute affirmation non prouvee par code/doc existante doit etre marquee comme hypothese.
- **Recopier un contrat `.env` partiel:** il faut reconcilier code, compose, Caddy, scripts et runbooks avant d'ecrire les tableaux de variables.
- **Transformer la doc en index brut:** l'objectif est de guider un humain, pas de lister chaque fichier.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Deploiement VPS | Un nouveau process manuel ou une nouvelle topologie | `docker-compose.yml` + `Dockerfile` + `infra/caddy/Caddyfile` + `infra/scripts/deploy.sh` | C'est deja la voie supportee par le depot et testee indirectement par les runbooks/tests ops |
| TLS / reverse proxy | Certbot/Nginx documentes de zero | Caddy et son auto-HTTPS | Le depot contient deja la config et les headers, Caddy gere nativement HTTPS |
| Smoke post-deploiement | Des commandes ad hoc ecrites pour la doc | `smoke-test-https.sh` et `smoke-authenticated-dashboard.mjs` | Evite une divergence entre doc et exploitation reelle |
| Sauvegarde/restauration | Fichiers SQL temporaires et procedures manuelles | `backup.sh`, `restore.sh`, `run-restore-drill.sh` | Les scripts actuels preservent le streaming chiffre et les garde-fous |
| Contrat d'environnement | Des tableaux manuels derives d'une seule source | Croisement de `.env.example`, `docker-compose.yml`, `infra/caddy/Caddyfile`, `src/server/env/ops-config.ts`, `src/server/llm/config.ts` | Le contrat est actuellement distribue |

**Key insight:** cette phase ne doit presque rien "inventer". Sa difficulte est de consolider proprement des verites deja presentes mais dispersees.

## Common Pitfalls

### Pitfall 1: Contrat D'Environnement Fragmente
**What goes wrong:** la documentation oublie des variables indispensables ou ne distingue pas obligatoire/optionnel.
**Why it happens:** `.env.example` ne montre pas `ACME_EMAIL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, ni les variables LLM; `docker-compose.yml`, `Caddyfile` et les parseurs Zod en demandent davantage selon le contexte.
**How to avoid:** etablir d'abord une matrice exhaustive des variables par source et par contexte d'usage.
**Warning signs:** un lecteur peut lancer `release:proof` ou `deploy.sh`, mais pas preparer completement son `.env.production`.

### Pitfall 2: Decrire Le Deploiement Sans Prouver Le Chemin
**What goes wrong:** le guide VPS parle d'Ubuntu, Docker et Caddy de facon plausible mais sans s'aligner sur les commandes reelles du depot.
**Why it happens:** tentation d'ecrire un tutoriel "standard" au lieu de suivre `deploy.sh`, `release-proof.sh` et les runbooks existants.
**How to avoid:** chaque etape operative doit renvoyer a un artefact repo ou a une commande existante.
**Warning signs:** presence de commandes qui ne figurent nulle part dans `infra/scripts` ou `docs/operations`.

### Pitfall 3: Oublier Le Compte De Smoke Authentifie
**What goes wrong:** la doc mentionne `OPS_SMOKE_*` mais n'explique pas comment rendre le smoke vraiment exploitable.
**Why it happens:** le depot verifie bien le contrat et le script de smoke, mais ne fournit pas de bootstrap explicite du compte/donnees.
**How to avoid:** traiter ce point comme une question ouverte du plan et documenter la procedure retenue ou l'hypothese explicite.
**Warning signs:** le guide dit "run release proof" sans expliquer le pre-requis "compte non prod avec donnees dashboard attendues".

### Pitfall 4: Documentation Technique Trop Abstraite
**What goes wrong:** la doc parle de "backend", "frontend" et "services" sans expliquer les chemins reels.
**Why it happens:** l'architecture est modulaire et peut sembler simple de loin; les vraies frontieres sont dans `src/app`, `src/lib`, `src/server`, `prisma`, `infra`.
**How to avoid:** documenter les scenarios en citant les points d'entree et modules exacts.
**Warning signs:** absence de references a `src/app/api/program/*`, `src/server/services/*`, `src/server/dal/*`, `prisma/schema.prisma`.

### Pitfall 5: Arborescence Commentee Trop Large
**What goes wrong:** l'arborescence essaye de couvrir `.next`, `node_modules`, migrations detaillees ou chaque test.
**Why it happens:** confusion entre vue de navigation et inventaire exhaustif.
**How to avoid:** limiter l'arborescence aux dossiers et fichiers structurants pour comprehension, exploitation et reprise.
**Warning signs:** la doc devient un dump de `find`.

### Pitfall 6: Exemples Dangereux Ou Trompeurs
**What goes wrong:** secrets reels, commandes destructrices non contextualisees, URLs de prod fictives trop copiables.
**Why it happens:** documentation ops souvent redigee par copier-coller depuis un shell.
**How to avoid:** utiliser des valeurs neutres, appeler les garde-fous (`RESTORE_TARGET_DB != POSTGRES_DB`, secrets hors repo, permissions restrictives).
**Warning signs:** des exemples semblent executables tels quels en production sans personnalisation.

## Code Examples

Verified patterns from the repository and official docs:

### Canonical Deploy Entry Point
```bash
# Source: infra/scripts/deploy.sh + docs/operations/vps-deploy.md
infra/scripts/deploy.sh /opt/coach/.env.production
```

### Canonical Release Gate
```bash
# Source: infra/scripts/release-proof.sh + docs/operations/release-proof.md
corepack pnpm release:proof -- /opt/coach/.env.production
```

### Canonical Backup / Restore Drill
```bash
# Source: infra/scripts/backup.sh + infra/scripts/run-restore-drill.sh
export BACKUP_PASSPHRASE='replace-with-backup-passphrase'
infra/scripts/backup.sh /opt/coach/.env.production
infra/scripts/run-restore-drill.sh /opt/coach/.env.production backups
```

### Canonical Runtime Verification
```bash
# Source: docs/operations/vps-deploy.md
docker compose --env-file /opt/coach/.env.production ps
docker compose --env-file /opt/coach/.env.production logs --tail=100 app caddy
curl -sSI https://coach.example.com
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Exposer directement un serveur Node | Mettre un reverse proxy devant Next.js | Recommande par la doc Next.js actuelle | Confirme que Caddy doit rester la reference documentaire |
| Decrire un hebergement "Node seul" comme unique voie | Self-hosting Next.js supporte Node.js ou Docker avec toutes les fonctionnalites | Confirme par la doc Next.js actuelle (maj fev. 2026) | Le guide VPS peut legitimer le chemin Docker existant sans le presenter comme un bricolage |
| Certificats TLS manuels | Auto-HTTPS Caddy via domaine configure | Pratique courante Caddy actuelle | Inutile d'ajouter Certbot comme prerequis principal |
| Anciennes versions Compose 2.x/3.x documentees comme formats distincts | Compose Specification unifiee / Compose v2 | Etat actuel des docs Docker | Le `docker-compose.yml` du repo peut etre documente sans debattre d'anciens formats |

**Deprecated/outdated:**
- Documenter un deploiement statique Next.js comme voie principale: incompatible avec les besoins runtime/auth/API du projet.
- Documenter un TLS manuel hors Caddy comme baseline: non justifie par les artefacts actuels.

## Open Questions

1. **Ou doivent vivre les sept documents francais ?**
   - What we know: le contexte donne des noms de fichiers, sans imposer de repertoire.
   - What's unclear: racine du repo vs `docs/` vs `docs/operations/`.
   - Recommendation: verrouiller tot la cible documentaire dans le plan pour eviter des deplacements en fin de phase.

2. **Quelle procedure officielle pour provisionner le compte de smoke et ses donnees ?**
   - What we know: `OPS_SMOKE_*` est requis par les scripts/tests et la doc ops existante, mais le bootstrap du compte n'est pas documente en tant que procedure unique.
   - What's unclear: creation via UI, seed manuel, reset admin + parcours applicatif, ou autre.
   - Recommendation: traiter ce point comme prerequis de documentation ops; si aucune procedure codee n'existe, documenter une procedure manuelle explicitement marquee.

3. **Quel perimetre exact pour la configuration d'environnement "complete" ?**
   - What we know: le runtime app, le deploy VPS, le release proof, le restore drill, les providers LLM et `APP_LOG_LEVEL` ont des variables distinctes.
   - What's unclear: faut-il documenter les variables LLM comme optionnelles "avancees" dans cette phase ou seulement le socle VPS/release.
   - Recommendation: inclure le tableau complet, avec colonne "obligatoire pour" afin d'eviter les confusions.

4. **Le portail francais doit-il remplacer ou completer la doc anglaise existante ?**
   - What we know: `docs/operations/*.md` existe deja en anglais; aucun `README.md` n'existe a la racine.
   - What's unclear: strategie de coexistence, duplication, ou migration progressive.
   - Recommendation: planifier la documentation francaise comme source prioritaire de cette phase, tout en reutilisant et en citant la doc existante comme materiau d'entree.

## Sources

### Primary (HIGH confidence)
- Repository source: `package.json`, `docker-compose.yml`, `Dockerfile`, `.env.example`
- Repository source: `infra/caddy/Caddyfile`
- Repository source: `infra/scripts/deploy.sh`, `infra/scripts/release-proof.sh`, `infra/scripts/backup.sh`, `infra/scripts/restore.sh`, `infra/scripts/run-restore-drill.sh`, `infra/scripts/smoke-authenticated-dashboard.mjs`, `infra/scripts/smoke-test-https.sh`
- Repository source: `docs/operations/vps-deploy.md`, `docs/operations/release-proof.md`, `docs/operations/restore-drill-runbook.md`, `docs/operations/data-protection.md`, `docs/operations/auth-recovery.md`
- Repository source: `src/server/env/ops-config.ts`, `src/server/llm/config.ts`, `prisma/schema.prisma`, `src/app/api/program/*`, `src/server/services/*`, `src/server/dal/*`
- Repository source: `tests/ops/release-proof.test.ts`, `tests/ops/restore-drill.test.ts`, `tests/ops/caddy-header-policy.test.ts`, `tests/ops/authenticated-dashboard-smoke.test.ts`
- Next.js docs: https://nextjs.org/docs/app/getting-started/deploying
- Next.js docs: https://nextjs.org/docs/pages/guides/self-hosting
- Docker docs: https://docs.docker.com/compose/
- Docker docs: https://docs.docker.com/reference/cli/docker/compose
- Docker docs: https://docs.docker.com/compose/compose-file/
- Caddy docs: https://caddyserver.com/docs/quick-starts/https

### Secondary (MEDIUM confidence)
- None needed beyond official docs and repository evidence.

### Tertiary (LOW confidence)
- Hypothese: le chemin Docker Compose + Caddy est le chemin de production effectif, pas seulement un chemin supporte. Le depot le soutient fortement, mais l'usage historique reel n'est pas prouve par un environnement de production observe.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - confirme par `package.json`, Compose, Dockerfile et docs officielles actuelles.
- Architecture: HIGH - confirme directement par l'organisation du code, les DAL/services/routes et le schema Prisma.
- Pitfalls: HIGH - derives d'ecarts concrets deja visibles entre code, scripts, docs et tests.
- Project-specific instructions/skills: HIGH - aucun `CLAUDE.md`, aucun `.claude/skills/`, aucun `.agents/skills/` detecte dans le projet.

**Research date:** 2026-03-10
**Valid until:** 2026-04-09
