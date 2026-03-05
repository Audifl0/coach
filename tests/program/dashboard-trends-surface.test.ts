import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ProgramTrendsSummaryResponse } from '../../src/lib/program/contracts';
import {
  TrendsSummaryCard,
  createDefaultTrendsSummaryState,
  createSummaryToggleOptions,
} from '../../src/app/(private)/dashboard/_components/trends-summary-card';
import {
  TrendsDrilldown,
  buildExerciseTrendRequestPath,
  mapExerciseSeries,
} from '../../src/app/(private)/dashboard/_components/trends-drilldown';
import {
  buildDashboardTrendsRequest,
  loadProgramTrendsData,
  resolveDashboardSectionOrder,
} from '../../src/app/(private)/dashboard/page';

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

function createExerciseSeriesFixture() {
  return {
    period: '30d' as const,
    exercise: {
      key: 'goblet_squat',
      displayName: 'Goblet Squat',
      movementPattern: 'squat' as const,
    },
    points: [
      { date: '2026-03-03', reps: 32, load: 22.5 },
      { date: '2026-03-04', reps: 30, load: 24 },
      { date: '2026-03-05', reps: 28, load: 25 },
    ],
  };
}

test('summary card renders exactly three KPI mini-chart cards for volume intensity and adherence', () => {
  const html = renderToStaticMarkup(React.createElement(TrendsSummaryCard, { initialData: createSummaryFixture() }));

  assert.equal((html.match(/data-testid="trend-metric-card"/g) ?? []).length, 3);
  assert.match(html, /Volume/);
  assert.match(html, /Intensity/);
  assert.match(html, /Adherence/);
  assert.match(html, /12,450/);
});

test('summary state defaults to 30d and exposes only 7d 30d 90d toggles', () => {
  const state = createDefaultTrendsSummaryState(createSummaryFixture());
  const toggles = createSummaryToggleOptions();

  assert.equal(state.period, '30d');
  assert.deepEqual(
    toggles.map((item) => item.period),
    ['7d', '30d', '90d'],
  );
});

test('summary helpers remain visual-only and never output delta arrows or interpretation badges', () => {
  const html = renderToStaticMarkup(React.createElement(TrendsSummaryCard, { initialData: createSummaryFixture() }));

  assert.equal(html.includes('▲'), false);
  assert.equal(html.includes('▼'), false);
  assert.equal(html.includes('badge'), false);
  assert.equal(html.includes('delta'), false);
});

test('drilldown renders separate reps and load series for selected exercise', () => {
  const mapped = mapExerciseSeries(createExerciseSeriesFixture());
  const html = renderToStaticMarkup(
    React.createElement(TrendsDrilldown, {
      period: '30d',
      exerciseKey: 'goblet_squat',
      data: createExerciseSeriesFixture(),
    }),
  );

  assert.equal(mapped.repsPoints.length, 3);
  assert.equal(mapped.loadPoints.length, 3);
  assert.match(html, /Reps evolution/);
  assert.match(html, /Load evolution/);
});

test('dashboard summary remains compact and does not embed exercise-level charts inline', () => {
  const html = renderToStaticMarkup(React.createElement(TrendsSummaryCard, { initialData: createSummaryFixture() }));

  assert.equal(html.includes('Reps evolution'), false);
  assert.equal(html.includes('Load evolution'), false);
});

test('drilldown request path is scoped to selected period and selected exercise key', () => {
  assert.equal(
    buildExerciseTrendRequestPath({ period: '7d', exerciseKey: 'barbell_row' }),
    '/api/program/trends/barbell_row?period=7d',
  );
  assert.equal(
    buildExerciseTrendRequestPath({ period: '90d', exerciseKey: 'goblet_squat' }),
    '/api/program/trends/goblet_squat?period=90d',
  );
});

test('dashboard section order places trends below adaptive forecast and above history', () => {
  assert.deepEqual(resolveDashboardSectionOrder({ hasAdaptiveForecast: true, hasTrends: true }), [
    'today-workout',
    'adaptive-forecast',
    'trends-summary',
    'session-history',
  ]);
});

test('initial trends request is period=30d and uses no-store cache policy', () => {
  const request = buildDashboardTrendsRequest({ origin: 'http://localhost', cookieHeader: 'sid=abc' });

  assert.equal(request.url, 'http://localhost/api/program/trends?period=30d');
  assert.equal(request.init.cache, 'no-store');
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.headers.cookie, 'sid=abc');
});

test('trends loader degrades gracefully to null when trends API fails', async () => {
  const result = await loadProgramTrendsData({
    origin: 'http://localhost',
    cookieHeader: 'sid=abc',
    fetchImpl: async () => new Response(JSON.stringify({ error: 'boom' }), { status: 500 }),
  });

  assert.equal(result, null);
});
