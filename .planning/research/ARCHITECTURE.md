# Architecture Research

**Domain:** Assistant de coaching musculation IA (personnel, web + VPS)
**Researched:** 2026-03-04
**Confidence:** MEDIUM

## Recommended Architecture

V1 should use a **modular monolith** with clear internal boundaries plus a **background worker** for AI recommendation generation and plan adaptation. This keeps VPS operations simple while avoiding tight coupling between tracking logic, recommendation logic, and UI delivery.

### System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                          Presentation Layer                          │
├──────────────────────────────────────────────────────────────────────┤
│  Web Dashboard (SPA/SSR)                                             │
│  - Planning view  - Daily workout log  - Progress & readiness view   │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ HTTPS
┌───────────────────────────────▼──────────────────────────────────────┐
│                             API Layer                                │
├──────────────────────────────────────────────────────────────────────┤
│  BFF/API (Auth, Validation, Rate limits, DTO mapping, RBAC)          │
└───────────────┬───────────────────────────┬──────────────────────────┘
                │                           │
┌───────────────▼──────────────┐   ┌────────▼──────────────────────────┐
│         Domain Layer         │   │        Orchestration Layer        │
├──────────────────────────────┤   ├───────────────────────────────────┤
│ Program Service              │   │ Recommendation Orchestrator       │
│ Workout Log Service          │   │ Safety Rules Engine               │
│ Progress Analytics Service   │   │ Adaptation Pipeline               │
└───────────────┬──────────────┘   └───────────────┬───────────────────┘
                │                                  │ async jobs/events
┌───────────────▼──────────────────────────────────▼────────────────────┐
│                         Data & Infrastructure                          │
├───────────────────────────────────────────────────────────────────────┤
│ PostgreSQL (OLTP) | Redis (cache + queue) | Object storage (exports) │
│ LLM Provider Gateway (single adapter + fallback strategy)             │
│ Observability (structured logs, metrics, audit trail)                 │
└───────────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| Web Dashboard | UI flows: onboarding, planning, daily logging, history | API Layer |
| API/BFF | AuthN/AuthZ, request validation, output shaping, idempotency | Web, Domain, Orchestration |
| Program Service | Program templates, split logic, exercise assignment rules | API, Progress Analytics, DB |
| Workout Log Service | Capture performed sets/reps/load/RPE + notes | API, DB, Events |
| Progress Analytics Service | Compute trends (volume, progression, fatigue signals) | API, Program Service, DB |
| Recommendation Orchestrator | Build context and request AI recommendations safely | Domain services, Safety engine, LLM Gateway |
| Safety Rules Engine | Hard constraints (volume ceilings, deload triggers, contraindications) | Orchestrator, Program Service |
| Adaptation Pipeline (Worker) | Async generation/refresh of next-session recommendations | Queue, LLM Gateway, DB |
| LLM Gateway | Provider abstraction, prompt versioning, retries/timeouts | Orchestrator, Worker |
| Persistence (Postgres/Redis) | Durable data + transient cache/jobs | All backend modules |

## Recommended Project Structure

```text
src/
├── app/                        # API bootstrap, dependency wiring, config
├── modules/
│   ├── auth/                   # Identity, sessions, RBAC policies
│   ├── users/                  # Profile, goals, availability, constraints
│   ├── programs/               # Program generation and lifecycle
│   ├── workouts/               # Session plans and daily execution logs
│   ├── progress/               # Analytics, trend computation, reports
│   └── recommendations/        # AI orchestration + adaptation workflow
├── shared/
│   ├── domain/                 # Shared value objects, domain errors
│   ├── infra/                  # DB, cache, queue, storage adapters
│   ├── llm/                    # Provider clients, prompt templates, guardrails
│   └── telemetry/              # Logging, metrics, tracing, audit
├── worker/                     # Background job processors
├── web/                        # Dashboard frontend
└── tests/                      # Unit, integration, contract, e2e
```

### Structure Rationale

- **`modules/`** keeps business capabilities isolated and testable.
- **`shared/llm`** prevents AI calls from leaking into domain logic.
- **`worker/`** isolates asynchronous adaptation from request latency.
- **`web/`** allows UI evolution without changing backend packaging strategy.

## Data Flow

### Primary Flow: Daily Workout Execution

```text
User logs workout
  -> Web Dashboard validates basic fields
  -> API stores immutable workout entries
  -> Workout Log Service emits "workout.logged"
  -> Progress Analytics updates trend aggregates
  -> Adaptation Pipeline enqueues recommendation refresh
  -> Worker computes next-session recommendation (AI + rules)
  -> Program/Session recommendation stored with explanation
  -> Dashboard shows "next best session" + rationale
```

