# Phase 3: Program Planning and Daily Workout Surface - Research

**Researched:** 2026-03-04  
**Domain:** Weekly program generation, daily workout rendering, safe exercise substitution  
**Confidence:** HIGH

## User Constraints

## Implementation Decisions

### Vue dashboard du jour
- Le bloc prioritaire en haut de page est la **seance du jour**.
- La vue doit etre **compacte avec ouverture de detail** (pas tout le detail affiche en permanence).
- S'il n'y a pas de seance aujourd'hui, afficher la **prochaine seance planifiee**.
- L'action principale de la vue est **Commencer seance**.

### Structure du split hebdomadaire
- Le planning fonctionne en **fenetre glissante sur 7 jours** (pas force a la semaine calendaire).
- Le systeme propose un **ordre recommande**, mais l'utilisateur garde le **choix du jour reel** d'execution.
- Le split reste **stable avec ajustements legers**.
- La continuite multi-semaines est importante: les exercices de base ne doivent pas changer brutalement d'une semaine a l'autre.
- La logique doit rester compatible avec d'autres pratiques sportives (running/velo) via un rappel d'auto-regulation, sans bloquer l'utilisateur.

### Prescription par exercice
- Les repetitions ciblees sont **fixes** (pas de fourchette par defaut).
- L'intensite ciblee est exprimee via **charge uniquement**.
- Les temps de repos sont affiches en **plages recommandees**.
- Pas d'explication longue par exercice: presentation orientee execution.

### Remplacement d'exercice
- Le remplacement se declenche via un **bouton directement sur l'exercice**.
- Presenter un **Top 3** des equivalents proposes.
- Validation d'equivalence en mode **tres strict securite**:
  - respect des limitations
  - respect du materiel disponible
  - pattern de mouvement proche
- Un remplacement valide s'applique a **la seance du jour uniquement**.

### Claude's Discretion
- Le wording exact des libelles et micro-copies sur dashboard/programme.
- Le style visuel fin de la vue compacte (cartes, listes, densite precise).

## Deferred Ideas

- Saisie complete "book de seance" (toutes reps + charges en continu pendant la seance) a traiter en phase 4 Session Logging pour rester dans le perimetre.

## Summary

Phase 3 should be implemented as a deterministic planning/read layer on top of `AthleteProfile`, with strict account scoping and schema-validated API payloads, matching current architecture from phases 1-2. The dashboard should remain server-gated for auth/profile completeness and render a compact, action-first "today workout" surface fed by a dedicated planning API.

To keep continuity and safety, planning logic should be rules-first (no free-form AI decisions in this phase), with a stable exercise template catalog and explicit substitution compatibility matrix. Exercise replacement must be ephemeral per planned day/session (not global program rewrite), and must enforce hard filters for equipment, limitations, and movement pattern.

**Primary recommendation:** Build a small `program` domain (Prisma models + DAL + contract schemas + API routes + dashboard integration) with deterministic generation/substitution functions and strong tests around safety filters and routing states.

## Requirement Mapping (Phase 3)

- `PROG-01`: Generate 7-day sliding split from `AthleteProfile` constraints.
- `PROG-02`: Persist and return per-exercise prescription (`sets`, fixed `reps`, `targetLoad`, `restRange`).
- `PROG-03`: Return strict-safe Top 3 substitutions and apply selection only to current-day planned exercise.
- `DASH-01`: Render one-page dashboard showing today workout (or next planned workout if none today) with primary CTA `Commencer seance`.

## Current Codebase Patterns to Reuse

### API + validation pattern (HIGH)
- Route handlers are dependency-injected and testable as pure functions (`createProfileGetHandler`, `createProfilePutHandler`).
- Payload validation is centralized in `src/lib/*/contracts.ts` with Zod parse functions.
- Errors return explicit HTTP status + JSON `{ error: string }`.

### Auth and account boundary pattern (HIGH)
- Middleware is only UX prefilter; authoritative auth checks happen server-side.
- Session validation uses `validateSessionFromCookies()` and persisted session hash checks.
- Account ownership safeguards exist in `src/server/dal/account-scope.ts`; new data access should remain strictly user-scoped.

### UI/data-fetch pattern (HIGH)
- Private pages currently client-render simple fetch flows (`/api/profile`) with loading states and redirects.
- Dashboard route already contains server-side gate and should remain the entry for `DASH-01`.

### Testing pattern (HIGH)
- Test runner: `tsx --test` using `node:test` + `assert/strict`.
- Strong preference for deterministic in-memory repos and dependency-injected handlers.

## Standard Stack

### Core
- Next.js App Router (`src/app/...`) for page + route handlers.
- Prisma for persistence.
- Zod for contracts.
- `node:test` for unit/integration-style tests.

### For this phase
- Rules-first deterministic planner functions in `src/lib/program/*`.
- Program DAL in `src/server/dal/program.ts` matching existing DAL style.
- New API routes under `src/app/api/program/*`.

## Proposed Data Model (Prisma)

Add normalized program entities, all account-owned by `userId`:

- `ProgramPlan`
  - `id`, `userId`, `status` (`active|archived`), `startDate`, `endDate`, `createdAt`, `updatedAt`
  - unique active-plan rule per user (`userId + status` partial behavior enforced in service)

- `PlannedSession`
  - `id`, `programPlanId`, `userId`, `scheduledDate`, `dayIndex` (0-6), `focusLabel`, `state` (`planned|started|completed|skipped`), timestamps
  - index on `(userId, scheduledDate)` for dashboard lookup

