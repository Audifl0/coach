import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildAdaptiveForecastViewModel } from '../../src/lib/adaptive-coaching/forecast';
import { AdaptiveForecastCard } from '../../src/app/(private)/dashboard/components/adaptive-forecast-card';
import { resolveAdaptiveForecastCard } from '../../src/app/(private)/dashboard/page-helpers';

type DashboardRecommendation = NonNullable<Parameters<typeof resolveAdaptiveForecastCard>[0]>;

function createRecommendation(overrides: Partial<DashboardRecommendation> = {}): DashboardRecommendation {
  return {
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
    progressionDeltaLoadPct: 2.5,
    progressionDeltaReps: 1,
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

test('dashboard resolves forecast card data when recommendation exists for upcoming session', () => {
  const viewModel = resolveAdaptiveForecastCard(createRecommendation());

  assert.equal(viewModel?.title, 'Prevision prochaine seance');
  assert.equal(viewModel?.actionLabel, 'Progression moderee');
});

test('adaptive forecast card renders prudent variant when warning or fallback applies', () => {
  const markup = renderToStaticMarkup(
    createElement(AdaptiveForecastCard, {
      forecast: buildAdaptiveForecastViewModel(
        createRecommendation({
          warningFlag: true,
          warningText: 'Charge non recommandee sur zone sensible',
        }),
      ),
    }),
  );

  assert.match(markup, /Prevision prudente/);
  assert.match(markup, /Charge non recommandee sur zone sensible/);
});

test('adaptive forecast card renders 2-3 reasons with evidence source tags', () => {
  const markup = renderToStaticMarkup(
    createElement(AdaptiveForecastCard, {
      forecast: buildAdaptiveForecastViewModel(
        createRecommendation({
          reasons: ['RPE stable', 'Recuperation en hausse', 'Technique reguliere'],
          evidenceTags: ['G-001', 'R-101', 'E-201'],
        }),
      ),
    }),
  );

  assert.match(markup, /RPE stable/);
  assert.match(markup, /Recuperation en hausse/);
  assert.match(markup, /Technique reguliere/);
  assert.match(markup, /G-001/);
  assert.match(markup, /R-101/);
  assert.match(markup, /E-201/);
});
