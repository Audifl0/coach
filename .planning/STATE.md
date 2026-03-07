---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 09
current_phase_name: security runtime and release proof stabilization
current_plan: 2
status: executing
stopped_at: Completed 09-01-PLAN.md
last_updated: "2026-03-07T18:06:00.560Z"
last_activity: 2026-03-07
progress:
  total_phases: 12
  completed_phases: 10
  total_plans: 56
  completed_plans: 49
  percent: 88
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-04)

**Core value:** Fournir un coaching musculation personnalisé, sûr et adaptatif au quotidien, sans perdre la simplicité d'usage.
**Current focus:** Phase 09 - Security runtime and release proof stabilization

## Current Position

**Current Phase:** 09
**Current Phase Name:** security runtime and release proof stabilization
**Total Phases:** 12
**Current Plan:** 2
**Total Plans in Phase:** 5
**Status:** In Progress
**Last Activity:** 2026-03-07
**Last Activity Description:** Completed 09-01 dashboard trust stabilization and advanced Phase 09 execution
**Progress:** [█████████░] 88%

## Performance Metrics

| Plan | Duration | Scope | Files |
|------|----------|-------|-------|
| Phase 05 P01 | 33min | 3 tasks | 6 files |
| Phase 05 P02 | 4 min | 3 tasks | 5 files |
| Phase 05 P03 | 5min | 3 tasks | 5 files |
| Phase 05 P04 | 5min | 3 tasks | 6 files |
| Phase 05.1 P01 | 5min | 2 tasks | 9 files |
| Phase 05.1 P02 | 10 min | 3 tasks | 12 files |
| Phase 05.1 P03 | 5 min | 3 tasks | 4 files |
| Phase 05.1 P05.1-04 | 2 min | 2 tasks | 1 files |
| Phase 05.2 P05.2-01 | 3 min | 3 tasks | 5 files |
| Phase 05.2 P05.2-02 | 19 min | 3 tasks | 10 files |
| Phase 05.2 P05.2-03 | 7 min | 3 tasks | 8 files |
| Phase 06-trends-and-operational-reliability P06-03 | 5 min | 3 tasks | 7 files |
| Phase 06-trends-and-operational-reliability P06-01 | 5 min | 3 tasks | 8 files |
| Phase 06-trends-and-operational-reliability P06-02 | 8min | 3 tasks | 6 files |
| Phase 06-trends-and-operational-reliability P06-04 | 2 min | 2 tasks | 2 files |
| Phase 07-audit-technique-avanc-et-stabilisation-compl-te-de-l-application P07-01 | 8 min | 3 tasks | 6 files |
| Phase 07-audit-technique-avanc-et-stabilisation-compl-te-de-l-application P07-02 | 6 min | 2 tasks | 4 files |
| Phase 07-audit-technique-avanc-et-stabilisation-compl-te-de-l-application P07-03 | 10 min | 2 tasks | 4 files |
| Phase 07-audit-technique-avanc-et-stabilisation-compl-te-de-l-application P07-04 | 6 min | 2 tasks | 4 files |
| Phase 07-audit-technique-avanc-et-stabilisation-compl-te-de-l-application P07-05 | 4 min | 2 tasks | 4 files |
| Phase 07-audit-technique-avanc-et-stabilisation-compl-te-de-l-application P07-06 | 5 min | 3 tasks | 6 files |
| Phase 08-release-blockers-and-regression-restoration P08-02 | 19 min | 4 tasks | 26 files |
| Phase 08-release-blockers-and-regression-restoration P08-01 | 32 min | 4 tasks | 4 files |
| Phase 08-release-blockers-and-regression-restoration P08-03 | 26 min | 3 tasks | 10 files |
| Phase 08-release-blockers-and-regression-restoration P08-04 | 9 min | 3 tasks | 6 files |
| Phase 08-release-blockers-and-regression-restoration P08-05 | 4 min | 3 tasks | 4 files |
| Phase 08-release-blockers-and-regression-restoration P08-06 | 31 min | 3 tasks | 52 files |
| Phase 09 P09-01 | 6 min | 2 tasks | 8 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 08-release-blockers-and-regression-restoration]: Shared dashboard/today-route session types now remain centralized in src/lib/program/contracts.ts instead of route-local unions.
- [Phase 08-release-blockers-and-regression-restoration]: isProfileComplete now accepts unknown input and performs explicit object checks so callers do not need cast-based suppressions.
- [Phase 08-release-blockers-and-regression-restoration]: Provider adapters normalize SDK request-id, payload-shape, and mutable-schema quirks before adaptive services consume fallback metadata.
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
- [Phase 07-audit-technique-avanc-et-stabilisation-compl-te-de-l-application]: Phase 07 must stop at a human-verification checkpoint after delivering the final audit package; no remediation is authorized before approval.
- [Phase 07-audit-technique-avanc-et-stabilisation-compl-te-de-l-application]: Production readiness is judged by compile, test, build, secrets, and auth-abuse posture together, not by unit coverage alone.
- [Phase 05.1-llm-provider-r-el-openai-anthropic-env-model-key-structured-output-strict-tests-safe-03]: Keep provider chain deterministic and bounded: OpenAI attempt, one retry, then one Anthropic fallback attempt.
- [Phase 05.1-llm-provider-r-el-openai-anthropic-env-model-key-structured-output-strict-tests-safe-03]: Emit only allowlisted attempt metadata (provider/model/latency/parse/fallback/request-id) to preserve non-PII observability.
- [Phase 05.1]: Real-provider mode never falls back to local deterministic proposal; null candidate is delegated to SAFE-03.
- [Phase 05.1]: Provider payload status is stripped before orchestration parse so lifecycle status remains server-owned.
- [Phase 05.1]: Disabled provider mode contract is null runtime config; tests assert parseLlmRuntimeConfig(...) === null.
- [Phase 05.1]: Enabled-mode provider config tests now enforce LLM_OPENAI_* and LLM_ANTHROPIC_* model/API-key env names and current parser shape.
- [Phase 05.2]: Corpus contracts are strict and shared across normalized evidence, FR synthesis principles, manifests, and run reports.
- [Phase 05.2]: Pipeline config is parsed from a single PIPELINE_* contract with approved-domain perimeter and bounded retries.
- [Phase 05.2]: refresh-corpus entrypoint now validates through shared contracts/config while keeping --check compatibility.
- [Phase 05.2]: Connector retries terminate as source-level skips with telemetry, never run-fatal throw.
- [Phase 05.2]: Pipeline writes only candidate artifacts under snapshots/<run-id>/candidate and leaves active corpus untouched.
- [Phase 05.2]: Synthesis stage failures persist run-report with synthesize=failed and validate=skipped before deterministic error.
- [Phase 05.2]: Publish stage is executed only when quality gate passes; blocked reasons are deterministic codes.
- [Phase 05.2]: Promotion converts candidate directory to validated directory before active pointer swap.
- [Phase 05.2]: Runtime retrieval reads active validated snapshot first, then rollback pointer, then legacy corpus.
- [Phase 06-trends-and-operational-reliability]: Require RESTORE_TARGET_DB and block restores targeting production database name.
- [Phase 06-trends-and-operational-reliability]: Use psql -X with ON_ERROR_STOP and single-transaction restore semantics for fail-fast drills.
- [Phase 06-trends-and-operational-reliability]: Drive monthly drills via systemd timer with Persistent=true and timestamped evidence logs.
- [Phase 06-trends-and-operational-reliability]: Trend query contract is restricted to 7d/30d/90d with default 30d for deterministic toggles.
- [Phase 06-trends-and-operational-reliability]: Intensity metric is computed from key-exercise set loads (first exercise by order index per session).
- [Phase 06-trends-and-operational-reliability]: Drilldown route returns deterministic 404 when no account-scoped series exists.
- [Phase 06-trends-and-operational-reliability]: Kept dashboard trend interpretation visual-only (KPI + line) without delta arrows/badges.
- [Phase 06-trends-and-operational-reliability]: Split trends into compact summary plus per-exercise drilldown to avoid bloating dashboard main surface.
- [Phase 06-trends-and-operational-reliability]: Server preloads 30d trends with no-store and tolerates API failure by omitting trends section only.
- [Phase 06-trends-and-operational-reliability]: Returning to 30d restores preloaded initialData immediately to guarantee period/data parity.
- [Phase 06-trends-and-operational-reliability]: Trend responses are applied only when response period matches the active selected period.
- [Phase 07-audit-technique-avanc-et-stabilisation-compl-te-de-l-application]: Keep 07-01 strictly documentation-only and avoid application-code edits.
- [Phase 07-audit-technique-avanc-et-stabilisation-compl-te-de-l-application]: Treat the dashboard SSR internal-fetch path and adaptive lifecycle as explicit cross-cutting architectural seams.
- [Phase 07-audit-technique-avanc-et-stabilisation-compl-te-de-l-application]: Record evidence strength per requirement so later audit plans can separate structural coverage from end-to-end proof.
- [Phase 07-audit-technique-avanc-et-stabilisation-compl-te-de-l-application]: Treat broken compile health and failing adaptive tests as release-critical, not cleanup.
- [Phase 07-audit-technique-avanc-et-stabilisation-compl-te-de-l-application]: Separate maintainability debt from bounded cleanup candidates in AUDIT-STATIC.md.
- [Phase 07-audit-technique-avanc-et-stabilisation-compl-te-de-l-application]: Treat missing `.env.production` exclusions from git and Docker build context as a release blocker.
- [Phase 07-audit-technique-avanc-et-stabilisation-compl-te-de-l-application]: Keep security findings split between production blockers and advisory hardening items.
- [Phase 07-audit-technique-avanc-et-stabilisation-compl-te-de-l-application]: History list/detail flow currently diverges because list reads all completed sessions while drilldown detail remains scoped to active plans.
- [Phase 07-audit-technique-avanc-et-stabilisation-compl-te-de-l-application]: Dashboard internal fetch failures for today/trends currently degrade to empty or omitted UI states instead of explicit error states.
- [Phase 07-audit-technique-avanc-et-stabilisation-compl-te-de-l-application]: Treat same-service SSR dashboard fetches and in-memory trend/history aggregation as important runtime risks, but not standalone release blockers.
- [Phase 07-audit-technique-avanc-et-stabilisation-compl-te-de-l-application]: Treat concurrent plan replacement, session-completion race windows, and adaptive decision partial writes as release-sensitive consistency issues.
- [Phase 07-audit-technique-avanc-et-stabilisation-compl-te-de-l-application]: User approved the 07-06 audit package; Phase 07 closes without remediation or application-code changes.
- [Phase 08-release-blockers-and-regression-restoration]: Middleware now consumes SESSION_COOKIE_NAME from a dependency-free session-contract module so Edge runtime imports stay clear of node:crypto auth helpers.
- [Phase 08-release-blockers-and-regression-restoration]: Current-head 08-01 re-verification is split: Prisma generate and focused auth lifecycle tests pass, while full next build still needs follow-up because static page generation exits with a generic build-worker failure.
- [Phase 08-release-blockers-and-regression-restoration]: The documented production env path is /opt/coach/.env.production, kept outside the repo and passed into existing scripts via explicit ENV_FILE arguments.
- [Phase 08-release-blockers-and-regression-restoration]: Docker builds now exclude .env* and related local secret artifacts via .dockerignore so production secrets do not enter build context by operator mistake.
- [Phase 08-release-blockers-and-regression-restoration]: Keep brute-force protection strictly on /api/auth/login and /api/auth/signup instead of introducing a generic abuse platform.
- [Phase 08-release-blockers-and-regression-restoration]: Throttle login on normalized username plus client IP and signup on client IP only so sub-threshold auth semantics remain unchanged.
- [Phase 08-release-blockers-and-regression-restoration]: Bind the shared auth limiter only in runtime POST handlers so production requests share state while direct handler factories stay isolated for deterministic tests.
- [Phase 08-release-blockers-and-regression-restoration]: Adaptive proposal parsing now strips transport-only metadata and keeps lifecycle status server-owned across local and provider paths.
- [Phase 08-release-blockers-and-regression-restoration]: Evidence retrieval now fills underflow slots from the same selected corpus in deterministic source-priority order, using the built-in corpus only when the runtime corpus is empty or unusable.
- [Phase 08-release-blockers-and-regression-restoration]: Force the entire (private) app segment dynamic so authenticated pages never enter the static-generation worker path.
- [Phase 08-release-blockers-and-regression-restoration]: Keep Next app entry files export-safe by moving testable runtime helpers into companion page-helpers and route-handlers modules.
- [Phase 08-release-blockers-and-regression-restoration]: Preserve dashboard today and trends contracts by loading DAL/projection data directly on the server instead of same-origin HTTP self-fetches.
- [Phase 09-security-runtime-and-release-proof-stabilization]: Dashboard SSR now consumes explicit server-side today/trends section loaders instead of nullable page-local loader results.
- [Phase 09-security-runtime-and-release-proof-stabilization]: Client dashboard cards receive lightweight load-state props so degraded runtime states are visible without importing server-only modules into client code.

### Roadmap Evolution

- Phase 05.1 inserted after Phase 05: LLM provider réel: OpenAI/Anthropic + env model/key + structured output strict + tests SAFE-03 (URGENT)
- Phase 05.2 inserted after Phase 05: Pipeline web autonome corpus scientifique: veille, synthèse, validation continue (URGENT)
- Phase 7 added: Audit technique avancé et stabilisation complète de l'application
- Phase 8 added: Release blockers and regression restoration
- Phase 9 added: Security, runtime, and release-proof stabilization
- Phase 10 added: Maintainability cleanup and operational hardening

### Pending Todos

None yet.

### Blockers

None.

## Session

**Last Date:** 2026-03-07T18:06:00.557Z
**Stopped At:** Completed 09-01-PLAN.md
**Resume File:** None
