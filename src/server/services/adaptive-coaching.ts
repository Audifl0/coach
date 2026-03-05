import { validateProfileInput } from '@/lib/profile/contracts';
import { generateAdaptiveRecommendation } from '@/lib/adaptive-coaching/orchestrator';
import { parseAdaptiveRecommendation } from '@/lib/adaptive-coaching/contracts';
import { createAdaptiveCoachingDal, type AdaptiveRecommendationRecord } from '@/server/dal/adaptive-coaching';
import { createProfileDal } from '@/server/dal/profile';
import { createProgramDal } from '@/server/dal/program';
import { parseLlmRuntimeConfig, type LlmRuntimeConfig } from '@/server/llm/config';
import { createLlmProposalClient } from '@/server/llm/client';
import { createOpenAiProposalClient } from '@/server/llm/providers/openai-client';
import { createAnthropicProposalClient } from '@/server/llm/providers/anthropic-client';
import type { LlmProposalProviderClient } from '@/server/llm/contracts';

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
  getAdaptiveRecommendationById?: (userId: string, recommendationId: string) => Promise<AdaptiveRecommendationRecord | null>;
  createAdaptiveRecommendation: (userId: string, input: RecommendationCreateInput) => Promise<AdaptiveRecommendationRecord>;
  updateAdaptiveRecommendationStatus?: (
    userId: string,
    input: {
      recommendationId: string;
      nextStatus: 'proposed' | 'validated' | 'pending_confirmation' | 'applied' | 'rejected' | 'fallback_applied';
      decisionType: 'policy' | 'user' | 'execution' | 'fallback';
      decisionReason: string;
      evidenceTags: unknown;
      metadata?: unknown;
      expiresAt?: Date | null;
      fallbackReason?: string | null;
      expectedCurrentStatus?: 'proposed' | 'validated' | 'pending_confirmation' | 'applied' | 'rejected' | 'fallback_applied';
    },
  ) => Promise<AdaptiveRecommendationRecord | null>;
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
  realProviderEnabled?: boolean;
  proposeRecommendationWithProvider?: (input: {
    userId: string;
    plannedSessionId: string;
    profile: ReturnType<typeof validateProfileInput>;
    historyCount: number;
  }) => Promise<unknown>;
  now?: () => Date;
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

function buildProviderPrompts(input: {
  plannedSessionId: string;
  profile: ReturnType<typeof validateProfileInput>;
  historyCount: number;
}) {
  const limitationSummary =
    input.profile.limitations.length > 0
      ? input.profile.limitations
        .map((item) => `${item.zone}:${item.severity}`)
        .join(', ')
      : 'none';

  return {
    systemPrompt:
      'Return one adaptive recommendation proposal as strict JSON using only: actionType, plannedSessionId, reasons, evidenceTags, forecastProjection, substitutionTarget.',
    userPrompt: [
      `planned_session_id=${input.plannedSessionId}`,
      `goal=${input.profile.goal}`,
      `history_count_30d=${input.historyCount}`,
      `weekly_session_target=${input.profile.weeklySessionTarget}`,
      `session_duration=${input.profile.sessionDuration}`,
      `limitations=${limitationSummary}`,
    ].join('\n'),
  };
}

function sanitizeProviderProposal(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return input;
  }

  const record = { ...(input as Record<string, unknown>) };
  if ('status' in record) {
    delete record.status;
  }

  return record;
}

function createProviderClientByName(input: {
  provider: 'openai' | 'anthropic';
  config: LlmRuntimeConfig;
}): LlmProposalProviderClient {
  if (input.provider === 'openai') {
    return createOpenAiProposalClient({
      apiKey: input.config.openAi.apiKey,
      model: input.config.openAi.model,
      timeoutMs: input.config.openAi.timeoutMs,
    });
  }

  return createAnthropicProposalClient({
    apiKey: input.config.anthropic.apiKey,
    model: input.config.anthropic.model,
    timeoutMs: input.config.anthropic.timeoutMs,
  });
}

function toAdaptiveRecommendationPayload(record: AdaptiveRecommendationRecord) {
  const reasons = Array.isArray(record.reasons) ? record.reasons : [];
  const evidenceTags = Array.isArray(record.evidenceTags) ? record.evidenceTags : [];
  const forecastPayload = (record.forecastPayload ?? {}) as {
    projectedReadiness?: unknown;
    projectedRpe?: unknown;
  };

  return parseAdaptiveRecommendation({
    id: record.id,
    actionType: record.actionType,
    status: record.status,
    plannedSessionId: record.plannedSessionId,
    confidence: record.confidence,
    confidenceLabel: record.confidenceLabel,
    confidenceReason: record.confidenceReason,
    warningFlag: record.warningFlag,
    warningText: record.warningText ?? undefined,
    fallbackApplied: record.fallbackApplied,
    fallbackReason: record.fallbackReason ?? undefined,
    reasons,
    evidenceTags,
    forecastProjection: {
      projectedReadiness: Number(forecastPayload.projectedReadiness ?? 3),
      projectedRpe: Number(forecastPayload.projectedRpe ?? 7),
    },
    progressionDeltaLoadPct: record.progressionDeltaLoadPct ?? undefined,
    progressionDeltaReps: record.progressionDeltaReps ?? undefined,
    progressionDeltaSets: record.progressionDeltaSets ?? undefined,
    substitutionTarget: record.substitutionExerciseKey
      ? {
        exerciseKey: record.substitutionExerciseKey,
        displayName: record.substitutionDisplayName ?? record.substitutionExerciseKey.replace(/_/g, ' '),
      }
      : undefined,
    expiresAt: record.expiresAt ? record.expiresAt.toISOString() : undefined,
    appliedAt: record.appliedAt ? record.appliedAt.toISOString() : undefined,
    rejectedAt: record.rejectedAt ? record.rejectedAt.toISOString() : undefined,
  });
}

