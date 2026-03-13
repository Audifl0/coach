# Roadmap: Coach Virtuel Musculation IA

**Created:** 2026-03-04
**Scope:** v1 only (26 requirements)
**Principles:** safety-first coaching, deterministic guardrails, pragmatic VPS delivery

## Phase 1: Platform Foundation, Security, and Authentication

**Goal:** Deliver a secure VPS-hosted app foundation with complete username/password account lifecycle.

**Requirements:** AUTH-01, AUTH-02, AUTH-03, PLAT-01, PLAT-03

**Success Criteria (observable):**
- New user can create an account via username/password and reach an authenticated area.
- Authenticated session survives browser refresh and standard revisit flow.
- Manual admin reset flow can restore account access and allow login with a new password.
- Application is reachable on a VPS HTTPS endpoint with valid TLS.
- Sensitive user data is encrypted in transit and protected at rest per configured controls.

## Phase 2: Athlete Profile and Constraints Onboarding

**Goal:** Capture all profile inputs required for safe personalized programming.

**Requirements:** PROF-01, PROF-02, PROF-03, PROF-04

**Success Criteria (observable):**
- Onboarding captures training goal (hypertrophy, strength, recomposition).
- User can set schedule/equipment/session-duration constraints.
- User can record limitation or pain flags that are persisted and queryable.
- User can edit profile constraints later and changes are reflected in profile state.

## Phase 3: Program Planning and Daily Workout Surface

**Goal:** Generate actionable weekly programming and present today's planned workout.

**Requirements:** PROG-01, PROG-02, PROG-03, DASH-01

**Success Criteria (observable):**
- Weekly split generation uses profile constraints and produces valid training days.
- Each planned exercise shows sets, reps, intensity/load target, and rest guidance.
- Exercise replacement returns only approved safe equivalents.
- Dashboard home shows today's workout and next action in a single view.

## Phase 4: Session Logging and History

**Goal:** Make workout completion tracking reliable and fast for daily adherence.

**Requirements:** LOG-01, LOG-02, LOG-03, LOG-04

**Success Criteria (observable):**
- User can log performed sets with weight, reps, and RPE/RIR.
- User can skip an exercise with a required reason captured in session data.
- User can submit post-session readiness/fatigue feedback.
- User can review recent session history with logged performance details.

## Phase 5: Adaptive Coaching and Safety Guardrails

**Goal:** Produce conservative, explainable next-session adjustments with user control.

**Requirements:** ADAP-01, ADAP-02, ADAP-03, SAFE-01, SAFE-02, SAFE-03, DASH-03

**Success Criteria (observable):**
- System proposes next-session action (progress/hold/deload/substitution) from latest logs.
- Each recommendation includes explicit, user-visible reasoning.
- High-impact changes require explicit user confirmation before application.
- Recommendations never exceed configured conservative progression bounds.
- Low-confidence or limitation-conflicting cases trigger warning/fallback conservative plan and dashboard forecast reflects applied outcome.

### Phase 05.1: LLM provider réel: OpenAI/Anthropic + env model/key + structured output strict + tests SAFE-03 (INSERTED)

**Goal:** Brancher un provider LLM reel (OpenAI principal + Anthropic fallback) avec sortie structuree stricte et fallback SAFE-03 deterministic.
**Requirements**: ADAP-01, ADAP-02, ADAP-03, SAFE-03
**Depends on:** Phase 5
**Plans:** 4/4 plans complete

Plans:
- [x] 05.1-01 - Provider contracts/schema/env gate
- [x] 05.1-02 - OpenAI primary + Anthropic fallback runtime
- [ ] 05.1-03 - Service wiring + integration tests SAFE-03

### Phase 05.2: Pipeline web autonome corpus scientifique: veille, synthèse, validation continue (INSERTED)

**Goal:** Mettre en place un pipeline web autonome hebdomadaire qui collecte, synthétise et valide le corpus scientifique, puis publie atomiquement un snapshot actif consommable par le moteur adaptatif.
**Requirements**: ADAP-01, ADAP-02, SAFE-02, SAFE-03
**Depends on:** Phase 5
**Plans:** 3/3 plans complete

Plans:
- [x] 05.2-01 - Contracts/config boundary (whitelist + freshness + synthesis contract)
- [x] 05.2-02 - Ingestion connectors + stage runner + synthesis candidate
- [x] 05.2-03 - Quality gate + atomic publish/rollback + runtime active snapshot + cron ops

## Phase 6: Trends and Operational Reliability

**Goal:** Finalize decision-support trends and production recovery readiness.

**Requirements:** DASH-02, PLAT-02
**Plans:** 4 plans

