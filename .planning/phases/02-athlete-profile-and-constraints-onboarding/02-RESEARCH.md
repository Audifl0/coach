# Phase 2: Athlete Profile and Constraints Onboarding - Research

**Researched:** 2026-03-04
**Domain:** Next.js + Prisma profile onboarding and account-scoped constraint persistence
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Parcours d'onboarding
- L'onboarding se declenche des la premiere connexion authentifiee si le profil n'est pas complete.
- Le parcours est une page unique avec sections (pas un wizard multi-etapes).
- Les champs critiques sont obligatoires au premier passage; le reste est editable ensuite.
- Apres sauvegarde reussie, l'utilisateur est redirige vers le dashboard.

### Modele des contraintes profil
- Objectif: choix unique parmi trois valeurs (`hypertrophy`, `strength`, `recomposition`).
- Disponibilite: capture via nombre cible de seances par semaine.
- Duree de seance: choix via plages predefinies (pas saisie libre brute).
- Equipement: checklist de categories structurees.

### Capture des limitations physiques
- Format principal: checklist de zones corporelles avec statut douleur/limitation.
- Intensite: echelle simple 0-3 (`none`, `mild`, `moderate`, `severe`).
- Temporalite: distinction explicite temporaire vs chronique.
- En edition, on conserve l'existant et les changements sont explicites (pas de reset implicite).

### Claude's Discretion
- Le wording exact des labels/aides inline.
- L'ordre visuel fin des sections dans la page unique.
- Le niveau exact de feedback UX (messages succes/erreur) tant que les decisions ci-dessus restent respectees.

### Deferred Ideas (OUT OF SCOPE)
Aucune - la discussion est restee dans le perimetre de la phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROF-01 | User can define training goal (hypertrophy, strength, recomposition) during onboarding. | Enforce single enum-like goal field in contracts + persistence; required on first onboarding save. |
| PROF-02 | User can declare constraints (available days, session duration, equipment access). | Model weekly frequency, predefined duration bucket, and structured equipment checklist; validate server-side with Zod. |
| PROF-03 | User can declare physical limitations or pain flags used by recommendation safety checks. | Persist structured pain/limitation records with severity + temporality and query-safe shape for later safety logic. |
| PROF-04 | User can update profile constraints at any time. | Provide account-scoped read/update endpoint + profile page form with explicit merge semantics (no implicit resets). |
</phase_requirements>

## Summary

Phase 2 should be implemented as an account-scoped profile domain with one authoritative server contract and one reusable client form flow: first-run onboarding and later profile edits must hit the same validation/persistence rules. The project already has strong conventions for this: Zod parsing at boundaries, Prisma for storage, strict account ownership checks in DAL helpers, and explicit status/error responses in API handlers.

The biggest planning risk is shape drift between UI payloads, validation schema, and DB fields for constraints/limitations. Avoid this by defining shared profile contracts first (goal, schedule, duration bucket, equipment categories, limitation records), then implementing a single persistence service used by both onboarding completion and profile edit endpoints.

**Primary recommendation:** Plan Phase 2 around a single `athlete-profile` domain module (contracts + DAL + API + UI reuse), and treat onboarding gating as routing logic only, not a separate data model.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 16.1.0 | Route handlers + server/private pages + redirects | Already established for auth APIs/private dashboard flow; minimizes architectural churn |
| Prisma ORM | 7.4.0 | Schema/migrations + account-owned profile persistence | Existing source of truth for user/session data and migration workflow |
| Zod | 4.1.12 | Runtime validation for API payloads/session context | Existing contract pattern in auth (`validate*Input`, schema parsing) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React | 19.2.0 | Single-page onboarding form sections + edit form state | Client form interactions and pending/error UX |
| Node test runner (`node:test` via `tsx --test`) | tsx 4.21.0 | Unit/integration-style tests for contracts/routes/helpers | Verify profile validation, account isolation, and update semantics |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Prisma enums/typed tables for constrained fields | JSON-only free-form profile blob | Faster initially but degrades queryability/safety checks and invites payload drift |
| Single shared onboarding/edit contract | Separate onboarding contract and edit contract | Can optimize UX differences, but increases divergence and maintenance risk |

