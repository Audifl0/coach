# Restore Drill Runbook

## Objective

Run a monthly restore drill that proves recoverability of encrypted backups into a
dedicated drill database, with auditable evidence and smoke checks.

## Prerequisites

- VPS has Docker + Docker Compose available.
- `BACKUP_PASSPHRASE` is exported in the shell used for the drill.
- `/opt/coach/.env.production` contains:
  - `APP_DOMAIN`
  - `POSTGRES_USER`
  - `POSTGRES_DB` (production source DB name, used only as guardrail)
  - `RESTORE_TARGET_DB` (dedicated drill DB, example: `coach_restore_drill`)
  - `OPS_SMOKE_USERNAME`
  - `OPS_SMOKE_PASSWORD`
  - `OPS_SMOKE_EXPECTED_FOCUS_LABEL`
- At least one encrypted backup exists under `backups/` OR backup creation is possible.
- Optional:
  - `RESTORE_DRILL_BASE_URL` (default: `http://127.0.0.1:3000`)
  - `RESTORE_DRILL_EVIDENCE_DIR` (default: `backups/restore-drills`)
  - `RESTORE_DRILL_BACKUP_FILE` to force a specific backup.

These variables are the same narrow phase-09 ops contract documented in
`.env.example` and the deploy runbook.

## Monthly Drill Procedure

1. Export backup passphrase:

```bash
export BACKUP_PASSPHRASE='replace-with-backup-passphrase'
```

2. Execute the drill wrapper:

```bash
infra/scripts/run-restore-drill.sh /opt/coach/.env.production backups
```

3. Confirm command exits with status `0`.

4. Identify the evidence log:
   - Path format: `backups/restore-drills/restore-drill-YYYYMMDDTHHMMSSZ.log`

5. Verify mandatory evidence markers in the log:
   - `stage=backup_selection`
   - `stage=restore`
   - `stage=smoke_login`
   - `stage=smoke_dashboard`
   - `restore_drill_status=success`

## Expected Smoke Verification Outcomes

- `smoke_login=ok` with HTTP `2xx` or `3xx` from `/login`
- `smoke_dashboard=ok` with HTTP `2xx` or `3xx` from `/dashboard`

The authenticated smoke account should confirm business data is present after
login, not only that `/dashboard` returns a status code. Keep the account
scoped to non-production verification and make sure it owns a session with a
focus label matching `OPS_SMOKE_EXPECTED_FOCUS_LABEL`.

## Failure Handling

If the drill fails:

1. Read the latest evidence log and capture:
   - failing stage marker,
   - exit code (`restore_drill_exit_code`),
   - endpoint status (for smoke failures).
2. Validate guardrail env:
   - `RESTORE_TARGET_DB` must be set.
   - `RESTORE_TARGET_DB` must differ from `POSTGRES_DB`.
3. Re-run with explicit backup file if needed:

```bash
export RESTORE_DRILL_BACKUP_FILE=backups/coach-YYYYMMDDTHHMMSSZ.sql.enc
infra/scripts/run-restore-drill.sh /opt/coach/.env.production backups
```

4. If restore errors persist, run direct restore diagnostics:

```bash
infra/scripts/restore.sh backups/coach-YYYYMMDDTHHMMSSZ.sql.enc /opt/coach/.env.production
```

5. Escalate incident if failure blocks recoverability; attach the timestamped evidence log.

## Rollback/Cleanup

- Drill restores only to `RESTORE_TARGET_DB`, not to production DB.
- To reset drill DB manually (if needed), drop/recreate the drill database in PostgreSQL.
- Keep evidence logs for audit history and monthly reliability tracking.

## Systemd Monthly Scheduling (VPS)

Install units from `infra/systemd/` to `/etc/systemd/system/` and enable timer:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now coach-restore-drill.timer
sudo systemctl list-timers coach-restore-drill.timer
```

This timer runs monthly and uses `Persistent=true` for missed-run catch-up.