Plans:
- [x] 06-01-PLAN.md - Trends contracts + DAL aggregation + authenticated trends APIs
- [x] 06-02-PLAN.md - Dashboard trends block + 7/30/90 toggles + exercise drilldown
- [x] 06-03-PLAN.md - Restore drill automation + systemd cadence + incident runbook
- [x] 06-04-PLAN.md - Trend toggle parity fix + regression coverage for return-to-30d behavior

**Success Criteria (observable):**
- Dashboard displays recent volume/intensity/adherence trends from session data.
- Backup and restore runbook is validated by a successful restore drill on VPS data.

### Phase 7: Audit technique avancé et stabilisation complète de l'application

**Goal:** Produire un audit technique exhaustif, evidence-based, et pre-production de toute l'application, puis s'arreter a un checkpoint de validation utilisateur avant toute remediations.
**Requirements**: AUTH-01, AUTH-02, AUTH-03, PROF-01, PROF-02, PROF-03, PROF-04, PROG-01, PROG-02, PROG-03, LOG-01, LOG-02, LOG-03, LOG-04, ADAP-01, ADAP-02, ADAP-03, SAFE-01, SAFE-02, SAFE-03, DASH-01, DASH-02, DASH-03, PLAT-01, PLAT-02, PLAT-03
**Depends on:** Phase 6
**Plans:** 6/6 plans complete

Plans:
- [x] 07-01-PLAN.md - Audit inventory, architecture map, and requirement traceability baseline
- [x] 07-02-PLAN.md - Static analysis and maintainability audit
- [x] 07-03-PLAN.md - Functional flow and data integrity audit
- [x] 07-04-PLAN.md - Security and secrets audit
- [x] 07-05-PLAN.md - Performance, scalability, and concurrency audit
- [x] 07-06-PLAN.md - Test and operational readiness synthesis plus mandatory user validation checkpoint (approved; no remediation started)

## Requirement Coverage

## Execution Progress

| Phase | Plans Completed | Total Plans | Status | Last Updated |
|-------|------------------|-------------|--------|--------------|
| 01 - Platform Foundation, Security, and Authentication | 7/7 | 7 | Complete | 2026-03-04 |
| 02 - Athlete Profile and Constraints Onboarding | 4/4 | 4 | Complete | 2026-03-04 |
| 03 - Program Planning and Daily Workout Surface | 4/4 | 4 | Complete | 2026-03-04 |
| 04 - Session Logging and History | 5/5 | 5 | Complete | 2026-03-04 |
| 05 - Adaptive Coaching and Safety Guardrails | 5/5 | 5 | Complete | 2026-03-05 |
| 05.1 - LLM provider réel + structured output + SAFE-03 tests | 4/4 | Complete    | 2026-03-05 | 2026-03-05 |
| 05.2 - Pipeline web autonome corpus scientifique | 3/3 | Complete    | 2026-03-05 | 2026-03-05 |
| 06 - Trends and Operational Reliability | 4/4 | Complete   | 2026-03-06 | 2026-03-05 |
| 07 - Audit technique avance et stabilisation complete de l'application | 6/6 | Complete   | 2026-03-06 | 2026-03-06 |
| 08 - Release blockers and regression restoration | 6/6 | Complete   | 2026-03-07 |
| 09 - Security, runtime, and release-proof stabilization | 6/6 | Complete   | 2026-03-09 |

- Total v1 requirements: 26
- Mapped to phases: 26
- Unmapped: 0
- Multi-phase assignments: 4

### Phase 8: Release blockers and regression restoration

**Goal:** Traiter tous les blockers P0/P1 qui empêchent une release crédible après l'audit de phase 07.
**Requirements**: AUTH-01, AUTH-02, ADAP-01, ADAP-02, ADAP-03, SAFE-03, PLAT-01, PLAT-03
**Depends on:** Phase 7
**Plans:** 6/6 plans complete

Plans:
- [x] 08-01-PLAN.md - Prisma client refresh plus middleware-safe auth import split and focused auth regression rerun
- [x] 08-02-PLAN.md - Dashboard/profile/provider typecheck restoration across the bounded RB-01 clusters
- [x] 08-03-PLAN.md - Production env file repository and Docker build-context guardrails
- [x] 08-04-PLAN.md - Focused auth throttling and abuse-proof verification
- [x] 08-05-PLAN.md - Adaptive lifecycle and evidence restoration plus final phase gates
- [x] 08-06-PLAN.md - Next.js static generation worker crash diagnosis and minimal build-path remediation

### Phase 9: Security, runtime, and release-proof stabilization

