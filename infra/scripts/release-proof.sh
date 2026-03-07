#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEFAULT_ENV_FILE="/opt/coach/.env.production"
ENV_FILE="${1:-$DEFAULT_ENV_FILE}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

if [[ -z "${APP_DOMAIN:-}" ]]; then
  echo "APP_DOMAIN is required for release proof." >&2
  exit 1
fi

BASE_URL="https://${APP_DOMAIN}"

run_stage() {
  local stage_name="$1"
  shift

  echo "==> ${stage_name}"
  "$@"
}

cd "$PROJECT_ROOT"

run_stage "typecheck" corepack pnpm typecheck
run_stage "test" corepack pnpm test
run_stage "build" corepack pnpm build
run_stage "deploy" env DEPLOY_SKIP_POST_DEPLOY_SMOKE=1 "$SCRIPT_DIR/deploy.sh" "$ENV_FILE"
run_stage "https_smoke" "$SCRIPT_DIR/smoke-test-https.sh" "$BASE_URL"
run_stage "authenticated_smoke" node "$SCRIPT_DIR/smoke-authenticated-dashboard.mjs" "$BASE_URL"

echo "Release proof passed."
