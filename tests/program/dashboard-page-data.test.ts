import assert from 'node:assert/strict';
import test from 'node:test';

import type { ProgramSessionSummary, ProgramTrendsSummaryResponse } from '../../src/lib/program/contracts';
import {
  loadDashboardProgramTodaySection,
  loadDashboardTrendsSection,
} from '../../src/server/dashboard/program-dashboard';

type SessionSummaryOverrides = Partial<Omit<ProgramSessionSummary, 'exercises'>> & {
  exercises?: ProgramSessionSummary['exercises'];
};

function createSessionSummary(overrides: SessionSummaryOverrides = {}): ProgramSessionSummary {
  return {
    id: 'session_1',
    scheduledDate: '2026-03-04',
    dayIndex: 0,
    focusLabel: 'Lower Body',
    state: 'planned',
    exercises: [
      {
        id: 'exercise_1',
        exerciseKey: 'goblet_squat',
        displayName: 'Goblet Squat',
        movementPattern: 'squat',
        sets: 4,
        targetReps: 8,
        targetLoad: '24kg',
        restMinSec: 90,
        restMaxSec: 120,
        isSubstituted: false,
        originalExerciseKey: null,
      },
    ],
    ...overrides,
  };
}

function createSummaryFixture(): ProgramTrendsSummaryResponse {
  return {
    period: '30d',
    generatedAt: '2026-03-05T12:00:00.000Z',
    metrics: {
      volume: {
        kpi: 12450,
        unit: 'kg',
        points: [
          { date: '2026-03-03', value: 3500 },
          { date: '2026-03-04', value: 4400 },
          { date: '2026-03-05', value: 4550 },
        ],
      },
      intensity: {
        kpi: 81.4,
        unit: 'kg',
        points: [
          { date: '2026-03-03', value: 78.2 },
          { date: '2026-03-04', value: 80.5 },
          { date: '2026-03-05', value: 85.5 },
        ],
      },
      adherence: {
        kpi: 0.75,
        unit: 'ratio',
        points: [
          { date: '2026-03-03', value: 0.66 },
          { date: '2026-03-04', value: 0.75 },
          { date: '2026-03-05', value: 0.8 },
        ],
      },
    },
  };
}

test('today section loader resolves direct account-scoped data without request-derived host input', async () => {
  let called = false;
  const result = await loadDashboardProgramTodaySection({
    getTodayOrNextSessionCandidates: async () => {
      called = true;
      return {
        todaySession: createSessionSummary(),
        nextSession: createSessionSummary({ id: 'session_2', scheduledDate: '2026-03-06' }),
      };
    },
  });

  assert.equal(called, true);
  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') {
    assert.fail('expected ready today section');
  }

  assert.equal(result.data.todaySession?.id, 'session_1');
  assert.equal(result.data.nextSession, null);
  assert.equal(result.data.primaryAction, 'start_workout');
});

test('today and trends section loaders expose explicit ready empty and error states', async () => {
  const readyToday = await loadDashboardProgramTodaySection({
    getTodayOrNextSessionCandidates: async () => ({
      todaySession: null,
      nextSession: createSessionSummary({ id: 'session_2', scheduledDate: '2026-03-06' }),
    }),
  });
  const emptyToday = await loadDashboardProgramTodaySection({
    getTodayOrNextSessionCandidates: async () => ({
      todaySession: null,
      nextSession: null,
    }),
  });
  const errorToday = await loadDashboardProgramTodaySection({
    getTodayOrNextSessionCandidates: async () => {
      throw new Error('boom');
    },
  });

  const readyTrends = await loadDashboardTrendsSection({
    getTrendSummary: async (input) => {
      assert.deepEqual(input, { period: '30d' });
      return createSummaryFixture();
    },
  });
  const emptyTrends = await loadDashboardTrendsSection({
    getTrendSummary: async () => null,
  });
  const errorTrends = await loadDashboardTrendsSection({
    getTrendSummary: async () => {
      throw new Error('boom');
    },
  });

  assert.equal(readyToday.status, 'ready');
  assert.equal(emptyToday.status, 'empty');
  assert.equal(errorToday.status, 'error');
  assert.equal(readyTrends.status, 'ready');
  assert.equal(emptyTrends.status, 'empty');
  assert.equal(errorTrends.status, 'error');
});

test('trends section loader preserves the strict 30d summary contract and surfaces failures as error', async () => {
  const ready = await loadDashboardTrendsSection({
    getTrendSummary: async () => ({
      ...createSummaryFixture(),
      period: '30d',
    }),
  });

  assert.equal(ready.status, 'ready');
  if (ready.status !== 'ready') {
    assert.fail('expected ready trends section');
  }

  assert.equal(ready.data.period, '30d');
  assert.equal(ready.data.metrics.volume.kpi, 12450);
  assert.equal(ready.data.metrics.intensity.unit, 'kg');
  assert.equal(ready.data.metrics.adherence.unit, 'ratio');

  const invalid = await loadDashboardTrendsSection({
    getTrendSummary: async () => ({
      ...createSummaryFixture(),
      period: 'invalid',
    }),
  });

  assert.equal(invalid.status, 'error');
});