**Goal:** Stabiliser les flux critiques, la resilience runtime, et la preuve de release apres la levee des blockers.
**Requirements**: PROG-01, PROG-02, LOG-01, LOG-02, LOG-03, LOG-04, ADAP-01, ADAP-03, SAFE-03, DASH-01, DASH-02, DASH-03, PLAT-02
**Depends on:** Phase 8
**Plans:** 6/6 plans complete

Plans:
- [x] 09-01-PLAN.md - Dashboard trust removal and explicit today/trends degraded states
- [x] 09-02-PLAN.md - Persistence hardening for active-plan, session logging, and adaptive transitions
- [x] 09-03-PLAN.md - Release-proof script and operator evidence runbook
- [x] 09-04-PLAN.md - UTC session selection, archived history drilldown, and workout-resume parity
- [x] 09-05-PLAN.md - Env contract, authenticated smoke, and structured critical-failure logging
- [ ] 09-06-PLAN.md - Gap closure for release-entry TypeScript blockers inside existing adaptive and authenticated-smoke/release-proof surfaces

### Phase 10: Maintainability cleanup and operational hardening

**Goal:** Fermer la dette de maintainability et le hardening ops restant une fois la release stabilisee.
**Requirements**: AUTH-03, PLAT-01, PLAT-02, PLAT-03
**Depends on:** Phase 9
**Plans:** 3/3 plans complete

Plans:
- [x] TBD (run /gsd:plan-phase 10 to break down) (completed 2026-03-09)

### Phase 11: Documentation complète en français et déploiement VPS Ubuntu

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 10
**Plans:** 4/4 plans complete

Plans:
- [x] TBD (run /gsd:plan-phase 11 to break down) (completed 2026-03-10)

### Phase 12: Worker corpus continu

**Goal:** Construire un worker IA continu qui recherche, agrege, synthese et publie un corpus scientifique sport/musculation afin d'alimenter automatiquement la knowledge bible consommee par la generation hybride de programmes.
**Requirements**: PROG-01, PROG-02, SAFE-03
**Depends on:** Phase 11
**Plans:** 4/4 plans complete

Plans:
- [x] 12-01-PLAN.md - Worker runtime continu, lease/heartbeat et orchestration idempotente
- [x] 12-02-PLAN.md - Decouverte borne, ingestion incremental et dedup du corpus scientifique
- [x] 12-03-PLAN.md - Curation IA, bible publiee, manifest/diff et gouvernance de promotion
- [x] 12-04-PLAN.md - Integration aval, observabilite hybride et verification des fallbacks

**Success Criteria (observable):**
- Un worker peut executer un cycle de recherche/synthese/publication sans corrompre le snapshot actif du corpus.
- La knowledge bible publiee expose principes et sources exploitables par le generateur hybride de programmes.
- La generation hybride peut consommer le corpus publie avec provenance explicite des principes/sources retenus.
- En cas de corpus indisponible, incomplet ou invalide, le flux degrade proprement vers un comportement prudent et deterministic.

### Phase 13: Moteur de synthese IA distant du corpus scientifique

**Goal:** Remplacer la synthese templatee du worker corpus par un vrai moteur de synthese base sur un modele distant, avec extraction structuree, provenance explicite, quality gates stricts et fallback deterministic si le provider est indisponible ou la sortie invalide.
**Requirements**: PROG-01, PROG-02, SAFE-03
**Depends on:** Phase 12
**Plans:** 4/4 plans complete

Plans:
- [x] 13-01-PLAN.md - Socle de synthese distante OpenAI-only, schemas stricts et erreurs deterministes
- [x] 13-02-PLAN.md - Synthese en deux temps, artefact intermediaire valide et consolidation thematique
- [x] 13-03-PLAN.md - Quality gates enrichis, strict publish blocking et run-report operateur
- [x] 13-04-PLAN.md - Curation finale, compatibilite runtime et verification PROG-01/PROG-02/SAFE-03

**Success Criteria (observable):**
- Le worker produit des principes et justifications issus d'une synthese par modele distant plutot que de blueprints statiques.
- Chaque principe publie reste relie a des sources et extraits traceables exploitables pour audit.
- Une sortie modele invalide, incomplete ou contradictoire ne peut pas promouvoir un snapshot actif.
- En cas d'indisponibilite fournisseur ou de depassement budget/timeout, le pipeline degrade sans casser la generation hybride.

### Phase 14: Dashboard web de suivi temps reel du worker corpus

**Goal:** Construire un dashboard web d'observabilite du worker corpus pour suivre en temps reel les runs, leases, snapshots, deltas, erreurs, freshness et etat de publication de la knowledge bible.
**Requirements**: DASH-02, PLAT-02, SAFE-03
**Depends on:** Phase 13
**Plans:** 4/4 plans complete

