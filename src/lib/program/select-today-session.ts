import {
  parseProgramSessionDetailResponse,
  parseProgramTodayResponse,
  type ProgramSessionDetailResponse,
  type ProgramSessionSummary,
  type ProgramTodayResponse,
} from '@/lib/program/contracts';
import type { SessionState } from '@/lib/program/types';

type SessionExerciseLike = {
  id: string;
  exerciseKey: string;
  displayName: string;
  movementPattern: string;
  sets: number;
  targetReps: number;
  targetLoad: string;
  restMinSec: number;
  restMaxSec: number;
  isSubstituted: boolean;
  originalExerciseKey: string | null;
};

type SessionRecordLike = {
  id: string;
  scheduledDate: Date | string;
  dayIndex: number;
  focusLabel: string;
  state: SessionState;
  exercises: SessionExerciseLike[];
};

function toIsoDate(value: Date | string): string {
  if (typeof value === 'string') {
    return value;
  }

  return value.toISOString().slice(0, 10);
}

export function mapSessionSummary(record: SessionRecordLike): ProgramSessionSummary {
  return {
    id: record.id,
    scheduledDate: toIsoDate(record.scheduledDate),
    dayIndex: record.dayIndex,
    focusLabel: record.focusLabel,
    state: record.state,
    exercises: record.exercises.map((exercise) => ({
      id: exercise.id,
      exerciseKey: exercise.exerciseKey,
      displayName: exercise.displayName,
      movementPattern: exercise.movementPattern as ProgramSessionSummary['exercises'][number]['movementPattern'],
      sets: exercise.sets,
      targetReps: exercise.targetReps,
      targetLoad: exercise.targetLoad,
      restMinSec: exercise.restMinSec,
      restMaxSec: exercise.restMaxSec,
      isSubstituted: exercise.isSubstituted,
      originalExerciseKey: exercise.originalExerciseKey,
    })),
  };
}

export function selectTodayWorkoutProjection(input: {
  todaySession: SessionRecordLike | null;
  nextSession: SessionRecordLike | null;
}): ProgramTodayResponse {
  const todaySession = input.todaySession ? mapSessionSummary(input.todaySession) : null;
  const nextSession = input.todaySession
    ? null
    : (input.nextSession ? mapSessionSummary(input.nextSession) : null);

  return parseProgramTodayResponse({
    todaySession,
    nextSession,
    primaryAction: 'start_workout',
  });
}

export function buildSessionDetailProjection(session: SessionRecordLike): ProgramSessionDetailResponse {
  return parseProgramSessionDetailResponse({
    session: mapSessionSummary(session),
  });
}
