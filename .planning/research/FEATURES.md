# Feature Research

**Domain:** AI virtual bodybuilding coach (web app, personal use)
**Researched:** 2026-03-04
**Confidence:** MEDIUM

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Athlete profile + onboarding (level, goals, injuries/limitations, available days/equipment) | Personalization is baseline expectation for coaching products | MEDIUM | Must capture hard constraints early; required input for all downstream recommendations |
| Program builder (weekly split + exercise selection + sets/reps/rest/load targets) | A bodybuilding coach must produce a structured plan, not generic tips | HIGH | Start with deterministic templates + constraints; AI suggests variants inside guardrails |
| Session logging (planned vs completed, weight/reps/RPE, skipped exercises, notes) | Tracking is foundational in strength apps | MEDIUM | Data quality is critical; keep logging flow frictionless on mobile and desktop |
| Progress dashboard (history, volume/load trends, upcoming session) | Users expect visibility into progress and next action | MEDIUM | Prioritize actionable insights over dense analytics |
| Adaptive next-session recommendations (progression, deload, exercise swap) | "Smart" adaptation is expected from an AI coach | HIGH | Gate recommendations with safety constraints and confidence scoring |
| Safety rails + warnings (fatigue/injury flags, conservative bounds, contraindication checks) | Fitness coaching products are expected to be safe-by-default | MEDIUM | Hard rules before AI output: cap load jumps, reject unsafe exercise selections |
| Explainability for adjustments (why load changed, why deload suggested) | Users need trust to follow recommendations | LOW | Use short reason strings tied to logged metrics |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Hybrid recommendation engine (rule-based safety core + LLM narrative coaching) | Better reliability than LLM-only while keeping coaching conversational | HIGH | Split "decision engine" from "language layer" to make behavior testable |
| Goal-periodization assistant (strength vs hypertrophy blocks with automatic transitions) | Helps beginners/intermediates train with coherent block logic | HIGH | Requires mesocycle state model and block completion criteria |
| Fatigue-aware auto-regulation using RPE/RIR + readiness inputs | Adapts daily load to real recovery, reducing burnout and missed sessions | MEDIUM | Start with simple heuristics; evolve to personalized adaptation curve |
| Personal constraint memory (travel, equipment changes, joint irritation patterns) | Reduces planning friction and improves recommendation relevance over time | MEDIUM | Treat as first-class profile state, not free-text only |
| "Coach confidence" indicator per recommendation | Makes uncertainty explicit and prevents blind trust in low-confidence changes | MEDIUM | Surface confidence + fallback option (maintain last successful prescription) |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time form analysis via camera in V1 | Feels cutting-edge and "AI-native" | High CV complexity, privacy risk, weak reliability without large validation | Manual form checklist + post-set perceived technique rating |
| Fully autonomous plan changes without user confirmation | Seems convenient | Can produce unsafe or surprising changes; harms trust | Assisted mode: explicit "Review and Apply" for major adjustments |
| Social feed/challenges/leaderboards | Common in fitness apps for engagement | Scope explosion, weak alignment with solo coaching value | Lightweight accountability streaks and weekly personal recap |
| Full nutrition/macros planner in V1 | Bodybuilding users often ask for it | Large separate domain with adherence complexity and safety considerations | Track bodyweight trend + optional protein target reminder only |
| Unlimited exercise novelty/randomization | Perceived as preventing boredom | Breaks progression tracking and overload continuity | Controlled swaps with movement-pattern equivalence rules |

## Feature Dependencies

```text
Athlete Profile + Constraints
    └──requires──> Safety Rules Engine
                           └──requires──> Recommendation Policy (progression/deload/swap)

Program Builder
    └──requires──> Exercise Library + Substitution Map

Session Logging
    └──feeds──> Progress Metrics (volume/intensity/adherence/fatigue)
                       └──requires──> Adaptive Recommendation Engine

Adaptive Recommendation Engine
    └──drives──> Next Session Plan + Explanation Layer

Dashboard
    └──requires──> Progress Metrics + Plan State + Recommendation Output

User Confirmation Workflow
    └──gates──> High-Impact Plan Changes
```