- `PlannedExercise`
  - `id`, `plannedSessionId`, `userId`, `orderIndex`, `exerciseKey`, `displayName`
  - prescription: `sets`, `targetReps` (fixed int), `targetLoad` (string), `restMinSec`, `restMaxSec`
  - substitution metadata: `movementPattern`, `isSubstituted`, `originalExerciseKey`

- `ExerciseCatalog` (seed/static table) and `ExerciseSubstitutionRule`
  - catalog fields for movement pattern, equipment tags, contraindication tags
  - substitution rule fields for `fromExerciseKey`, `toExerciseKey`, `rank`, `strictness`

Implementation note: If static-table seeding is too heavy for this phase, keep catalog/rules as typed constants in `src/lib/program/catalog.ts` and persist only planned output tables.

## Architecture Patterns

### Plan generation flow (`PROG-01`, `PROG-02`)
1. Resolve authenticated session from cookie.
2. Load profile with account scope.
3. Validate profile completeness (reuse `isProfileComplete` behavior expectations).
4. Generate 7-day sliding split deterministically:
   - pick number of sessions from `weeklySessionTarget`
   - assign session days in sliding window
   - select stable base exercises by goal + equipment + limitations
   - derive prescription from simple templates (goal/sessionDuration aware)
5. Persist plan/session/exercises in transaction.
6. Return compact response optimized for dashboard.

### Daily workout read flow (`DASH-01`)
1. Dashboard page gate stays server-side (`login` vs `onboarding` vs `dashboard`).
2. Client/server component fetches `/api/program/today`.
3. If `today` exists: render compact card + expandable details + CTA `Commencer seance`.
4. If not: render `nextPlannedSession` card.

### Exercise replacement flow (`PROG-03`)
1. Request replacement candidates for one planned exercise.
2. Enforce strict filters in this order:
   - limitation safety hard-fail
   - equipment compatibility hard-fail
   - movement pattern compatibility hard-fail
3. Rank and return Top 3.
4. Apply chosen substitution to that planned exercise row only (`isSubstituted=true`, keep `originalExerciseKey`).

## API Surface Recommendation

- `POST /api/program/generate`
  - auth required
  - input optional (`regenerate?: boolean`)
  - output includes generated 7-day sessions + exercises summary

- `GET /api/program/today`
  - auth required
  - output:
    - `todaySession: SessionDTO | null`
    - `nextSession: SessionDTO | null`
    - `primaryAction: "start_workout"`

- `GET /api/program/sessions/:sessionId`
  - auth required + account-scoped ownership
  - output detailed exercises (for expand panel)

- `GET /api/program/exercises/:plannedExerciseId/substitutions`
  - auth required
  - output `candidates: Top3[]`

- `POST /api/program/exercises/:plannedExerciseId/substitute`
  - auth required
  - input `{ replacementExerciseKey: string }`
  - output updated planned exercise

## Contracts and DTOs

Create `src/lib/program/contracts.ts`:
- Zod schemas for session/exercise DTO.
- strict enums for session state, movement patterns, equipment tags.
- parse helpers mirroring `validateProfileInput` style.

Create `src/lib/program/types.ts` for internal planner types (catalog entry, split template, safety flags).

## Don't Hand-Roll

- Do not bypass Zod parsing in API routes.
- Do not trust client-provided `userId`/ownership markers; derive from session.
- Do not implement substitution via fuzzy text matching; use explicit compatibility keys/rules.
- Do not couple middleware cookie presence to authorization logic.

## Common Pitfalls

- Mixing calendar-week semantics with required 7-day sliding window.
- Regeneration replacing base exercises too aggressively (breaks continuity requirement).
- Applying substitution globally instead of current-day only.
- Returning rep ranges when requirement requires fixed target reps.
- Exposing workout details without profile-complete gate path.

## Testing Strategy (Plan-ready)

Add tests in `tests/program/`:

- `planner.test.ts`
  - generates valid count of sessions from `weeklySessionTarget`
  - respects equipment and limitations filters
  - preserves continuity of base exercise set across regeneration

- `program-route.test.ts`
  - unauthorized calls return 401
  - generate route validates payload
  - today route returns fallback next session when no session today

- `substitution.test.ts`
  - candidate list max length 3
  - strict safety filters exclude invalid options
  - applying substitution mutates only targeted planned exercise

- `dashboard-program-surface.test.ts`
  - route state + today/next rendering decisions remain correct

## Suggested Plan Decomposition (for planner)

1. Schema and domain foundation
- Prisma models + migration for plan/session/exercise.
- Program DAL with account-scoped queries.
- Contracts/types for DTO and command payloads.

2. Deterministic planner + generation API
- Implement split generation and prescription templates.
- `POST /api/program/generate` with tests.

3. Daily workout dashboard surface
- `GET /api/program/today`.
- Dashboard compact today/next UI and expandable details.

4. Safe substitution workflow
- Candidate + apply endpoints.
- Strict filter + Top 3 ranking + today-only mutation.
- End-to-end behavior tests.

## Open Decisions for Planning (minimal)

- Whether catalog/substitution rules are persisted in DB now vs typed constants in code for v1 speed.
- Whether dashboard should fetch `today` server-side in page load or client-side after mount (both fit current patterns; server-side improves first paint correctness).

## Confidence by Area

- Existing architecture fit: HIGH
- Prisma data shape recommendation: HIGH
- Deterministic planner and substitution algorithm shape: HIGH
- UI interaction wording/details: MEDIUM (left to discretion by design)

## RESEARCH COMPLETE
