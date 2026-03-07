import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAdaptiveCoachingService,
  type AdaptiveCoachingServiceDeps,
} from '../../src/server/services/adaptive-coaching';
import {
  createProgramAdaptationConfirmPostHandler,
  createProgramAdaptationRejectPostHandler,
} from '../../src/app/api/program/adaptation/[recommendationId]/route-handlers';

type RecommendationRecord = {
  id: string;
  userId: string;
  plannedSessionId: string;
  actionType: 'progress' | 'hold' | 'deload' | 'substitution';
  status: 'proposed' | 'validated' | 'pending_confirmation' | 'applied' | 'rejected' | 'fallback_applied';
  confidence: number;
  confidenceLabel: 'low' | 'medium' | 'high';
  confidenceReason: string;
  warningFlag: boolean;
  warningText: string | null;
  fallbackApplied: boolean;
  fallbackReason: string | null;
  progressionDeltaLoadPct: number | null;
  progressionDeltaReps: number | null;
  progressionDeltaSets: number | null;
  substitutionExerciseKey: string | null;
  substitutionDisplayName: string | null;
  substitutionReason: string | null;
  reasons: unknown;
  evidenceTags: unknown;
  forecastPayload: unknown;
  expiresAt: Date | null;
  appliedAt: Date | null;
  rejectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function buildRecommendation(overrides: Partial<RecommendationRecord>): RecommendationRecord {
  return {
    id: 'rec_1',
    userId: 'user_1',
    plannedSessionId: 'session_next',
    actionType: 'deload',
    status: 'pending_confirmation',
    confidence: 0.72,
    confidenceLabel: 'medium',
    confidenceReason: 'signals mixed',
    warningFlag: false,
    warningText: null,
    fallbackApplied: false,
    fallbackReason: null,
    progressionDeltaLoadPct: -3,
    progressionDeltaReps: -1,
    progressionDeltaSets: 0,
    substitutionExerciseKey: null,
    substitutionDisplayName: null,
    substitutionReason: null,
    reasons: ['Fatigue elevated', 'Readiness dipped'],
    evidenceTags: ['G-001', 'R-101'],
    forecastPayload: { projectedReadiness: 3, projectedRpe: 7.6 },
    expiresAt: new Date('2026-03-06T08:00:00.000Z'),
    appliedAt: null,
    rejectedAt: null,
    createdAt: new Date('2026-03-05T08:00:00.000Z'),
    updatedAt: new Date('2026-03-05T08:00:00.000Z'),
    ...overrides,
  };
}

function createDeps(options?: {
  now?: Date;
  recommendation?: RecommendationRecord;
  targetSessionId?: string | null;
  proposalActionType?: 'progress' | 'hold' | 'deload' | 'substitution';
  useProviderPath?: boolean;
  proposalMetadata?: Record<string, unknown>;
}): AdaptiveCoachingServiceDeps {
  let recommendation = options?.recommendation ?? buildRecommendation({});
  const targetSessionId = options?.targetSessionId ?? 'session_next';
  const proposalActionType = options?.proposalActionType ?? 'hold';
  const proposalMetadata = options?.proposalMetadata ?? {};
  const proposalPayload = {
    actionType: proposalActionType,
    status: 'proposed',
    plannedSessionId: 'session_next',
    reasons: ['Reason 1', 'Reason 2'],
    evidenceTags: ['G-001'],
    forecastProjection: { projectedReadiness: 3, projectedRpe: 7 },
    modelConfidence: 0.8,
    ...proposalMetadata,
  };

  return {
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
      nextSession: targetSessionId
        ? {
          id: targetSessionId,
          scheduledDate: new Date('2026-03-06T08:00:00.000Z'),
        }
        : null,
    }),
    getHistoryList: async () => [{ id: 'h1' }],
    listLatestAdaptiveRecommendation: async () => recommendation,
    getAdaptiveRecommendationById: async () => recommendation,
    createAdaptiveRecommendation: async (_userId, input) => buildRecommendation({
      id: 'rec_new',
      actionType: input.actionType,
      status: input.status,
      plannedSessionId: input.plannedSessionId,
      fallbackApplied: input.fallbackApplied,
      fallbackReason: input.fallbackReason ?? null,
      progressionDeltaLoadPct: input.progressionDeltaLoadPct ?? null,
      progressionDeltaReps: input.progressionDeltaReps ?? null,
      progressionDeltaSets: input.progressionDeltaSets ?? null,
      substitutionExerciseKey: input.substitutionExerciseKey ?? null,
      substitutionDisplayName: input.substitutionDisplayName ?? null,
      reasons: input.reasons,
      evidenceTags: input.evidenceTags,
      forecastPayload: input.forecastPayload,
      expiresAt: input.expiresAt ?? null,
      appliedAt: input.status === 'applied' ? (options?.now ?? new Date('2026-03-05T09:00:00.000Z')) : null,
      rejectedAt: null,
    }),
    updateAdaptiveRecommendationStatus: async (_userId, input) => {
      recommendation = buildRecommendation({
        ...recommendation,
        id: input.recommendationId,
        status: input.nextStatus,
        expiresAt: input.expiresAt ?? recommendation.expiresAt,
        appliedAt: input.nextStatus === 'applied' ? (options?.now ?? new Date('2026-03-05T09:00:00.000Z')) : recommendation.appliedAt,
        rejectedAt: input.nextStatus === 'rejected' ? (options?.now ?? new Date('2026-03-05T09:00:00.000Z')) : recommendation.rejectedAt,
        fallbackReason: input.fallbackReason ?? recommendation.fallbackReason,
      });
      return recommendation;
    },
    appendDecisionTrace: async () => ({ id: 'decision' }),
    proposeRecommendation: async () => proposalPayload,
    realProviderEnabled: options?.useProviderPath ?? false,
    proposeRecommendationWithProvider: options?.useProviderPath
      ? async () => proposalPayload
      : undefined,
    now: options?.now ? () => options.now as Date : undefined,
  };
}

