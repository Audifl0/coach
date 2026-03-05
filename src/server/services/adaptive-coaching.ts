import { validateProfileInput } from '@/lib/profile/contracts';
import { generateAdaptiveRecommendation } from '@/lib/adaptive-coaching/orchestrator';
import { createAdaptiveCoachingDal, type AdaptiveRecommendationRecord } from '@/server/dal/adaptive-coaching';
import { createProfileDal } from '@/server/dal/profile';
import { createProgramDal } from '@/server/dal/program';

type PlannedSessionRef = {
  id: string;
  scheduledDate: Date | string;
};

type RecommendationCreateInput = {
  plannedSessionId: string;
  actionType: 'progress' | 'hold' | 'deload' | 'substitution';
  status: 'proposed' | 'validated' | 'pending_confirmation' | 'applied' | 'rejected' | 'fallback_applied';
  confidence: number;
  confidenceLabel: 'low' | 'medium' | 'high';
  confidenceReason: string;
  warningFlag: boolean;
  warningText?: string | null;
  fallbackApplied: boolean;
  fallbackReason?: string | null;
  progressionDeltaLoadPct?: number | null;
  progressionDeltaReps?: number | null;
  progressionDeltaSets?: number | null;
  substitutionExerciseKey?: string | null;
  substitutionDisplayName?: string | null;
  substitutionReason?: string | null;
  reasons: unknown;
  evidenceTags: unknown;
  forecastPayload: unknown;
  expiresAt?: Date | null;
};

export type AdaptiveCoachingServiceDeps = {
  getProfile: (userId: string) => Promise<unknown | null>;
  getTodayOrNextSessionCandidates: (userId: string) => Promise<{
    todaySession: PlannedSessionRef | null;
    nextSession: PlannedSessionRef | null;
  }>;
  getHistoryList: (userId: string, range: { from: Date; to: Date }) => Promise<Array<{ id: string }>>;
  listLatestAdaptiveRecommendation: (userId: string) => Promise<AdaptiveRecommendationRecord | null>;
  createAdaptiveRecommendation: (userId: string, input: RecommendationCreateInput) => Promise<AdaptiveRecommendationRecord>;
  appendDecisionTrace: (userId: string, input: {
    recommendationId: string;
    previousStatus: 'proposed' | 'validated' | 'pending_confirmation' | 'applied' | 'rejected' | 'fallback_applied' | null;
    nextStatus: 'proposed' | 'validated' | 'pending_confirmation' | 'applied' | 'rejected' | 'fallback_applied';
    decisionType: 'policy' | 'user' | 'execution' | 'fallback';
    decisionReason: string;
    evidenceTags: unknown;
    metadata?: unknown;
  }) => Promise<unknown>;
  proposeRecommendation: (input: {
    userId: string;
    plannedSessionId: string;
    profile: ReturnType<typeof validateProfileInput>;
    historyCount: number;
  }) => Promise<unknown>;
};

export class AdaptiveCoachingError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdaptiveCoachingError';
    this.status = status;
  }
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toPolicyRecommendationFromRecord(record: AdaptiveRecommendationRecord | null) {
  if (!record) {
    return null;
  }

  return {
    actionType: record.actionType,
    deltaLoadPct: (record.progressionDeltaLoadPct ?? 0) / 100,
    deltaRep: record.progressionDeltaReps ?? 0,
    substitutionExerciseKey: record.substitutionExerciseKey,
    movementTags: [],
    equipmentTags: [],
  } as const;
}

function buildDefaultProposal(input: {
  plannedSessionId: string;
  historyCount: number;
}): unknown {
  return {
    actionType: input.historyCount >= 3 ? 'progress' : 'hold',
    status: 'proposed',
    plannedSessionId: input.plannedSessionId,
    reasons:
      input.historyCount >= 3
        ? ['Recent adherence is stable', 'Readiness profile remains on target']
        : ['Recent signal depth is limited', 'Conservative hold keeps progression safe'],
    evidenceTags: ['model-default'],
    forecastProjection: {
      projectedReadiness: input.historyCount >= 3 ? 4 : 3,
      projectedRpe: input.historyCount >= 3 ? 7.5 : 7.0,
    },
    modelConfidence: input.historyCount >= 3 ? 0.8 : 0.6,
  };
}

