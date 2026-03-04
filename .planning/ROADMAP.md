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

## Phase 6: Trends and Operational Reliability

**Goal:** Finalize decision-support trends and production recovery readiness.

**Requirements:** DASH-02, PLAT-02

**Success Criteria (observable):**
- Dashboard displays recent volume/intensity/adherence trends from session data.
- Backup and restore runbook is validated by a successful restore drill on VPS data.

## Requirement Coverage

## Execution Progress

| Phase | Plans Completed | Total Plans | Status | Last Updated |
|-------|------------------|-------------|--------|--------------|
| 01 - Platform Foundation, Security, and Authentication | 7/7 | 7 | Complete | 2026-03-04 |
| 02 - Athlete Profile and Constraints Onboarding | 4/4 | 4 | Complete | 2026-03-04 |
| 03 - Program Planning and Daily Workout Surface | 4/4 | 4 | Complete | 2026-03-04 |
| 04 - Session Logging and History | 4/4 | Complete   | 2026-03-04 | 2026-03-04 |

- Total v1 requirements: 26
- Mapped to phases: 26
- Unmapped: 0
- Multi-phase assignments: 0
