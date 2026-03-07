import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { parseOpsRuntimeConfig } from '../../src/server/env/ops-config';
import { runAuthenticatedDashboardSmoke } from '../../infra/scripts/smoke-authenticated-dashboard.mjs';
import { createProgramTrendsGetHandler } from '../../src/app/api/program/trends/route-handlers';
import {
  loadDashboardProgramTodaySection,
  loadDashboardTrendsSection,
} from '../../src/server/dashboard/program-dashboard';
import { createAppLogger, logRouteFailure, type AppLogRecord } from '../../src/server/observability/app-logger';

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

function createTrendSummaryFixture() {
  return {
    period: '30d',
    generatedAt: '2026-03-05T12:00:00.000Z',
    metrics: {
      volume: {
        kpi: 12450,
        unit: 'kg',
        points: [{ date: '2026-03-05', value: 4550 }],
      },
      intensity: {
        kpi: 81.4,
        unit: 'kg',
        points: [{ date: '2026-03-05', value: 85.5 }],
      },
      adherence: {
        kpi: 0.75,
        unit: 'ratio',
        points: [{ date: '2026-03-05', value: 0.8 }],
      },
    },
  };
}

function createBufferedAppLogger() {
  const records: Array<{ level: 'error' | 'warn'; record: AppLogRecord }> = [];

  return {
    records,
    logger: createAppLogger((level, record) => {
      records.push({ level, record });
    }),
  };
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

test('route failure logs keep an allowlisted structured envelope only', () => {
  const { logger, records } = createBufferedAppLogger();

  logRouteFailure(
    {
      route: '/api/program/history',
      method: 'GET',
      status: 500,
      source: 'route_handler',
      error: Object.assign(new Error('private payload should not leak'), {
        body: { password: 'secret' },
        userId: 'user_1',
      }),
    },
    logger,
  );

  assert.equal(records.length, 1);
  assert.equal(records[0]?.level, 'error');
  assert.deepEqual(records[0]?.record, {
    event: 'route_failure',
    route: '/api/program/history',
    method: 'GET',
    status: 500,
    source: 'route_handler',
    errorName: 'Error',
  });
});

test('trends route logs unexpected failures and returns 500 without exposing request details', async () => {
  const { logger, records } = createBufferedAppLogger();
  const handler = createProgramTrendsGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getTrendSummary: async () => {
      throw new Error('private failure payload');
    },
    logger,
  });

  const response = await handler(new Request('http://localhost/api/program/trends?period=30d'));

  assert.equal(response.status, 500);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0]?.record, {
    event: 'route_failure',
    route: '/api/program/trends',
    method: 'GET',
    status: 500,
    source: 'route_handler',
    errorName: 'Error',
  });
});

test('dashboard degraded-path logging is explicit on failure and quiet on success', async () => {
  const { logger, records } = createBufferedAppLogger();

  const readyTrends = await loadDashboardTrendsSection({
    getTrendSummary: async () => createTrendSummaryFixture(),
    logger,
  });
  assert.equal(readyTrends.status, 'ready');
  assert.equal(records.length, 0);

  const degradedToday = await loadDashboardProgramTodaySection({
    getTodayOrNextSessionCandidates: async () => {
      throw new Error('private loader failure');
    },
    logger,
  });

  assert.equal(degradedToday.status, 'error');
  assert.equal(records.length, 1);
  assert.deepEqual(records[0]?.record, {
    event: 'degraded_path',
    route: '/dashboard',
    boundary: 'program_today',
    reason: 'load_failed',
  });
});
