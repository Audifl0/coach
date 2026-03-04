#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  if [[ -n "${APP_DOMAIN:-}" ]]; then
    TARGET="https://${APP_DOMAIN}"
  else
    echo "Usage: $0 https://your-domain.tld[/path]" >&2
    exit 1
  fi
fi

if [[ "$TARGET" != https://* ]]; then
  echo "Target must be an https URL: $TARGET" >&2
  exit 1
fi

echo "Running HTTPS smoke test for: $TARGET"
STATUS_CODE="$(curl --silent --show-error --output /dev/null --write-out "%{http_code}" --max-time 20 "$TARGET")"

if [[ "$STATUS_CODE" -ge 200 && "$STATUS_CODE" -lt 400 ]]; then
  echo "Smoke test passed with HTTP $STATUS_CODE"
  exit 0
fi

echo "Smoke test failed with HTTP $STATUS_CODE" >&2
exit 1
