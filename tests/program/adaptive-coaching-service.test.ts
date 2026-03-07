import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateRecommendationConfidence } from '../../src/lib/adaptive-coaching/confidence';
import {
  buildAdaptiveExplanationEnvelope,
  deriveEvidenceContextQuality,
  retrieveAdaptiveEvidence,
} from '../../src/lib/adaptive-coaching/evidence';
import {
  createAdaptiveCoachingService,
  type AdaptiveCoachingServiceDeps,
} from '../../src/server/services/adaptive-coaching';
import { createProgramAdaptationPostHandler } from '../../src/app/api/program/adaptation/route-handlers';

function toPersistedRecommendationRecord(
  userId: string,
  payload: Parameters<AdaptiveCoachingServiceDeps['createAdaptiveRecommendation']>[1],
) {
  return {
    ...payload,
    userId,
    warningText: payload.warningText ?? null,
    fallbackReason: payload.fallbackReason ?? null,
    progressionDeltaLoadPct: payload.progressionDeltaLoadPct ?? null,
    progressionDeltaReps: payload.progressionDeltaReps ?? null,
    progressionDeltaSets: payload.progressionDeltaSets ?? null,
    substitutionExerciseKey: payload.substitutionExerciseKey ?? null,
    substitutionDisplayName: payload.substitutionDisplayName ?? null,
    substitutionReason: payload.substitutionReason ?? null,
    expiresAt: payload.expiresAt ?? null,
    appliedAt: null,
    rejectedAt: null,
  };
}

test('evidence retrieval returns exactly top-k deterministic references from the runtime corpus when enough usable entries exist', () => {
  const evidence = retrieveAdaptiveEvidence({
    queryTags: ['fatigue', 'adherence'],
    topK: 3,
    corpus: [
      {
        id: 'guideline-runtime-011',
        sourceClass: 'guideline',
        title: 'Runtime guideline fatigue',
        summary: 'Fatigue-specific runtime evidence.',
        tags: ['fatigue'],
      },
      {
        id: 'review-runtime-022',
        sourceClass: 'review',
        title: 'Runtime review adherence',
        summary: 'Adherence-specific runtime evidence.',
        tags: ['adherence'],
      },
      {
        id: 'expertise-runtime-033',
        sourceClass: 'expertise',
        title: 'Runtime expertise filler',
        summary: 'Fallback filler from runtime corpus.',
        tags: ['readiness'],
      },
      {
        id: 'review-runtime-044',
        sourceClass: 'review',
        title: 'Runtime review extra',
        summary: 'Additional runtime filler.',
        tags: ['volume'],
      },
    ],
  });

  assert.equal(evidence.length, 3);
  assert.deepEqual(
    evidence.map((item) => item.ref),
    ['G-011', 'R-022', 'R-044'],
  );
  assert.deepEqual(
    evidence.map((item) => item.sourceClass),
    ['guideline', 'review', 'review'],
  );
});

test('runtime-corpus underfill is completed before built-in fallback corpus entries are considered', () => {
  const evidence = retrieveAdaptiveEvidence({
    queryTags: ['fatigue'],
    topK: 3,
    corpus: [
      {
        id: 'review-runtime-120',
        sourceClass: 'review',
        title: 'Runtime direct hit',
        summary: 'Direct match in runtime corpus.',
        tags: ['fatigue'],
      },
      {
        id: 'guideline-runtime-110',
        sourceClass: 'guideline',
        title: 'Runtime guideline filler',
        summary: 'Higher-priority runtime filler.',
        tags: ['readiness'],
      },
      {
        id: 'expertise-runtime-130',
        sourceClass: 'expertise',
        title: 'Runtime expertise filler',
        summary: 'Lower-priority runtime filler.',
        tags: ['pain'],
      },
    ],
  });

  assert.equal(evidence.length, 3);
  assert.deepEqual(
    evidence.map((item) => item.title),
    ['Runtime direct hit', 'Runtime guideline filler', 'Runtime expertise filler'],
  );
  assert.equal(
    evidence.some((item) => item.title === 'Progressive Overload Boundaries'),
    false,
  );
});

