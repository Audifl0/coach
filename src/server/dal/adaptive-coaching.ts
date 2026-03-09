import type { SessionContext } from '@/lib/auth/contracts';
import type {
  AdaptiveRecommendationAction,
  AdaptiveRecommendationStatus,
} from '@/lib/adaptive-coaching/types';

import { buildAccountScopedWhere, requireAccountScope } from './account-scope';

export type AdaptiveRecommendationRecord = {
  id: string;
  userId: string;
  plannedSessionId: string;
  actionType: AdaptiveRecommendationAction;
  status: AdaptiveRecommendationStatus;
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

export type AdaptiveRecommendationDecisionRecord = {
  id: string;
  recommendationId: string;
  userId: string;
  decisionType: 'policy' | 'user' | 'execution' | 'fallback';
  previousStatus: AdaptiveRecommendationStatus | null;
  nextStatus: AdaptiveRecommendationStatus;
  decisionReason: string;
  evidenceTags: unknown;
  metadata: unknown;
  createdAt: Date;
};

type AdaptiveDalClient = {
  $transaction<T>(callback: (tx: AdaptiveDalClientTx) => Promise<T>): Promise<T>;
  adaptiveRecommendation: {
    create(args: {
      data: {
        userId: string;
        plannedSessionId: string;
        actionType: AdaptiveRecommendationAction;
        status: AdaptiveRecommendationStatus;
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
      };
    }): Promise<AdaptiveRecommendationRecord>;
    findFirst(args: {
      where: {
        userId: string;
        id?: string;
        plannedSessionId?: string;
      };
      orderBy?: { createdAt: 'asc' | 'desc' };
    }): Promise<AdaptiveRecommendationRecord | null>;
    updateMany(args: {
      where: {
        id: string;
        userId: string;
        status?: AdaptiveRecommendationStatus;
      };
      data: {
        status: AdaptiveRecommendationStatus;
        expiresAt?: Date | null;
        appliedAt?: Date | null;
        rejectedAt?: Date | null;
        fallbackApplied?: boolean;
        fallbackReason?: string | null;
      };
    }): Promise<{ count: number }>;
    update(args: {
      where: { id: string };
      data: {
        status: AdaptiveRecommendationStatus;
        expiresAt?: Date | null;
        appliedAt?: Date | null;
        rejectedAt?: Date | null;
        fallbackApplied?: boolean;
        fallbackReason?: string | null;
      };
    }): Promise<AdaptiveRecommendationRecord>;
  };
  adaptiveRecommendationDecision: {
    create(args: {
      data: {
        recommendationId: string;
        userId: string;
        decisionType: 'policy' | 'user' | 'execution' | 'fallback';
        previousStatus: AdaptiveRecommendationStatus | null;
        nextStatus: AdaptiveRecommendationStatus;
        decisionReason: string;
        evidenceTags: unknown;
        metadata?: unknown;
      };
    }): Promise<AdaptiveRecommendationDecisionRecord>;
  };
};

export function createAdaptiveCoachingDbClient(db: unknown): AdaptiveDalClient {
  return db as AdaptiveDalClient;
}

type AdaptiveDalClientTx = Omit<AdaptiveDalClient, '$transaction'>;

export type CreateAdaptiveRecommendationInput = {
  plannedSessionId: string;
  actionType: AdaptiveRecommendationAction;
  status?: AdaptiveRecommendationStatus;
  confidence: number;
  confidenceLabel: 'low' | 'medium' | 'high';
  confidenceReason: string;
  warningFlag?: boolean;
  warningText?: string | null;
  fallbackApplied?: boolean;
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

export type UpdateAdaptiveRecommendationStatusInput = {
  recommendationId: string;
  nextStatus: AdaptiveRecommendationStatus;
  decisionType: 'policy' | 'user' | 'execution' | 'fallback';
  decisionReason: string;
  evidenceTags: unknown;
  metadata?: unknown;
  expiresAt?: Date | null;
  fallbackReason?: string | null;
  expectedCurrentStatus?: AdaptiveRecommendationStatus;
};

export type RejectRecommendationWithFallbackInput = {
  recommendationId: string;
  expectedCurrentStatus: AdaptiveRecommendationStatus;
  rejectionReason: string;
  rejectionEvidenceTags: unknown;
  fallbackReason: string;
  fallbackMetadata?: unknown;
  fallback: {
    plannedSessionId: string;
    confidence: number;
    confidenceLabel: 'low' | 'medium' | 'high';
    confidenceReason: string;
    warningFlag: boolean;
    warningText: string | null;
    evidenceTags: unknown;
    forecastPayload: unknown;
    progressionDeltaSets: number | null;
    reasons: unknown;
  };
};

export class AdaptiveRecommendationStaleStateError extends Error {
  expectedStatus: AdaptiveRecommendationStatus;
  actualStatus: AdaptiveRecommendationStatus;

  constructor(expectedStatus: AdaptiveRecommendationStatus, actualStatus: AdaptiveRecommendationStatus) {
    super(`Adaptive recommendation status mismatch: expected ${expectedStatus}, got ${actualStatus}`);
    this.name = 'AdaptiveRecommendationStaleStateError';
    this.expectedStatus = expectedStatus;
    this.actualStatus = actualStatus;
  }
}

function buildRecommendationUpdateData(
  existing: AdaptiveRecommendationRecord,
  input: UpdateAdaptiveRecommendationStatusInput,
  now: Date,
) {
  return {
    status: input.nextStatus,
    expiresAt: input.expiresAt ?? existing.expiresAt,
    appliedAt: input.nextStatus === 'applied' ? now : existing.appliedAt,
    rejectedAt: input.nextStatus === 'rejected' ? now : existing.rejectedAt,
    fallbackApplied: input.nextStatus === 'fallback_applied' ? true : existing.fallbackApplied,
    fallbackReason:
      input.nextStatus === 'fallback_applied'
        ? (input.fallbackReason ?? existing.fallbackReason)
        : existing.fallbackReason,
  };
}

export function createAdaptiveCoachingDal(db: AdaptiveDalClient, session: SessionContext | null | undefined) {
  const scope = requireAccountScope(session);

  async function createAdaptiveRecommendation(
    input: CreateAdaptiveRecommendationInput,
  ): Promise<AdaptiveRecommendationRecord> {
    return db.adaptiveRecommendation.create({
      data: {
        userId: scope.userId,
        plannedSessionId: input.plannedSessionId,
        actionType: input.actionType,
        status: input.status ?? 'proposed',
        confidence: input.confidence,
        confidenceLabel: input.confidenceLabel,
        confidenceReason: input.confidenceReason,
        warningFlag: input.warningFlag ?? false,
        warningText: input.warningText ?? null,
        fallbackApplied: input.fallbackApplied ?? false,
        fallbackReason: input.fallbackReason ?? null,
        progressionDeltaLoadPct: input.progressionDeltaLoadPct ?? null,
        progressionDeltaReps: input.progressionDeltaReps ?? null,
        progressionDeltaSets: input.progressionDeltaSets ?? null,
        substitutionExerciseKey: input.substitutionExerciseKey ?? null,
        substitutionDisplayName: input.substitutionDisplayName ?? null,
        substitutionReason: input.substitutionReason ?? null,
        reasons: input.reasons,
        evidenceTags: input.evidenceTags,
        forecastPayload: input.forecastPayload,
        expiresAt: input.expiresAt ?? null,
      },
    });
  }

  async function getAdaptiveRecommendationById(recommendationId: string): Promise<AdaptiveRecommendationRecord | null> {
    return db.adaptiveRecommendation.findFirst({
      where: buildAccountScopedWhere(scope, {
        id: recommendationId,
      }),
    });
  }

  async function listLatestAdaptiveRecommendation(
    plannedSessionId?: string,
  ): Promise<AdaptiveRecommendationRecord | null> {
    return db.adaptiveRecommendation.findFirst({
      where: buildAccountScopedWhere(scope, plannedSessionId ? { plannedSessionId } : {}),
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async function appendDecisionTrace(input: {
    recommendationId: string;
    previousStatus: AdaptiveRecommendationStatus | null;
    nextStatus: AdaptiveRecommendationStatus;
    decisionType: 'policy' | 'user' | 'execution' | 'fallback';
    decisionReason: string;
    evidenceTags: unknown;
    metadata?: unknown;
  }): Promise<AdaptiveRecommendationDecisionRecord> {
    return db.adaptiveRecommendationDecision.create({
      data: {
        recommendationId: input.recommendationId,
        userId: scope.userId,
        decisionType: input.decisionType,
        previousStatus: input.previousStatus,
        nextStatus: input.nextStatus,
        decisionReason: input.decisionReason,
        evidenceTags: input.evidenceTags,
        metadata: input.metadata,
      },
    });
  }

  async function updateAdaptiveRecommendationStatus(
    input: UpdateAdaptiveRecommendationStatusInput,
  ): Promise<AdaptiveRecommendationRecord | null> {
    return db.$transaction(async (tx) => {
      const existing = await tx.adaptiveRecommendation.findFirst({
        where: buildAccountScopedWhere(scope, {
          id: input.recommendationId,
        }),
      });

      if (!existing) {
        return null;
      }

      const now = new Date();
      const nextData = buildRecommendationUpdateData(existing, input, now);

      const updateResult = await tx.adaptiveRecommendation.updateMany({
        where: {
          id: existing.id,
          userId: scope.userId,
          ...(input.expectedCurrentStatus ? { status: input.expectedCurrentStatus } : {}),
        },
        data: nextData,
      });

      if (updateResult.count === 0) {
        const current = await tx.adaptiveRecommendation.findFirst({
          where: buildAccountScopedWhere(scope, {
            id: input.recommendationId,
          }),
        });

        if (!current) {
          return null;
        }

        throw new AdaptiveRecommendationStaleStateError(
          input.expectedCurrentStatus ?? existing.status,
          current.status,
        );
      }

      const updated = await tx.adaptiveRecommendation.findFirst({
        where: buildAccountScopedWhere(scope, {
          id: existing.id,
        }),
      });

      if (!updated) {
        return null;
      }

      await tx.adaptiveRecommendationDecision.create({
        data: {
          recommendationId: existing.id,
          userId: scope.userId,
          decisionType: input.decisionType,
          previousStatus: existing.status,
          nextStatus: input.nextStatus,
          decisionReason: input.decisionReason,
          evidenceTags: input.evidenceTags,
          metadata: input.metadata,
        },
      });

      return updated;
    });
  }

  async function rejectRecommendationWithFallback(
    input: RejectRecommendationWithFallbackInput,
  ): Promise<{
    rejectedRecommendation: AdaptiveRecommendationRecord;
    fallbackRecommendation: AdaptiveRecommendationRecord;
  } | null> {
    return db.$transaction(async (tx) => {
      const existing = await tx.adaptiveRecommendation.findFirst({
        where: buildAccountScopedWhere(scope, {
          id: input.recommendationId,
        }),
      });

      if (!existing) {
        return null;
      }

      if (existing.status !== input.expectedCurrentStatus) {
        throw new AdaptiveRecommendationStaleStateError(input.expectedCurrentStatus, existing.status);
      }

      const now = new Date();
      const rejectionData = buildRecommendationUpdateData(
        existing,
        {
          recommendationId: input.recommendationId,
          nextStatus: 'rejected',
          decisionType: 'user',
          decisionReason: input.rejectionReason,
          evidenceTags: input.rejectionEvidenceTags,
          expectedCurrentStatus: input.expectedCurrentStatus,
          expiresAt: null,
        },
        now,
      );

      const result = await tx.adaptiveRecommendation.updateMany({
        where: {
          id: existing.id,
          userId: scope.userId,
          status: input.expectedCurrentStatus,
        },
        data: rejectionData,
      });

      if (result.count === 0) {
        const current = await tx.adaptiveRecommendation.findFirst({
          where: buildAccountScopedWhere(scope, {
            id: input.recommendationId,
          }),
        });

        if (!current) {
          return null;
        }

        throw new AdaptiveRecommendationStaleStateError(input.expectedCurrentStatus, current.status);
      }

      const rejectedRecommendation = await tx.adaptiveRecommendation.findFirst({
        where: buildAccountScopedWhere(scope, {
          id: existing.id,
        }),
      });

      if (!rejectedRecommendation) {
        return null;
      }

      await tx.adaptiveRecommendationDecision.create({
        data: {
          recommendationId: existing.id,
          userId: scope.userId,
          decisionType: 'user',
          previousStatus: existing.status,
          nextStatus: 'rejected',
          decisionReason: input.rejectionReason,
          evidenceTags: input.rejectionEvidenceTags,
          metadata: input.fallbackMetadata,
        },
      });

      const fallbackRecommendation = await tx.adaptiveRecommendation.create({
        data: {
          userId: scope.userId,
          plannedSessionId: input.fallback.plannedSessionId,
          actionType: 'hold',
          status: 'applied',
          confidence: input.fallback.confidence,
          confidenceLabel: input.fallback.confidenceLabel,
          confidenceReason: input.fallback.confidenceReason,
          warningFlag: input.fallback.warningFlag,
          warningText: input.fallback.warningText,
          fallbackApplied: true,
          fallbackReason: input.fallbackReason,
          progressionDeltaLoadPct: 0,
          progressionDeltaReps: 0,
          progressionDeltaSets: input.fallback.progressionDeltaSets ?? 0,
          substitutionExerciseKey: null,
          substitutionDisplayName: null,
          substitutionReason: null,
          reasons: input.fallback.reasons,
          evidenceTags: input.fallback.evidenceTags,
          forecastPayload: input.fallback.forecastPayload,
          expiresAt: null,
        },
      });

      await tx.adaptiveRecommendationDecision.create({
        data: {
          recommendationId: fallbackRecommendation.id,
          userId: scope.userId,
          decisionType: 'fallback',
          previousStatus: null,
          nextStatus: fallbackRecommendation.status,
          decisionReason: 'conservative_hold_after_rejection',
          evidenceTags: fallbackRecommendation.evidenceTags,
          metadata: input.fallbackMetadata,
        },
      });

      return {
        rejectedRecommendation,
        fallbackRecommendation,
      };
    });
  }

  return {
    createAdaptiveRecommendation,
    getAdaptiveRecommendationById,
    listLatestAdaptiveRecommendation,
    appendDecisionTrace,
    updateAdaptiveRecommendationStatus,
    rejectRecommendationWithFallback,
    async markRecommendationValidated(
      recommendationId: string,
      decisionReason: string,
      evidenceTags: unknown,
    ): Promise<AdaptiveRecommendationRecord | null> {
      return updateAdaptiveRecommendationStatus({
        recommendationId,
        nextStatus: 'validated',
        decisionType: 'policy',
        decisionReason,
        evidenceTags,
      });
    },
    async markRecommendationPendingConfirmation(input: {
      recommendationId: string;
      decisionReason: string;
      evidenceTags: unknown;
      expiresAt: Date;
    }): Promise<AdaptiveRecommendationRecord | null> {
      return updateAdaptiveRecommendationStatus({
        recommendationId: input.recommendationId,
        nextStatus: 'pending_confirmation',
        decisionType: 'policy',
        decisionReason: input.decisionReason,
        evidenceTags: input.evidenceTags,
        expiresAt: input.expiresAt,
      });
    },
    async markRecommendationApplied(
      recommendationId: string,
      decisionReason: string,
      evidenceTags: unknown,
    ): Promise<AdaptiveRecommendationRecord | null> {
      return updateAdaptiveRecommendationStatus({
        recommendationId,
        nextStatus: 'applied',
        decisionType: 'execution',
        decisionReason,
        evidenceTags,
      });
    },
    async markRecommendationRejected(
      recommendationId: string,
      decisionReason: string,
      evidenceTags: unknown,
    ): Promise<AdaptiveRecommendationRecord | null> {
      return updateAdaptiveRecommendationStatus({
        recommendationId,
        nextStatus: 'rejected',
        decisionType: 'user',
        decisionReason,
        evidenceTags,
      });
    },
    async markRecommendationFallbackApplied(
      recommendationId: string,
      decisionReason: string,
      evidenceTags: unknown,
      fallbackReason: string,
    ): Promise<AdaptiveRecommendationRecord | null> {
      return updateAdaptiveRecommendationStatus({
        recommendationId,
        nextStatus: 'fallback_applied',
        decisionType: 'fallback',
        decisionReason,
        evidenceTags,
        fallbackReason,
      });
    },
  };
}
