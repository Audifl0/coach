#!/usr/bin/env bash
set -euo pipefail

SCHEDULE="${1:-0 3 * * 1}"
TAG="# adaptive-corpus-refresh"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${2:-/opt/coach/.env.production}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}" >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE_BIN="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_BIN="docker-compose"
else
  echo "Docker Compose is required but not installed." >&2
  exit 1
fi

COMMAND="cd ${REPO_ROOT} && ${COMPOSE_BIN} --profile worker --env-file ${ENV_FILE} run --rm worker"
ENTRY="${SCHEDULE} ${COMMAND} ${TAG}"

CURRENT_CRON="$(crontab -l 2>/dev/null || true)"
FILTERED_CRON="$(printf '%s\n' "${CURRENT_CRON}" | grep -v "${TAG}" || true)"

{
  if [ -n "${FILTERED_CRON}" ]; then
    printf '%s\n' "${FILTERED_CRON}"
  fi
  printf '%s\n' "${ENTRY}"
} | crontab -

printf 'Installed weekly adaptive corpus worker cron job:\n%s\n' "${ENTRY}"