test('empty runtime corpus falls back conservatively to built-in evidence', () => {
  const evidence = retrieveAdaptiveEvidence({
    queryTags: ['fatigue'],
    topK: 2,
    corpus: [],
  });

  assert.equal(evidence.length, 2);
  assert.deepEqual(
    evidence.map((item) => item.ref),
    ['G-001', 'R-102'],
  );
});

test('explanation envelope requires 2-3 reasons and at least one evidence reference', () => {
  const evidence = retrieveAdaptiveEvidence({
    queryTags: ['fatigue'],
    topK: 1,
  });

  const envelope = buildAdaptiveExplanationEnvelope({
    reasons: ['Fatigue trend has increased', 'Recent adherence dipped'],
    evidence,
  });

  assert.equal(envelope.reasons.length, 2);
  assert.equal(envelope.evidenceTags.length, 1);

  assert.throws(() =>
    buildAdaptiveExplanationEnvelope({
      reasons: ['Only one reason'],
      evidence,
    }),
  );

  assert.throws(() =>
    buildAdaptiveExplanationEnvelope({
      reasons: ['Reason 1', 'Reason 2'],
      evidence: [],
    }),
  );
});

test('missing evidence corpus hits lower context quality and trigger SAFE-03 confidence gate', () => {
  const lowContextQuality = deriveEvidenceContextQuality(0);
  assert.equal(lowContextQuality < 0.5, true);

  const result = evaluateRecommendationConfidence({
    candidateRecommendation: {
      actionType: 'hold',
      deltaLoadPct: 0,
      deltaRep: 0,
      movementTags: [],
      equipmentTags: [],
      substitutionExerciseKey: null,
    },
    modelConfidence: 0.9,
    contextQuality: lowContextQuality,
  });

  assert.equal(result.fallbackRequired, true);
  assert.equal(result.reasonCodes.includes('low_context_quality'), true);
});

test('orchestrator uses fixed guardrail ordering parse -> integrity -> SAFE-01/02 -> SAFE-03 -> status assignment', async () => {
  const deps: AdaptiveCoachingServiceDeps = {
    getProfile: async () => ({
      goal: 'strength',
      weeklySessionTarget: 4,
      sessionDuration: '45_to_75m',
      equipmentCategories: ['dumbbells'],
      limitationsDeclared: false,
      limitations: [],
    }),
    getTodayOrNextSessionCandidates: async () => ({
      todaySession: {
        id: 'session_1',
        scheduledDate: new Date('2026-03-05T08:00:00.000Z'),
      },
      nextSession: null,
    }),
    getHistoryList: async () => [{ id: 'h1' }],
    listLatestAdaptiveRecommendation: async () => null,
    createAdaptiveRecommendation: async (_userId, payload) => ({
      ...toPersistedRecommendationRecord(_userId, payload),
      id: 'rec_1',
      createdAt: new Date('2026-03-05T08:30:00.000Z'),
      updatedAt: new Date('2026-03-05T08:30:00.000Z'),
    }),
    appendDecisionTrace: async () => ({
      id: 'decision_1',
      recommendationId: 'rec_1',
      userId: 'user_1',
      decisionType: 'policy',
      previousStatus: null,
      nextStatus: 'validated',
      decisionReason: 'ok',
      evidenceTags: [],
      metadata: null,
      createdAt: new Date('2026-03-05T08:30:00.000Z'),
    }),
    proposeRecommendation: async () => ({
      actionType: 'progress',
      plannedSessionId: 'session_1',
      reasons: ['Readiness trend improved', 'Adherence was stable'],
      evidenceTags: ['ignored-model-tag'],
      forecastProjection: {
        projectedReadiness: 4,
        projectedRpe: 7.5,
      },
      modelConfidence: 0.88,
    }),
  };

  const service = createAdaptiveCoachingService(deps);
  const result = await service.generate('user_1');

  assert.deepEqual(result.meta.traceSteps, [
    'parse',
    'integrity',
    'safe_01_02',
    'safe_03',
    'status_assignment',
  ]);
});

