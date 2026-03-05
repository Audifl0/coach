import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAdaptiveCoachingService,
  type AdaptiveCoachingServiceDeps,
} from '../../src/server/services/adaptive-coaching';

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
}): AdaptiveCoachingServiceDeps {
  let recommendation = options?.recommendation ?? buildRecommendation({});
  const targetSessionId = options?.targetSessionId ?? 'session_next';
  const proposalActionType = options?.proposalActionType ?? 'hold';

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
    proposeRecommendation: async () => ({
      actionType: proposalActionType,
      status: 'proposed',
      plannedSessionId: 'session_next',
      reasons: ['Reason 1', 'Reason 2'],
      evidenceTags: ['G-001'],
      forecastProjection: { projectedReadiness: 3, projectedRpe: 7 },
      modelConfidence: 0.8,
    }),
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
