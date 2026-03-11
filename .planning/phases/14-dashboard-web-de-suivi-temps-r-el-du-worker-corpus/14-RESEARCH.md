# Phase 14: Dashboard web de suivi temps reel du worker corpus - Research

**Researched:** 2026-03-11
**Domain:** dashboard operateur authentifie pour observabilite du worker corpus et de la knowledge bible publiee
**Confidence:** HIGH

## User Constraints

## Implementation Decisions

### Scope de phase
- La phase doit ajouter une surface web d'exploitation pour le worker corpus, pas un nouvel orchestrateur du worker.
- Le dashboard doit rester authentifie, server-first, et coherer avec les patterns `src/app/(private)/dashboard/*` deja en place.
- Le temps reel doit etre atteint via polling borne et ciblage `cache: 'no-store'`; websocket/SSE ne sont pas necessaires par defaut.
- La surface doit rendre visibles lease, heartbeat, runs, snapshots, publication active, diffs, erreurs et freshness sans lecture manuelle des JSON.

### Sources de verite
- La source primaire du dashboard doit etre les artefacts reels du worker sous `.planning/knowledge/adaptive-coaching`, pas un etat derive en memoire.
- Les pointeurs `active.json` et `rollback.json`, `worker-state.json`, les snapshots `validated/`, ainsi que `run-report.json`, `manifest.json`, `diff.json`, `knowledge-bible.json`, `validated-synthesis.json` et `sources.json` sont le socle d'observabilite.
- Le dashboard doit accepter qu'aucun snapshot actif ne soit commite localement; l'etat "not configured / no snapshot yet" est un etat normal a exposer proprement.

### Alignement exigences
- `DASH-02`: traiter le dashboard worker comme une surface de synthese tendance/etat, avec signaux lisibles et drilldown.
- `PLAT-02`: rendre visible l'etat de publication et le lien avec `active.json` / `rollback.json` pour faciliter backup, restore drill et diagnostic apres incident.
- `SAFE-03`: rendre explicites les chemins de fallback et les degradations, notamment `fallback_baseline`, absence de snapshot actif, synthese distante en echec, quality gate bloquant ou publish refuse.

### Claude's Discretion
- Decoupage exact entre page overview et vues de detail run/snapshot.
- Niveau de densite visuelle entre cartes de statut, tableaux et diff summaries.
- Choix entre route server-rendered unique avec petits composants client de polling ou routes detail dediees supplementaires.

## Summary

Le depot a deja presque toutes les primitives critiques pour cette phase. Cote app, `src/app/(private)/layout.tsx` force deja le segment prive en `dynamic = 'force-dynamic'`, `resolveDashboardAccess()` garantit l'authentification et la redirection onboarding/login, et le dashboard principal assemble des loaders serveur typés (`today-workout`, `adaptive-forecast`, `trends-summary`) qui renvoient des etats `ready/empty/error` sans self-fetch SSR. Cote contrats, `src/lib/program/contracts.ts` centralise les schemas partages utilises entre loaders, routes API et composants.

Cote worker, la matiere premiere est egalement en place. `scripts/adaptive-knowledge/worker-state.ts` expose un contrat stable de lease/heartbeat (`started`, `heartbeat`, `completed`, `failed`, `blocked-by-lease`, `stale`). `refresh-corpus.ts` enchaine acquire/heartbeat/release et `pipeline-run.ts` persiste des artefacts observables et suffisamment riches pour un dashboard operateur: `run-report.json`, `manifest.json`, `diff.json`, `knowledge-bible.json`, `validated-synthesis.json`, `sources.json`, plus les pointeurs atomiques `active.json` et `rollback.json` geres par `publish.ts`. Phase 13 a deja enrichi le `run-report` pour supporter la future surface operateur.

Le vrai enjeu de la phase 14 n'est donc pas de "creer des metriques", mais de normaliser la lecture serveur de ces artefacts, de les projeter dans des contrats UI stables, et d'afficher des etats franchement degrades plutot qu'une fausse apparence de sante. La meilleure approche est un mini sous-systeme `worker dashboard` server-side, parallele aux loaders du dashboard sportif existant, avec polling pragmatique uniquement sur les zones volatiles.

