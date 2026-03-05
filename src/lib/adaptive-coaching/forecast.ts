import type { AdaptiveRecommendationAction, AdaptiveRecommendationStatus } from './types';

type AdaptiveForecastSource = {
  actionType: AdaptiveRecommendationAction;
  status: AdaptiveRecommendationStatus;
  warningFlag: boolean;
  warningText: string | null;
  fallbackApplied: boolean;
  fallbackReason: string | null;
  reasons: unknown;
  evidenceTags: unknown;
  forecastPayload: unknown;
  progressionDeltaLoadPct?: number | null;
  progressionDeltaReps?: number | null;
};

export type AdaptiveForecastViewModel = {
  title: string;
  state: 'active' | 'awaiting_decision' | 'prevision_prudente';
  actionLabel: string;
  prudenceLabel: 'Prevision prudente' | null;
  prudenceReason: string | null;
  reasons: string[];
  evidenceTags: string[];
  projection: {
    projectedReadiness: number;
    projectedRpe: number;
    progressionDeltaLoadPct: number;
    progressionDeltaReps: number;
  };
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function toActionLabel(actionType: AdaptiveRecommendationAction, status: AdaptiveRecommendationStatus): string {
  if (status === 'pending_confirmation') {
    if (actionType === 'deload') {
      return 'Deload a confirmer';
    }

    if (actionType === 'substitution') {
      return 'Substitution a confirmer';
    }
  }

  if (actionType === 'progress') {
    return 'Progression moderee';
  }

  if (actionType === 'deload') {
    return 'Deload conservateur';
  }

  if (actionType === 'substitution') {
    return 'Substitution ciblee';
  }

  return 'Maintien conservateur';
}

function toPrudenceReason(source: AdaptiveForecastSource): string | null {
  if (source.warningFlag && source.warningText) {
    return source.warningText;
  }

  if (source.fallbackApplied && source.fallbackReason) {
    return `Fallback prudent applique (${source.fallbackReason})`;
  }

  if (source.warningFlag) {
    return 'Risque detecte sur limitation ou douleur declaree';
  }

  if (source.fallbackApplied) {
    return 'Fallback prudent applique faute de recommandation fiable';
  }

  return null;
}

function toProjection(source: AdaptiveForecastSource): AdaptiveForecastViewModel['projection'] {
  const payload = source.forecastPayload && typeof source.forecastPayload === 'object'
    ? (source.forecastPayload as Record<string, unknown>)
    : {};

  const readiness = typeof payload.projectedReadiness === 'number' ? payload.projectedReadiness : 3;
  const rpe = typeof payload.projectedRpe === 'number' ? payload.projectedRpe : 7;
  const rawLoadDelta = typeof payload.progressionDeltaLoadPct === 'number'
    ? payload.progressionDeltaLoadPct
    : (source.progressionDeltaLoadPct ?? 0);
  const rawRepDelta = typeof payload.progressionDeltaReps === 'number'
    ? payload.progressionDeltaReps
    : (source.progressionDeltaReps ?? 0);

  return {
    projectedReadiness: clamp(Math.round(readiness), 1, 5),
    projectedRpe: clamp(Number(rpe.toFixed(1)), 1, 10),
    progressionDeltaLoadPct: clamp(Number(rawLoadDelta.toFixed(2)), -5, 5),
    progressionDeltaReps: clamp(Math.round(rawRepDelta), -2, 2),
  };
}

export function buildAdaptiveForecastViewModel(source: AdaptiveForecastSource): AdaptiveForecastViewModel {
  const prudentState = source.warningFlag || source.fallbackApplied;
  const awaitingDecision = source.status === 'pending_confirmation';

  return {
    title: 'Prevision prochaine seance',
    state: prudentState ? 'prevision_prudente' : (awaitingDecision ? 'awaiting_decision' : 'active'),
    actionLabel: toActionLabel(source.actionType, source.status),
    prudenceLabel: prudentState ? 'Prevision prudente' : null,
    prudenceReason: prudentState ? toPrudenceReason(source) : null,
    reasons: normalizeStringList(source.reasons, 3),
    evidenceTags: normalizeStringList(source.evidenceTags, 3),
    projection: toProjection(source),
  };
}
