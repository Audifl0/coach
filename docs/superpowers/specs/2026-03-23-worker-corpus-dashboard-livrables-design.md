# Worker Corpus Dashboard — Vue Livrables d'abord et simplification

**Date:** 2026-03-23
**Statut:** Proposé et validé en discussion
**Objectif:** Simplifier le dashboard worker corpus et ajouter une section concrète montrant les livrables produits par le worker.

## Contexte

Le dashboard actuel expose correctement la supervision technique du worker corpus, mais il reste orienté état interne : files, distributions d'états, backlog, supervision documentaire et doctrinale. Pour un usage quotidien, cette structure répond mal à une question plus directe :

- qu'a produit concrètement le worker ?

Le besoin exprimé est double :

1. voir les **livrables concrets** du worker ;
2. **simplifier** le dashboard pour réduire la charge visuelle et hiérarchiser l'information par valeur produite plutôt que par mécanique interne.

## Direction retenue

Le dashboard devient une page à **deux vues** :

- **Livrables** *(vue par défaut)*
- **Supervision** *(vue secondaire)*

La vue par défaut cesse d'être un mur de cartes de supervision. Elle devient une vue de lecture produit centrée sur :

- ce qui a été généré,
- ce qui est exploitable,
- ce qui est en cours,
- ce qui bloque encore.

La vue Supervision conserve la lecture technique, mais allégée et reléguée derrière cette vue principale.

---

## Vue 1 — Livrables

### Bloc 1 — Livrables produits

Bloc principal de la page.

Il doit exposer, à partir du snapshot actif si disponible :

1. **Doctrine publiée**
   - 3 à 5 principes actifs ou récemment révisés
   - formulation courte
   - niveau de confiance
   - limites / conditions compactes
   - questions sources
   - date de publication ou révision

2. **Questions consolidées**
   - 3 à 5 questions notables
   - label
   - couverture
   - statut de publication
   - nombre d'études liées
   - contradictions ouvertes ou non
   - mini résumé

3. **Études structurées récentes**
   - 3 à 5 study cards / extractions récentes
   - titre
   - type d'étude
   - topic principal
   - extraction source (`abstract` / `full-text`)
   - takeaway court
   - date / snapshot

4. **Artefacts générés**
   - booklet
   - knowledge bible
   - validated synthesis
   - run report
   - snapshot actif

Cette zone doit montrer des **objets lisibles**. Les compteurs seuls ne suffisent pas.

### Bloc 2 — Snapshot / run source

Bloc compact de provenance :

- snapshot actif
- run source
- date de génération / promotion
- statut global
- sévérité compacte
- raisons de quality gate si pertinentes

Le but est de relier les livrables à leur source sans forcer l'utilisateur à ouvrir les panneaux détaillés.

### Bloc 3 — Activité en cours

Bloc compact pour l'état live :

- état du worker
- stage courant
- item courant
- message live
- heartbeat récent / stale
- métriques très simples (queue / documents / questions / doctrine)

Ce bloc remplace la dispersion actuelle entre plusieurs cartes proches.

### Bloc 4 — Reste à traiter / blocages

Bloc court de pilotage :

- backlog résumé
- raisons de no-progress
- contradictions bloquantes
- questions encore faibles / immatures

Ce bloc n'est pas une vue ops complète. C'est un résumé orienté action.

---

## Vue 2 — Supervision

La vue secondaire conserve la supervision détaillée :

- live run détaillé
- workflow queues
- distribution documentaire
- maturité des questions
- révisions doctrine
- journal de recherche compact

Cette vue peut largement réutiliser les composants et services existants, avec un allègement visuel si nécessaire.

---

## Simplifications retenues

### Ce qui sort de la vue principale

Les éléments suivants quittent la vue par défaut et passent dans Supervision :

- détail complet des queues
- distribution complète des états documentaires
- journal de recherche détaillé
- répétition des KPI backlog / workflow / documents / questions / doctrine

### Ce qui est fusionné

1. **worker status + live run** → une carte unique d'activité en cours
2. **backlog + workflow summary** → une carte unique de blocages / reste à traiter
3. **publication + library detail partiel** → absorbés dans la section livrables

### Règle de hiérarchie

Le premier écran doit répondre d'abord à :

1. qu'a produit le worker ?
2. est-ce utile / lisible ?
3. sur quoi travaille-t-il maintenant ?
4. qu'est-ce qui bloque encore ?

Il ne doit pas commencer par la mécanique interne.

---

## Données serveur

### Réutilisation

Les services suivants fournissent déjà la majorité de la matière :

- `loadWorkerCorpusOverview`
- `loadWorkerCorpusSupervision`
- `getWorkerCorpusLibraryDetail`
- `loadWorkerCorpusLiveRun`
- `getWorkerCorpusBacklog`

### Nouveau service recommandé

Créer un agrégateur dédié pour la vue livrables, par exemple :

- `loadWorkerCorpusDeliverables(...)`

Responsabilités :

- charger le snapshot actif / fallback snapshot utile
- extraire les principes doctrine récents / actifs
- sélectionner les questions consolidées notables
- sélectionner les study extractions récentes
- exposer les artefacts présents
- produire un payload déjà hiérarchisé pour le client

But : garder la composition métier côté serveur et éviter un client React trop intelligent.

---

## Composants

### À créer

- `worker-corpus-deliverables-panel.tsx`
- `worker-corpus-deliverable-list.tsx`
- `worker-corpus-activity-card.tsx`
- `worker-corpus-blockers-card.tsx`
- un switch simple `Livrables | Supervision`

### À conserver

- shell de page
- `run-detail-panel`
- `snapshot-detail-panel`

### À déplacer dans la vue Supervision

- panneaux queues / documents / questions / doctrine / journal dans leur forme détaillée actuelle

---

## Comportement des cas vides

### Pas de doctrine publiée

La vue Livrables ne doit pas sembler vide. Elle retombe sur :

- questions consolidées,
- study extractions récentes,
- artefacts présents,
- snapshot actif si disponible.

### Pas de snapshot actif

Message clair orienté produit :

- le worker n'a pas encore publié de livrable exploitable.

Éviter un faux vide technique opaque.

---

## Critères de réussite

Le redesign est réussi si :

1. la vue par défaut montre immédiatement des **livrables concrets** ;
2. un utilisateur comprend en quelques secondes ce qui a été produit ;
3. la supervision technique détaillée reste disponible sans encombrer le premier écran ;
4. le dashboard reste utile même quand aucune doctrine n'est encore publiée ;
5. la hiérarchie d'information passe de **mécanique d'abord** à **sorties d'abord**.

---

## Approche d'implémentation recommandée

1. créer le payload serveur dédié à la vue livrables ;
2. introduire un switch `Livrables | Supervision` ;
3. faire de Livrables la vue par défaut ;
4. déplacer la majorité des panneaux détaillés dans Supervision ;
5. conserver les drilldowns existants (run / snapshot) ;
6. vérifier les fallbacks sans doctrine et sans snapshot.