**Primary recommendation:** planifier la phase en quatre axes: contrats/projections serveur du worker, page overview authentifiee, vues de detail run+snapshot, puis refresh client borne et verification des degradations/fallbacks.

## Standard Stack

### Core
| Library / Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | repo current | pages privees + route handlers | Le dashboard existant suit deja ce modele |
| Server loaders + DAL-style projections | repo pattern | lecture SSR server-owned | Evite self-fetch et garde auth/typing au meme endroit |
| Zod | repo current | contrats partages UI/API | Deja central dans `src/lib/program/contracts.ts` |
| Node fs/path JSON reads | stdlib | lecture artefacts worker | Les artefacts sont des fichiers versionnes et atomiques |

### Supporting
| Artifact / Module | Purpose | When to Use |
|---------|---------|-------------|
| `src/app/(private)/dashboard/loaders/*` | Pattern de loaders SSR typés | Base a recopier pour le dashboard worker |
| `src/server/dashboard/program-dashboard.ts` | Etats `ready/empty/error` + degraded logging | Modele direct pour un `worker-dashboard.ts` |
| `src/server/observability/app-logger.ts` | logging allowliste | A etendre prudemment pour `worker_dashboard` |
| `scripts/adaptive-knowledge/worker-state.ts` | lease/heartbeat/source de sante | Carte de statut live |
| `scripts/adaptive-knowledge/pipeline-run.ts` | run artifacts et compteurs | Historique runs, stages, freshness, deltas |
| `scripts/adaptive-knowledge/publish.ts` | publication active/rollback | Etat de publication, restoreability |
| `src/lib/coach/knowledge-bible.ts` | consommateur runtime du snapshot actif | Validation que la surface expose ce que le runtime consomme |
| `src/server/services/program-generation.ts` | expose `meta.mode` + `knowledgeSnapshotId` | Important pour relier worker/fallback runtime |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Polling borne sur APIs detail | websocket/SSE | Complexite infra et auth superieure, peu justifiee ici |
| Lire directement les fichiers depuis composants React | projection serveur centralisee | Sinon duplication, erreurs de parsing et couplage fort |
| Route dashboard unique surchargee | sous-routes detail loader/API | Les details run/snapshot restent plus testables et maintenables |

## Worker Data Sources

| Source | Signal a exposer | Notes |
|--------|-------------------|-------|
| `worker-state.json` | `runId`, `mode`, `status`, `startedAt`, `heartbeatAt`, `leaseExpiresAt`, `message` | Etat live principal |
| `active.json` | snapshot actif, chemin publie, `promotedAt` | Verite du snapshot runtime |
| `rollback.json` | dernier snapshot restaurable | Signal PLAT-02 / recoverability |
| `snapshots/<id>/validated/run-report.json` | stages, succes/echec/skipped, messages operateur | Historique de runs et causes |
| `snapshots/<id>/validated/manifest.json` | `generatedAt`, counts, `sourceDomains`, artifact pointers | Vue snapshot et freshness |
| `snapshots/<id>/validated/diff.json` | deltas entre snapshot precedent et courant | Vue evolution corpus |
| `snapshots/<id>/validated/knowledge-bible.json` | principes/sources publies | Apercu operateur du corpus consomme |
| `snapshots/<id>/validated/validated-synthesis.json` | provenance, contradictions, provider/model metadata | Drilldown synthese distante |
| `snapshots/<id>/validated/sources.json` | discovery plan, records, domains | Drilldown evidence et compteurs reels |
| `src/server/services/program-generation.ts` output meta | `mode`, `knowledgeSnapshotId` | Pont SAFE-03 entre worker et runtime produit |

## Architecture Patterns

### Pattern 1: Projection serveur dediee au worker dashboard
**What:** creer un module du type `src/server/dashboard/worker-dashboard.ts` qui lit les fichiers worker et retourne des unions discriminees `ready | empty | error`.
**When to use:** pour tout chargement overview/detail du dashboard worker.
**Why:** c'est exactement le pattern deja utilise par `program-dashboard.ts`, qui isole parse, fallback et log degrade.
**Recommendation:** ne jamais parser les artefacts directement dans les pages ou composants client.

