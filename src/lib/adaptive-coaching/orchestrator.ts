import {
  parseAdaptiveRecommendation,
  parseAdaptiveRecommendationProposal,
  type AdaptiveRecommendation,
} from '@/lib/adaptive-coaching/contracts';
import {
  buildAdaptiveExplanationEnvelope,
  deriveEvidenceContextQuality,
  retrieveAdaptiveEvidence,
} from '@/lib/adaptive-coaching/evidence';
import { evaluateRecommendationConfidence, selectConservativeFallback } from '@/lib/adaptive-coaching/confidence';
import { applyAdaptiveSafetyPolicy, type AdaptiveRecommendation as PolicyRecommendation } from '@/lib/adaptive-coaching/policy';

type RecommendationStatus = AdaptiveRecommendation['status'];

export type AdaptiveOrchestrationInput = {
  rawProposal: unknown;
  plannedSessionId: string;
  queryTags: string[];
  modelConfidence: number | null;
  athleteContext: {
    limitations: Array<{ zone: string; severity: 'none' | 'mild' | 'moderate' | 'severe' }>;
    painFlags: string[];
  };
  lastAppliedRecommendation: PolicyRecommendation | null;
  confirmationExpiresAt: Date | null;
};

export type AdaptiveOrchestrationResult = {
  recommendation: AdaptiveRecommendation;
  traceSteps: Array<'parse' | 'integrity' | 'safe_01_02' | 'safe_03' | 'status_assignment'>;
};

function toConfidenceLabel(value: number): 'low' | 'medium' | 'high' {
  if (value >= 0.8) {
    return 'high';
  }

  if (value >= 0.6) {
    return 'medium';
  }

  return 'low';
}

function toPolicyCandidate(actionType: AdaptiveRecommendation['actionType'], substitutionExerciseKey?: string): PolicyRecommendation {
  if (actionType === 'progress') {
    return {
      actionType,
      deltaLoadPct: 0.03,
      deltaRep: 1,
      substitutionExerciseKey: null,
      movementTags: ['compound'],
      equipmentTags: ['dumbbells'],
    };
  }

  if (actionType === 'deload') {
    return {
      actionType,
      deltaLoadPct: -0.03,
      deltaRep: -1,
      substitutionExerciseKey: null,
      movementTags: ['fatigue'],
      equipmentTags: ['dumbbells'],
    };
  }

  if (actionType === 'substitution') {
    return {
      actionType,
      deltaLoadPct: 0,
      deltaRep: 0,
      substitutionExerciseKey: substitutionExerciseKey ?? null,
      movementTags: ['limitation'],
      equipmentTags: ['dumbbells'],
    };
  }

  return {
    actionType: 'hold',
    deltaLoadPct: 0,
    deltaRep: 0,
    substitutionExerciseKey: null,
    movementTags: ['recovery'],
    equipmentTags: ['dumbbells'],
  };
}

function resolveStatus(actionType: AdaptiveRecommendation['actionType'], fallbackApplied: boolean): RecommendationStatus {
  if (fallbackApplied) {
    return 'fallback_applied';
  }

  if (actionType === 'deload' || actionType === 'substitution') {
    return 'pending_confirmation';
  }

  return 'validated';
}

