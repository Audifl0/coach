import assert from 'node:assert/strict';
import test from 'node:test';

import { createProgramTrendsExerciseGetHandler } from '../../src/app/api/program/trends/[exerciseKey]/route-handlers';
import { createProgramTrendsGetHandler } from '../../src/app/api/program/trends/route-handlers';

test('unauthenticated requests return 401 on trend summary and exercise drilldown routes', async () => {
  const getSummary = createProgramTrendsGetHandler({
    resolveSession: async () => null,
    getTrendSummary: async () => {
      throw new Error('not expected');
    },
  });

  const getExercise = createProgramTrendsExerciseGetHandler({
    resolveSession: async () => null,
    getExerciseTrendSeries: async () => {
      throw new Error('not expected');
    },
  });

  const summaryResponse = await getSummary(new Request('http://localhost/api/program/trends?period=30d'));
  assert.equal(summaryResponse.status, 401);

  const exerciseResponse = await getExercise(
    new Request('http://localhost/api/program/trends/barbell_back_squat?period=30d'),
    { params: Promise.resolve({ exerciseKey: 'barbell_back_squat' }) },
  );
  assert.equal(exerciseResponse.status, 401);
});

test('valid period query returns parse-validated summary trend payload', async () => {
  const getSummary = createProgramTrendsGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getTrendSummary: async ({ period }) => ({
      period,
      generatedAt: '2026-03-05T12:00:00.000Z',
      metrics: {
        volume: {
          kpi: 8450,
          unit: 'kg',
          points: [
            { date: '2026-03-04', value: 2750 },
            { date: '2026-03-05', value: 3100 },
          ],
        },
        intensity: {
          kpi: 82.5,
          unit: 'kg',
          points: [
            { date: '2026-03-04', value: 80 },
            { date: '2026-03-05', value: 85 },
          ],
        },
        adherence: {
          kpi: 0.66,
          unit: 'ratio',
          points: [
            { date: '2026-03-04', value: 1 },
            { date: '2026-03-05', value: 0 },
          ],
        },
      },
    }),
  });

  const response = await getSummary(new Request('http://localhost/api/program/trends?period=30d'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.period, '30d');
  assert.equal(body.metrics.volume.unit, 'kg');
  assert.equal(body.metrics.adherence.points.length, 2);
});

test('invalid query and missing drilldown data return deterministic 400 and 404 responses', async () => {
  const getSummary = createProgramTrendsGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getTrendSummary: async () => {
      throw new Error('not expected');
    },
  });

  const invalidSummary = await getSummary(new Request('http://localhost/api/program/trends?period=custom'));
  assert.equal(invalidSummary.status, 400);

  const getExercise = createProgramTrendsExerciseGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getExerciseTrendSeries: async () => null,
  });

  const missingExercise = await getExercise(
    new Request('http://localhost/api/program/trends/barbell_back_squat?period=30d'),
    { params: Promise.resolve({ exerciseKey: 'barbell_back_squat' }) },
  );
  assert.equal(missingExercise.status, 404);

  const invalidExercise = await getExercise(
    new Request('http://localhost/api/program/trends/barbell_back_squat?period=custom'),
    { params: Promise.resolve({ exerciseKey: 'barbell_back_squat' }) },
  );
  assert.equal(invalidExercise.status, 400);
});