export function createAdaptiveCoachingService(deps: AdaptiveCoachingServiceDeps) {
  return {
    async generate(userId: string): Promise<{
      recommendation: {
        id: string;
        actionType: 'progress' | 'hold' | 'deload' | 'substitution';
        status: 'proposed' | 'validated' | 'pending_confirmation' | 'applied' | 'rejected' | 'fallback_applied';
        plannedSessionId: string;
        confidence: number;
        confidenceLabel: 'low' | 'medium' | 'high';
        confidenceReason: string;
        warningFlag: boolean;
        warningText?: string;
        fallbackApplied: boolean;
        fallbackReason?: string;
        reasons: string[];
        evidenceTags: string[];
        forecastProjection: { projectedReadiness: number; projectedRpe: number };
        progressionDeltaLoadPct?: number;
        progressionDeltaReps?: number;
        progressionDeltaSets?: number;
        substitutionTarget?: { exerciseKey: string; displayName: string };
        expiresAt?: string;
        appliedAt?: string;
        rejectedAt?: string;
      };
      meta: { traceSteps: string[] };
    }> {
      const profileRaw = await deps.getProfile(userId);
      if (!profileRaw) {
        throw new AdaptiveCoachingError('Profile is required before generating adaptive recommendation', 400);
      }

      const profile = validateProfileInput(profileRaw);
      const candidates = await deps.getTodayOrNextSessionCandidates(userId);
      const targetSession = candidates.todaySession ?? candidates.nextSession;
      if (!targetSession) {
        throw new AdaptiveCoachingError('Planned session not found', 404);
      }

      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const history = await deps.getHistoryList(userId, { from: thirtyDaysAgo, to: now });

      const latestRecommendation = await deps.listLatestAdaptiveRecommendation(userId);
      const rawProposal =
        (await deps.proposeRecommendation({
          userId,
          plannedSessionId: targetSession.id,
          profile,
          historyCount: history.length,
        })) ?? buildDefaultProposal({ plannedSessionId: targetSession.id, historyCount: history.length });

      const scheduledAt = toDate(targetSession.scheduledDate);
      const confirmationExpiresAt = new Date(scheduledAt);
      confirmationExpiresAt.setDate(confirmationExpiresAt.getDate() + 1);

      const result = generateAdaptiveRecommendation({
        rawProposal,
        plannedSessionId: targetSession.id,
        queryTags: ['fatigue', 'adherence', 'readiness'],
        modelConfidence:
          typeof (rawProposal as { modelConfidence?: unknown }).modelConfidence === 'number'
            ? (rawProposal as { modelConfidence: number }).modelConfidence
            : 0.6,
        athleteContext: {
          limitations: profile.limitations.map((item) => ({
            zone: item.zone,
            severity: item.severity,
          })),
          painFlags: profile.limitations
            .filter((item) => item.severity === 'moderate' || item.severity === 'severe')
            .map((item) => item.zone),
        },
        lastAppliedRecommendation: toPolicyRecommendationFromRecord(latestRecommendation),
        confirmationExpiresAt,
      });

      const persisted = await deps.createAdaptiveRecommendation(userId, {
        plannedSessionId: result.recommendation.plannedSessionId,
        actionType: result.recommendation.actionType,
        status: result.recommendation.status,
        confidence: result.recommendation.confidence,
        confidenceLabel: result.recommendation.confidenceLabel,
        confidenceReason: result.recommendation.confidenceReason,
        warningFlag: result.recommendation.warningFlag,
        warningText: result.recommendation.warningText ?? null,
        fallbackApplied: result.recommendation.fallbackApplied,
        fallbackReason: result.recommendation.fallbackReason ?? null,
        progressionDeltaLoadPct: result.recommendation.progressionDeltaLoadPct ?? null,
        progressionDeltaReps: result.recommendation.progressionDeltaReps ?? null,
        progressionDeltaSets: result.recommendation.progressionDeltaSets ?? null,
        substitutionExerciseKey: result.recommendation.substitutionTarget?.exerciseKey ?? null,
        substitutionDisplayName: result.recommendation.substitutionTarget?.displayName ?? null,
        substitutionReason: null,
        reasons: result.recommendation.reasons,
        evidenceTags: result.recommendation.evidenceTags,
        forecastPayload: result.recommendation.forecastProjection,
        expiresAt: result.recommendation.expiresAt ? new Date(result.recommendation.expiresAt) : null,
      });

      await deps.appendDecisionTrace(userId, {
        recommendationId: persisted.id,
        previousStatus: null,
        nextStatus: result.recommendation.status,
        decisionType: result.recommendation.fallbackApplied ? 'fallback' : 'policy',
        decisionReason: result.recommendation.confidenceReason,
        evidenceTags: result.recommendation.evidenceTags,
        metadata: { traceSteps: result.traceSteps },
      });

      return {
        recommendation: {
          ...result.recommendation,
          id: persisted.id,
        },
        meta: {
          traceSteps: result.traceSteps,
        },
      };
    },
  };
}

export async function buildDefaultAdaptiveCoachingService() {
  const { prisma } = await import('@/lib/db/prisma');
  const profileDal = createProfileDal(prisma as never);

  return createAdaptiveCoachingService({
    getProfile: (userId) => profileDal.getProfileByUserId(userId),
    getTodayOrNextSessionCandidates: (userId) => {
      const programDal = createProgramDal(prisma as never, { userId });
      return programDal.getTodayOrNextSessionCandidates();
    },
    getHistoryList: (userId, range) => {
      const programDal = createProgramDal(prisma as never, { userId });
      return programDal.getHistoryList(range);
    },
    listLatestAdaptiveRecommendation: (userId) => {
      const dal = createAdaptiveCoachingDal(prisma as never, { userId });
      return dal.listLatestAdaptiveRecommendation();
    },
    createAdaptiveRecommendation: (userId, input) => {
      const dal = createAdaptiveCoachingDal(prisma as never, { userId });
      return dal.createAdaptiveRecommendation(input);
    },
    appendDecisionTrace: (userId, input) => {
      const dal = createAdaptiveCoachingDal(prisma as never, { userId });
      return dal.appendDecisionTrace(input);
    },
    proposeRecommendation: async (input) => buildDefaultProposal(input),
  });
}
