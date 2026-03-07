import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { parseOpsRuntimeConfig } from '../../src/server/env/ops-config';

const projectRoot = path.resolve(__dirname, '..', '..');

type TestEnv = Partial<Record<string, string | undefined>>;

const REQUIRED_OPS_VARS = [
  'APP_DOMAIN',
  'POSTGRES_DB',
  'RESTORE_TARGET_DB',
  'OPS_SMOKE_USERNAME',
  'OPS_SMOKE_PASSWORD',
  'OPS_SMOKE_EXPECTED_FOCUS_LABEL',
] as const;

function buildEnv(overrides: TestEnv = {}): TestEnv {
  return {
    APP_DOMAIN: 'coach.example.com',
    POSTGRES_DB: 'coach',
    RESTORE_TARGET_DB: 'coach_restore_drill',
    RESTORE_DRILL_BASE_URL: 'http://127.0.0.1:3000',
    OPS_SMOKE_USERNAME: 'release-smoke',
    OPS_SMOKE_PASSWORD: 'smoke-secret',
    OPS_SMOKE_EXPECTED_FOCUS_LABEL: 'Upper Body',
    ...overrides,
  };
}

async function readProjectFile(relativePath: string): Promise<string> {
  return readFile(path.join(projectRoot, relativePath), 'utf8');
}

test('ops runtime config parses the narrow release-facing contract without unrelated env requirements', () => {
  const parsed = parseOpsRuntimeConfig(buildEnv());

  assert.equal(parsed.appDomain, 'coach.example.com');
  assert.equal(parsed.deployBaseUrl, 'https://coach.example.com');
  assert.equal(parsed.productionDatabaseName, 'coach');
  assert.equal(parsed.restore.targetDatabaseName, 'coach_restore_drill');
  assert.equal(parsed.restore.baseUrl, 'http://127.0.0.1:3000');
  assert.equal(parsed.smoke.username, 'release-smoke');
  assert.equal(parsed.smoke.password, 'smoke-secret');
  assert.equal(parsed.smoke.expectedFocusLabel, 'Upper Body');
});

test('ops runtime config fails clearly for missing or malformed release-proof inputs', () => {
  assert.throws(() => parseOpsRuntimeConfig(buildEnv({ APP_DOMAIN: undefined })), /APP_DOMAIN/);
  assert.throws(() => parseOpsRuntimeConfig(buildEnv({ RESTORE_TARGET_DB: undefined })), /RESTORE_TARGET_DB/);
  assert.throws(() => parseOpsRuntimeConfig(buildEnv({ OPS_SMOKE_USERNAME: undefined })), /OPS_SMOKE_USERNAME/);
  assert.throws(() => parseOpsRuntimeConfig(buildEnv({ OPS_SMOKE_PASSWORD: undefined })), /OPS_SMOKE_PASSWORD/);
  assert.throws(
    () => parseOpsRuntimeConfig(buildEnv({ OPS_SMOKE_EXPECTED_FOCUS_LABEL: undefined })),
    /OPS_SMOKE_EXPECTED_FOCUS_LABEL/,
  );
  assert.throws(
    () => parseOpsRuntimeConfig(buildEnv({ RESTORE_DRILL_BASE_URL: 'not-a-url' })),
    /RESTORE_DRILL_BASE_URL/,
  );
  assert.throws(
    () => parseOpsRuntimeConfig(buildEnv({ RESTORE_TARGET_DB: 'coach' })),
    /RESTORE_TARGET_DB/,
  );
});

test('.env example and runbooks describe the same phase-09 ops contract', async () => {
  const [envExample, deployRunbook, restoreRunbook] = await Promise.all([
    readProjectFile('.env.example'),
    readProjectFile('docs/operations/vps-deploy.md'),
    readProjectFile('docs/operations/restore-drill-runbook.md'),
  ]);

  for (const variableName of REQUIRED_OPS_VARS) {
    assert.match(envExample, new RegExp(variableName));
    assert.match(deployRunbook, new RegExp(variableName));
    assert.match(restoreRunbook, new RegExp(variableName));
  }
});

test('ops config remains scoped to release-proof inputs instead of provider or pipeline contracts', () => {
  const parsed = parseOpsRuntimeConfig({
    APP_DOMAIN: 'coach.example.com',
    POSTGRES_DB: 'coach',
    RESTORE_TARGET_DB: 'coach_restore_drill',
    OPS_SMOKE_USERNAME: 'release-smoke',
    OPS_SMOKE_PASSWORD: 'smoke-secret',
    OPS_SMOKE_EXPECTED_FOCUS_LABEL: 'Upper Body',
  });

  assert.equal(parsed.restore.baseUrl, 'http://127.0.0.1:3000');
});
