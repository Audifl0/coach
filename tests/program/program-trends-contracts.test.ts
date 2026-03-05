import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseProgramTrendQueryInput,
  parseProgramTrendsExerciseResponse,
  parseProgramTrendsSummaryResponse,
} from '../../src/lib/program/contracts';

test('trend query parser accepts only 7d/30d/90d periods', () => {
  assert.equal(parseProgramTrendQueryInput({ period: '7d' }).period, '7d');
  assert.equal(parseProgramTrendQueryInput({ period: '30d' }).period, '30d');
  assert.equal(parseProgramTrendQueryInput({ period: '90d' }).period, '90d');

  assert.throws(() => parseProgramTrendQueryInput({ period: 'custom' }));
  assert.throws(() => parseProgramTrendQueryInput({ period: '14d' }));
});

test('summary response schema requires deterministic metric cards with KPI and points', () => {
  const parsed = parseProgramTrendsSummaryResponse({
    period: '30d',
    generatedAt: '2026-03-05T12:00:00.000Z',
    metrics: {
      volume: {
        kpi: 8450,
        unit: 'kg',
        points: [
          { date: '2026-03-03', value: 2750 },
          { date: '2026-03-04', value: 3100 },
        ],
      },
      intensity: {
        kpi: 82.5,
        unit: 'kg',
        points: [
          { date: '2026-03-03', value: 80 },
          { date: '2026-03-04', value: 85 },
        ],
      },
      adherence: {
        kpi: 0.66,
        unit: 'ratio',
        points: [
          { date: '2026-03-03', value: 1 },
          { date: '2026-03-04', value: 0 },
        ],
      },
    },
  });

  assert.equal(parsed.period, '30d');
  assert.equal(parsed.metrics.volume.points.length, 2);
  assert.equal(parsed.metrics.intensity.kpi, 82.5);
  assert.equal(parsed.metrics.adherence.unit, 'ratio');

  assert.throws(() =>
    parseProgramTrendsSummaryResponse({
      period: '30d',
      generatedAt: '2026-03-05T12:00:00.000Z',
      metrics: {
        volume: { kpi: 1, unit: 'kg', points: [{ date: '2026-03-03', value: 1 }] },
        intensity: { kpi: 1, unit: 'kg', points: [{ date: '2026-03-03', value: 1 }] },
      },
    }),
  );
});

test('exercise drilldown response schema requires identity and line-ready reps/load points', () => {
  const parsed = parseProgramTrendsExerciseResponse({
    period: '30d',
    exercise: {
      key: 'barbell_back_squat',
      displayName: 'Barbell Back Squat',
    },
    points: [
      { date: '2026-03-01', reps: 24, load: 80 },
      { date: '2026-03-03', reps: 25, load: 82.5 },
    ],
  });

  assert.equal(parsed.exercise.key, 'barbell_back_squat');
  assert.equal(parsed.points[0]?.reps, 24);
  assert.equal(parsed.points[1]?.load, 82.5);

  assert.throws(() =>
    parseProgramTrendsExerciseResponse({
      period: '30d',
      exercise: {
        key: 'barbell_back_squat',
        displayName: '',
      },
      points: [{ date: '2026-03-01', reps: 24, load: 80 }],
    }),
  );
});