### Pattern 2: Contrats partages centralises
**What:** introduire dans `src/lib/program/contracts.ts` ou dans un companion module re-exporte des schemas Zod pour `WorkerDashboardOverview`, `WorkerRunDetail`, `WorkerSnapshotDetail`.
**When to use:** entre loaders SSR, route handlers detail et composants client de polling.
**Why:** le depot a deja choisi `contracts.ts` comme frontiere de stabilite shareable.
**Recommendation:** garder des payloads compacts et orientes UI, pas des dumps bruts de JSON worker.

### Pattern 3: Overview SSR + drilldowns API
**What:** rendre la page overview integralement cote serveur, puis charger/refraichir seulement les petits morceaux volatils via API authentifiees.
**When to use:** heartbeat, liste recente de runs, statut snapshot actif.
**Why:** l'overview doit etre visible immediatement au premier paint, mais le heartbeat et l'etat de run changent apres rendu.
**Recommendation:** page SSR initiale, puis polling client 10-30s sur `/api/worker-corpus/status` et eventuellement `/api/worker-corpus/runs?limit=N`.

### Pattern 4: Surface de degradation explicite
**What:** distinguer clairement `empty`, `stale`, `blocked`, `failed`, `fallback`, `partial success`.
**When to use:** partout ou les artefacts sont absents, obsoletes ou incoherents.
**Why:** c'est le prolongement operateur de `SAFE-03`; masquer l'etat reel ferait perdre la capacite de diagnostiquer le fallback prudent.
**Recommendation:** derive des badges/resumes a partir des artefacts, pas a partir d'heuristiques visuelles cote client.

### Pattern 5: Freshness calculee serveur
**What:** calculer cote serveur l'age du heartbeat, l'age du snapshot actif, l'age du dernier run complete et des seuils de stale.
**When to use:** overview et liste runs.
**Why:** evite divergences de timezone et logique dupliquee.
**Recommendation:** renvoyer des dates ISO + quelques derivations UI utiles (`isHeartbeatStale`, `snapshotAgeHours`, `lastRunAgeHours`).

## Reusable UI / Server Patterns

### A reutiliser tel quel
- `resolveDashboardAccess()` pour proteger la surface et reutiliser le flux login/onboarding.
- `dynamic = 'force-dynamic'` deja pose sur `(private)` pour eviter toute mise en cache statique des pages authentifiees.
- Le couple `loaders/*` + `src/server/dashboard/*` pour garder les pages minces.
- Les route handlers de style `createProgramTrendsGetHandler` pour des endpoints auth-check + parse query + `Response.json(...)`.
- Les unions `ready/empty/error` et le degraded logging allowliste de `app-logger.ts`.

### A adapter
- Le pattern client de `TrendsSummaryCard` pour faire du polling `fetch(..., { cache: 'no-store' })` avec etat de chargement/erreur borne.
- Les cartes du dashboard actuel comme structure de presentation: overview cards, drilldown toggle, empty state simple.
- La logique "section order" si le dashboard worker doit masquer certains blocs lorsqu'aucun artefact n'existe encore.

### A ajouter
- Un service de lecture d'artefacts worker qui encapsule `fs`, parse JSON, tri des snapshots et guards defensifs.
- Une petite couche de mapping UI qui transforme messages de stage et statuts worker en severites lisibles (`healthy`, `degraded`, `critical`).
- Des sous-routes detail dediees: run detail, snapshot detail, diff detail, plutot qu'un seul mega payload.

## Recommended Architecture

### Routes
- Page SSR overview: `/dashboard/worker-corpus`
- APIs detail/status authentifiees:
  - `/api/worker-corpus/status`
  - `/api/worker-corpus/runs`
  - `/api/worker-corpus/runs/[runId]`
  - `/api/worker-corpus/snapshots/[snapshotId]`

### Server modules
- `src/server/dashboard/worker-dashboard.ts`
  - lecture worker-state
  - lecture pointeurs active/rollback
  - resolution des N derniers snapshots/runs
  - derive de freshness / severity
