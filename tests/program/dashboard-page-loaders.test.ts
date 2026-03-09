import assert from 'node:assert/strict';
import test from 'node:test';

import type { ProgramSessionSummary } from '../../src/lib/program/contracts';
import {
  pickDashboardSession,
  resolveDashboardRoute,
  resolveDashboardSectionOrder,
} from '../../src/app/(private)/dashboard/page-helpers';
import {
  loadDashboardProgramTodaySection,
  loadDashboardTrendsSection,
} from '../../src/server/dashboard/program-dashboard';

function createSessionSummary(overrides: Partial<ProgramSessionSummary> = {}): ProgramSessionSummary {
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

test('dashboard route resolution preserves login and onboarding redirects before dashboard render', async () => {
  const loginRoute = await resolveDashboardRoute(null, async () => null);
  assert.equal(loginRoute, 'login');

  const onboardingRoute = await resolveDashboardRoute({ userId: 'user_1' }, async () => ({
    goal: null,
    weeklySessionTarget: null,
    sessionDuration: null,
    equipmentCategories: [],
    limitationsDeclared: false,
    limitations: [],
  }));
  assert.equal(onboardingRoute, 'onboarding');

  const dashboardRoute = await resolveDashboardRoute({ userId: 'user_1' }, async () => ({
    goal: 'muscle_gain',
    weeklySessionTarget: 4,
    sessionDuration: 60,
    equipmentCategories: ['barbell'],
    limitationsDeclared: false,
    limitations: [],
  }));
  assert.equal(dashboardRoute, 'dashboard');
});

test('dashboard section ordering remains today -> adaptive? -> trends? -> history', () => {
  assert.deepEqual(resolveDashboardSectionOrder({ hasAdaptiveForecast: false, hasTrends: false }), [
    'today-workout',
    'session-history',
  ]);
  assert.deepEqual(resolveDashboardSectionOrder({ hasAdaptiveForecast: true, hasTrends: false }), [
    'today-workout',
    'adaptive-forecast',
    'session-history',
  ]);
  assert.deepEqual(resolveDashboardSectionOrder({ hasAdaptiveForecast: false, hasTrends: true }), [
    'today-workout',
    'trends-summary',
    'session-history',
  ]);
  assert.deepEqual(resolveDashboardSectionOrder({ hasAdaptiveForecast: true, hasTrends: true }), [
    'today-workout',
    'adaptive-forecast',
    'trends-summary',
    'session-history',
  ]);
});

test('dashboard today and trends loader outcomes stay explicit: ready, empty, and error', async () => {
  const readyToday = await loadDashboardProgramTodaySection({
    getTodayOrNextSessionCandidates: async () => ({
      todaySession: createSessionSummary(),
      nextSession: null,
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
    getTrendSummary: async () => ({
      period: '30d',
      generatedAt: '2026-03-05T12:00:00.000Z',
      metrics: {
        volume: { kpi: 1000, unit: 'kg', points: [{ date: '2026-03-05', value: 1000 }] },
        intensity: { kpi: 80, unit: 'kg', points: [{ date: '2026-03-05', value: 80 }] },
        adherence: { kpi: 0.7, unit: 'ratio', points: [{ date: '2026-03-05', value: 0.7 }] },
      },
    }),
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

test('dashboard session selection still prioritizes today over next fallback', () => {
  const selectedToday = pickDashboardSession({
    todaySession: createSessionSummary({ id: 'today_1' }),
    nextSession: createSessionSummary({ id: 'next_1', scheduledDate: '2026-03-06' }),
    primaryAction: 'start_workout',
  });
  assert.equal(selectedToday.mode, 'today');
  assert.equal(selectedToday.topSession?.id, 'today_1');

  const selectedNext = pickDashboardSession({
    todaySession: null,
    nextSession: createSessionSummary({ id: 'next_1', scheduledDate: '2026-03-06' }),
    primaryAction: 'start_workout',
  });
  assert.equal(selectedNext.mode, 'next');
  assert.equal(selectedNext.topSession?.id, 'next_1');
});
