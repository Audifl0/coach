# Phase 1: Platform Foundation, Security, and Authentication - Research

**Researched:** 2026-03-04
**Domain:** Next.js VPS platform baseline, username/password authentication, session security
**Confidence:** MEDIUM-HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Deferred Ideas (OUT OF SCOPE)
- Automated email-based password reset flow.
- Stronger anti-bruteforce and account security monitoring.
- Broader AI coaching knowledge implementation details (to be executed in later coaching phases, especially phase 5).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | User can create a personal account with email/password. | Implement signup with `username + password` per locked decision; keep schema extensible with optional email field for later expansion. |
| AUTH-02 | User can sign in and keep a persistent session across browser refresh. | Use server-validated cookie session with ~30-day expiry and rolling refresh; verify persistence across refresh/restart. |
| AUTH-03 | User can reset password through email recovery flow. | Current locked context requires manual admin reset in V1; plan must include explicit scope reconciliation and implement manual reset runbook/tooling now. |
| PLAT-01 | User can access the web app on a VPS-hosted HTTPS endpoint. | Use Docker Compose + Caddy automatic HTTPS on dedicated subdomain with healthchecks and restart policy. |
| PLAT-03 | User-related sensitive data is protected in transit and at rest. | Enforce TLS-only transport, secure session cookies, salted password hashing, and encrypted VPS/backups for storage layer. |
</phase_requirements>

## Summary

Phase 1 should establish a production-capable foundation with secure-by-default transport, simple account lifecycle, and durable session management aligned to personal-use friction goals. The implementation should avoid custom crypto and custom session logic where proven libraries already solve edge cases.

The most important planning issue is a requirements-context conflict: roadmap requirements still mention email/password + email recovery, while user-locked decisions mandate username/password and manual admin reset for V1. Planning should treat this as a formal reconciliation item at wave 0 so execution does not drift.

**Primary recommendation:** Use Next.js 16 + Prisma + PostgreSQL + Better Auth (username plugin, DB-backed cookie sessions), deployed via Docker Compose behind Caddy automatic HTTPS.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.1.x | Web app and server routes | Official auth guidance and App Router model are current and documented. |
| Better Auth | latest stable | Auth/session lifecycle | Modern maintained successor direction from Auth.js docs; includes username and session features needed for constraints. |
| Prisma ORM | 7.4.x | Auth/user/session persistence | Type-safe schema+migrations for greenfield speed and consistency. |
| PostgreSQL | 18.x | Durable system of record | Strong relational guarantees for user/session/account isolation. |
| Caddy | 2.10.x | Reverse proxy + TLS | Automatic HTTPS and certificate renewal with low ops overhead. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | 4.x | Input validation | Validate signup/login/reset payloads and internal auth DTOs. |
| pino | 10.x | Structured logging | Record auth events without sensitive secrets. |
| Docker Compose | 5.x | Service orchestration | Single-VPS deployment for app/db/redis/proxy. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Better Auth | Auth.js credentials provider | Still viable, but docs now indicate project transition to Better Auth; greenfield should avoid migration churn. |
| Better Auth DB sessions | Hand-rolled cookies/JWT session layer | Custom session invalidation, refresh, and security handling is error-prone and unnecessary here. |

**Installation:**
```bash
pnpm add better-auth prisma @prisma/client zod pino
```

## Architecture Patterns

### Recommended Project Structure
```text
src/
├── app/                     # Next.js routes (public + authenticated)
├── modules/
│   ├── auth/                # signup/signin/logout/reset handlers + DTOs
│   └── users/               # user profile and account data access
├── lib/
│   ├── auth/                # Better Auth config + adapters
│   ├── db/                  # Prisma client and query helpers
│   └── security/            # password hashing + timing-safe helpers
└── server/
    └── dal/                 # per-request user/session authorization checks
```

### Pattern 1: DB-backed Cookie Sessions
**What:** Store session state server-side, send opaque session token via secure cookie.
**When to use:** Default for this phase because revocation/control is clearer than stateless JWT.
**Example:** Set session expiry/update policy in auth config (`expiresIn`, `updateAge`) to match ~30-day target.

### Pattern 2: Account-Scoped Data Access Layer
**What:** Centralize `session -> userId -> account-filtered query` checks in server DAL.
**When to use:** For every protected read/write route.
**Example:** Resolve active session, derive account id, enforce query filter on all user-owned tables.

### Pattern 3: Manual Recovery as Operational Flow
**What:** Password loss handled through admin reset command/runbook, not public self-serve email flow.
**When to use:** V1 per locked constraint.
**Example:** CLI/admin endpoint writes new hash and invalidates active sessions.

