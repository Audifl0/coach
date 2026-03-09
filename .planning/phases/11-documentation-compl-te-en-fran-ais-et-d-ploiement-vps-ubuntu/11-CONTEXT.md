# Phase 11: Documentation complète en français et déploiement VPS Ubuntu - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Produire une base documentaire complète en français pour le projet `coach`, directement exploitable par un exploitant VPS et un repreneur technique. La phase couvre deux axes strictement liés au périmètre existant du dépôt :

1. expliquer le fonctionnement réel de l'application, de son architecture, de ses modules, de ses flux et de ses scripts ;
2. documenter de manière opérationnelle le déploiement, l'exploitation, la maintenance et la reprise sur un VPS Ubuntu à partir des artefacts réellement présents dans le repository.

Cette phase clarifie comment documenter le système existant. Elle ne crée pas de nouvelles capacités produit, ne redéfinit pas l'architecture applicative, et ne doit pas inventer des composants, services ou procédures absents du code.

</domain>

<decisions>
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

</decisions>

<specifics>
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

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `package.json`: confirme une application Next.js/React/TypeScript lancee via `pnpm`, avec scripts `dev`, `build`, `start`, `typecheck`, `test` et `release:proof`.
- `docker-compose.yml`: fournit une topologie de deploiement concrete `app` + `db` (PostgreSQL) + `caddy`, exploitable comme chemin principal de documentation VPS si confirme par l'analyse detaillee.
- `Dockerfile`: montre qu'un packaging conteneur applicatif existe deja et devra etre explique dans la documentation de deploiement.
- `infra/caddy/Caddyfile`: donne un reverse proxy HTTPS reel avec headers de hardening et reverse proxy vers `app:3000`.
- `infra/scripts/deploy.sh`, `infra/scripts/release-proof.sh`, `infra/scripts/smoke-test-https.sh`, `infra/scripts/smoke-authenticated-dashboard.mjs`: constituent deja une base concrete pour documenter deploiement, verification post-deploiement et diagnostic.
- `infra/scripts/backup.sh` et `infra/scripts/restore.sh`: constituent la base reelle des chapitres sauvegarde/restauration.
- `infra/systemd/coach-restore-drill.service` et `infra/systemd/coach-restore-drill.timer`: fournissent des artefacts d'exploitation a integrer dans la documentation maintenance.
- `docs/operations/*.md` et `docs/security/phase-1-baseline.md`: documentation existante a harmoniser plutot qu'a ignorer.

### Established Patterns
- Le projet suit une architecture Next.js App Router avec separation nette entre `src/app`, `src/server`, `src/lib`, `prisma`, `infra`, `docs` et `scripts`.
- Les frontieres de donnees sont fortement typees via Zod, Prisma et des contrats partages.
- L'exploitation est deja pensee autour de scripts shell explicites, d'un deploiement VPS pragmatique, d'une base PostgreSQL, et d'un reverse proxy Caddy.
- La verification de release repose sur des commandes deterministes (`typecheck`, `test`, `build`, `release:proof`) plutot que sur une plateforme CI complexe.

### Integration Points
- L'analyse technique devra couvrir les routes App Router, les DAL `src/server/dal/*`, les services `src/server/services/*`, les contrats `src/lib/*`, la couche Prisma et les scripts d'infrastructure.
- Le guide VPS devra articuler ensemble `docker-compose.yml`, `infra/caddy/Caddyfile`, les scripts `infra/scripts/*`, et les documents de `docs/operations/`.
- La documentation environnement devra s'appuyer sur les variables visibles dans `docker-compose.yml`, les scripts d'exploitation et les modules de configuration serveur.

</code_context>

<deferred>
## Deferred Ideas

None — la discussion est restee dans le perimetre de la phase.

</deferred>

---

*Phase: 11-documentation-compl-te-en-fran-ais-et-d-ploiement-vps-ubuntu*
*Context gathered: 2026-03-09*