test('deload and substitution recommendations are stored as pending_confirmation and not applied', async () => {
  const deloadService = createAdaptiveCoachingService(
    createDeps({
      recommendation: buildRecommendation({
        id: 'latest',
        actionType: 'hold',
        status: 'applied',
      }),
      proposalActionType: 'deload',
    }),
  );

  const deloadResult = await deloadService.generate('user_1');
  assert.equal(deloadResult.recommendation.status, 'pending_confirmation');
  assert.equal(deloadResult.recommendation.actionType, 'deload');

  const substitutionService = createAdaptiveCoachingService(
    createDeps({
      recommendation: buildRecommendation({
        id: 'latest2',
        actionType: 'hold',
        status: 'applied',
      }),
      proposalActionType: 'substitution',
    }),
  );

  const substitutionResult = await substitutionService.generate('user_1');
  assert.equal(substitutionResult.recommendation.status, 'pending_confirmation');
  assert.equal(substitutionResult.recommendation.actionType, 'substitution');
});

test('transport-only proposal metadata is stripped for local and provider payloads before parsing', async () => {
  const localService = createAdaptiveCoachingService(
    createDeps({
      recommendation: buildRecommendation({
        id: 'latest_local',
        actionType: 'hold',
        status: 'applied',
      }),
      proposalActionType: 'deload',
      proposalMetadata: {
        status: 'applied',
        modelConfidence: 0.93,
        requestId: 'req_local',
      },
    }),
  );

  const localResult = await localService.generate('user_1');
  assert.equal(localResult.recommendation.actionType, 'deload');
  assert.equal(localResult.recommendation.status, 'pending_confirmation');
  assert.equal(localResult.recommendation.fallbackApplied, false);

  const providerService = createAdaptiveCoachingService(
    createDeps({
      recommendation: buildRecommendation({
        id: 'latest_provider',
        actionType: 'hold',
        status: 'applied',
      }),
      proposalActionType: 'substitution',
      useProviderPath: true,
      proposalMetadata: {
        status: 'applied',
        modelConfidence: 0.91,
        requestId: 'req_provider',
      },
    }),
  );

  const providerResult = await providerService.generate('user_1');
  assert.equal(providerResult.recommendation.actionType, 'substitution');
  assert.equal(providerResult.recommendation.status, 'pending_confirmation');
  assert.equal(providerResult.recommendation.fallbackApplied, false);
});