### Anti-Patterns to Avoid
- **Auth checks only in UI/layout:** enforce authorization near data access, not only route rendering.
- **Custom crypto/session primitives:** use vetted auth/password/session libraries.
- **Leaky login/reset responses:** keep generic error messages to reduce user enumeration risk.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session lifecycle | Custom cookie signing + refresh + revocation logic | Better Auth session management | Built-in expiry/refresh patterns reduce auth bugs. |
| Password hashing | Homegrown hash/salt algorithm | Argon2id/scrypt via vetted libs | Correct parameterization and migration are non-trivial. |
| TLS certificate lifecycle | Manual cert issuance/renew scripts | Caddy automatic HTTPS | Auto-provision/renew removes recurring operational risk. |
| Input validation | Ad-hoc field checks in handlers | Zod schemas at boundaries | Prevents inconsistent validation behavior across auth endpoints. |

**Key insight:** Security defects in auth mostly come from custom implementations of solved problems; library defaults plus explicit configuration is safer and faster.

## Common Pitfalls

### Pitfall 1: Requirement Drift (Email vs Username)
**What goes wrong:** Build team implements email flow from requirements, violating locked context decisions.
**Why it happens:** Phase docs contain conflicting source-of-truth statements.
**How to avoid:** Add explicit phase kickoff task to reconcile AUTH wording with locked decisions before coding.
**Warning signs:** PRs introducing email verification/recovery flows in phase 1.

### Pitfall 2: Weak Session Cookie Configuration
**What goes wrong:** Persistent sessions work but are exposed to avoidable theft risks.
**Why it happens:** Missing `Secure`, `HttpOnly`, or weak `SameSite` policy.
**How to avoid:** Enforce HTTPS-only deployment and strict cookie attributes from day 1.
**Warning signs:** Cookies visible via JS, auth working over HTTP, or cross-site session leakage.

### Pitfall 3: Incomplete Account Isolation
**What goes wrong:** Queries accidentally expose another user's data.
**Why it happens:** Authorization checks scattered across route handlers.
**How to avoid:** Central DAL helper that requires user/account context for all protected queries.
**Warning signs:** Any query path lacking explicit user/account filter.

### Pitfall 4: Manual Reset Without Session Revocation
**What goes wrong:** Password reset succeeds but stolen sessions remain valid.
**Why it happens:** Reset only updates credential hash.
**How to avoid:** Reset operation must revoke existing sessions for that account.
**Warning signs:** Old session tokens still valid after reset.

## Code Examples

Verified implementation patterns from primary docs:

### Better Auth Username + Session Configuration
```ts
import { betterAuth } from "better-auth"
import { username } from "better-auth/plugins"

export const auth = betterAuth({
  emailAndPassword: { enabled: true },
  plugins: [username()],
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
})
```
Source: Better Auth docs (`/docs/plugins/username`, `/docs/concepts/session-management`)

### Generic Authentication Error Policy
```ts
// Never reveal whether username exists.
return { ok: false, message: "Invalid credentials." }
```
Source: OWASP Authentication Cheat Sheet (generic login error guidance)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Treat Auth.js as default destination for greenfield | Auth.js docs now point to Better Auth migration path | Present in current Auth.js docs as of 2026-03-04 | Prefer Better Auth directly for new builds to reduce future migration burden. |
| Build auth checks in route middleware only | Layer checks near data access (DAL) plus optional route prefiltering | Reinforced by current Next.js auth guide | Reduces accidental authorization bypass from rendering assumptions. |

**Deprecated/outdated:**
- Heavy custom authentication stacks for simple credential apps: too much risk versus modern auth frameworks.

## Open Questions

1. **How should AUTH-01/AUTH-03 wording be reconciled with locked context?**
- What we know: Requirements/roadmap say email/password + email reset, but context locks username/password + manual reset for V1.
- What's unclear: Whether to amend requirement text now or implement compatibility shim.
- Recommendation: Update requirement wording before planning or add explicit acceptance note that phase delivers context-locked variant.

2. **What is the exact at-rest protection baseline for this VPS?**
- What we know: PLAT-03 requires at-rest protection; app-level hashing is insufficient for full storage encryption.
- What's unclear: Whether host-level disk encryption and backup encryption are mandatory in this milestone acceptance.
- Recommendation: Define concrete acceptance checks (e.g., encrypted volumes/backups enabled) during planning.

## Sources

### Primary (HIGH confidence)
- Next.js Authentication Guide: https://nextjs.org/docs/app/guides/authentication
- Better Auth Username Plugin: https://www.better-auth.com/docs/plugins/username
- Better Auth Session Management: https://www.better-auth.com/docs/concepts/session-management
- Caddy Automatic HTTPS: https://caddyserver.com/docs/automatic-https
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

### Secondary (MEDIUM confidence)
- NIST SP 800-63B (password authenticator guidance): https://pages.nist.gov/800-63-4/sp800-63b.html

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - aligned with current framework/auth docs and existing project stack research.
- Architecture: MEDIUM-HIGH - patterns are well-supported but final shape depends on phase plan granularity.
- Pitfalls: HIGH - directly aligned with OWASP guidance and known auth failure modes.

**Research date:** 2026-03-04
**Valid until:** 2026-04-03
