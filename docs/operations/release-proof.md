# Release Proof Runbook

## Scope

This runbook defines the narrow phase-09 release gate that proves the repo can
typecheck, test, build, deploy, answer over HTTPS, and serve authenticated
dashboard business data with the existing ops scripts.

Use it after the branch already satisfies the phase-08 preconditions:

- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- deploy env/secrets flow from `vps-deploy.md`
- auth throttling and phase-09 authenticated smoke setup

## Prerequisites

- Run from the repository root on the deploy host or equivalent release shell.
- Docker Engine and Docker Compose are available for `infra/scripts/deploy.sh`.
- The external deploy env file exists at `/opt/coach/.env.production` or at the
  explicit path you will pass to the command.
- The env file includes the narrow release-proof contract:
  - `APP_DOMAIN`
  - `OPS_SMOKE_USERNAME`
  - `OPS_SMOKE_PASSWORD`
  - `OPS_SMOKE_EXPECTED_FOCUS_LABEL`
- The smoke account is non-production and owns dashboard data whose
  `/api/program/today` response includes `OPS_SMOKE_EXPECTED_FOCUS_LABEL`.

For deploy-host preparation and env-file ownership rules, follow
`docs/operations/vps-deploy.md` first.

## Command

Run the proof with the package entrypoint and explicit env path:

```bash
corepack pnpm release:proof -- /opt/coach/.env.production
```

Equivalent direct shell invocation:

```bash
bash infra/scripts/release-proof.sh /opt/coach/.env.production
```

## Stage Order

The release proof is intentionally deterministic and fail-fast:

1. `==> typecheck`
2. `==> test`
3. `==> build`
4. `==> deploy`
5. `==> https_smoke`
6. `==> authenticated_smoke`

The wrapper reuses:

- `infra/scripts/deploy.sh`
- `infra/scripts/smoke-test-https.sh`
- `infra/scripts/smoke-authenticated-dashboard.mjs`

It does not add browser automation, CI-only assumptions, or a second deploy
implementation.

## Evidence Contract

A valid pass should capture the release-proof output in a timestamped log, for
example:

```bash
mkdir -p logs/release-proof
corepack pnpm release:proof -- /opt/coach/.env.production \
  | tee "logs/release-proof/release-proof-$(date -u +%Y%m%dT%H%M%SZ).log"
```

Evidence is sufficient only when the log contains all of the following:

- `==> typecheck`
- `==> test`
- `==> build`
- `==> deploy`
- `==> https_smoke`
- `==> authenticated_smoke`
- `Smoke test passed with HTTP`
- `smoke_login=ok`
- `smoke_dashboard=ok`
- `smoke_business_data=ok`
- `Release proof passed.`

Treat the authenticated smoke output as required evidence of business data, not
an optional follow-up note.

## Stop Conditions

Stop immediately and treat the proof as failed when any stage exits non-zero.
Do not continue manually to later stages after a failure.

Common stop conditions:

- `typecheck`, `test`, or `build` fails on the release candidate branch
- `infra/scripts/deploy.sh` fails to pull, build, or start the stack
- HTTPS smoke returns a non-2xx/3xx response
- Authenticated smoke cannot log in
- Authenticated smoke reaches `/dashboard` but does not find the expected focus
  label in `/api/program/today`

## Operator Flow

1. Review the env contract and deploy prerequisites in `vps-deploy.md`.
2. Run the release proof command.
3. Save the release-proof log as the deploy evidence artifact.
4. If the proof fails, fix the failing stage before attempting another release.

## Related Runbooks

- `docs/operations/vps-deploy.md`
- `docs/operations/restore-drill-runbook.md`
