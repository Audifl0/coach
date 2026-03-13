---
phase: 16-bootstrap-profond-du-worker-corpus-pour-b-tir-une-biblioth-que-scientifique-large-depuis-z-ro
plan: 16-05
subsystem: dashboard
tags: [bootstrap, dashboard, control-center, campaign, routes]
requires:
  - phase: 16-01
    provides: contrats bootstrap et etat persistant
  - phase: 16-02
    provides: queue de collecte, curseurs et telemetrie de reprise
  - phase: 16-03
    provides: staging documentaire et artefacts auditable
  - phase: 16-04
    provides: publication progressive et statuts runtime `progressing`
provides:
  - projections dashboard de campagne bootstrap longue duree
  - controles operateur pause/reprise/reset scope au-dela du simple start
  - surface UI lisible pour backlog, budgets, curseurs et reprise
affects: [worker-corpus, dashboard, bootstrap, ops]
tech-stack:
  added: []
  patterns: [campaign control center, bootstrap-aware dashboard, route-level operator controls]
key-files:
  created:
    - .planning/phases/16-bootstrap-profond-du-worker-corpus-pour-b-tir-une-biblioth-que-scientifique-large-depuis-z-ro/16-05-SUMMARY.md
  modified:
    - src/lib/program/contracts.ts
    - src/server/dashboard/worker-control.ts
    - src/server/dashboard/worker-dashboard.ts
    - src/app/api/worker-corpus/control/route-handlers.ts
    - src/app/api/worker-corpus/control/route.ts
    - src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client.tsx
    - src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard.module.css
    - tests/program/worker-corpus-dashboard.test.ts
    - tests/program/worker-corpus-dashboard-routes.test.ts
    - tests/program/worker-corpus-dashboard-page.test.tsx
key-decisions:
  - "Le dashboard n'est plus centre sur le dernier run uniquement: il expose une campagne bootstrap persistante avec backlog, budgets et curseurs."
  - "Le controle operateur supporte `start`, `pause`, `resume` et `reset` pour piloter une campagne multi-jours sans shell."
  - "Le reset scope efface uniquement l'etat bootstrap et les curseurs, sans toucher le snapshot runtime actif deja publie."
patterns-established:
  - "Campaign-aware control plane: la couche controle lit et enrichit l'etat bootstrap avant de l'exposer aux routes et a l'UI."
  - "Progress-first dashboard: la page distingue campagne en cours, campagne paused, blocage et publication active."
requirements-completed: [DASH-02, PLAT-02, SAFE-03]
duration: 35 min
completed: 2026-03-13
---

# Phase 16 Plan 05: Bootstrap Control Center Summary

**Dashboard operateur longue duree avec campagne bootstrap visible, commandes de reprise et diagnostics de backlog**

## Performance

- **Duration:** 35 min
- **Started:** 2026-03-13T08:35:19Z
- **Completed:** 2026-03-13T08:46:16Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Le serveur projette maintenant une vraie campagne bootstrap: backlog complet, curseurs actifs, jobs reprenables et budgets de collecte.
- Les routes de controle supportent `resume` et `reset`, en plus du `start/pause`, pour piloter une campagne longue duree sans shell.
- Le dashboard est redevenu un centre de controle: mode `bootstrap`, cartes de progression, reprise, diagnostics de curseurs et budget operateur.

## Task Commits

Each task was committed atomically:

1. **Task 1: Projeter la campagne bootstrap cote serveur** - `pending`
2. **Task 2: Redessiner l'UI pour un bootstrap longue duree** - `pending`
3. **Task 3: Verifier les scenarii critiques de campagne et de reprise** - `pending`

## Files Created/Modified

- `src/lib/program/contracts.ts` - extension des contrats worker corpus pour campagne enrichie et actions `resume/reset`
- `src/server/dashboard/worker-control.ts` - enrichment de l'etat controle avec campagne, budgets, curseurs et reset scope
- `src/server/dashboard/worker-dashboard.ts` - interpretation `progressing` comme campagne en cours plutot que succes final
- `src/app/api/worker-corpus/control/route-handlers.ts` - support route-level des nouvelles commandes operateur
- `src/app/api/worker-corpus/control/route.ts` - wiring runtime des nouveaux controles
- `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client.tsx` - surface operateur bootstrap avec progression, resume et reset
- `src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard.module.css` - style de control center longue duree
- `tests/program/worker-corpus-dashboard.test.ts` - projection serveur de campagne et curseurs
- `tests/program/worker-corpus-dashboard-routes.test.ts` - couverture route pour `resume/reset`
- `tests/program/worker-corpus-dashboard-page.test.tsx` - couverture de surface bootstrap-aware et panels detail

## Decisions Made

- Une campagne bootstrap incomplete mais productive doit apparaitre comme `running/progressing`, jamais comme un succes terminal trompeur.
- Les budgets exposes au dashboard viennent de la config pipeline effective, ce qui permet a l'operateur de raisonner sans lire les fichiers du repo.
- Le reset scope est volontairement borne aux artefacts bootstrap (`bootstrap-state`, `bootstrap-jobs`, `connector-state`, lease) pour proteger le runtime publie.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test harness] Le test page ne pouvait pas importer le client a cause des CSS modules**
- **Found during:** Task 2/3 verification
- **Issue:** `tsx --test` chargeait directement le module CSS, cassant le rendu statique du client dashboard.
- **Fix:** Le test page stubbe maintenant proprement les imports `.css` avant l'import dynamique du client.
- **Files modified:** `tests/program/worker-corpus-dashboard-page.test.tsx`
- **Verification:** `corepack pnpm test tests/program/worker-corpus-dashboard.test.ts tests/program/worker-corpus-dashboard-routes.test.ts tests/program/worker-corpus-dashboard-page.test.tsx --runInBand`
- **Committed in:** metadata close-out follows implementation commit

---

**Total deviations:** 1 auto-fixed
**Impact on plan:** Aucun scope change. L'auto-fix a seulement rendu la couverture page executable hors runtime Next.

## Issues Encountered

- Les anciens tests page couvraient encore l'ancienne surface a cartes et non le control center bootstrap.
- L'import CSS module du client dashboard devait etre neutralise dans le harness de test pour garder une couverture serveur legere.

## User Setup Required

None.

## Next Phase Readiness

- Phase 16 est complete. Le worker bootstrap peut maintenant etre pilote et interprete depuis le dashboard sans shell.
- La prochaine etape GSD logique est de fermer/archiver le milestone ou d'ouvrir une phase suivante si tu veux pousser le moteur bootstrap plus loin.

## Self-Check: PASSED

- Summary file exists.
- Verification commands passed: dashboard test bundle, keyword scan, and `corepack pnpm build`.
- Le dashboard distingue campagne bootstrap, controle live, publication active et backlog reprenable.
