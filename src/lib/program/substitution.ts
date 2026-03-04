import type { ProfileInput } from '@/lib/profile/contracts';
import type { MovementPattern } from '@/lib/program/types';
import type { PlannedExerciseRecord } from '@/server/dal/program';

import { getExerciseCatalogEntry } from './catalog';

type LimitationInput = Pick<ProfileInput['limitations'][number], 'zone' | 'severity'>;
type EquipmentInput = ProfileInput['equipmentCategories'];

export type SubstitutionCandidate = {
  exerciseKey: string;
  displayName: string;
  movementPattern: MovementPattern;
  equipmentTags: string[];
};

export class SubstitutionError extends Error {
  code: 'NOT_FOUND' | 'INVALID_REPLACEMENT' | 'NON_TODAY_EXERCISE';

  constructor(code: SubstitutionError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export function getSubstitutionCandidates(input: {
  plannedExerciseKey: string;
  equipmentCategories: EquipmentInput;
  limitations: LimitationInput[];
  overrideCandidateKeys?: string[];
  limit?: number;
}): SubstitutionCandidate[] {
  const source = getExerciseCatalogEntry(input.plannedExerciseKey);
  if (!source) {
    return [];
  }

  const safetyBlockedTags = new Set(
    input.limitations
      .filter((limitation) => limitation.severity !== 'none')
      .map((limitation) => `${limitation.zone.trim().toLowerCase().replace(/\s+/g, '_')}_acute`),
  );
  const availableEquipment = new Set(input.equipmentCategories);
  const orderedCandidateKeys = input.overrideCandidateKeys ?? source.compatibleSubstitutionKeys;
  const max = Math.max(1, input.limit ?? 3);
  const candidates: SubstitutionCandidate[] = [];

  for (const candidateKey of orderedCandidateKeys) {
    const candidate = getExerciseCatalogEntry(candidateKey);
    if (!candidate) {
      continue;
    }

    if (candidate.movementPattern !== source.movementPattern) {
      continue;
    }

    if (candidate.blockedLimitations.some((blocked) => safetyBlockedTags.has(blocked))) {
      continue;
    }

    if (candidate.equipmentTags.some((tag) => !availableEquipment.has(tag))) {
      continue;
    }

    candidates.push({
      exerciseKey: candidate.key,
      displayName: candidate.displayName,
      movementPattern: candidate.movementPattern,
      equipmentTags: [...candidate.equipmentTags],
    });

    if (candidates.length >= max) {
      break;
    }
  }

  return candidates;
}

export async function applyPlannedExerciseSubstitution(input: {
  plannedExerciseId: string;
  replacementExerciseKey: string;
  now: Date;
  equipmentCategories: EquipmentInput;
  limitations: LimitationInput[];
  getPlannedExerciseOwnership: (plannedExerciseId: string) => Promise<{
    plannedExerciseId: string;
    exerciseKey: string;
    scheduledDate: string;
  } | null>;
  updatePlannedExercise: (input: {
    plannedExerciseId: string;
    replacementExerciseKey: string;
    replacementDisplayName: string;
    replacementMovementPattern: MovementPattern;
  }) => Promise<PlannedExerciseRecord>;
}): Promise<PlannedExerciseRecord> {
  const ownership = await input.getPlannedExerciseOwnership(input.plannedExerciseId);
  if (!ownership) {
    throw new SubstitutionError('NOT_FOUND', 'Planned exercise not found');
  }

  const todayIso = input.now.toISOString().slice(0, 10);
  if (ownership.scheduledDate !== todayIso) {
    throw new SubstitutionError('NON_TODAY_EXERCISE', 'Substitution is only allowed for today');
  }

  const candidates = getSubstitutionCandidates({
    plannedExerciseKey: ownership.exerciseKey,
    equipmentCategories: input.equipmentCategories,
    limitations: input.limitations,
  });
  const replacement = candidates.find((entry) => entry.exerciseKey === input.replacementExerciseKey);
  if (!replacement) {
    throw new SubstitutionError('INVALID_REPLACEMENT', 'Invalid replacement exercise');
  }

  return input.updatePlannedExercise({
    plannedExerciseId: input.plannedExerciseId,
    replacementExerciseKey: replacement.exerciseKey,
    replacementDisplayName: replacement.displayName,
    replacementMovementPattern: replacement.movementPattern,
  });
}
