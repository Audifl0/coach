# Phase 14: Dashboard web de suivi temps reel du worker corpus - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Cette phase ajoute une surface web de supervision du worker corpus et de la knowledge bible publiee. L'objectif est de rendre visible en temps reel l'etat du worker, des runs, des leases, des snapshots et des deltas, sans obliger l'operateur a inspecter les fichiers de sortie manuellement.

Le scope couvre le dashboard web, ses loaders/API, les metriques operateur, l'affichage des erreurs et degradations, ainsi que les vues de detail du corpus publie et de ses evolutions. Cette phase n'a pas pour objectif de refaire le worker lui-meme ni de remplacer les outils shell/runbook existants, mais de fournir une lecture web exploitable au quotidien.

</domain>

<decisions>
## Implementation Decisions

### Operability first
- Le dashboard doit servir d'outil d'exploitation et de diagnostic, pas seulement de vitrine.
- Les signaux critiques doivent etre lisibles rapidement: worker bloque, lease stale, publication en echec, corpus vieux, synthese degradee, provider indisponible.
- Les etats doivent distinguer succes, succes partiel, fallback et echec dur.

### Data sources
- Le dashboard doit s'appuyer d'abord sur les artefacts reels du worker et sur les etats de publication deja produits.
- Les donnees doivent venir du serveur et rester compatibles avec les patterns dashboard/auth deja etablis dans le projet.
- Le temps reel peut etre atteint par polling borne, rafraichissement regulier ou mecanisme equivalent pragmatique; pas besoin d'imposer du websocket si le gain n'est pas justifie.

### UX and scope guardrails
- La surface doit rester orientee signal et investigation: resume d'etat, historique de runs, details de snapshot, diff, erreurs, freshness, provenance agregée.
- Le dashboard ne doit pas devenir une interface d'edition manuelle du corpus dans cette phase.
- Les vues doivent rester authentifiees et coherentes avec le langage visuel actuel de l'application.

### Claude's Discretion
- Decoupage exact entre page resume, vues detail run, vues snapshot et deltas.
- Mecanisme technique de rafraichissement "temps reel" le plus approprie pour le depot.
- Niveau de detail expose pour les erreurs LLM/provider et artefacts de synthese.
- Part de visualisation graphique versus tableaux/logs structurels.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/dashboard/*`: surface applicative deja authentifiee et patterns UI serveur/client deja en place.
- `src/lib/program/contracts.ts`: point de centralisation de contrats UI/shareable a preserver si de nouveaux types dashboard emergent.
- `src/server/services/program-generation.ts` et `program-generation-hybrid.ts`: exposent deja une partie des meta runtime autour de la generation hybride.
- `scripts/adaptive-knowledge/worker-state.ts`: etat de lease/heartbeat du worker a rendre visible.
- `.planning/knowledge/adaptive-coaching/published/*`: snapshots, manifests, diffs et artefacts publies a valoriser dans l'UI.
- `GUIDE_WORKER_CORPUS_CONTINU_FR.md`: base documentaire utile pour calibrer les parcours operateur.

### Established Patterns
- Les surfaces dashboard du projet privilegient des loaders serveur et des contrats typés, avec degradation explicite plutot que silence.
- Les etats d'erreur/degraded ont deja fait l'objet de durcissement dans les phases 08 a 10.
- L'authentification du dashboard est deja un invariant structurel du produit.

### Integration Points
- Il faudra probablement ajouter des loaders/API server-side pour lire l'etat du worker, les rapports de run et les snapshots publies.
- Les artefacts du worker devront peut-etre etre completes pour exposer certains compteurs de facon plus directe a l'UI.
- Les futurs rapports de synthese distante de la phase 13 devront etre visibles ou au moins resumables dans le dashboard.

</code_context>

<specifics>
## Specific Ideas

- Page resume avec statut du worker, dernier heartbeat, dernier run, snapshot actif, age du corpus et indicateurs de sante.
- Vue historique des runs avec duree, stages, volumes, provider utilise, erreurs et issue finale.
- Vue diff de snapshots montrant ajouts, retraits, changements de principes et evolution de freshness.
- Vue detail d'un snapshot pour consulter principes, sources, provenance et metadata de publication.

</specifics>

<deferred>
## Deferred Ideas

- Edition manuelle inline des principes/sources depuis le dashboard.
- Alerting externe complet (email, Discord, PagerDuty) si ce n'est pas deja supporte ailleurs.
- Console multi-workers ou orchestration distribuee complexe.

</deferred>

---
*Phase: 14-dashboard-web-de-suivi-temps-r-el-du-worker-corpus*
*Context gathered: 2026-03-11*
