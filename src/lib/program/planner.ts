import { getExerciseCatalogEntry, exerciseCatalog } from './catalog';
import type { ProfileInput } from '../profile/contracts';
import type { MovementPattern } from './types';

type PlannedExercise = {
  id: string;
  exerciseKey: string;
  displayName: string;
  movementPattern: MovementPattern;
  sets: number;
  targetReps: number;
  targetLoad: string;
  restMinSec: number;
  restMaxSec: number;
  isSubstituted: boolean;
  originalExerciseKey: string | null;
};

type PlannedSession = {
  id: string;
  scheduledDate: string;
  dayIndex: number;
  focusLabel: string;
  state: 'planned';
  exercises: PlannedExercise[];
};

export type WeeklyProgramPlan = {
  startDate: string;
  endDate: string;
  sessions: PlannedSession[];
};

type PlannerInput = {
  profile: ProfileInput;
  anchorDate?: string;
  previousPlan?: WeeklyProgramPlan | null;
};

type Prescription = {
  sets: number;
  targetReps: number;
  targetLoad: string;
  restMinSec: number;
  restMaxSec: number;
};

const sessionPatternTemplates: MovementPattern[][] = [
  ['squat', 'horizontal_push'],
  ['hinge', 'horizontal_pull'],
  ['squat', 'horizontal_pull'],
  ['hinge', 'horizontal_push'],
  ['squat', 'horizontal_push'],
  ['hinge', 'horizontal_pull'],
  ['squat', 'horizontal_pull'],
];

function parseAnchorDate(anchorDate?: string): Date {
  if (!anchorDate) {
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    return now;
  }

  const parsed = new Date(`${anchorDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid anchor date');
  }

  return parsed;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const clone = new Date(date);
  clone.setUTCDate(clone.getUTCDate() + days);
  return clone;
}

function buildDayOffsets(sessionCount: number): number[] {
  if (sessionCount <= 1) {
    return [0];
  }

  const offsets = new Set<number>();
  for (let index = 0; index < sessionCount; index += 1) {
    offsets.add(Math.round((index * 6) / (sessionCount - 1)));
  }

  let candidate = 0;
  while (offsets.size < sessionCount && candidate <= 6) {
    offsets.add(candidate);
    candidate += 1;
  }

  return Array.from(offsets).sort((a, b) => a - b).slice(0, sessionCount);
}

function deriveBlockedLimitations(profile: ProfileInput): Set<string> {
  if (!profile.limitationsDeclared) {
    return new Set();
  }

  return new Set(profile.limitations.filter((item) => item.severity !== 'none').map((item) => item.zone));
}

function buildPrescription(goal: ProfileInput['goal']): Prescription {
  if (goal === 'strength') {
    return {
      sets: 4,
      targetReps: 6,
      targetLoad: 'heavy (RPE 7-8)',
      restMinSec: 120,
      restMaxSec: 180,
    };
  }

  if (goal === 'recomposition') {
    return {
      sets: 3,
      targetReps: 8,
      targetLoad: 'moderate-heavy (RPE 7)',
      restMinSec: 75,
      restMaxSec: 120,
    };
  }

  return {
    sets: 3,
    targetReps: 10,
    targetLoad: 'moderate (RPE 7)',
    restMinSec: 60,
    restMaxSec: 90,
  };
}

function chooseExerciseKey(
  pattern: MovementPattern,
  sessionIndex: number,
  allowedEquipment: Set<string>,
  blockedLimitations: Set<string>,
  previousKey?: string | null,
): string {
  const eligible = exerciseCatalog
    .filter((entry) => entry.movementPattern === pattern)
    .filter((entry) => entry.equipmentTags.every((tag) => allowedEquipment.has(tag)))
    .filter((entry) => entry.blockedLimitations.every((zone) => !blockedLimitations.has(zone)))
    .map((entry) => entry.key)
    .sort();

  if (eligible.length === 0) {
    const fallback = exerciseCatalog
      .filter((entry) => entry.equipmentTags.every((tag) => allowedEquipment.has(tag)))
      .filter((entry) => entry.blockedLimitations.every((zone) => !blockedLimitations.has(zone)))
      .map((entry) => entry.key)
      .sort();

    if (fallback.length === 0) {
      throw new Error('No eligible exercise available for provided profile constraints');
    }

    return fallback[sessionIndex % fallback.length];
  }

  if (previousKey && eligible.includes(previousKey)) {
    return previousKey;
  }

  return eligible[sessionIndex % eligible.length];
}

function deriveFocusLabel(patterns: MovementPattern[]): string {
  const labelByPattern: Record<MovementPattern, string> = {
    squat: 'Lower',
    hinge: 'Posterior Chain',
    horizontal_push: 'Push',
    horizontal_pull: 'Pull',
    vertical_push: 'Shoulders',
    vertical_pull: 'Back',
    core: 'Core',
  };

  return patterns.map((pattern) => labelByPattern[pattern]).join(' + ');
}

export function buildWeeklyProgramPlan(input: PlannerInput): WeeklyProgramPlan {
  const anchor = parseAnchorDate(input.anchorDate);
  const startDate = toIsoDate(anchor);
  const endDate = toIsoDate(addDays(anchor, 6));
  const dayOffsets = buildDayOffsets(input.profile.weeklySessionTarget);
  const allowedEquipment = new Set(input.profile.equipmentCategories);
  const blockedLimitations = deriveBlockedLimitations(input.profile);
  const prescription = buildPrescription(input.profile.goal);

  const previousByDayPattern = new Map<string, string>();
  for (const session of input.previousPlan?.sessions ?? []) {
    for (const exercise of session.exercises) {
      const catalog = getExerciseCatalogEntry(exercise.exerciseKey);
      if (!catalog) {
        continue;
      }
      previousByDayPattern.set(`${session.dayIndex}:${catalog.movementPattern}`, exercise.exerciseKey);
    }
  }

  const sessions: PlannedSession[] = dayOffsets.map((dayIndex, sessionIndex) => {
    const patterns = sessionPatternTemplates[sessionIndex % sessionPatternTemplates.length];
    const exercises: PlannedExercise[] = patterns.map((pattern, exerciseIndex) => {
      const previousKey = previousByDayPattern.get(`${dayIndex}:${pattern}`);
      const exerciseKey = chooseExerciseKey(
        pattern,
        sessionIndex + exerciseIndex,
        allowedEquipment,
        blockedLimitations,
        previousKey,
      );
      const entry = getExerciseCatalogEntry(exerciseKey);
      if (!entry) {
        throw new Error(`Exercise ${exerciseKey} missing from catalog`);
      }

      return {
        id: `session_${dayIndex + 1}_exercise_${exerciseIndex + 1}`,
        exerciseKey: entry.key,
        displayName: entry.displayName,
        movementPattern: entry.movementPattern,
        sets: prescription.sets,
        targetReps: prescription.targetReps,
        targetLoad: prescription.targetLoad,
        restMinSec: prescription.restMinSec,
        restMaxSec: prescription.restMaxSec,
        isSubstituted: false,
        originalExerciseKey: null,
      };
    });

    return {
      id: `session_${dayIndex + 1}`,
      scheduledDate: toIsoDate(addDays(anchor, dayIndex)),
      dayIndex,
      focusLabel: deriveFocusLabel(patterns),
      state: 'planned',
      exercises,
    };
  });

  return {
    startDate,
    endDate,
    sessions,
  };
}