test('valid model proposal returns allowed adaptive action with 2-3 reasons', async () => {
  const service = createAdaptiveCoachingService({
    getProfile: async () => ({
      goal: 'hypertrophy',
      weeklySessionTarget: 4,
      sessionDuration: '45_to_75m',
      equipmentCategories: ['dumbbells'],
      limitationsDeclared: false,
      limitations: [],
    }),
    getTodayOrNextSessionCandidates: async () => ({
      todaySession: null,
      nextSession: {
        id: 'session_2',
        scheduledDate: new Date('2026-03-06T08:00:00.000Z'),
      },
    }),
    getHistoryList: async () => [{ id: 'h1' }, { id: 'h2' }],
    listLatestAdaptiveRecommendation: async () => null,
    createAdaptiveRecommendation: async (_userId, payload) => ({
      ...toPersistedRecommendationRecord(_userId, payload),
      id: 'rec_2',
      createdAt: new Date('2026-03-05T08:40:00.000Z'),
      updatedAt: new Date('2026-03-05T08:40:00.000Z'),
    }),
    appendDecisionTrace: async () => ({
      id: 'decision_2',
      recommendationId: 'rec_2',
      userId: 'user_1',
      decisionType: 'policy',
      previousStatus: null,
      nextStatus: 'validated',
      decisionReason: 'ok',
      evidenceTags: [],
      metadata: null,
      createdAt: new Date('2026-03-05T08:40:00.000Z'),
    }),
    proposeRecommendation: async () => ({
      actionType: 'progress',
      plannedSessionId: 'session_2',
      reasons: ['Readiness trend improved', 'Fatigue remains controlled'],
      evidenceTags: ['model-tag'],
      forecastProjection: {
        projectedReadiness: 4,
        projectedRpe: 7.2,
      },
      modelConfidence: 0.85,
    }),
  });

  const result = await service.generate('user_1');

  assert.ok(['progress', 'hold', 'deload', 'substitution'].includes(result.recommendation.actionType));
  assert.equal(result.recommendation.reasons.length >= 2 && result.recommendation.reasons.length <= 3, true);
});

test('invalid model output follows fallback path and returns contract-valid recommendation payload', async () => {
  const service = createAdaptiveCoachingService({
    getProfile: async () => ({
      goal: 'strength',
      weeklySessionTarget: 4,
      sessionDuration: '45_to_75m',
      equipmentCategories: ['dumbbells'],
      limitationsDeclared: false,
      limitations: [],
    }),
    getTodayOrNextSessionCandidates: async () => ({
      todaySession: {
        id: 'session_3',
        scheduledDate: new Date('2026-03-05T08:00:00.000Z'),
      },
      nextSession: null,
    }),
    getHistoryList: async () => [],
    listLatestAdaptiveRecommendation: async () => null,
    createAdaptiveRecommendation: async (_userId, payload) => ({
      ...toPersistedRecommendationRecord(_userId, payload),
      id: 'rec_3',
      createdAt: new Date('2026-03-05T08:50:00.000Z'),
      updatedAt: new Date('2026-03-05T08:50:00.000Z'),
    }),
    appendDecisionTrace: async () => ({
      id: 'decision_3',
      recommendationId: 'rec_3',
      userId: 'user_1',
      decisionType: 'fallback',
      previousStatus: null,
      nextStatus: 'fallback_applied',
      decisionReason: 'fallback',
      evidenceTags: [],
      metadata: null,
      createdAt: new Date('2026-03-05T08:50:00.000Z'),
    }),
    proposeRecommendation: async () => ({
      actionType: 'invalid',
      plannedSessionId: 'session_3',
      reasons: ['x'],
      evidenceTags: [],
      forecastProjection: {
        projectedReadiness: 4,
        projectedRpe: 7.2,
      },
      modelConfidence: 0.2,
    }),
  });

  const result = await service.generate('user_1');
  assert.equal(result.recommendation.fallbackApplied, true);
  assert.equal(result.recommendation.status, 'fallback_applied');
});

