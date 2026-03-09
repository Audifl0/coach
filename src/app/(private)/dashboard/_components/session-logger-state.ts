import type { ProgramSessionDetailResponse, ProgramSessionSummary } from '@/lib/program/contracts';

export type LoggedSetEntry = {
  setIndex: number;
  weight: number;
  reps: number;
  rpe: number | null;
};

export type LoggerState = {
  timerStartedAtMs: number | null;
  timerCompletedAtMs: number | null;
};

export type HydratedSkipState = {
  skipped: boolean;
  reasonCode: string;
  reasonText?: string;
};

export type SessionLoggerHydration = {
  loggerState: LoggerState;
  loggedSets: Record<string, LoggedSetEntry[]>;
  skipState: Record<string, HydratedSkipState>;
  note: string;
  fatigue: number | null;
  readiness: number | null;
  comment: string;
  isCompleted: boolean;
};

export type HydratableSession = ProgramSessionSummary | ProgramSessionDetailResponse['session'];

type CompleteSessionInput = {
  fatigue: number | null;
  readiness: number | null;
  comment?: string;
};

export const MAX_NOTE_LENGTH = 280;

function toTwoDigits(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function clampComment(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, MAX_NOTE_LENGTH);
}

export function createInitialLoggerState(): LoggerState {
  return {
    timerStartedAtMs: null,
    timerCompletedAtMs: null,
  };
}

function isHydratableDetailSession(session: HydratableSession): session is ProgramSessionDetailResponse['session'] {
  return 'startedAt' in session || 'completedAt' in session || 'note' in session;
}

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function buildSessionLoggerHydration(session: HydratableSession): SessionLoggerHydration {
  if (!isHydratableDetailSession(session)) {
    return {
      loggerState: createInitialLoggerState(),
      loggedSets: {},
      skipState: {},
      note: '',
      fatigue: null,
      readiness: null,
      comment: '',
      isCompleted: false,
    };
  }

  const loggedSets = session.exercises.reduce<Record<string, LoggedSetEntry[]>>((accumulator, exercise) => {
    accumulator[exercise.id] = [...exercise.loggedSets].sort((left, right) => left.setIndex - right.setIndex);
    return accumulator;
  }, {});

  const skipState = session.exercises.reduce<Record<string, HydratedSkipState>>((accumulator, exercise) => {
    if (!exercise.isSkipped) {
      return accumulator;
    }

    accumulator[exercise.id] = {
      skipped: true,
      reasonCode: exercise.skipReasonCode ?? '',
      ...(exercise.skipReasonText ? { reasonText: exercise.skipReasonText } : {}),
    };
    return accumulator;
  }, {});

  return {
    loggerState: {
      timerStartedAtMs: toTimestamp(session.startedAt),
      timerCompletedAtMs: toTimestamp(session.completedAt),
    },
    loggedSets,
    skipState,
    note: session.note ?? '',
    fatigue: session.postSessionFatigue ?? null,
    readiness: session.postSessionReadiness ?? null,
    comment: session.postSessionComment ?? '',
    isCompleted: session.completedAt !== null || session.state === 'completed',
  };
}

export function reduceLoggerStateAfterSetSaved(state: LoggerState, input: { nowMs: number }): LoggerState {
  if (state.timerStartedAtMs !== null) {
    return state;
  }

  return {
    timerStartedAtMs: input.nowMs,
    timerCompletedAtMs: null,
  };
}

export function reduceLoggerStateAfterCompletion(state: LoggerState, input: { nowMs: number }): LoggerState {
  const startedAt = state.timerStartedAtMs ?? input.nowMs;

  return {
    timerStartedAtMs: startedAt,
    timerCompletedAtMs: input.nowMs,
  };
}

export function formatElapsedSeconds(state: LoggerState, nowMs: number): string {
  if (state.timerStartedAtMs === null) {
    return '00:00';
  }

  const end = state.timerCompletedAtMs ?? nowMs;
  const totalSeconds = Math.max(0, Math.floor((end - state.timerStartedAtMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${toTwoDigits(minutes)}:${toTwoDigits(seconds)}`;
}

export function upsertLoggedSet(existing: LoggedSetEntry[], incoming: LoggedSetEntry): LoggedSetEntry[] {
  const index = existing.findIndex((item) => item.setIndex === incoming.setIndex);
  if (index === -1) {
    return [...existing, incoming].sort((a, b) => a.setIndex - b.setIndex);
  }

  const next = [...existing];
  next[index] = incoming;
  return next.sort((a, b) => a.setIndex - b.setIndex);
}

export function buildSkipPayload(reasonCode: string, reasonText?: string): { reasonCode: string; reasonText?: string } {
  const normalizedReason = reasonCode.trim();
  if (!normalizedReason) {
    throw new Error('Skip reason is required.');
  }

  const normalizedText = reasonText?.trim().slice(0, MAX_NOTE_LENGTH);
  if (!normalizedText) {
    return { reasonCode: normalizedReason };
  }

  return {
    reasonCode: normalizedReason,
    reasonText: normalizedText,
  };
}

export function buildCompleteSessionPayload(input: CompleteSessionInput): {
  fatigue: number;
  readiness: number;
  comment?: string;
} {
  if (input.fatigue === null || input.fatigue < 1 || input.fatigue > 5) {
    throw new Error('Fatigue is required and must be between 1 and 5.');
  }

  if (input.readiness === null || input.readiness < 1 || input.readiness > 5) {
    throw new Error('Readiness is required and must be between 1 and 5.');
  }

  return {
    fatigue: input.fatigue,
    readiness: input.readiness,
    ...(clampComment(input.comment) ? { comment: clampComment(input.comment) } : {}),
  };
}

export function clampSessionNote(value: string | undefined): string | undefined {
  return clampComment(value);
}