### Dependency Notes

- **Program Builder requires Athlete Profile + Constraints:** without hard constraints, generated plans can violate schedule/equipment/injury limits.
- **Adaptive Recommendation Engine requires reliable Session Logging:** weak logging quality directly degrades adaptation quality.
- **Safety Rules Engine wraps Recommendation Policy:** safety invariants must execute before recommendation output is shown.
- **Explanation Layer depends on recommendation provenance:** each adjustment must carry machine-readable "reason codes."
- **User Confirmation Workflow gates high-impact changes:** prevents silent risky plan shifts.

## MVP Definition

### Launch With (v1)

- [ ] Athlete profile + constraints capture — essential for safe personalization
- [ ] Program builder with template-driven weekly split — core coaching output
- [ ] Session logging (exercise, load, reps, RPE, completion) — required feedback loop
- [ ] Adaptive recommendations for next session (progress/hold/deload/swap) — core AI value
- [ ] Safety rails with conservative progression bounds — trust and risk control
- [ ] Web dashboard (today plan, recent history, next actions) — daily usability
- [ ] VPS-ready deployment + backup/restore basics — operational requirement from project constraints

### Add After Validation (v1.x)

- [ ] Periodized block planning (mesocycle transitions) — add once base adherence and outcomes are stable
- [ ] Confidence scoring UI + fallback plans — add after recommendation accuracy baseline is measured
- [ ] Constraint memory refinement (travel/injury pattern learning) — add once enough user history accumulates

### Future Consideration (v2+)

- [ ] Nutrition planning module — separate high-complexity domain
- [ ] Camera-based technique analysis — only after validated model and privacy posture
- [ ] Social/community systems — only if solo-coach value is already strong

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Athlete profile + constraints | HIGH | MEDIUM | P1 |
| Program builder | HIGH | HIGH | P1 |
| Session logging | HIGH | MEDIUM | P1 |
| Adaptive recommendations | HIGH | HIGH | P1 |
| Safety rails + confirmation flow | HIGH | MEDIUM | P1 |
| Dashboard (action-focused) | MEDIUM | MEDIUM | P1 |
| Periodized block planning | MEDIUM | HIGH | P2 |
| Confidence scoring UI | MEDIUM | MEDIUM | P2 |
| Nutrition module | MEDIUM | HIGH | P3 |
| Social/challenges | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Fitbod | Strong | Our Approach |
|---------|--------|--------|--------------|
| Program generation | Adaptive workouts based on muscle recovery and equipment | Minimal planning; primarily logging-focused | Safety-first personalized plans with explicit rationale |
| Logging UX | Built-in logging with guided sessions | Very strong, fast logging workflow | Logging UX inspired by tracker simplicity, plus adaptation inputs (RPE/fatigue) |
| Adaptation | Automatic adjustments and substitutions | Mostly manual progression by user | Assisted recommendations with user confirmation for major changes |
| Coaching explanation | Limited transparency in many AI-like recommendations | Not a coaching engine | Explicit "why changed" per recommendation + confidence level |
| Scope focus | Broad fitness use cases | Tracking-first tool | Narrow focus on beginner/intermediate bodybuilding coaching quality |

## Sources

- HHS Physical Activity Guidelines for Americans, 2nd edition: https://health.gov/our-work/nutrition-physical-activity/physical-activity-guidelines/current-guidelines
- WHO Guidelines on physical activity and sedentary behaviour: https://www.who.int/publications/i/item/9789240015128
- Fitbod product site (feature positioning): https://fitbod.me/
- Strong app product site (tracking-focused positioning): https://strong.app/
- Freeletics product positioning (AI coach framing): https://www.freeletics.com/
- ACSM position stand (progression models in resistance training): https://pubmed.ncbi.nlm.nih.gov/19204579/
- Review context for autoregulation in resistance training (RPE/RIR concepts): https://pubmed.ncbi.nlm.nih.gov/27737688/

---
*Feature research for: AI virtual bodybuilding coach*
*Researched: 2026-03-04*
