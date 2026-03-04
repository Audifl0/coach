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

Create `.env.production` at the repository root:

```env
APP_DOMAIN=coach.example.com
ACME_EMAIL=ops@example.com

POSTGRES_DB=coach
POSTGRES_USER=coach
POSTGRES_PASSWORD=replace-with-strong-password

DATABASE_URL=postgresql://coach:replace-with-strong-password@db:5432/coach
BETTER_AUTH_SECRET=replace-with-long-random-secret
BETTER_AUTH_URL=https://coach.example.com
```

Use strong secrets and avoid committing this file.

## First Deployment

Run from repository root:

```bash
infra/scripts/deploy.sh .env.production
```

The script:

- Pulls/builds containers.
- Starts `db`, `app`, and `caddy` services.
- Runs HTTPS smoke test automatically when `APP_DOMAIN` is set.

## HTTPS Behavior

- Caddy serves the domain from `infra/caddy/Caddyfile`.
- TLS certificates are provisioned and renewed automatically.
- Requests are proxied to `app:3000` with forwarded headers:
  - `X-Forwarded-Proto=https`
  - `X-Forwarded-Host`
  - `X-Forwarded-For`
  - `X-Real-IP`

These headers support secure cookie/session handling in the app layer.

## Operator Checks

After deploy, verify health:

```bash
infra/scripts/smoke-test-https.sh https://coach.example.com
```

Inspect services:

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=100 app caddy
```

## Update Procedure

For routine updates:

```bash
git pull
infra/scripts/deploy.sh .env.production
```

## Failure Recovery Basics

- TLS issue: check DNS resolution and Caddy logs.
- App startup issue: check app logs and ensure `DATABASE_URL` resolves
  to `db`.
- Database issue: confirm `POSTGRES_*` values match credentials in
  `DATABASE_URL`.