export function generateAdaptiveRecommendation(input: AdaptiveOrchestrationInput): AdaptiveOrchestrationResult {
  const traceSteps: AdaptiveOrchestrationResult['traceSteps'] = [];

  traceSteps.push('parse');
  let parsedProposal: ReturnType<typeof parseAdaptiveRecommendationProposal> | null = null;
  try {
    parsedProposal = parseAdaptiveRecommendationProposal(input.rawProposal);
  } catch {
    parsedProposal = null;
  }

  traceSteps.push('integrity');
  const evidence = retrieveAdaptiveEvidence({
    queryTags: input.queryTags,
    topK: 3,
  });
  const contextQuality = deriveEvidenceContextQuality(evidence.length);

  let explanationReasons = ['Conservative adaptation used', 'Model output was not valid'];
  let explanationEvidenceTags = evidence.map((item) => item.ref);
  if (explanationEvidenceTags.length === 0) {
    explanationEvidenceTags = ['G-000'];
  }

  let candidateRecommendation: PolicyRecommendation | null = null;
  let fallbackReasonCode: string | null = null;
  let forecastProjection = { projectedReadiness: 3, projectedRpe: 7 };

  if (parsedProposal && parsedProposal.plannedSessionId === input.plannedSessionId) {
    try {
      const envelope = buildAdaptiveExplanationEnvelope({
        reasons: parsedProposal.reasons,
        evidence,
      });
      explanationReasons = envelope.reasons;
      explanationEvidenceTags = envelope.evidenceTags;
      forecastProjection = parsedProposal.forecastProjection;
      candidateRecommendation = toPolicyCandidate(
        parsedProposal.actionType,
        parsedProposal.substitutionTarget?.exerciseKey,
      );
    } catch {
      candidateRecommendation = null;
    }
  }

  traceSteps.push('safe_01_02');
  const safeCandidate = candidateRecommendation
    ? applyAdaptiveSafetyPolicy({
      recommendation: candidateRecommendation,
      athleteContext: input.athleteContext,
    })
    : null;

  traceSteps.push('safe_03');
  const confidence = evaluateRecommendationConfidence({
    candidateRecommendation: safeCandidate ? safeCandidate.normalizedRecommendation : null,
    modelConfidence: input.modelConfidence,
    contextQuality,
  });

  const useFallback = !safeCandidate || confidence.fallbackRequired;
  const resolved = useFallback
    ? selectConservativeFallback({
      lastAppliedRecommendation: input.lastAppliedRecommendation,
      athleteContext: input.athleteContext,
    })
    : null;

  if (resolved) {
    fallbackReasonCode = resolved.fallbackReasonCode;
  }

  const finalPolicy = resolved ? resolved.recommendation : safeCandidate!.normalizedRecommendation;
  const warningFlag = Boolean(safeCandidate?.warnings.limitationConflict);
  const warningText = warningFlag ? 'Recommendation overlaps declared limitation or pain flags' : undefined;

  traceSteps.push('status_assignment');
  const status = resolveStatus(finalPolicy.actionType, useFallback);
  const expiresAt = status === 'pending_confirmation' ? input.confirmationExpiresAt : null;

  const recommendation = parseAdaptiveRecommendation({
    id: `preview_${input.plannedSessionId}`,
    actionType: finalPolicy.actionType,
    status,
    plannedSessionId: input.plannedSessionId,
    confidence: Number(confidence.confidenceScore.toFixed(3)),
    confidenceLabel: toConfidenceLabel(confidence.confidenceScore),
    confidenceReason: useFallback
      ? `Fallback applied (${fallbackReasonCode ?? 'invalid_recommendation'})`
      : 'Structured proposal passed policy checks',
    warningFlag,
    warningText,
    fallbackApplied: useFallback,
    fallbackReason: useFallback ? (fallbackReasonCode ?? 'conservative_hold') : undefined,
    reasons: explanationReasons,
    evidenceTags: explanationEvidenceTags,
    forecastProjection,
    progressionDeltaLoadPct: Number((finalPolicy.deltaLoadPct * 100).toFixed(2)),
    progressionDeltaReps: finalPolicy.deltaRep,
    progressionDeltaSets: undefined,
    substitutionTarget: finalPolicy.substitutionExerciseKey
      ? {
        exerciseKey: finalPolicy.substitutionExerciseKey,
        displayName: finalPolicy.substitutionExerciseKey.replace(/_/g, ' '),
      }
      : undefined,
    expiresAt: expiresAt ? expiresAt.toISOString() : undefined,
  });

  return {
    recommendation,
    traceSteps,
  };
}