test('feature flag disabled keeps deterministic local proposal path', async () => {
  let localCalls = 0;
  let providerCalls = 0;

  const service = createAdaptiveCoachingService({
    getProfile: async () => ({
      goal: 'strength',
      weeklySessionTarget: 4,
      sessionDuration: '45_to_75m',
      equipmentCategories: ['dumbbells'],
      limitationsDeclared: false,
      limitations: [],
    }),
    getTodayOrNextSessionCandidates: async () => ({
      todaySession: null,
      nextSession: {
        id: 'session_flag_off',
        scheduledDate: new Date('2026-03-06T08:00:00.000Z'),
      },
    }),
    getHistoryList: async () => [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }],
    listLatestAdaptiveRecommendation: async () => null,
    createAdaptiveRecommendation: async (_userId, payload) => ({
      ...toPersistedRecommendationRecord(_userId, payload),
      id: 'rec_flag_off',
      createdAt: new Date('2026-03-05T08:50:00.000Z'),
      updatedAt: new Date('2026-03-05T08:50:00.000Z'),
    }),
    appendDecisionTrace: async () => ({ id: 'decision_flag_off' }),
    proposeRecommendation: async () => {
      localCalls += 1;
      return {
        actionType: 'progress',
        plannedSessionId: 'session_flag_off',
        reasons: ['Deterministic local proposal path', 'Feature flag disabled'],
        evidenceTags: ['local-model-default'],
        forecastProjection: {
          projectedReadiness: 4,
          projectedRpe: 7.4,
        },
      };
    },
    realProviderEnabled: false,
    proposeRecommendationWithProvider: async () => {
      providerCalls += 1;
      return {
        actionType: 'hold',
        plannedSessionId: 'session_flag_off',
        reasons: ['Provider should not run', 'Flag disabled'],
        evidenceTags: ['G-001'],
        forecastProjection: {
          projectedReadiness: 3,
          projectedRpe: 7,
        },
      };
    },
  });

  const result = await service.generate('user_1');
  assert.equal(result.recommendation.actionType, 'progress');
  assert.equal(localCalls, 1);
  assert.equal(providerCalls, 0);
});

test('feature flag enabled uses provider proposal path when payload is valid', async () => {
  let localCalls = 0;
  let providerCalls = 0;

  const service = createAdaptiveCoachingService({
    getProfile: async () => ({
      goal: 'strength',
      weeklySessionTarget: 4,
      sessionDuration: '45_to_75m',
      equipmentCategories: ['dumbbells'],
      limitationsDeclared: false,
      limitations: [],
    }),
    getTodayOrNextSessionCandidates: async () => ({
      todaySession: {
        id: 'session_flag_on',
        scheduledDate: new Date('2026-03-05T08:00:00.000Z'),
      },
      nextSession: null,
    }),
    getHistoryList: async () => [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }],
    listLatestAdaptiveRecommendation: async () => null,
    createAdaptiveRecommendation: async (_userId, payload) => ({
      ...toPersistedRecommendationRecord(_userId, payload),
      id: 'rec_flag_on',
      createdAt: new Date('2026-03-05T08:50:00.000Z'),
      updatedAt: new Date('2026-03-05T08:50:00.000Z'),
    }),
    appendDecisionTrace: async () => ({ id: 'decision_flag_on' }),
    proposeRecommendation: async () => {
      localCalls += 1;
      return {
        actionType: 'hold',
        plannedSessionId: 'session_flag_on',
        reasons: ['Should not be used', 'Provider path should win'],
        evidenceTags: ['local-fallback'],
        forecastProjection: {
          projectedReadiness: 3,
          projectedRpe: 7,
        },
      };
    },
    realProviderEnabled: true,
    proposeRecommendationWithProvider: async () => {
      providerCalls += 1;
      return {
        actionType: 'progress',
        plannedSessionId: 'session_flag_on',
        reasons: ['Provider output accepted', 'Structured payload valid'],
        evidenceTags: ['G-001'],
        forecastProjection: {
          projectedReadiness: 4,
          projectedRpe: 7.3,
        },
      };
    },
  });

  const result = await service.generate('user_1');
  assert.equal(result.recommendation.actionType, 'progress');
  assert.equal(localCalls, 0);
  assert.equal(providerCalls, 1);
});

