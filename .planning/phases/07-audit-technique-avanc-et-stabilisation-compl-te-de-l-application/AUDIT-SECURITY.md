# Security Audit

Phase 07 security audit covering application trust boundaries, protected routes, provider integrations, and operational controls.

## Executive Summary

Current posture is mixed:

- Strong application-layer foundations are present: opaque hashed session tokens, `Secure` + `HttpOnly` + `SameSite=Lax` cookies, server-side session validation, account-scoped DAL helpers, and broad Zod input parsing across authenticated routes.
- Provider and corpus boundaries are also comparatively disciplined: real-provider mode is env-gated, model outputs are reparsed against strict schemas, provider telemetry is allowlisted, and corpus ingestion is restricted to approved domains.
- The repository is **not ready for production as-is** because at least two release blockers remain: production env files are not excluded from git or Docker build context, and the public auth surface has no brute-force/rate-limit control.

## Security Posture Snapshot

| Area | Status | Notes |
| --- | --- | --- |
| Session handling | Strong | Session cookie is `Secure`/`HttpOnly`/`SameSite=Lax`; token is random and stored as SHA-256 hash only. |
| Authorization / account scope | Strong | Private routes resolve identity from persisted session and DAL helpers enforce ownership. |
| Input validation | Strong | Route handlers consistently parse JSON and validate contracts with Zod. |
| CSRF posture | Acceptable with caveats | Current mutating endpoints are JSON POST routes plus `SameSite=Lax`; no dedicated CSRF token layer exists. |
| Browser hardening headers | Weak | No CSP or related response hardening found. |
| Public auth abuse resistance | Weak | No rate limiting, lockout, or proxy throttling on auth routes. |
| Provider / LLM boundary | Strong | Strict env gate, schema validation, bounded retry/fallback, allowlisted metadata. |
| Secrets / deployment handling | Weak | `.env.production` is instructed at repo root but is not excluded from git or Docker build context. |
| Backup / restore safety | Good with gaps | Restore blocks production DB target; backup path still creates temporary plaintext dump. |

## Positive Controls Observed

- `src/lib/auth/auth.ts` issues 32-byte random session tokens, stores only `sessionTokenHash`, and sets `Secure` + `HttpOnly` + `SameSite=Lax` cookie attributes.
- `src/lib/auth/session-gate.ts` validates sessions against persisted non-revoked, non-expired rows before private access is granted.
- `src/server/dal/account-scope.ts` centralizes account isolation and is covered by `tests/security/account-isolation.test.ts`.
- Authenticated API routes consistently resolve `userId` from the server session rather than trusting caller-supplied identity.
- `src/server/llm/config.ts`, `src/server/llm/client.ts`, and provider clients enforce strict runtime config and schema validation before model output is accepted.

## Findings

### SEC-APP-01

- Severity: important
- Priority: P1
- Domain: security
- Surface: `src/app/api/auth/login/route.ts`, `src/app/api/auth/signup/route.ts`, `infra/caddy/Caddyfile`
- Production blocker: yes

**Evidence**

- Login and signup are public JSON POST endpoints.
- No app-level throttle, account lockout, IP rate-limit, CAPTCHA, or reverse-proxy rate limiting was found in the auth routes or Caddy config.
- Login error masking is good (`Invalid username or password`), but masking alone does not slow online guessing.

**Risk**

Internet-facing username/password auth can be brute-forced or targeted with credential stuffing. Signup conflict responses also make username availability enumerable, which becomes more exploitable without throttling.

**Recommendation**

Introduce rate limiting at the edge and/or app layer for `/api/auth/login` and `/api/auth/signup`, add monitoring on repeated failures, and define an operator response for suspicious auth activity.

**Validation needed**

- Repeated login attempts from one client/IP are throttled or blocked.
- Auth abuse events are visible in logs or monitoring.

### SEC-APP-02

- Severity: important
- Priority: P1
- Domain: security
- Surface: `src/app/(private)/dashboard/page.tsx`, `infra/caddy/Caddyfile`, `docker-compose.yml`
- Production blocker: no

**Evidence**

