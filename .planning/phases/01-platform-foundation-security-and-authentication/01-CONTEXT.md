# Phase 1: Platform Foundation, Security, and Authentication - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the VPS-hosted web foundation and complete account access lifecycle for personal use: account creation, sign-in persistence, manual recovery path, and baseline data protection fit for this project context.

</domain>

<decisions>
## Implementation Decisions

### Account Access Model
- Use `username + password` as the primary account credential model for V1.
- Keep auth flow simple (no mandatory email verification in V1).
- Password recovery in V1 is manual admin reset (no automated email recovery flow).
- Login failures should show generic messages (do not expose whether account exists).

### Session Policy
- Default session duration should be long (target: ~30 days).
- Allow multiple concurrent sessions across devices.
- Do not force periodic re-authentication during active usage; re-login mainly happens after logout/session loss.
- Logout action in V1 targets current device/session only.

### Security & Friction Tradeoff
- Prioritize low friction for personal usage over enterprise-grade hardening in phase 1.
- Keep password requirement minimal (baseline: minimum length).
- Do not add dedicated brute-force lock/slowdown behavior in this phase.
- Do not require password re-entry for sensitive account actions in this phase.
- Do not implement login activity history in this phase.

### VPS Access & Data Isolation
- Instance usage scope: owner + close circle (not public open signup intent).
- Access endpoint should be a dedicated subdomain over HTTPS.
- In case of password loss, operational recovery is manual admin reset on server.
- Enforce strict data isolation by account from the start.

### AI Coaching Guardrail for Future Phases
- AI coaching expertise source is locked as hybrid: deterministic coaching/safety rules + LLM reasoning/explanations.
- Top priority remains reliability and safety over aggressive personalization.
- This decision guides later coaching phases; phase 1 only prepares the foundation.

### Claude's Discretion
- Exact UX copywriting for auth screens and inline help text.
- Exact visual design and flow details of login/signup/reset screens.
- Exact session mechanism and storage strategy that best fit chosen stack.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet: no application source files exist in repository.

### Established Patterns
- None yet: architecture patterns will be established in implementation phases.

### Integration Points
- New code will establish initial integration points: web entrypoint, auth boundary, and deployment baseline.

</code_context>

<specifics>
## Specific Ideas

- "Projet perso" with intentionally pragmatic security posture for V1.
- Main practical need: access personal dashboard from multiple devices.
- AI value depends on quality of coaching knowledge source; this is fixed as hybrid (rules + LLM).

</specifics>

<deferred>
## Deferred Ideas

- Automated email-based password reset flow.
- Stronger anti-bruteforce and account security monitoring.
- Broader AI coaching knowledge implementation details (to be executed in later coaching phases, especially phase 5).

</deferred>

---

*Phase: 01-platform-foundation-security-and-authentication*
*Context gathered: 2026-03-04*