- `src/app/(private)/dashboard/worker-corpus/loaders/*`
  - access
  - overview
  - run detail
  - snapshot detail
- `src/lib/program/contracts.ts` re-export ou companion contract module
  - overview status response
  - run row/detail response
  - snapshot detail response

### Page composition
- Bloc 1: statut live du worker
  - status
  - mode refresh/check
  - dernier heartbeat
  - expiration du lease
  - message courant
- Bloc 2: derniere publication
  - snapshot actif
  - age/freshness
  - source domains
  - principle/evidence counts
  - rollback snapshot present/missing
- Bloc 3: derniers runs
  - runId
  - started/completed
  - stages
  - issue finale
  - compteurs synthese/ingest/publish
- Bloc 4: deltas et erreurs
  - diff courant
  - contradiction / quality gate reasons
  - provider / request metadata resumee
  - fallback impact sur runtime

### Polling strategy
- SSR initial pour tout.
- Polling client uniquement pour:
  - worker status card
  - recent runs list
  - active snapshot freshness badge
- Cadence recommandee:
  - 10s si `status` est `started` ou `heartbeat`
  - 30s sinon
- Ne pas poller les vues detail lourdes par defaut; refresh manuel suffit.

## Risks

### Risk 1: couplage direct aux chemins de fichiers
**Impact:** chaque evolution de structure snapshot casserait la page.
**Mitigation:** centraliser la resolution des chemins dans un seul module serveur avec parse defensif et tests fixtures.

### Risk 2: surfacer trop de JSON brut
**Impact:** UI confuse, payloads volumineux, details peu actionnables.
**Mitigation:** projeter des resumes compacts et garder les artefacts complets pour drilldown/detail.

### Risk 3: faux "temps reel"
**Impact:** l'operateur croit voir du live alors que la page est stale.
**Mitigation:** afficher `updatedAt`, age derive et badge stale; polling seulement sur les zones critiques.

### Risk 4: absence de snapshot ou artefacts partiels
**Impact:** erreurs 500 inutiles en dev/local ou apres incident.
**Mitigation:** traiter l'absence d'artefacts comme `empty` ou `degraded`, jamais comme exception fatale de page.

### Risk 5: oublier le lien avec SAFE-03
**Impact:** le dashboard worker devient purement technique et ne dit pas si le produit tourne en fallback prudent.
**Mitigation:** ajouter au moins un resume de l'impact runtime attendu: snapshot actif absent, publish bloque, dernier run failed, knowledge snapshot potentiellement stale.

### Risk 6: observabilite PLAT-02 superficielle
**Impact:** la surface ne sert pas pendant un restore drill ou un incident de publication.
**Mitigation:** exposer `active.json`, `rollback.json`, `promotedAt`, snapshot ids et signes de restorabilite.

## Validation Strategy

### Contract tests
- Verrouiller les schemas overview/run/snapshot avec fixtures de JSON worker valides, absents, corrompus et partiels.
- Verifier qu'un `worker-state.json` stale ou bloque renvoie un etat degrade non fatal.
- Verifier qu'un snapshot sans `knowledge-bible.json` ou sans `manifest.json` degrade proprement.

### Loader / route tests
- Reproduire le pattern des tests `dashboard-trends-surface` et `program-trends-route`.
- Cas a couvrir:
  - non authentifie => `401` ou redirect login
  - artefacts absents => `empty`
  - run failed + publish blocked => payload detaille et stable
  - active + rollback pointers presents => projection restoreable visible

### UI tests
- Overview SSR affiche les badges critiques sans fetch supplementaire.
- Polling client remplace l'etat status sans casser les autres blocs.
- Les vues detail ne fetchent qu'a l'ouverture ou via navigation explicite.

### Verification manuelle
- Simuler localement:
  - aucun artefact
  - worker en cours (`started`/`heartbeat`)
  - run failed
  - snapshot publie et rollback disponible
- Verifier que la page reste exploitable sans websocket et que les badges stale changent bien avec le temps.

## Anti-Patterns to Avoid

