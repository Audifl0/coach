# Coach - README FR

Portail de lecture francais pour comprendre rapidement le produit, son perimetre v1, et savoir quel document ouvrir selon votre besoin.

## Coach en bref

Coach est une application web de coaching musculation personnalise qui couvre:

- authentification et espace prive,
- onboarding profil athlete,
- generation de programme d'entrainement,
- seance du jour et journalisation d'execution,
- recommandations adaptatives avec garde-fous de securite,
- tendances de progression,
- exploitation VPS avec scripts de deploiement, preuve de release et reprise.

## Fonctionnalites v1

- `Auth`: inscription, connexion, deconnexion, session persistante.
- `Profil`: questionnaire et validation de completude.
- `Programme`: generation du plan actif puis consultation "today/next".
- `Execution`: sets, skip, notes, duree, completion de seance.
- `Adaptation`: proposition, confirmation/rejet, fallback conservateur.
- `Tendances`: synthese 7j/30j/90j et drilldown par exercice.
- `Operations`: `deploy.sh`, `release:proof`, backup/restore, restore drill.

## Stack reel (repo-first)

- Frontend/serveur web: Next.js + React + TypeScript
- Persistance: PostgreSQL + Prisma
- Deploiement: Docker Compose (`app` + `db` + `caddy`)
- Reverse proxy HTTPS: Caddy
- Verification ops: scripts `infra/scripts/*` + runbooks `docs/operations/*`

## Documentation a lire selon le besoin

| Besoin | Ouvrir |
| --- | --- |
| Comprendre architecture, flux et modules | `DOCUMENTATION_TECHNIQUE_FR.md` |
| Comprendre le worker corpus continu | `GUIDE_WORKER_CORPUS_CONTINU_FR.md` |
| Explorer la structure du depot | `ARBORESCENCE_COMMENTEE_FR.md` |
| Installer/deployer sur VPS Ubuntu | `GUIDE_INSTALLATION_VPS_UBUNTU_FR.md` |
| Exploiter, maintenir, diagnostiquer | `GUIDE_EXPLOITATION_MAINTENANCE_FR.md` |
| Construire/valider `.env.production` | `CONFIGURATION_ENVIRONNEMENT_FR.md` |
| Piloter un deploiement/release pas-a-pas | `DEPLOIEMENT_CHECKLIST_FR.md` |

Terminologie harmonisee de la phase 11:
- "guide" = document explicatif detaille;
- "checklist" = controle d'execution court;
- "portail" = entree de navigation (ce README).

## Parcours de lecture recommande

1. `README_FR.md` (ce portail)
2. `DOCUMENTATION_TECHNIQUE_FR.md`
3. `GUIDE_WORKER_CORPUS_CONTINU_FR.md`
4. `CONFIGURATION_ENVIRONNEMENT_FR.md`
5. `GUIDE_INSTALLATION_VPS_UBUNTU_FR.md`
6. `DEPLOIEMENT_CHECKLIST_FR.md`
7. `GUIDE_EXPLOITATION_MAINTENANCE_FR.md`
8. `ARBORESCENCE_COMMENTEE_FR.md` (navigation code)

## Rappels importants

- Ce README reste volontairement synthetique: les procedures detaillees sont dans les guides cibles.
- Le chemin canonique de deploiement est celui du depot: Docker Compose + Caddy + scripts `infra/scripts`.
- La preuve de release attend un smoke authentifie (`OPS_SMOKE_*`) avec donnees metier valides.

## Hypotheses et limites

- Hypothese: l'exploitation production suit `infra/scripts/deploy.sh` et `infra/scripts/release-proof.sh`.
- Limite: le depot ne fournit pas de bootstrap automatique du compte smoke; sa preparation reste une action operateur.
- Hypothese: la documentation est maintenue en mode repo-first et doit etre alignee avec les scripts/version courante.
