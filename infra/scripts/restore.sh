#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_FILE="${1:-}"
ENV_FILE="${2:-$PROJECT_ROOT/.env.production}"

if [[ -z "$BACKUP_FILE" ]]; then
  echo "Usage: $0 /path/to/backup.sql.enc [env-file]" >&2
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
  echo "BACKUP_PASSPHRASE is required to decrypt backups." >&2
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

set -a
source "$ENV_FILE"
set +a

POSTGRES_USER="${POSTGRES_USER:-coach}"
POSTGRES_DB="${POSTGRES_DB:-coach}"
DECRYPTED_SQL="$(mktemp "${TMPDIR:-/tmp}/coach-restore.XXXXXX.sql")"

cleanup() {
  rm -f "$DECRYPTED_SQL"
}
trap cleanup EXIT

echo "Decrypting backup..."
openssl enc -d -aes-256-cbc -pbkdf2 \
  -pass env:BACKUP_PASSPHRASE \
  -in "$BACKUP_FILE" \
  -out "$DECRYPTED_SQL"

echo "Restoring PostgreSQL database '$POSTGRES_DB'..."
"${COMPOSE_CMD[@]}" --env-file "$ENV_FILE" exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <"$DECRYPTED_SQL"

echo "Restore complete."