- The dashboard reconstructs an origin from `x-forwarded-host` or `host`, then performs server-side fetches to `${origin}/api/program/today` and `${origin}/api/program/trends`.
- The request forwards the full cookie header to that derived origin.
- Current Docker Compose keeps the app container off public ports and Caddy is the intended sole ingress, which partially contains the risk.

**Risk**

This design is safe only while the deployment invariant holds exactly. If the app becomes directly reachable, sits behind a different proxy, or accepts attacker-controlled Host/forwarded-host headers, SSR could send authenticated cookies to an attacker-chosen origin.

**Recommendation**

Replace same-service HTTP fetches with direct server/DAL calls where possible, or pin the internal origin to a trusted env/config value instead of request headers.

**Validation needed**

- Host header spoofing cannot alter the destination of internal dashboard fetches.
- Dashboard still works when direct HTTP access to the app container is denied.

### SEC-APP-03

- Severity: minor
- Priority: P2
- Domain: security
- Surface: `next.config.ts`
- Production blocker: no

**Evidence**

- `next.config.ts` only sets `reactStrictMode`.
- No CSP, `X-Frame-Options`, `Referrer-Policy`, or similar hardening headers were found.
- No `dangerouslySetInnerHTML` usage was found during the review, which lowers immediate XSS exposure.

**Risk**

Current React rendering patterns reduce direct XSS risk, but absence of browser hardening headers increases blast radius if an injection bug appears later and leaves the app more exposed to framing and policy gaps.

**Recommendation**

Add a conservative CSP and baseline security headers after the audit-driven remediation phase starts, keeping compatibility with Next.js assets and the authenticated dashboard.

**Validation needed**

- Response headers include CSP and standard browser hardening policies.
- Dashboard/scripts still load correctly under the chosen CSP.

### SEC-APP-04

- Severity: minor
- Priority: P2
- Domain: security
- Surface: `scripts/admin-reset-password.ts`
- Production blocker: no

**Evidence**

- The manual admin reset CLI gathers the new password using `readline.question(...)`, which echoes input in a normal terminal session.
- The reset flow otherwise behaves defensively: it returns a generic completion message and revokes active sessions after a successful reset.

**Risk**

The reset password can be exposed to shoulder surfing, terminal capture, or operator recording tools during an incident response workflow.

**Recommendation**

Switch the password prompt to a non-echoing terminal input method and document that the reset should run only from trusted admin shells.

**Validation needed**

- The password entry is not echoed to the terminal.
- Reset still produces the same generic operator-facing outcome.

### SEC-OPS-01

- Severity: critical
- Priority: P0
- Domain: ops
- Surface: `docs/operations/vps-deploy.md`, `.gitignore`, `.dockerignore`, `Dockerfile`
- Production blocker: yes

**Evidence**

- The deployment runbook instructs operators to create `.env.production` at the repository root.
- `.gitignore` ignores `.env` but not `.env.production`.
- `.dockerignore` ignores `.env` but not `.env.production`.
- `Dockerfile` build stage uses `COPY . .`, so any root-level production env file is sent into Docker build context and copied into the build stage.

**Risk**

Production secrets can be accidentally committed, included in Docker build context, captured in build cache/layers, or exposed to anyone with access to the local build environment. This is a direct secret-handling flaw in the documented production workflow.

**Recommendation**

Treat this as a release blocker. Exclude `.env.production*` from git and Docker context, keep runtime secrets outside the repository tree when possible, and ensure deploy/build flows never `COPY` secret env files into image build stages.

**Validation needed**

- `git check-ignore .env.production` confirms the file is ignored.
- Docker build context excludes `.env.production`.
- Production deploy still works using runtime-only env injection.

### SEC-OPS-02

- Severity: minor
- Priority: P2
- Domain: ops
- Surface: `infra/scripts/backup.sh`
- Production blocker: no

**Evidence**

- The backup script creates a plaintext SQL dump inside the backup directory via `mktemp`, then encrypts it with OpenSSL, then deletes the plaintext file.

**Risk**

The plaintext dump exists on disk for a short window. On a misconfigured host, synced backup directory, or compromised filesystem, this weakens the otherwise sound encrypted-backup story.

**Recommendation**

