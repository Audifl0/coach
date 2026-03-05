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
import { createProgramAdaptationPostHandler } from '../../src/app/api/program/adaptation/route';

test('evidence retrieval returns deterministic top-k snippets with short refs and source classes', () => {
  const evidence = retrieveAdaptiveEvidence({
    queryTags: ['fatigue', 'adherence', 'readiness'],
    topK: 3,
  });

  assert.equal(evidence.length, 3);
  assert.ok(evidence[0]?.ref.startsWith('G-'));
  assert.ok(evidence[1]?.ref.startsWith('R-') || evidence[1]?.ref.startsWith('G-'));
  assert.ok(evidence[2]?.ref.startsWith('E-') || evidence[2]?.ref.startsWith('R-') || evidence[2]?.ref.startsWith('G-'));
  assert.ok(['guideline', 'review', 'expertise'].includes(evidence[0]?.sourceClass ?? ''));
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
    createAdaptiveRecommendation: async (payload) => ({
      ...payload,
      id: 'rec_1',
      createdAt: new Date('2026-03-05T08:30:00.000Z'),
      updatedAt: new Date('2026-03-05T08:30:00.000Z'),
      appliedAt: null,
      rejectedAt: null,
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
      status: 'proposed',
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
    createAdaptiveRecommendation: async (payload) => ({
      ...payload,
      id: 'rec_2',
      createdAt: new Date('2026-03-05T08:40:00.000Z'),
      updatedAt: new Date('2026-03-05T08:40:00.000Z'),
      appliedAt: null,
      rejectedAt: null,
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
      status: 'proposed',
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
    createAdaptiveRecommendation: async (payload) => ({
      ...payload,
      id: 'rec_3',
      createdAt: new Date('2026-03-05T08:50:00.000Z'),
      updatedAt: new Date('2026-03-05T08:50:00.000Z'),
      appliedAt: null,
      rejectedAt: null,
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

  const response = await post(
    new Request('http://localhost/api/program/adaptation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'ignored' }),
    }),
  );

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

  const response = await post(
    new Request('http://localhost/api/program/adaptation', {
      method: 'POST',
    }),
  );

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

  const response = await post(
    new Request('http://localhost/api/program/adaptation', {
      method: 'POST',
    }),
  );

  assert.equal(response.status, 500);
});