Plans:
- [x] 14-01-PLAN.md - Socle serveur de lecture des artefacts worker, projections dashboard et contrats partages
- [x] 14-02-PLAN.md - Overview SSR authentifiee avec cartes de statut, publication active et runs recents
- [x] 14-03-PLAN.md - Drilldowns runs/snapshots, routes detail authifiees et inspection diff/publication
- [x] 14-04-PLAN.md - Polling borne, regressions auth/degraded paths et documentation operateur du dashboard

**Success Criteria (observable):**
- Un operateur peut visualiser l'etat courant du worker, du lease et du dernier heartbeat sans lire les fichiers bruts.
- Le dashboard expose le dernier run, les stages, les compteurs d'ingestion, les motifs d'echec et l'etat du snapshot actif.
- Les deltas entre snapshots et la freshness de la knowledge bible sont consultables depuis le web.
- Les degradations critiques du worker sont visibles rapidement et distinguent clairement fallback, echec et succes partiel.

### Phase 15: Qualite scientifique du worker corpus

**Goal:** Renforcer fortement la qualite scientifique du worker corpus en ameliorant la discovery, le ranking des evidences, l'extraction structuree par etude et les quality gates de couverture/diversite avant publication.
**Requirements**: PROG-01, PROG-02, SAFE-02, SAFE-03
**Depends on:** Phase 14
**Plans:** 4/4 plans complete

Plans:
- [x] 15-01-PLAN.md - Discovery taxonomique bornee, coverage targets et telemetry de gaps
- [x] 15-02-PLAN.md - Ranking scientifique explicable, priorisation des records et motifs de declassement
- [x] 15-03-PLAN.md - Extraction structuree par etude, artefact intermediaire et consolidation enrichie
- [x] 15-04-PLAN.md - Quality gates couverture/diversite/solidite, publish blocking et reverification runtime

**Success Criteria (observable):**
- Le worker couvre plus largement et plus finement les themes sport/musculation pertinents sans se limiter a quelques seeds fixes.
- Les snapshots publies privilegient des evidences mieux classees, mieux contextualisees et mieux reliees aux principes retenus.
- La synthese s'appuie sur une extraction structuree par etude ou lot avant consolidation finale, avec traces d'exclusion explicites.
- Un snapshot scientifiquement pauvre, peu diversifie ou insuffisamment couvert ne peut pas etre promu vers la bible active.

### Phase 16: Bootstrap profond du worker corpus pour bâtir une bibliothèque scientifique large depuis zéro

**Goal:** Transformer le worker corpus actuel en un sous-systeme capable de construire une bibliotheque scientifique large depuis zero sur plusieurs runs, avec backfill profond, reprise apres interruption, staging d'evidences, extraction structuree, quality gates progressifs et publication sure d'un snapshot actif exploitable par le runtime.
**Requirements**: PROG-01, PROG-02, SAFE-02, SAFE-03, DASH-02, PLAT-02
**Depends on:** Phase 15
**Plans:** 4/5 plans executed

Plans:
- [x] 16-01-PLAN.md - Contrats bootstrap, etat persistant, mode split bootstrap versus refresh et surfaces de reprise
- [x] 16-02-PLAN.md - Backfill profond multi-sources, pagination/cursors, file de travail et budgets de collecte
- [x] 16-03-PLAN.md - Staging documentaire, acquisition abstract/full-text, extraction structuree et artefacts auditable a grande echelle
- [x] 16-04-PLAN.md - Ranking/triage de masse, quality gates progressifs et publication incrementale d'une bibliotheque utile
- [ ] 16-05-PLAN.md - Dashboard operateur longue duree, controles de bootstrap et verification end-to-end sur runs reprisables

**Success Criteria (observable):**
- Un operateur peut lancer un bootstrap from scratch qui construit le corpus sur plusieurs runs sans repartir de zero ni perdre la progression acquise.
- Le worker separe explicitement les modes `bootstrap` et `refresh`, avec etat persistant, files de travail et reprise saine apres interruption, timeout ou redeploiement.
- Les evidences collectees passent par un staging auditable (metadata, abstract/full-text, extraction structuree, motifs de rejet) avant toute synthese ou publication runtime.
- La publication reste sure: seuls des snapshots gates, suffisamment couverts et provenances sont promus vers la bible active, tandis que le backlog bootstrap peut continuer en arriere-plan.
- Le dashboard expose progression, queue depth, curseurs, budgets, throughput, blocages et etat de publication pour un bootstrap qui dure des heures, jours ou semaines.
