---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 05
current_phase_name: Adaptive Coaching and Safety Guardrails
current_plan: Not started
status: completed
stopped_at: Completed 05.1-02-PLAN.md
last_updated: "2026-03-05T10:05:01.819Z"
last_activity: 2026-03-05
progress:
  total_phases: 4
  completed_phases: 5
  total_plans: 28
  completed_plans: 27
  percent: 96
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-04)

**Core value:** Fournir un coaching musculation personnalisé, sûr et adaptatif au quotidien, sans perdre la simplicité d'usage.
**Current focus:** Phase 5 - Adaptive Coaching and Safety Guardrails

## Current Position

**Current Phase:** 05
**Current Phase Name:** Adaptive Coaching and Safety Guardrails
**Total Phases:** 4
**Current Plan:** Not started
**Total Plans in Phase:** 5
**Status:** Milestone complete
**Last Activity:** 2026-03-05
**Last Activity Description:** Phase 05 complete
**Progress:** [██████████] 96%

## Performance Metrics

| Plan | Duration | Scope | Files |
|------|----------|-------|-------|
| Phase 05 P01 | 33min | 3 tasks | 6 files |
| Phase 05 P02 | 4 min | 3 tasks | 5 files |
| Phase 05 P03 | 5min | 3 tasks | 5 files |
| Phase 05 P04 | 5min | 3 tasks | 6 files |
| Phase 05.1 P01 | 5min | 2 tasks | 9 files |
| Phase 05.1 P02 | 10 min | 3 tasks | 12 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 1]: Auth model is username + password with low-friction personal usage focus
- [Phase 1]: AI coaching strategy locked as hybrid rules + LLM, safety-first
- [Phase 01]: Pinned stable foundation dependencies with minimal scripts for deterministic installs.
- [Phase 01]: Adopted Prisma 7 config-driven datasource via prisma.config.ts.
- [Phase 01]: Baseline env contract includes DATABASE_URL, BETTER_AUTH_SECRET, and BETTER_AUTH_URL.
- [Phase 01-platform-foundation-security-and-authentication]: Use Caddy automatic TLS for HTTPS termination and forwarding
- [Phase 01-platform-foundation-security-and-authentication]: Use encrypted PostgreSQL dumps (OpenSSL) as baseline at-rest backup control
- [Phase 01-platform-foundation-security-and-authentication]: Use Prisma User+Session schema with unique username and sessionTokenHash for concurrent long-lived sessions.
- [Phase 01-platform-foundation-security-and-authentication]: Enforce auth boundary validation through Zod parse helpers (signup/login/session context).
- [Phase 01-platform-foundation-security-and-authentication]: Require authenticated account scope through requireAccountScope before protected DAL queries.
- [Phase 01-platform-foundation-security-and-authentication]: Return a generic invalid-credentials message for all login auth failures.
- [Phase 01-platform-foundation-security-and-authentication]: Issue 30-day secure httpOnly sameSite=lax session cookies on successful login.
- [Phase 01-platform-foundation-security-and-authentication]: Manual reset CLI uses generic completion messaging to avoid username enumeration.
- [Phase 01-platform-foundation-security-and-authentication]: DAL account isolation now enforces ownership assertions and scoped query filters.
- [Phase 01-platform-foundation-security-and-authentication]: Dashboard middleware gate redirects anonymous dashboard requests to /login with next path preservation.
- [Phase 01-platform-foundation-security-and-authentication]: Logout endpoint revokes only the active session token hash and clears local session cookie idempotently.
- [Phase 01-platform-foundation-security-and-authentication]: Task 2 followed TDD red/green with explicit multi-session lifecycle tests for persistence and current-session logout.
- [Phase 01-platform-foundation-security-and-authentication]: Private route authorization now depends on persisted active session state, never raw cookie presence.
- [Phase 01-platform-foundation-security-and-authentication]: Middleware remains a lightweight UX prefilter; authoritative auth checks run in server-side private route logic.
- [Phase 01-platform-foundation-security-and-authentication]: Current-session logout revocation semantics are verified by lifecycle tests against concurrent session behavior.
- [Phase 03-program-planning-and-daily-workout-surface]: Program persistence uses explicit active/archived status with DAL-driven active-plan replacement
- [Phase 03-program-planning-and-daily-workout-surface]: Program DAL methods enforce ownership strictly from authenticated session scope, never caller userId
- [Phase 03-program-planning-and-daily-workout-surface]: Substitution compatibility metadata remains deterministic in code catalog for Phase 3 foundation
- [Phase 03-program-planning-and-daily-workout-surface]: Planner generation is deterministic and rules-first, without LLM calls.
- [Phase 03-program-planning-and-daily-workout-surface]: Generation endpoint derives account scope exclusively from authenticated session, never from payload.
- [Phase 03-program-planning-and-daily-workout-surface]: Substitution eligibility remains deterministic and metadata-driven only (no fuzzy matching).
- [Phase 03-program-planning-and-daily-workout-surface]: Equipment compatibility is strict-all-tags and limitation filtering is hard-fail.
- [Phase 03-program-planning-and-daily-workout-surface]: Apply route enforces today-only semantics before mutation and updates only one planned exercise row.
- [Phase 03]: Dashboard daily workout surface uses today-first then next-session fallback.
- [Phase 03]: Session detail route filters exercise payload by authenticated account ownership before returning prescriptions.
- [Phase 04-session-logging-and-history]: Stored execution logs under existing ProgramPlan->PlannedSession->PlannedExercise ownership to preserve account scoping.
- [Phase 04-session-logging-and-history]: History query parsing is strict: custom requires ordered from/to and preset windows reject explicit date bounds.
- [Phase 04-session-logging-and-history]: History projection outputs are contract-validated via shared parse helpers to prevent route-local shape drift.
- [Phase 04-session-logging-and-history]: Session lifecycle timing invariants are centralized in createSessionLoggingService with injectable now() for deterministic tests.
- [Phase 04-session-logging-and-history]: Program DAL now exposes explicit scoped logging/history primitives (set upsert, skip/revert, completion, correction, history reads).
- [Phase 04-session-logging-and-history]: Session mutation routes enforce ownership using DAL ownership checks and return not-found for cross-account access.
- [Phase 04-session-logging-and-history]: History ranges are resolved server-side from strict period parsing, with custom ranges requiring ordered from/to dates.
- [Phase 04-session-logging-and-history]: Used helper exports in dashboard components to keep interaction behavior deterministic under node:test.
- [Phase 04-session-logging-and-history]: Mounted history card as an independent client panel below today workout to avoid breaking auth/onboarding route behavior.
- [Phase 04-session-logging-and-history]: Drilldown detail reuses /api/program/sessions/:sessionId to avoid introducing a new history-detail endpoint.
- [Phase 04-session-logging-and-history]: Kept auth + not-found masking in route while moving payload shaping to buildSessionDetailProjection.
- [Phase 04-session-logging-and-history]: Expanded ProgramSessionDetailResponse schema to validate enriched execution metadata instead of route-local loose shaping.
- [Phase 05]: SAFE-01 bounds centralized at +/-5% load and +/-2 reps in one policy module to prevent route/UI drift.
- [Phase 05]: SAFE-03 fallback reuses last recommendation only when already within SAFE-01 bounds; otherwise return conservative hold with prudence flag.
- [Phase 05]: Use Prisma enums for adaptive action/status/decision lifecycle to keep persistence and contracts aligned.
- [Phase 05]: Keep DAL not-found behavior masked with account-scoped filters by returning null for missing recommendation reads/transitions.
- [Phase 05]: Record every status transition in append-only AdaptiveRecommendationDecision rows with previous and next status.
- [Phase 05-adaptive-coaching-and-safety-guardrails]: Orchestrator enforces fixed parse->integrity->SAFE-01/02->SAFE-03->status ordering with trace metadata.
- [Phase 05-adaptive-coaching-and-safety-guardrails]: User-facing evidence tags are always derived from local corpus retrieval, not model-provided tags.
- [Phase 05-adaptive-coaching-and-safety-guardrails]: Adaptation API parse-validates service payloads before response to prevent contract drift.
- [Phase 05-adaptive-coaching-and-safety-guardrails]: Confirmation validity enforces pending status, unexpired window, and match to current next session.
- [Phase 05-adaptive-coaching-and-safety-guardrails]: Reject flow records user rejection then applies a conservative hold recommendation as applied fallback.
- [Phase 05-adaptive-coaching-and-safety-guardrails]: Dashboard banner waits for server success before showing resolved state.
- [Phase 05]: Forecast prudence is explicit prevision_prudente state derived from warning/fallback flags, not implicit UI inference.
- [Phase 05]: Dashboard consumes a single server-resolved forecast contract via resolveAdaptiveForecastCard to avoid view-model drift.
- [Phase 05.1-llm-provider-r-el-openai-anthropic-env-model-key-structured-output-strict-tests-safe-03]: Provider proposal payload excludes status; lifecycle status remains server-owned.
- [Phase 05.1-llm-provider-r-el-openai-anthropic-env-model-key-structured-output-strict-tests-safe-03]: Real-provider mode fails fast unless full OpenAI primary and Anthropic fallback env contract is present.
- [Phase 05.1-llm-provider-r-el-openai-anthropic-env-model-key-structured-output-strict-tests-safe-03]: Runtime policy caps primary retries at one and fallback attempts at one.
- [Phase 05.1-llm-provider-r-el-openai-anthropic-env-model-key-structured-output-strict-tests-safe-03]: Treat schema/JSON parse failures as retryable invalid_payload on the primary provider boundary.
- [Phase 05.1-llm-provider-r-el-openai-anthropic-env-model-key-structured-output-strict-tests-safe-03]: Keep provider chain deterministic and bounded: OpenAI attempt, one retry, then one Anthropic fallback attempt.
- [Phase 05.1-llm-provider-r-el-openai-anthropic-env-model-key-structured-output-strict-tests-safe-03]: Emit only allowlisted attempt metadata (provider/model/latency/parse/fallback/request-id) to preserve non-PII observability.

### Roadmap Evolution

- Phase 05.1 inserted after Phase 05: LLM provider réel: OpenAI/Anthropic + env model/key + structured output strict + tests SAFE-03 (URGENT)
- Phase 05.2 inserted after Phase 05: Pipeline web autonome corpus scientifique: veille, synthèse, validation continue (URGENT)

### Pending Todos

None yet.

### Blockers

None.

## Session

**Last Date:** 2026-03-05T10:05:01.817Z
**Stopped At:** Completed 05.1-02-PLAN.md
**Resume File:** None
