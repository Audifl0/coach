import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseAdaptiveConfirmationInput,
  parseAdaptiveRecommendation,
  parseAdaptiveRecommendationProposal,
} from '../../src/lib/adaptive-coaching/contracts';

test('proposal parser accepts only allowed action/state values', () => {
  const parsed = parseAdaptiveRecommendationProposal({
    actionType: 'progress',
    plannedSessionId: 'session_1',
    reasons: ['ready to progress', 'all sets completed with margin'],
    evidenceTags: ['load_trend'],
    forecastProjection: {
      projectedReadiness: 4,
      projectedRpe: 8,
    },
  });

  assert.equal(parsed.actionType, 'progress');
  assert.equal(Object.hasOwn(parsed, 'status'), false);

  assert.throws(() =>
    parseAdaptiveRecommendationProposal({
      actionType: 'jump',
      plannedSessionId: 'session_1',
      reasons: ['x', 'y'],
      evidenceTags: ['load_trend'],
      forecastProjection: {
        projectedReadiness: 3,
        projectedRpe: 8,
      },
    }),
  );

  assert.throws(() =>
    parseAdaptiveRecommendationProposal({
      actionType: 'hold',
      status: 'unknown',
      plannedSessionId: 'session_1',
      reasons: ['x', 'y'],
      evidenceTags: ['load_trend'],
      forecastProjection: {
        projectedReadiness: 3,
        projectedRpe: 8,
      },
    }),
  );
});

test('recommendation parser requires 2-3 reasons and at least one evidence tag', () => {
  const parsed = parseAdaptiveRecommendation({
    id: 'rec_1',
    actionType: 'hold',
    status: 'validated',
    plannedSessionId: 'session_1',
    confidence: 0.62,
    confidenceLabel: 'medium',
    confidenceReason: 'signals mixed from latest sets',
    warningFlag: false,
    fallbackApplied: false,
    reasons: ['fatigue elevated', 'technique unstable on final sets'],
    evidenceTags: ['fatigue_trend'],
    forecastProjection: {
      projectedReadiness: 3,
      projectedRpe: 7.5,
    },
  });

  assert.equal(parsed.reasons.length, 2);
  assert.equal(parsed.evidenceTags.length, 1);

  assert.throws(() =>
    parseAdaptiveRecommendation({
      id: 'rec_1',
      actionType: 'hold',
      status: 'validated',
      plannedSessionId: 'session_1',
      confidence: 0.62,
      confidenceLabel: 'medium',
      confidenceReason: 'signals mixed from latest sets',
      warningFlag: false,
      fallbackApplied: false,
      reasons: ['only one reason'],
      evidenceTags: ['fatigue_trend'],
      forecastProjection: {
        projectedReadiness: 3,
        projectedRpe: 7.5,
      },
    }),
  );

  assert.throws(() =>
    parseAdaptiveRecommendation({
      id: 'rec_1',
      actionType: 'hold',
      status: 'validated',
      plannedSessionId: 'session_1',
      confidence: 0.62,
      confidenceLabel: 'medium',
      confidenceReason: 'signals mixed from latest sets',
      warningFlag: false,
      fallbackApplied: false,
      reasons: ['a', 'b'],
      evidenceTags: [],
      forecastProjection: {
        projectedReadiness: 3,
        projectedRpe: 7.5,
      },
    }),
  );
});

test('confirmation parser enforces explicit decision and recommendation id', () => {
  const parsed = parseAdaptiveConfirmationInput({
    recommendationId: 'rec_1',
    decision: 'accept',
  });

  assert.equal(parsed.decision, 'accept');
  assert.equal(parsed.recommendationId, 'rec_1');

  assert.throws(() =>
    parseAdaptiveConfirmationInput({
      recommendationId: '',
      decision: 'accept',
    }),
  );

  assert.throws(() =>
    parseAdaptiveConfirmationInput({
      recommendationId: 'rec_1',
      decision: 'approve',
    }),
  );
});

test('pending confirmation payload requires expiresAt and plannedSessionId linkage', () => {
  const parsed = parseAdaptiveRecommendation({
    id: 'rec_2',
    actionType: 'substitution',
    status: 'pending_confirmation',
    plannedSessionId: 'session_2',
    confidence: 0.55,
    confidenceLabel: 'low',
    confidenceReason: 'limitation flag conflict detected',
    warningFlag: true,
    warningText: 'Shoulder discomfort reported recently',
    fallbackApplied: false,
    reasons: ['limitation risk present', 'movement quality score dropped'],
    evidenceTags: ['limitation_flag', 'movement_quality'],
    forecastProjection: {
      projectedReadiness: 3,
      projectedRpe: 7,
    },
    expiresAt: '2026-03-06T10:00:00.000Z',
  });

  assert.equal(parsed.status, 'pending_confirmation');
  assert.equal(parsed.plannedSessionId, 'session_2');
  assert.equal(parsed.expiresAt, '2026-03-06T10:00:00.000Z');

  assert.throws(() =>
    parseAdaptiveRecommendation({
      id: 'rec_2',
      actionType: 'substitution',
      status: 'pending_confirmation',
      plannedSessionId: 'session_2',
      confidence: 0.55,
      confidenceLabel: 'low',
      confidenceReason: 'limitation flag conflict detected',
      warningFlag: true,
      fallbackApplied: false,
      reasons: ['limitation risk present', 'movement quality score dropped'],
      evidenceTags: ['limitation_flag', 'movement_quality'],
      forecastProjection: {
        projectedReadiness: 3,
        projectedRpe: 7,
      },
    }),
  );
});