### Recommendation Safety Flow

```text
Context builder (profile + history + fatigue)
  -> LLM Gateway proposes adaptation
  -> Safety Rules Engine validates proposal
      -> pass: persist recommendation
      -> fail: fallback to deterministic safe adjustment
  -> Audit trail logs inputs, prompt version, decision path
```

### Read Model Flow (Dashboard)

```text
Dashboard query
  -> API/BFF aggregates from programs + workouts + progress + recommendations
  -> Response DTO optimized for UI cards/charts
  -> Redis cache (short TTL) for heavy summary endpoints
```

## Patterns to Follow

### Pattern 1: Modular Monolith with Enforced Internal APIs

**What:** Single deployable backend with strict module interfaces.
**When to use:** Early and mid-stage product with one team and VPS deployment.
**Trade-offs:** Faster delivery and ops simplicity, but requires discipline to avoid coupling.

### Pattern 2: AI as Recommendation, Rules as Authority

**What:** LLM suggests; deterministic safety layer approves or rewrites.
**When to use:** Any training/health-adjacent logic with risk exposure.
**Trade-offs:** Slightly less flexibility than pure AI output, but far better reliability and trust.

### Pattern 3: Async Adaptation Pipeline

**What:** Expensive recommendation refreshes run in background jobs.
**When to use:** Recommendation generation can exceed interactive latency budgets.
**Trade-offs:** Eventual consistency in exchange for predictable API response times.

## Anti-Patterns to Avoid

### Anti-Pattern 1: LLM Calls Inside Request Path for Every Read

**What people do:** Generate recommendations synchronously on each dashboard load.
**Why it is bad:** Slow UX, unstable output, high cost, poor observability.
**Do this instead:** Precompute and cache recommendations; regenerate on relevant events.

### Anti-Pattern 2: Mixing Workout Facts with Derived Analytics in One Table

**What people do:** Store raw session data and rolling indicators together.
**Why it is bad:** Hard to backfill/recompute and easy to corrupt trend logic.
**Do this instead:** Keep immutable workout events; compute derived projections separately.

### Anti-Pattern 3: No Explicit Safety Override Path

**What people do:** Treat LLM output as final plan.
**Why it is bad:** Increases injury-risk exposure and degrades user trust.
**Do this instead:** Mandatory rule validation + deterministic safe fallback + user-visible rationale.

## Suggested Build Order

1. **Foundation + Data Model**
   - Set up backend app, DB schema, migrations, auth, user profile/goals.
   - Define immutable workout log entities and core program entities.

2. **Program Generation (Deterministic First)**
   - Implement baseline program builder without AI.
   - Add plan CRUD and session calendar endpoints.

3. **Daily Tracking + Progress Analytics**
   - Implement workout logging UX/API and derived progress metrics.
   - Deliver dashboard history and trend views.

4. **Recommendation Orchestrator + Safety Engine**
   - Add LLM gateway, prompt versioning, safety constraints.
   - Produce explainable, auditable recommendation objects.

5. **Async Adaptation Worker**
   - Queue/event pipeline on `workout.logged` and fatigue updates.
   - Background adaptation and recommendation refresh lifecycle.

6. **Hardening for VPS Operations**
   - Observability, backups, retry/dead-letter handling, rate limits, cache tuning.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users | Single VPS, single Postgres instance, optional Redis for queue/cache |
| 1k-20k users | Split web/API/worker processes, read replicas, stronger caching |
| 20k+ users | Consider service extraction (recommendations), dedicated queue and DB partitioning |

### First Bottlenecks and Mitigations

1. **Hot path reads on dashboard summaries**: add read-optimized aggregates and Redis TTL cache.
2. **AI job bursts after many workout logs**: queue prioritization, per-user dedupe, worker autoscaling.
3. **Analytics recomputation costs**: incremental aggregates instead of full-history scans.

## Sources

- Project constraints and scope from [PROJECT.md](/home/flo/projects/coach/.planning/PROJECT.md)
- Architecture template from [ARCHITECTURE.md](/home/flo/.codex/get-shit-done/templates/research-project/ARCHITECTURE.md)
- Research role guidance from [gsd-project-researcher.md](/home/flo/.codex/agents/gsd-project-researcher.md)

---
*Architecture research for: Coach Virtuel Musculation IA*
*Researched: 2026-03-04*
