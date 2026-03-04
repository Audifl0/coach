# Data Protection Baseline

## Objective

Define practical baseline controls for protecting data in transit and at
rest for the phase-1 VPS deployment.

## In-Transit Protection

- Public traffic terminates over HTTPS at Caddy on port `443`.
- HTTP requests on port `80` are handled by Caddy and upgraded to HTTPS.
- Upstream proxy headers include `X-Forwarded-Proto=https` so the app can
  enforce secure session behavior.
- Application endpoints should only be exposed through Caddy, not directly
  from app container ports.

## At-Rest Protection

### Database Storage

- PostgreSQL data is stored in Docker volume `postgres_data`.
- Volume is isolated to the VPS host and inaccessible from public network paths.
- Database credentials are provided through environment secrets
  (`POSTGRES_PASSWORD`, `DATABASE_URL`) and not committed in source
  control.

### Encrypted Backups

Use encrypted dumps for off-host retention:

```bash
export BACKUP_PASSPHRASE='replace-with-backup-passphrase'
infra/scripts/backup.sh .env.production
```

Backups are encrypted with OpenSSL AES-256 (`-pbkdf2` with salted key derivation).

Restore flow:

```bash
export BACKUP_PASSPHRASE='replace-with-backup-passphrase'
infra/scripts/restore.sh backups/coach-YYYYMMDDTHHMMSSZ.sql.enc .env.production
```

## Secret Handling Baseline

- Keep `.env.production` on the server only with restrictive file permissions.
- Rotate `BETTER_AUTH_SECRET`, database password, and backup passphrase
  on incident or periodic schedule.
- Do not print secrets in logs or shell history.

## Recovery Drill Recommendation

Run a periodic restore drill to confirm recoverability:

1. Create encrypted backup.
2. Restore into a staging database on same VPS (or alternate host).
3. Validate schema and key auth tables are present.
4. Record date and outcome in operational notes.

## Deferred Hardening (Out of Current Scope)

- Managed KMS integration for automated key rotation.
- Host-level disk encryption automation.
- Multi-region backup replication.

These controls can be introduced in later reliability phases.
