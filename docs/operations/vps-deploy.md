# VPS Deployment Runbook

## Scope

This runbook deploys the Coach app on a single VPS using Docker Compose
with Caddy TLS termination.

## Prerequisites

- Ubuntu VPS with Docker Engine and Docker Compose installed.
- DNS A/AAAA record for your subdomain (example: `coach.example.com`)
  pointing to the VPS.
- Ports `80` and `443` open in firewall/security group.
- Repository cloned on the VPS.

## Environment Configuration

Create the production env file outside the repository checkout at
`/opt/coach/.env.production`:

```env
APP_DOMAIN=coach.example.com
ACME_EMAIL=ops@example.com

POSTGRES_DB=coach
POSTGRES_USER=coach
POSTGRES_PASSWORD=replace-with-strong-password

DATABASE_URL=postgresql://coach:replace-with-strong-password@db:5432/coach
BETTER_AUTH_SECRET=replace-with-long-random-secret
BETTER_AUTH_URL=https://coach.example.com

RESTORE_TARGET_DB=coach_restore_drill
RESTORE_DRILL_BASE_URL=http://127.0.0.1:3000
OPS_SMOKE_USERNAME=release-smoke
OPS_SMOKE_PASSWORD=replace-with-smoke-password
OPS_SMOKE_EXPECTED_FOCUS_LABEL=Upper Body
```

Use strong secrets, keep the file owned by the deploy user with
restrictive permissions, and do not place production secrets in the
repository checkout.

The phase-09 operator contract stays intentionally narrow:

- `APP_DOMAIN` drives the public HTTPS deploy smoke target.
- `POSTGRES_DB` and `RESTORE_TARGET_DB` keep restore drills pointed away from production.
- `RESTORE_DRILL_BASE_URL` lets restore verification hit the local app listener without depending on public DNS.
- `OPS_SMOKE_USERNAME`, `OPS_SMOKE_PASSWORD`, and `OPS_SMOKE_EXPECTED_FOCUS_LABEL` define the dedicated authenticated smoke account used by deploy and restore evidence.

## First Deployment

Run from repository root and pass the external env path explicitly:

```bash
infra/scripts/deploy.sh /opt/coach/.env.production
```

The script:

- Pulls/builds containers.
- Starts `db`, `app`, and `caddy` services.
- Runs HTTPS smoke test automatically when `APP_DOMAIN` is set.
- Uses the same ops env contract later for authenticated dashboard smoke once the release-smoke account is provisioned.

For the full phase-09 release gate, continue with
`docs/operations/release-proof.md` after deploy-host prerequisites are in
place.

## HTTPS Behavior

- Caddy serves the domain from `infra/caddy/Caddyfile`.
- TLS certificates are provisioned and renewed automatically.
- Requests are proxied to `app:3000` with forwarded headers:
  - `X-Forwarded-Proto=https`
  - `X-Forwarded-Host`
  - `X-Forwarded-For`
  - `X-Real-IP`

These headers support secure cookie/session handling in the app layer.

### Browser Header Hardening

Caddy now emits low-risk hardening headers at the HTTPS entrypoint:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `X-Frame-Options: DENY`
- `Content-Security-Policy-Report-Only: frame-ancestors 'none'`

This phase intentionally avoids a blocking CSP rollout.

## Operator Checks

After deploy, verify health:

```bash
infra/scripts/smoke-test-https.sh https://coach.example.com
```

For phase-09 release proof, keep a non-production smoke user populated with
dashboard data matching `OPS_SMOKE_EXPECTED_FOCUS_LABEL`. That gives deploy
and restore flows one deterministic authenticated sanity check instead of
anonymous reachability only.

Inspect services:

```bash
docker compose --env-file /opt/coach/.env.production ps
docker compose --env-file /opt/coach/.env.production logs --tail=100 app caddy
```

Reload Caddy after Caddyfile updates:

```bash
docker compose --env-file /opt/coach/.env.production exec caddy caddy reload --config /etc/caddy/Caddyfile
```

Verify response headers over HTTPS:

```bash
curl -sSI https://coach.example.com | grep -E "X-Content-Type-Options|Referrer-Policy|Permissions-Policy|X-Frame-Options|Content-Security-Policy-Report-Only"
```

Then run the existing authenticated release-proof path and capture the
header-check evidence with the normal smoke proof:

```bash
corepack pnpm release:proof -- /opt/coach/.env.production
```

## Update Procedure

For routine updates:

```bash
git pull
infra/scripts/deploy.sh /opt/coach/.env.production
```

For release candidates, prefer the full proof instead of deploy-only:

```bash
corepack pnpm release:proof -- /opt/coach/.env.production
```

## Failure Recovery Basics

- TLS issue: check DNS resolution and Caddy logs.
- App startup issue: check app logs and ensure `DATABASE_URL` resolves
  to `db`.
- Database issue: confirm `POSTGRES_*` values match credentials in
  `DATABASE_URL`.
