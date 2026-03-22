# Worker Dashboard Control Extension — Start / Pause (Soft Pause)

**Date:** 2026-03-22
**Statut:** Approuvé en discussion, formalisé pour revue
**Approche:** Extension légère du dashboard worker avec contrôle opérateur simple

## Objectif

Ajouter au dashboard worker un contrôle opérateur minimal permettant de :

1. voir si le worker est en mode `running` ou `paused`,
2. déclencher facilement un démarrage manuel,
3. activer une **pause douce** qui empêche les nouveaux runs sans interrompre un run en cours,
4. utiliser explicitement **`/opt/coach/.env`** comme env-file de référence côté VPS/Docker.

Le but n'est pas de transformer le dashboard en cockpit complet. Le but est d'ajouter un **pilotage léger, sûr, lisible**.

---

## Portée fonctionnelle

### Actions ajoutées

- **Démarrer**
- **Mettre en pause**

### Comportement attendu

#### Démarrer
- met le worker en mode `running`,
- tente un lancement manuel d'un run si aucun run n'est déjà actif,
- si un run est déjà actif, ne crée pas de doublon et retourne un état de type `already-running`.

#### Mettre en pause
- met le worker en mode `paused`,
- n'interrompt pas le run en cours,
- bloque les prochains démarrages tant qu'on ne revient pas à `running`.

### Type de pause retenu

**Pause douce uniquement**.

Pas de stop brutal dans cette phase.

---

## Design technique

### Fichier de contrôle persistant

Ajouter un fichier de contrôle sous le root worker, par exemple :

- `.planning/knowledge/adaptive-coaching/control.json`

Contenu minimal :

```json
{
  "mode": "running",
  "updatedAt": "2026-03-22T20:00:00.000Z",
  "reason": null,
  "lastCommand": "start"
}
```

Champs :
- `mode`: `running | paused`
- `updatedAt`
- `reason`: optionnel
- `lastCommand`: `start | pause`

### Garde d'entrée côté worker

Au début d'un lancement worker :
- lire `control.json`,
- si `mode === "paused"`, ne pas démarrer un nouveau run,
- retourner un statut explicite, par exemple `paused-by-operator`.

Un run déjà actif continue jusqu'à sa fin.

### API privée du dashboard

Ajouter une route privée de contrôle, avec deux actions bornées :
- `POST /api/worker-corpus/control/start`
- `POST /api/worker-corpus/control/pause`

Ou une route unique avec action explicite, selon le pattern existant.

Cette couche :
- écrit l'état de contrôle,
- déclenche un run si nécessaire pour `start`,
- n'exécute aucune autre commande libre.

### Intégration Docker / VPS

Toutes les commandes déclenchées depuis cette surface doivent utiliser :

- `docker compose --env-file /opt/coach/.env ...`

**et non** `.env.production`.

Cette contrainte fait partie de la spec.

---

## Dashboard UI

### Bloc de contrôle opérateur

Ajouter en haut du dashboard worker un bloc avec :
- état opérateur (`En marche` / `En pause`),
- bouton `Démarrer`,
- bouton `Mettre en pause`.

### Règles d'affichage

#### Si mode `running`
- badge visible `En marche`,
- bouton `Mettre en pause` actif,
- bouton `Démarrer` désactivé si un run est déjà actif, ou utilisable uniquement comme relance si inactif.

#### Si mode `paused`
- badge visible `En pause`,
- message clair :
  - `Pause active — aucun nouveau run ne démarrera tant que le mode n'est pas remis sur En marche`,
- bouton `Démarrer` actif,
- bouton `Mettre en pause` désactivé.

### Retour utilisateur

Après action :
- retour court de succès/échec,
- actualisation immédiate de l'état affiché,
- pas de système complexe de jobs UI dans cette phase.

---

## Sécurité et garde-fous

### Garde-fous retenus

- route strictement privée,
- actions bornées (`start`, `pause`) uniquement,
- pas d'édition libre de commande shell,
- pas d'arrêt brutal,
- pas de contrôle avancé multi-worker,
- pas d'orchestration manuelle des files de recherche dans cette phase.

### Non-objectifs

Cette extension ne couvre pas :
- stop immédiat,
- priorisation manuelle,
- requeue manuel,
- édition des questions scientifiques,
- validation/rejet manuel de dossiers,
- administration complète du worker depuis l'UI.

---

## Critères de réussite

L'extension est considérée correcte si :

1. Le dashboard montre clairement `running` vs `paused`.
2. Un opérateur peut mettre le worker en pause douce depuis l'UI.
3. Un opérateur peut relancer facilement le worker depuis l'UI.
4. Un run déjà actif n'est pas interrompu par `pause`.
5. Un démarrage ne lance pas de doublon si un run est déjà actif.
6. Les commandes opérateur passent explicitement par **`/opt/coach/.env`**.
7. Les erreurs sont visibles côté UI sans exposer de détails sensibles.

---

## Direction d'implémentation recommandée

Introduire cette extension comme une couche petite et séparée :
- un contrat `control.json`,
- un petit service serveur de contrôle,
- une garde au démarrage du worker,
- un bloc dashboard dédié.

L'objectif est d'améliorer la maniabilité sans complexifier le cœur scientifique du worker.
