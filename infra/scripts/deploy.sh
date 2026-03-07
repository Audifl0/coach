#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ENV_FILE="/opt/coach/.env.production"
ENV_FILE="${1:-$DEFAULT_ENV_FILE}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "Docker Compose is required but not installed." >&2
  exit 1
fi

echo "Deploying stack with env: $ENV_FILE"
"${COMPOSE_CMD[@]}" --env-file "$ENV_FILE" pull
"${COMPOSE_CMD[@]}" --env-file "$ENV_FILE" build --pull
"${COMPOSE_CMD[@]}" --env-file "$ENV_FILE" up -d --remove-orphans

if [[ -n "${APP_DOMAIN:-}" ]]; then
  if [[ "${DEPLOY_SKIP_POST_DEPLOY_SMOKE:-0}" != "1" ]]; then
    "$SCRIPT_DIR/smoke-test-https.sh" "https://${APP_DOMAIN}"
    node "$SCRIPT_DIR/smoke-authenticated-dashboard.mjs" "https://${APP_DOMAIN}"
  fi
fi

echo "Deployment complete."