**Installation:**
```bash
pnpm install
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/profile/contracts.ts          # zod schemas + types for profile payloads
├── server/dal/profile.ts             # prisma profile read/write with account scoping
├── app/api/profile/route.ts          # GET/PUT profile endpoints
├── app/(private)/onboarding/page.tsx # first-run profile completion page
└── app/(private)/profile/page.tsx    # later editable profile page
```

### Pattern 1: Contract-First Server Validation
**What:** Parse/validate payloads at API boundary with Zod, then pass typed objects inward.
**When to use:** Every profile write endpoint (onboarding submit + later edits).
**Example:**
```typescript
// Source pattern: src/lib/auth/contracts.ts + src/app/api/auth/login/route.ts
const parsed = profileInputSchema.parse(payload);
await profileService.upsert(parsed, accountScope);
```

### Pattern 2: Account-Scoped DAL Writes
**What:** Resolve authenticated user scope first, then enforce `userId` in all reads/writes.
**When to use:** Every profile data access path.
**Example:**
```typescript
// Source pattern: src/server/dal/account-scope.ts
const scope = requireAccountScope(session);
const where = buildAccountScopedWhere(scope);
```

### Pattern 3: Shared Form UX Pattern
**What:** Use client page pattern from login/signup (`pending`, inline error, redirect on success).
**When to use:** Onboarding submit and profile update actions.
**Example:**
```typescript
// Source pattern: src/app/(public)/login/page.tsx
setState({ error: null, pending: true });
const response = await fetch('/api/profile', { method: 'PUT', ... });
```

### Anti-Patterns to Avoid
- **Unscoped profile queries:** Never query/update profile rows without account scope guard.
- **Split validation logic across UI and API:** UI hints are optional; server contract is authoritative.
- **Implicit overwrite on edit:** Do not wipe limitation/equipment fields when omitted in partial updates.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Input validation | Custom manual `if` trees in route handlers | Zod schemas + `parse/safeParse` pattern | Existing codebase standard, better error consistency |
| Ownership enforcement | Ad-hoc `if (userId===...)` everywhere | `requireAccountScope` + `buildAccountScopedWhere` helpers | Centralized, already tested security pattern |
| Session/auth checks | Cookie-presence-only authorization | Existing `validateSessionFromCookies` + server-side gate | Avoids middleware-only security mistakes |

**Key insight:** This phase is mostly data-shape correctness and safe ownership enforcement; reuse proven auth/account guardrails rather than inventing new boundary logic.

## Common Pitfalls

### Pitfall 1: Profile Completion Gate Loops
**What goes wrong:** User gets redirected between dashboard/onboarding due to inconsistent “profile complete” check.
**Why it happens:** Gate based on UI flags instead of persisted canonical fields.
**How to avoid:** Define one server-side completeness predicate tied to required fields.
**Warning signs:** Users with saved profile still seeing onboarding.

### Pitfall 2: Constraint Enum Drift
**What goes wrong:** UI values (`strength`) diverge from DB/API accepted values.
**Why it happens:** Constants duplicated across client/server layers.
**How to avoid:** Export shared constants/types from profile contract module.
**Warning signs:** 400 validation errors after harmless UI changes.

### Pitfall 3: Implicit Data Loss on Edit
**What goes wrong:** Updating one section clears equipment/limitations unexpectedly.
**Why it happens:** Full-object replacement with sparse payloads.
**How to avoid:** Use explicit merge/patch semantics and test unchanged fields remain.
**Warning signs:** Existing profile flags disappear after minor edits.

