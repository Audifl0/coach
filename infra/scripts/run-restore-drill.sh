#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${1:-$PROJECT_ROOT/.env.production}"
BACKUP_DIR="${2:-$PROJECT_ROOT/backups}"
EVIDENCE_DIR="${RESTORE_DRILL_EVIDENCE_DIR:-$BACKUP_DIR/restore-drills}"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
EVIDENCE_FILE="$EVIDENCE_DIR/restore-drill-${TIMESTAMP}.log"
DRILL_BASE_URL="${RESTORE_DRILL_BASE_URL:-http://127.0.0.1:3000}"

mkdir -p "$EVIDENCE_DIR"

{
  echo "restore_drill_started_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "env_file=$ENV_FILE"
  echo "backup_dir=$BACKUP_DIR"
  echo "evidence_file=$EVIDENCE_FILE"
} >"$EVIDENCE_FILE"

log() {
  local message="$1"
  echo "$message" | tee -a "$EVIDENCE_FILE"
}

record_failure() {
  local exit_code="$1"
  log "restore_drill_status=failed"
  log "restore_drill_finished_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  log "restore_drill_exit_code=$exit_code"
}

record_success() {
  log "restore_drill_status=success"
  log "restore_drill_finished_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  log "restore_drill_exit_code=0"
}

trap 'record_failure "$?"' ERR

if [[ ! -f "$ENV_FILE" ]]; then
  log "Missing env file: $ENV_FILE"
  exit 1
fi

select_backup_file() {
  local backup_file="${RESTORE_DRILL_BACKUP_FILE:-}"
  if [[ -n "$backup_file" ]]; then
    if [[ ! -f "$backup_file" ]]; then
      log "Configured RESTORE_DRILL_BACKUP_FILE does not exist: $backup_file"
      return 1
    fi
    echo "$backup_file"
    return 0
  fi

  local latest_backup
  latest_backup="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'coach-*.sql.enc' -print | sort -r | head -n 1 || true)"
  if [[ -z "$latest_backup" ]]; then
    log "No encrypted backup found in $BACKUP_DIR. Creating one via backup.sh."
    "$SCRIPT_DIR/backup.sh" "$ENV_FILE" "$BACKUP_DIR"
    latest_backup="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'coach-*.sql.enc' -print | sort -r | head -n 1 || true)"
    if [[ -z "$latest_backup" ]]; then
      log "backup.sh completed but no encrypted backup file was found."
      return 1
    fi
  fi
  echo "$latest_backup"
}

http_smoke_check() {
  local name="$1"
  local url="$2"
  local status
  status="$(curl -k -sS --max-time 15 -o /dev/null -w "%{http_code}" "$url")"
  if [[ "$status" =~ ^(2|3)[0-9][0-9]$ ]]; then
    log "smoke_${name}=ok http_status=$status url=$url"
    return 0
  fi

  log "smoke_${name}=failed http_status=$status url=$url"
  return 1
}

log "stage=backup_selection"
BACKUP_FILE="$(select_backup_file)"
log "selected_backup_file=$BACKUP_FILE"

log "stage=restore"
"$SCRIPT_DIR/restore.sh" "$BACKUP_FILE" "$ENV_FILE"

log "stage=smoke_login"
http_smoke_check "login" "$DRILL_BASE_URL/login"

log "stage=smoke_dashboard"
http_smoke_check "dashboard" "$DRILL_BASE_URL/dashboard"

record_success
