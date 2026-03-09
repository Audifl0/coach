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
infra/scripts/backup.sh /opt/coach/.env.production
```

Backups are encrypted with OpenSSL AES-256 (`-pbkdf2` with salted key derivation).
The backup flow streams `pg_dump` directly into OpenSSL and does not write plaintext
SQL dumps to disk in the normal path.

Restore flow:

```bash
export BACKUP_PASSPHRASE='replace-with-backup-passphrase'
infra/scripts/restore.sh backups/coach-YYYYMMDDTHHMMSSZ.sql.enc /opt/coach/.env.production
```

Restore decrypts and replays SQL as a stream (`openssl -d | psql`) while preserving
`RESTORE_TARGET_DB`, `ON_ERROR_STOP`, and single-transaction guardrails.

## Secret Handling Baseline

- Keep `/opt/coach/.env.production` on the server only with restrictive
  file permissions and outside the repository checkout.
- Rotate `BETTER_AUTH_SECRET`, database password, and backup passphrase
  on incident or periodic schedule.
- Do not print secrets in logs or shell history.

## Recovery Drill Recommendation

Run a periodic restore drill to confirm recoverability:

1. Export backup passphrase.
2. Run `infra/scripts/run-restore-drill.sh /opt/coach/.env.production backups`.
3. Confirm smoke reachability checks for `/login` and `/dashboard`.
4. Archive the timestamped evidence log under `backups/restore-drills/`.

Detailed incident procedure and failure handling:

- [Restore Drill Runbook](./restore-drill-runbook.md)

## Deferred Hardening (Out of Current Scope)

- Managed KMS integration for automated key rotation.
- Host-level disk encryption automation.
- Multi-region backup replication.

These controls can be introduced in later reliability phases.
