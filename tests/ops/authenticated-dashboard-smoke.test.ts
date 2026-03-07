import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { parseOpsRuntimeConfig } from '../../src/server/env/ops-config';
import { runAuthenticatedDashboardSmoke } from '../../infra/scripts/smoke-authenticated-dashboard.mjs';

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

test('authenticated dashboard smoke logs in, reuses the session cookie, and verifies business data', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const logs: string[] = [];

  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });

    if (url.endsWith('/api/auth/login')) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'set-cookie': 'coach_session=test-session; Path=/; HttpOnly; Secure; SameSite=Lax',
        },
      });
    }

    if (url.endsWith('/dashboard')) {
      return new Response('<html><body>Dashboard</body></html>', { status: 200 });
    }

    if (url.endsWith('/api/program/today')) {
      return new Response(
        JSON.stringify({
          todaySession: {
            id: 'session_1',
            scheduledDate: '2026-03-07',
            dayIndex: 0,
            focusLabel: 'Upper Body',
            state: 'planned',
            exercises: [],
          },
          nextSession: null,
          primaryAction: 'start_workout',
        }),
        { status: 200 },
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  await runAuthenticatedDashboardSmoke({
    baseUrl: 'https://coach.example.com',
    username: 'release-smoke',
    password: 'smoke-secret',
    expectedFocusLabel: 'Upper Body',
    fetchImpl,
    log: (message) => logs.push(message),
  });

  assert.equal(calls.length, 3);
  assert.equal(calls[0]?.url, 'https://coach.example.com/api/auth/login');
  assert.equal(calls[0]?.init?.method, 'POST');
  assert.match(String(calls[1]?.init?.headers instanceof Headers ? calls[1]?.init?.headers.get('cookie') : (calls[1]?.init?.headers as Record<string, string>).cookie), /coach_session=test-session/);
  assert.equal(calls[2]?.url, 'https://coach.example.com/api/program/today');
  assert.match(logs.join('\n'), /smoke_login=ok/);
  assert.match(logs.join('\n'), /smoke_dashboard=ok/);
  assert.match(logs.join('\n'), /smoke_business_data=ok/);
});

test('deploy and restore scripts invoke the authenticated smoke helper with the centralized env contract', async () => {
  const [deployScript, restoreDrillScript] = await Promise.all([
    readProjectFile('infra/scripts/deploy.sh'),
    readProjectFile('infra/scripts/run-restore-drill.sh'),
  ]);

  assert.match(deployScript, /source "\$ENV_FILE"/);
  assert.match(deployScript, /smoke-authenticated-dashboard\.mjs/);
  assert.match(restoreDrillScript, /stage=smoke_dashboard_authenticated/);
  assert.match(restoreDrillScript, /smoke-authenticated-dashboard\.mjs/);
});
