# Project Research Summary

**Project:** Coach (AI virtual bodybuilding coach)
**Domain:** Personal web app on VPS
**Researched:** 2026-03-04
**Confidence:** MEDIUM-HIGH

## Executive Summary

The research converges on a safety-first AI coaching product: deterministic training logic and guardrails must remain authoritative, while the LLM is used for recommendation synthesis and explanation. The product should launch as a focused bodybuilding coaching workflow, not a broad fitness platform.

For v1, success depends on reliable daily logging, conservative adaptation, and clear rationale for every adjustment. The strongest risk is unsafe or inconsistent recommendations caused by weak data quality or over-trusting raw LLM output. The strategy is to enforce hard constraints, keep adaptation async, and require explicit user confirmation for high-impact plan changes.

## Key Findings

### Stack

Preferred stack is a TypeScript-first modular monolith on a single VPS: Node.js + Next.js + React, PostgreSQL + pgvector, Redis + BullMQ, Prisma, and OpenAI SDK. Infrastructure should stay simple with Docker Compose and Caddy for TLS.

Why this stack: fast delivery, low ops overhead, strong compatibility for AI + web workloads, and a clear path to scale by splitting worker/API roles later without replatforming.

### Table Stakes (Must-Have)

- Athlete profile and constraints onboarding (level, goals, injuries, schedule, equipment).
- Program builder with structured split and prescription targets.
- Session logging (planned vs done, weight/reps/RPE, notes).
- Progress dashboard focused on next action and trends.
- Adaptive next-session recommendation loop.
- Safety rails (progression caps, deload logic, contraindication checks).
- Explainable recommendation output (clear “why changed”).

### Differentiators

- Hybrid engine: deterministic safety/rule core + LLM coaching narrative.
- Fatigue-aware auto-regulation using RPE/RIR and readiness signals.
- Constraint memory (travel/equipment/pain patterns) to improve personalization over time.
- Recommendation confidence indicator with conservative fallback path.
- Periodization assistant (block transitions) as a v1.x upgrade once base loop is stable.

### Architecture Strategy

Use a modular monolith with explicit internal boundaries plus a background worker.

- API/BFF handles auth, validation, DTO shaping, and idempotency.
- Domain modules cover users, programs, workouts, progress, recommendations.
- Orchestration layer runs recommendation pipeline and mandatory safety validation.
- Worker processes async adaptation jobs triggered by workout events.
- Postgres stores immutable workout facts + plan state; Redis handles queue/cache.

Core architectural rule: AI proposes, rules decide.

### Top Pitfalls

1. Over-aggressive progression causing overreaching/injury risk.
- Mitigation: hard progression bounds, deload triggers, conservative defaults.

2. Hallucinated or out-of-scope coaching advice.
- Mitigation: output validators, refusal policy, deterministic fallback.

3. Weak personalization despite AI positioning.
- Mitigation: rich profile/constraints model and explicit substitution logic.

4. Low-quality tracking data degrading recommendations.
- Mitigation: fast logging UX, strict input validation, conservative missing-data behavior.

5. Late security/privacy hardening for health-adjacent data.
- Mitigation: privacy-by-design from phase 1 (minimization, encryption, deletion/export flows).

## Recommendations for v1

1. Ship a narrow, reliable loop first: onboard -> plan -> log -> adapt -> explain.
2. Implement deterministic program and safety rules before advanced LLM behavior.
3. Make adaptation asynchronous and auditable (reason codes, prompt/version trace).
4. Gate major recommendation changes behind explicit user confirmation.
5. Optimize for logging adherence (60-90 second post-session flow).
6. Exclude high-scope items (nutrition planner, social feed, camera form analysis).
7. Include production basics at launch: backups, rate limits, structured logs, secret hygiene.

## Source Docs

- `.planning/research/STACK.md`
- `.planning/research/FEATURES.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`
