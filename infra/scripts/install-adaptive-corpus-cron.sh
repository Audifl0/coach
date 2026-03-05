#!/usr/bin/env bash
set -euo pipefail

SCHEDULE="${1:-0 3 * * 1}"
TAG="# adaptive-corpus-refresh"
COMMAND="cd $(pwd) && corepack pnpm tsx scripts/adaptive-knowledge/refresh-corpus.ts"
ENTRY="${SCHEDULE} ${COMMAND} ${TAG}"

CURRENT_CRON="$(crontab -l 2>/dev/null || true)"
FILTERED_CRON="$(printf '%s\n' "${CURRENT_CRON}" | grep -v "${TAG}" || true)"

{
  if [ -n "${FILTERED_CRON}" ]; then
    printf '%s\n' "${FILTERED_CRON}"
  fi
  printf '%s\n' "${ENTRY}"
} | crontab -

printf 'Installed weekly adaptive corpus refresh cron job:\n%s\n' "${ENTRY}"
