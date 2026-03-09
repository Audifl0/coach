#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEFAULT_ENV_FILE="/opt/coach/.env.production"
ENV_FILE="${1:-$DEFAULT_ENV_FILE}"
BACKUP_DIR="${2:-$PROJECT_ROOT/backups}"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
  echo "BACKUP_PASSPHRASE is required for encrypted backups." >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "Docker Compose is required but not installed." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
ENCRYPTED_FILE="$BACKUP_DIR/coach-${TIMESTAMP}.sql.enc"

set -a
source "$ENV_FILE"
set +a

POSTGRES_USER="${POSTGRES_USER:-coach}"
POSTGRES_DB="${POSTGRES_DB:-coach}"

echo "Creating PostgreSQL dump for database '$POSTGRES_DB'..."
"${COMPOSE_CMD[@]}" --env-file "$ENV_FILE" exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  | openssl enc -aes-256-cbc -salt -pbkdf2 \
      -pass env:BACKUP_PASSPHRASE \
      -out "$ENCRYPTED_FILE"

echo "Backup created: $ENCRYPTED_FILE"