Pipe `pg_dump` directly into encryption or place the temporary plaintext file in a tightly permissioned transient directory with restrictive `umask`.

**Validation needed**

- Backup execution leaves no plaintext SQL artifact in the backup directory.
- Backup still produces a valid encrypted dump.

## Application Boundary Assessment

### Authentication and session handling

- Good: session cookies are `Secure`, `HttpOnly`, and `SameSite=Lax`.
- Good: session state is authoritative in the database, not inferred from cookie presence alone.
- Good: logout revokes only the active hashed token and clears the cookie idempotently.
- Gap: auth endpoints are unaudited for abuse resistance beyond generic error messaging.

### Authorization and account scope

- Good: private route handlers resolve the current session first and pass only server-derived `userId` into DAL/services.
- Good: DAL helpers reject mismatched ownership and account scope drift.
- Good: session detail routes additionally filter exercise payloads and logged-set queries by authenticated `userId`.

### Input validation and injection/XSS exposure

- Good: route handlers consistently wrap `request.json()` parsing and Zod validation.
- Good: Prisma is used through DAL helpers; no raw SQL or dangerous HTML rendering surfaced in reviewed files.
- Caveat: browser hardening headers are absent, so future UI injection bugs would have fewer containment layers.

### CSRF posture

- Current posture is acceptable for the present implementation because authenticated mutations are JSON POST routes and session cookies are `SameSite=Lax`.
- No dedicated CSRF token or Origin/Referer enforcement exists, so this guarantee depends on keeping mutations off GET and avoiding future form-compatible mutators.

## Provider and Operational Boundary Assessment

### LLM and provider boundary

- Good: real-provider mode is explicitly gated by env parsing in `src/server/llm/config.ts`.
- Good: OpenAI and Anthropic outputs are reparsed against strict schemas before acceptance.
- Good: attempt metadata is allowlisted in `src/server/llm/observability.ts`; prompts, profile payloads, and raw provider responses are not surfaced there.
- Good: adaptive prompt construction does not send obvious personal identifiers such as username or raw session data.

### Corpus and external-source perimeter

- Good: `scripts/adaptive-knowledge/config.ts` constrains allowed domains to a fixed approved set.
- Good: connector normalization rejects records outside the allowlist or freshness window.
- Good: publish flow keeps candidate artifacts separate and uses active/rollback pointers instead of mutating the live corpus in place.

### Deployment, secrets, and recovery controls

- Good: `docker-compose.yml` exposes only Caddy publicly; the app and database stay on the internal backend network.
- Good: `infra/scripts/restore.sh` forces `RESTORE_TARGET_DB` and explicitly blocks restores targeting the production database name.
- Good: restore uses `psql -X`, `ON_ERROR_STOP`, and a single transaction.
- Gap: documented `.env.production` handling is unsafe because repo/build-context exclusions are incomplete.
- Gap: backup encryption is solid, but the current script still materializes a temporary plaintext SQL dump before encryption.

## Production Risk Register

| ID | Severity | Blocker | Summary |
| --- | --- | --- | --- |
| `SEC-OPS-01` | critical | yes | Production env file can enter git history and Docker build context under the documented deploy flow. |
| `SEC-APP-01` | important | yes | Public auth endpoints have no brute-force or credential-stuffing control. |
| `SEC-APP-02` | important | no | Dashboard SSR trusts request-derived host/origin when forwarding authenticated cookies internally. |
| `SEC-APP-03` | minor | no | No CSP or baseline browser hardening headers found. |
| `SEC-APP-04` | minor | no | Admin reset CLI echoes the new password in the terminal. |
| `SEC-OPS-02` | minor | no | Backup flow briefly writes a plaintext SQL dump before encryption. |

## Release Blockers

- `SEC-OPS-01`: production env file handling is unsafe in both git and Docker build context.
- `SEC-APP-01`: public auth surface has no brute-force or credential-stuffing control.

## Advisory Hardening Items

- `SEC-APP-02`: remove request-header-derived origin trust from dashboard SSR fetches.
- `SEC-APP-03`: add CSP and baseline browser security headers.
- `SEC-APP-04`: hide password input for the admin reset CLI.
- `SEC-OPS-02`: eliminate temporary plaintext backup artifacts.
