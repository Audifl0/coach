# Requirements: Coach Virtuel Musculation IA

**Defined:** 2026-03-04
**Core Value:** Fournir un coaching musculation personnalisé, sûr et adaptatif au quotidien, sans perdre la simplicité d'usage.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication

- [ ] **AUTH-01**: User can create a personal account with username and password.
- [ ] **AUTH-02**: User can sign in and keep a persistent session across browser refresh.
- [ ] **AUTH-03**: User can recover account access through a manual admin password reset flow.

### Athlete Profile

- [ ] **PROF-01**: User can define training goal (hypertrophy, strength, recomposition) during onboarding.
- [ ] **PROF-02**: User can declare constraints (available days, session duration, equipment access).
- [ ] **PROF-03**: User can declare physical limitations or pain flags used by recommendation safety checks.
- [ ] **PROF-04**: User can update profile constraints at any time.

### Program Planning

- [ ] **PROG-01**: User can generate a weekly training split adapted to profile constraints.
- [ ] **PROG-02**: User can view per-exercise prescription (sets, reps, target load/intensity, rest).
- [ ] **PROG-03**: User can replace an exercise with a safe equivalent from substitution rules.

### Session Logging

- [ ] **LOG-01**: User can log completed sets with weight, reps, and perceived effort (RPE/RIR).
- [ ] **LOG-02**: User can mark an exercise as skipped and provide a reason.
- [ ] **LOG-03**: User can submit post-session readiness/fatigue feedback.
- [ ] **LOG-04**: User can review recent session history.

### Adaptation & Coaching

- [ ] **ADAP-01**: User can receive next-session recommendation (progress, hold, deload, or substitution) based on latest logs.
- [ ] **ADAP-02**: User can see an explicit reason for each recommended change.
- [ ] **ADAP-03**: User must confirm high-impact recommendation changes before they are applied.

### Safety Guardrails

- [ ] **SAFE-01**: User cannot receive recommendations exceeding configured conservative progression bounds.
- [ ] **SAFE-02**: User receives warning when recommendation conflicts with declared limitation/pain flags.
- [ ] **SAFE-03**: User falls back to conservative default plan when recommendation confidence is insufficient.

### Dashboard

- [ ] **DASH-01**: User can view today's planned workout and next actions on a single dashboard page.
- [ ] **DASH-02**: User can view trend summaries (volume/intensity/adherence) over recent sessions.
- [ ] **DASH-03**: User can view upcoming session forecast after adaptation.

### Deployment & Reliability

- [x] **PLAT-01**: User can access the web app on a VPS-hosted HTTPS endpoint.
- [ ] **PLAT-02**: User data is backed up and can be restored in case of failure.
- [x] **PLAT-03**: User-related sensitive data is protected in transit and at rest.

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Coaching

- **COCH-01**: User can receive mesocycle/periodization block transition suggestions.
- **COCH-02**: User can see confidence scoring with multiple alternative recommendation paths.
- **COCH-03**: User benefits from long-term pattern memory (travel/equipment/pain recurrence).

### Nutrition

- **NUTR-01**: User can define nutritional targets (calories/macros) linked to training goals.
- **NUTR-02**: User can track nutrition adherence with coaching feedback.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Social feed, challenges, leaderboards | Not aligned with personal, coaching-first core value for v1 |
| Camera-based form analysis | High complexity and privacy burden for low v1 leverage |
| Fully autonomous plan changes without user confirmation | Contradicts safety-first assisted coaching approach |
| Full monetization stack (subscriptions/payments) | Project is personal and non-commercial in current milestone |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | 1 | Pending |
| AUTH-02 | 1 | Pending |
| AUTH-03 | 1 | Pending |
| PROF-01 | 2 | Pending |
| PROF-02 | 2 | Pending |
| PROF-03 | 2 | Pending |
| PROF-04 | 2 | Pending |
| PROG-01 | 3 | Pending |
| PROG-02 | 3 | Pending |
| PROG-03 | 3 | Pending |
| LOG-01 | 4 | Pending |
| LOG-02 | 4 | Pending |
| LOG-03 | 4 | Pending |
| LOG-04 | 4 | Pending |
| ADAP-01 | 5 | Pending |
| ADAP-02 | 5 | Pending |
| ADAP-03 | 5 | Pending |
| SAFE-01 | 5 | Pending |
| SAFE-02 | 5 | Pending |
| SAFE-03 | 5 | Pending |
| DASH-01 | 3 | Pending |
| DASH-02 | 6 | Pending |
| DASH-03 | 5 | Pending |
| PLAT-01 | 1 | Complete |
| PLAT-02 | 6 | Pending |
| PLAT-03 | 1 | Complete |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0

---
*Requirements defined: 2026-03-04*
*Last updated: 2026-03-04 after roadmap mapping*