function assertPendingConfirmationScope(input: {
  recommendation: AdaptiveRecommendationRecord;
  expectedSessionId: string;
  now: Date;
}) {
  if (input.recommendation.status !== 'pending_confirmation') {
    throw new AdaptiveCoachingError('Recommendation is not pending confirmation', 409);
  }

  if (input.recommendation.actionType !== 'deload' && input.recommendation.actionType !== 'substitution') {
    throw new AdaptiveCoachingError('Recommendation action does not require confirmation', 409);
  }

  if (!input.recommendation.expiresAt || input.recommendation.expiresAt.getTime() <= input.now.getTime()) {
    throw new AdaptiveCoachingError('Recommendation confirmation window has expired', 409);
  }

  if (input.recommendation.plannedSessionId !== input.expectedSessionId) {
    throw new AdaptiveCoachingError('Recommendation no longer targets the next planned session', 409);
  }
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

      const now = deps.now ? deps.now() : new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const history = await deps.getHistoryList(userId, { from: thirtyDaysAgo, to: now });

      const latestRecommendation = await deps.listLatestAdaptiveRecommendation(userId);
      const proposalInput = {
        userId,
        plannedSessionId: targetSession.id,
        profile,
        historyCount: history.length,
      };

      let rawProposal: unknown = null;
      if (deps.realProviderEnabled && deps.proposeRecommendationWithProvider) {
        try {
          rawProposal = await deps.proposeRecommendationWithProvider(proposalInput);
        } catch {
          rawProposal = null;
        }
      } else {
        rawProposal = await deps.proposeRecommendation(proposalInput);
      }

      if (rawProposal == null && !deps.realProviderEnabled) {
        rawProposal = buildDefaultProposal({ plannedSessionId: targetSession.id, historyCount: history.length });
      }
      const rawProposalRecord =
        rawProposal && typeof rawProposal === 'object' && !Array.isArray(rawProposal)
          ? (rawProposal as { modelConfidence?: unknown })
          : null;

      const scheduledAt = toDate(targetSession.scheduledDate);
      const confirmationExpiresAt = new Date(scheduledAt);
      confirmationExpiresAt.setDate(confirmationExpiresAt.getDate() + 1);

      const result = generateAdaptiveRecommendation({
        rawProposal: sanitizeProviderProposal(rawProposal),
        plannedSessionId: targetSession.id,
        queryTags: ['fatigue', 'adherence', 'readiness'],
        modelConfidence: typeof rawProposalRecord?.modelConfidence === 'number' ? rawProposalRecord.modelConfidence : 0.6,
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
    async confirmAdaptiveRecommendation(input: {
      userId: string;
      recommendationId: string;
    }) {
      if (!deps.getAdaptiveRecommendationById || !deps.updateAdaptiveRecommendationStatus) {
        throw new AdaptiveCoachingError('Confirmation transitions are not configured', 500);
      }

      const recommendation = await deps.getAdaptiveRecommendationById(input.userId, input.recommendationId);
      if (!recommendation) {
        throw new AdaptiveCoachingError('Recommendation not found', 404);
      }

      const candidates = await deps.getTodayOrNextSessionCandidates(input.userId);
      const targetSession = candidates.nextSession ?? candidates.todaySession;
      if (!targetSession) {
        throw new AdaptiveCoachingError('Planned session not found', 404);
      }

      const now = deps.now ? deps.now() : new Date();
      assertPendingConfirmationScope({
        recommendation,
        expectedSessionId: targetSession.id,
        now,
      });

      const updated = await deps.updateAdaptiveRecommendationStatus(input.userId, {
        recommendationId: recommendation.id,
        nextStatus: 'applied',
        decisionType: 'user',
        decisionReason: 'user_confirmed_high_impact_recommendation',
        evidenceTags: recommendation.evidenceTags,
        expectedCurrentStatus: 'pending_confirmation',
        expiresAt: null,
      });

      if (!updated) {
        throw new AdaptiveCoachingError('Recommendation not found', 404);
      }

      return toAdaptiveRecommendationPayload(updated);
    },
    async rejectAdaptiveRecommendation(input: {
      userId: string;
      recommendationId: string;
      reason?: string;
    }) {
      if (!deps.getAdaptiveRecommendationById || !deps.updateAdaptiveRecommendationStatus) {
        throw new AdaptiveCoachingError('Rejection transitions are not configured', 500);
      }

      const recommendation = await deps.getAdaptiveRecommendationById(input.userId, input.recommendationId);
      if (!recommendation) {
        throw new AdaptiveCoachingError('Recommendation not found', 404);
      }

      const candidates = await deps.getTodayOrNextSessionCandidates(input.userId);
      const targetSession = candidates.nextSession ?? candidates.todaySession;
      if (!targetSession) {
        throw new AdaptiveCoachingError('Planned session not found', 404);
      }

      const now = deps.now ? deps.now() : new Date();
      assertPendingConfirmationScope({
        recommendation,
        expectedSessionId: targetSession.id,
        now,
      });

      await deps.updateAdaptiveRecommendationStatus(input.userId, {
        recommendationId: recommendation.id,
        nextStatus: 'rejected',
        decisionType: 'user',
        decisionReason: input.reason?.trim() || 'user_rejected_high_impact_recommendation',
        evidenceTags: recommendation.evidenceTags,
        expectedCurrentStatus: 'pending_confirmation',
        expiresAt: null,
      });

      const conservative = await deps.createAdaptiveRecommendation(input.userId, {
        plannedSessionId: recommendation.plannedSessionId,
        actionType: 'hold',
        status: 'applied',
        confidence: Math.min(recommendation.confidence, 0.7),
        confidenceLabel: recommendation.confidenceLabel,
        confidenceReason: 'Conservative hold applied after user rejection',
        warningFlag: recommendation.warningFlag,
        warningText: recommendation.warningText,
        fallbackApplied: true,
        fallbackReason: 'user_rejected_high_impact',
        progressionDeltaLoadPct: 0,
        progressionDeltaReps: 0,
        progressionDeltaSets: recommendation.progressionDeltaSets ?? 0,
        substitutionExerciseKey: null,
        substitutionDisplayName: null,
        substitutionReason: null,
        reasons: [
          'High-impact recommendation was rejected by user',
          'Conservative hold applied for next planned session',
        ],
        evidenceTags: recommendation.evidenceTags,
        forecastPayload: recommendation.forecastPayload,
        expiresAt: null,
      });

      await deps.appendDecisionTrace(input.userId, {
        recommendationId: conservative.id,
        previousStatus: null,
        nextStatus: conservative.status,
        decisionType: 'fallback',
        decisionReason: 'conservative_hold_after_rejection',
        evidenceTags: conservative.evidenceTags,
        metadata: {
          sourceRecommendationId: recommendation.id,
          rejectedReason: input.reason?.trim() || null,
        },
      });

      return toAdaptiveRecommendationPayload(conservative);
    },
  };
}

export async function buildDefaultAdaptiveCoachingService() {
  const { prisma } = await import('@/lib/db/prisma');
  const profileDal = createProfileDal(prisma as never);
  const runtimeConfig = parseLlmRuntimeConfig(process.env);

  const providerProposalSource =
    runtimeConfig === null
      ? null
      : (() => {
        const primary = createProviderClientByName({
          provider: runtimeConfig.primaryProvider,
          config: runtimeConfig,
        });
        const fallback = createProviderClientByName({
          provider: runtimeConfig.fallbackProvider,
          config: runtimeConfig,
        });
        const client = createLlmProposalClient({
          primary,
          fallback,
          primaryMaxRetries: runtimeConfig.primaryMaxRetries,
        });

        return async (input: {
          userId: string;
          plannedSessionId: string;
          profile: ReturnType<typeof validateProfileInput>;
          historyCount: number;
        }) => {
          const prompts = buildProviderPrompts(input);
          const result = await client.generate({
            systemPrompt: prompts.systemPrompt,
            userPrompt: prompts.userPrompt,
            plannedSessionId: input.plannedSessionId,
          });

          return result.candidate;
        };
      })();

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
    getAdaptiveRecommendationById: (userId, recommendationId) => {
      const dal = createAdaptiveCoachingDal(prisma as never, { userId });
      return dal.getAdaptiveRecommendationById(recommendationId);
    },
    createAdaptiveRecommendation: (userId, input) => {
      const dal = createAdaptiveCoachingDal(prisma as never, { userId });
      return dal.createAdaptiveRecommendation(input);
    },
    updateAdaptiveRecommendationStatus: (userId, input) => {
      const dal = createAdaptiveCoachingDal(prisma as never, { userId });
      return dal.updateAdaptiveRecommendationStatus(input);
    },
    appendDecisionTrace: (userId, input) => {
      const dal = createAdaptiveCoachingDal(prisma as never, { userId });
      return dal.appendDecisionTrace(input);
    },
    proposeRecommendation: async (input) => buildDefaultProposal(input),
    realProviderEnabled: runtimeConfig !== null,
    proposeRecommendationWithProvider: providerProposalSource ?? undefined,
  });
}