test('provider status field is ignored and final lifecycle status stays server-owned', async () => {
  const service = createAdaptiveCoachingService({
    getProfile: async () => ({
      goal: 'strength',
      weeklySessionTarget: 4,
      sessionDuration: '45_to_75m',
      equipmentCategories: ['dumbbells'],
      limitationsDeclared: false,
      limitations: [],
    }),
    getTodayOrNextSessionCandidates: async () => ({
      todaySession: {
        id: 'session_status_ignored',
        scheduledDate: new Date('2026-03-05T08:00:00.000Z'),
      },
      nextSession: null,
    }),
    getHistoryList: async () => [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }],
    listLatestAdaptiveRecommendation: async () => null,
    createAdaptiveRecommendation: async (_userId, payload) => ({
      ...toPersistedRecommendationRecord(_userId, payload),
      id: 'rec_status_ignored',
      createdAt: new Date('2026-03-05T08:50:00.000Z'),
      updatedAt: new Date('2026-03-05T08:50:00.000Z'),
    }),
    appendDecisionTrace: async () => ({ id: 'decision_status_ignored' }),
    proposeRecommendation: async () => ({
      actionType: 'hold',
      plannedSessionId: 'session_status_ignored',
      reasons: ['Should not be used', 'Provider path should win'],
      evidenceTags: ['local-fallback'],
      forecastProjection: {
        projectedReadiness: 3,
        projectedRpe: 7,
      },
    }),
    realProviderEnabled: true,
    proposeRecommendationWithProvider: async () => ({
      actionType: 'progress',
      status: 'applied',
      plannedSessionId: 'session_status_ignored',
      reasons: ['Provider sent status that must be ignored', 'Server assigns lifecycle status'],
      evidenceTags: ['G-001'],
      forecastProjection: {
        projectedReadiness: 4,
        projectedRpe: 7.2,
      },
    }),
  });

  const result = await service.generate('user_1');
  assert.equal(result.recommendation.actionType, 'progress');
  assert.equal(result.recommendation.status, 'validated');
});

test('authenticated adaptation request returns validated recommendation with explanation and warning/fallback metadata', async () => {
  const post = createProgramAdaptationPostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    generateRecommendation: async () => ({
      recommendation: {
        id: 'rec_10',
        actionType: 'hold',
        status: 'validated',
        plannedSessionId: 'session_10',
        confidence: 0.7,
        confidenceLabel: 'medium',
        confidenceReason: 'signals mixed',
        warningFlag: true,
        warningText: 'Limitation conflict warning',
        fallbackApplied: false,
        reasons: ['Fatigue trend elevated', 'Recent adherence dipped'],
        evidenceTags: ['G-001', 'R-101'],
        forecastProjection: {
          projectedReadiness: 3,
          projectedRpe: 7.6,
        },
      },
      meta: { traceSteps: ['parse'] },
    }),
  });

  const response = await post();

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.recommendation.id, 'rec_10');
  assert.equal(body.recommendation.reasons.length, 2);
  assert.equal(body.recommendation.warningFlag, true);
  assert.equal(body.recommendation.fallbackApplied, false);
});

test('cross-account recommendation path is masked as not-found', async () => {
  const post = createProgramAdaptationPostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    generateRecommendation: async () => {
      throw new Error('Mismatched account context');
    },
  });

  const response = await post();

  assert.equal(response.status, 404);
});

test('endpoint parse-validates service payload and rejects malformed recommendation shape', async () => {
  const post = createProgramAdaptationPostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    generateRecommendation: async () => ({
      recommendation: {
        id: 'rec_bad',
        actionType: 'hold',
        status: 'validated',
      },
      meta: { traceSteps: [] },
    }),
  });

  const response = await post();

  assert.equal(response.status, 500);
});
