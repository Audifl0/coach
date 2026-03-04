import {
  parseProgramHistoryListResponse,
  parseProgramHistorySessionDetailResponse,
  parseProgramSessionDetailResponse,
  parseProgramTodayResponse,
  type ProgramHistoryListResponse,
  type ProgramHistorySessionDetailResponse,
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

type LoggedSetLike = {
  setIndex: number;
  weight: number | string | { toString(): string };
  reps: number;
  rpe: number | null;
};

type SessionHistoryExerciseLike = {
  id: string;
  exerciseKey: string;
  displayName: string;
  movementPattern: string;
  isSkipped: boolean;
  skipReasonCode: string | null;
  skipReasonText: string | null;
  loggedSets: LoggedSetLike[];
};

type SessionDetailExerciseLike = SessionExerciseLike & {
  isSkipped?: boolean;
  skipReasonCode?: string | null;
  skipReasonText?: string | null;
  loggedSets?: LoggedSetLike[];
};

type SessionDetailRecordLike = {
  id: string;
  scheduledDate: Date | string;
  dayIndex: number;
  focusLabel: string;
  state: SessionState;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  effectiveDurationSec?: number | null;
  durationCorrectedAt?: Date | string | null;
  note?: string | null;
  postSessionFatigue?: number | null;
  postSessionReadiness?: number | null;
  postSessionComment?: string | null;
  exercises: SessionDetailExerciseLike[];
};

type SessionHistoryRecordLike = {
  id: string;
  scheduledDate: Date | string;
  effectiveDurationSec: number | null;
  focusLabel: string;
  exercises: SessionHistoryExerciseLike[];
};

function toIsoDate(value: Date | string): string {
  if (typeof value === 'string') {
    return value;
  }

  return value.toISOString().slice(0, 10);
}

function toIsoDateTime(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return value.toISOString();
}

function toNumericValue(value: number | string | { toString(): string }): number {
  if (typeof value === 'number') {
    return value;
  }

  return Number(value.toString());
}

function sumTotalLoad(exercises: SessionHistoryExerciseLike[]): number {
  return exercises.reduce((accumulator, exercise) => {
    const exerciseLoad = exercise.loggedSets.reduce(
      (setAccumulator, setItem) => setAccumulator + (toNumericValue(setItem.weight) * setItem.reps),
      0,
    );
    return accumulator + exerciseLoad;
  }, 0);
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

export function buildSessionDetailProjection(session: SessionDetailRecordLike): ProgramSessionDetailResponse {
  return parseProgramSessionDetailResponse({
    session: {
      id: session.id,
      scheduledDate: toIsoDate(session.scheduledDate),
      dayIndex: session.dayIndex,
      focusLabel: session.focusLabel,
      state: session.state,
      startedAt: toIsoDateTime(session.startedAt),
      completedAt: toIsoDateTime(session.completedAt),
      effectiveDurationSec: session.effectiveDurationSec ?? null,
      durationCorrectedAt: toIsoDateTime(session.durationCorrectedAt),
      note: session.note ?? null,
      postSessionFatigue: session.postSessionFatigue ?? null,
      postSessionReadiness: session.postSessionReadiness ?? null,
      postSessionComment: session.postSessionComment ?? null,
      exercises: session.exercises.map((exercise) => ({
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
        isSkipped: Boolean(exercise.isSkipped),
        skipReasonCode: exercise.skipReasonCode ?? null,
        skipReasonText: exercise.skipReasonText ?? null,
        loggedSets: [...(exercise.loggedSets ?? [])]
          .sort((a, b) => a.setIndex - b.setIndex)
          .map((setItem) => ({
            setIndex: setItem.setIndex,
            weight: toNumericValue(setItem.weight),
            reps: setItem.reps,
            rpe: setItem.rpe === null ? null : toNumericValue(setItem.rpe),
          })),
      })),
    },
  });
}

export function buildProgramHistoryRowsProjection(sessions: SessionHistoryRecordLike[]): ProgramHistoryListResponse {
  return parseProgramHistoryListResponse({
    sessions: sessions.map((session) => ({
      id: session.id,
      date: toIsoDate(session.scheduledDate),
      duration: session.effectiveDurationSec ?? 0,
      exerciseCount: session.exercises.length,
      totalLoad: sumTotalLoad(session.exercises),
    })),
  });
}

export function buildProgramHistorySessionDetailProjection(
  session: SessionHistoryRecordLike,
): ProgramHistorySessionDetailResponse {
  return parseProgramHistorySessionDetailResponse({
    session: {
      id: session.id,
      date: toIsoDate(session.scheduledDate),
      duration: session.effectiveDurationSec ?? 0,
      exerciseCount: session.exercises.length,
      totalLoad: sumTotalLoad(session.exercises),
      focusLabel: session.focusLabel,
      exercises: session.exercises.map((exercise) => ({
        id: exercise.id,
        exerciseKey: exercise.exerciseKey,
        displayName: exercise.displayName,
        movementPattern: exercise.movementPattern,
        isSkipped: exercise.isSkipped,
        skipReasonCode: exercise.skipReasonCode,
        skipReasonText: exercise.skipReasonText,
        loggedSets: [...exercise.loggedSets]
          .sort((a, b) => a.setIndex - b.setIndex)
          .map((setItem) => ({
            setIndex: setItem.setIndex,
            weight: toNumericValue(setItem.weight),
            reps: setItem.reps,
            rpe: setItem.rpe,
          })),
      })),
    },
  });
}