### Pitfall 4: Non-Queryable Limitation Shape
**What goes wrong:** Phase 5 safety logic cannot reliably read pain flags.
**Why it happens:** Storing opaque free text or inconsistent JSON objects.
**How to avoid:** Persist structured records (`zone`, `severity`, `temporality`) with constrained values.
**Warning signs:** Complex runtime parsing branches before any safety decision.

## Code Examples

Verified patterns from this codebase:

### Authenticated Route Pattern
```typescript
// Source: src/app/(private)/dashboard/page.tsx
const repository = await buildDefaultSessionGateRepository();
const session = await validateSessionFromCookies(repository);
if (!session) redirect('/login?next=/dashboard');
```

### JSON Route Error Handling Pattern
```typescript
// Source: src/app/api/auth/login/route.ts
let payload: unknown;
try { payload = await request.json(); }
catch { return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 }); }
```

### Account Isolation Pattern
```typescript
// Source: src/server/dal/account-scope.ts
const scope = requireAccountScope(session);
const where = buildAccountScopedWhere(scope, { userId: scope.userId });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Middleware-only private-route protection | Middleware as UX prefilter + authoritative server session checks | Phase 1 (2026-03-04) | Phase 2 onboarding/profile protection should follow same layered model |
| Ad-hoc auth payload checks | Zod contract parsing in auth domain | Phase 1 (2026-03-04) | Profile domain should adopt same contract-first standard |

**Deprecated/outdated:**
- Cookie-presence-only authorization as security boundary.
- Unstructured account access checks outside shared DAL helpers.

## Open Questions

1. **Persistence shape for equipment and limitations in Prisma**
   - What we know: Needs structured/queryable fields for future safety checks.
   - What's unclear: Whether to normalize into tables now vs constrained JSON columns.
   - Recommendation: Decide in planning based on Phase 3-5 query needs; default to normalized/minimally relational if unsure.

2. **Exact onboarding completion predicate**
   - What we know: Critical fields required on first pass; editable later.
   - What's unclear: Whether “limitations omitted” means explicit `none` vs incomplete profile.
   - Recommendation: Encode explicit defaults (`none`) to avoid ambiguous null-state.

3. **Duration bucket taxonomy**
   - What we know: Predefined ranges required (no free-form duration).
   - What's unclear: Final set of allowed buckets.
   - Recommendation: Lock discrete buckets in contracts before UI implementation to prevent migration churn.

## Sources

### Primary (HIGH confidence)
- `.planning/phases/02-athlete-profile-and-constraints-onboarding/02-CONTEXT.md` - locked decisions and scope constraints
- `.planning/REQUIREMENTS.md` - PROF-01..PROF-04 requirement definitions
- `.planning/ROADMAP.md` - phase boundary and success criteria
- `src/lib/auth/contracts.ts` - contract-first validation pattern
- `src/server/dal/account-scope.ts` - account isolation helpers
- `src/app/api/auth/login/route.ts` / `src/app/api/auth/signup/route.ts` / `src/app/api/auth/logout/route.ts` - API error and persistence patterns
- `src/app/(public)/login/page.tsx` / `src/app/(public)/signup/page.tsx` - form UX/pending/error patterns
- `src/app/(private)/dashboard/page.tsx` / `src/lib/auth/session-gate.ts` / `src/middleware.ts` - auth gate layering pattern
- `prisma/schema.prisma` / `prisma/migrations/0001_init_auth/migration.sql` / `prisma.config.ts` - data model and migration conventions
- `tests/auth/*.test.ts` / `tests/security/account-isolation.test.ts` - testing style and security invariants

### Secondary (MEDIUM confidence)
- None required; recommendations are derived from repository conventions and locked phase decisions.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - directly evidenced by current dependencies and implemented auth phase.
- Architecture: HIGH - patterns already in production code and tests.
- Pitfalls: MEDIUM-HIGH - inferred from existing patterns plus known onboarding data-shape risks.

**Research date:** 2026-03-04
**Valid until:** 2026-04-03 (or until stack/requirements change)