test('confirm fails when recommendation is expired, not pending, or no longer tied to next session', async () => {
  const now = new Date('2026-03-06T09:00:00.000Z');
  const expiredService = createAdaptiveCoachingService(
    createDeps({
      now,
      recommendation: buildRecommendation({
        expiresAt: new Date('2026-03-06T08:00:00.000Z'),
      }),
    }),
  );

  await assert.rejects(
    () =>
      expiredService.confirmAdaptiveRecommendation({
        userId: 'user_1',
        recommendationId: 'rec_1',
      }),
  );

  const notPendingService = createAdaptiveCoachingService(
    createDeps({
      now,
      recommendation: buildRecommendation({
        status: 'validated',
      }),
    }),
  );
  await assert.rejects(
    () =>
      notPendingService.confirmAdaptiveRecommendation({
        userId: 'user_1',
        recommendationId: 'rec_1',
      }),
  );

  const staleSessionService = createAdaptiveCoachingService(
    createDeps({
      now: new Date('2026-03-05T09:00:00.000Z'),
      targetSessionId: 'session_new',
      recommendation: buildRecommendation({
        plannedSessionId: 'session_old',
        expiresAt: new Date('2026-03-06T08:00:00.000Z'),
      }),
    }),
  );
  await assert.rejects(
    () =>
      staleSessionService.confirmAdaptiveRecommendation({
        userId: 'user_1',
        recommendationId: 'rec_1',
      }),
  );
});

test('reject transitions to conservative outcome with explicit rejection trace', async () => {
  const service = createAdaptiveCoachingService(
    createDeps({
      now: new Date('2026-03-05T09:00:00.000Z'),
      recommendation: buildRecommendation({
        actionType: 'substitution',
      }),
    }),
  );

  const result = await service.rejectAdaptiveRecommendation({
    userId: 'user_1',
    recommendationId: 'rec_1',
    reason: 'Prefer to keep original movement this session',
  });

  assert.equal(result.actionType, 'hold');
  assert.equal(result.status, 'applied');
  assert.equal(result.fallbackApplied, true);
  assert.equal(result.fallbackReason, 'user_rejected_high_impact');
});

test('authenticated owner can confirm pending recommendation and receives updated state payload', async () => {
  const post = createProgramAdaptationConfirmPostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    confirmRecommendation: async () => ({
      id: 'rec_1',
      actionType: 'deload',
      status: 'applied',
      plannedSessionId: 'session_next',
      confidence: 0.71,
      confidenceLabel: 'medium',
      confidenceReason: 'confirmed',
      warningFlag: false,
      fallbackApplied: false,
      reasons: ['Reason 1', 'Reason 2'],
      evidenceTags: ['G-001', 'R-101'],
      forecastProjection: { projectedReadiness: 3, projectedRpe: 7.4 },
      appliedAt: '2026-03-05T09:00:00.000Z',
    }),
  });

  const response = await post(
    new Request('http://localhost/api/program/adaptation/rec_1/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'accept' }),
    }),
    { params: Promise.resolve({ recommendationId: 'rec_1' }) },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.recommendation.id, 'rec_1');
  assert.equal(body.recommendation.status, 'applied');
});

test('authenticated owner can reject pending recommendation and receives conservative applied state', async () => {
  const post = createProgramAdaptationRejectPostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    rejectRecommendation: async () => ({
      id: 'rec_safe',
      actionType: 'hold',
      status: 'applied',
      plannedSessionId: 'session_next',
      confidence: 0.64,
      confidenceLabel: 'medium',
      confidenceReason: 'conservative hold',
      warningFlag: false,
      fallbackApplied: true,
      fallbackReason: 'user_rejected_high_impact',
      reasons: ['Reason 1', 'Reason 2'],
      evidenceTags: ['G-001'],
      forecastProjection: { projectedReadiness: 3, projectedRpe: 7.2 },
      appliedAt: '2026-03-05T09:00:00.000Z',
    }),
  });

  const response = await post(
    new Request('http://localhost/api/program/adaptation/rec_1/reject', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'reject', reason: 'not today' }),
    }),
    { params: Promise.resolve({ recommendationId: 'rec_1' }) },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.recommendation.actionType, 'hold');
  assert.equal(body.recommendation.status, 'applied');
  assert.equal(body.recommendation.fallbackApplied, true);
});

test('non-owner or missing recommendation responses are masked as not-found', async () => {
  const confirmPost = createProgramAdaptationConfirmPostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    confirmRecommendation: async () => {
      throw new Error('Mismatched account context');
    },
  });
  const rejectPost = createProgramAdaptationRejectPostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    rejectRecommendation: async () => {
      throw new Error('Recommendation not found');
    },
  });

  const confirmResponse = await confirmPost(
    new Request('http://localhost/api/program/adaptation/rec_404/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'accept' }),
    }),
    { params: Promise.resolve({ recommendationId: 'rec_404' }) },
  );

  const rejectResponse = await rejectPost(
    new Request('http://localhost/api/program/adaptation/rec_404/reject', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'reject' }),
    }),
    { params: Promise.resolve({ recommendationId: 'rec_404' }) },
  );

  assert.equal(confirmResponse.status, 404);
  assert.equal(rejectResponse.status, 404);
});