- Lire les artefacts worker directement dans `page.tsx` ou dans des composants client.
- Exposer un seul endpoint "dump all worker files" sans contrat UI stable.
- Confondre "run le plus recent" et "snapshot actif"; un run peut echouer sans changer `active.json`.
- Faire du polling global de toute la page avec `window.location.reload()`.
- Utiliser des websockets avant d'avoir epuisé SSR + polling 10-30s.
- Masquer les erreurs de parse ou les artefacts absents derriere un simple "No data".
- Ajouter une interface d'edition/manipulation manuelle du corpus dans cette phase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth dashboard | Nouveau gate custom | `resolveDashboardAccess()` + segment `(private)` | Le pattern est deja stable |
| Etat SSR/API | Self-fetch depuis la page serveur | loaders serveur + route handlers | Decision explicite depuis phases 08-10 |
| Types UI shareables | Types locaux par composant | Zod contracts centralises | Evite le drift page/API |
| Temps reel | websocket infra sur mesure | polling borne `no-store` | Suffisant et moins fragile |
| Publication state | heuristiques "dernier dossier snapshot" | `active.json` / `rollback.json` | Seule source de verite publiee |

## Common Pitfalls

### Pitfall 1: Dashboard trop technique
**What goes wrong:** on affiche des fichiers et chemins, pas des signaux operateur.
**How to avoid:** transformer les artefacts en statuts orientes action: healthy, stale, blocked, failed, fallback-risk.

### Pitfall 2: Absence de distinction run vs publication
**What goes wrong:** un dernier run rouge fait croire que le runtime est casse alors que le snapshot actif est encore sain.
**How to avoid:** toujours separer "worker live", "dernier run", "snapshot actif".

### Pitfall 3: Polling excessif
**What goes wrong:** bruit reseau, flicker UI, complexite inutile.
**How to avoid:** poller seulement le statut et la liste recente; details lourds en chargement ponctuel.

### Pitfall 4: Ignore corruption/partial writes
**What goes wrong:** un JSON illisible fait tomber toute la page.
**How to avoid:** parse defensif + etats `error`/`degraded` locals, jamais crash total du dashboard.

### Pitfall 5: Oublier le consommateur runtime
**What goes wrong:** on suit joliment le worker, mais on ne sait pas si la generation utilise encore un snapshot valide ou retombe en `fallback_baseline`.
**How to avoid:** relier la vue worker au contrat `knowledgeSnapshotId` / `meta.mode` au moins conceptuellement dans les libelles et les tests.

## Concrete Planning Recommendation

Planifier la phase 14 en 4 plans maximum:

1. **Contrats + projections serveur du worker**
   - Ajouter les schemas shareables overview/run/snapshot.
   - Creer le module serveur de lecture d'artefacts avec derives `stale`, `freshness`, `severity`, `publishState`.
   - Ajouter les tests fixtures pour artefacts absents/partiels/failed/published.

2. **Page overview authentifiee**
   - Ajouter `/dashboard/worker-corpus` ou equivalent dans le segment prive.
   - Reutiliser `resolveDashboardAccess()` et le pattern loaders SSR.
   - Afficher statut worker, snapshot actif, rollback, derniers runs, freshness, errors summary.

3. **APIs detail + drilldowns snapshot/run**
   - Creer les route handlers auth-check pour status/runs/run detail/snapshot detail.
   - Ajouter detail d'un run (stages/messages/provider/gate result) et detail snapshot (manifest/diff/knowledge bible summary).
   - Garder des payloads compacts, pas les artefacts bruts complets.

4. **Polling pragmatique + verification operateur**
   - Ajouter un petit composant client qui poll le status overview et la liste recente.
   - Tester la cadence adaptee selon worker actif/inactif.
   - Verifier explicitement les chemins critiques `blocked-by-lease`, `failed`, `stale`, `no snapshot`, `publish blocked`, `rollback available`.

**Sequencing recommendation:** commencer par les projections serveur et les contrats. Tant que cette couche n'est pas stable, la page et le polling risquent d'encoder des suppositions fragiles sur les artefacts.
