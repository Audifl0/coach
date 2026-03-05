import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAdaptiveForecastViewModel } from '../../src/lib/adaptive-coaching/forecast';

function createRecommendation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rec_1',
    actionType: 'progress',
    status: 'applied',
    warningFlag: false,
    warningText: null,
    fallbackApplied: false,
    fallbackReason: null,
    reasons: ['Readiness stable this week', 'Execution quality improved'],
    evidenceTags: ['G-001', 'R-101'],
    forecastPayload: {
      projectedReadiness: 4,
      projectedRpe: 7,
      progressionDeltaLoadPct: 2.5,
      progressionDeltaReps: 1,
    },
    ...overrides,
  };
}

test('forecast builder returns upcoming-session projection for applied recommendation', () => {
  const viewModel = buildAdaptiveForecastViewModel(createRecommendation());

  assert.equal(viewModel.state, 'active');
  assert.equal(viewModel.title, 'Prevision prochaine seance');
  assert.equal(viewModel.actionLabel, 'Progression moderee');
  assert.deepEqual(viewModel.reasons, ['Readiness stable this week', 'Execution quality improved']);
  assert.deepEqual(viewModel.evidenceTags, ['G-001', 'R-101']);
  assert.equal(viewModel.projection.projectedReadiness, 4);
  assert.equal(viewModel.projection.projectedRpe, 7);
  assert.equal(viewModel.projection.progressionDeltaLoadPct, 2.5);
  assert.equal(viewModel.projection.progressionDeltaReps, 1);
});

test('forecast builder marks pending confirmation as awaiting decision', () => {
  const viewModel = buildAdaptiveForecastViewModel(
    createRecommendation({
      actionType: 'deload',
      status: 'pending_confirmation',
      reasons: ['Douleur persistante epaule', 'RPE eleve depuis 3 seances'],
    }),
  );

  assert.equal(viewModel.state, 'awaiting_decision');
  assert.equal(viewModel.actionLabel, 'Deload a confirmer');
  assert.equal(viewModel.prudenceLabel, null);
});

test('forecast builder forces prudent state when warning or fallback flags are active', () => {
  const warningViewModel = buildAdaptiveForecastViewModel(
    createRecommendation({
      warningFlag: true,
      warningText: 'Conflit avec limitation declaree',
    }),
  );
  assert.equal(warningViewModel.state, 'prevision_prudente');
  assert.equal(warningViewModel.prudenceLabel, 'Prevision prudente');
  assert.match(warningViewModel.prudenceReason ?? '', /Conflit avec limitation declaree/);

  const fallbackViewModel = buildAdaptiveForecastViewModel(
    createRecommendation({
      fallbackApplied: true,
      fallbackReason: 'low_confidence_hold',
    }),
  );
  assert.equal(fallbackViewModel.state, 'prevision_prudente');
  assert.equal(fallbackViewModel.prudenceLabel, 'Prevision prudente');
  assert.match(fallbackViewModel.prudenceReason ?? '', /low_confidence_hold/);
});
