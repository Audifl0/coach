import type { buildCompleteSessionPayload } from './session-logger-state';

type SetRequestPayload = {
  setIndex: number;
  weight: number;
  reps: number;
  rpe?: number;
};

type SkipRequestPayload = {
  reasonCode: string;
  reasonText?: string;
};

type NoteRequestPayload = {
  note: string | null;
};

type DurationCorrectionRequestPayload = {
  effectiveDurationSec: number;
};

type SessionLoggerRequestErrorKind =
  | 'save_set'
  | 'skip_exercise'
  | 'revert_skip'
  | 'save_note'
  | 'complete_session'
  | 'correct_duration';

function createJsonRequest(url: string, method: 'POST' | 'PATCH', payload: unknown) {
  return {
    url,
    init: {
      method,
      cache: 'no-store' as const,
      headers: { 'content-type': 'application/json' as const },
      body: JSON.stringify(payload),
    },
  };
}

export function buildSaveSetRequest(input: { sessionId: string; exerciseId: string; payload: SetRequestPayload }) {
  return createJsonRequest(`/api/program/sessions/${input.sessionId}/exercises/${input.exerciseId}/sets`, 'POST', input.payload);
}

export function buildSkipRequest(input: { sessionId: string; exerciseId: string; payload: SkipRequestPayload }) {
  return createJsonRequest(`/api/program/sessions/${input.sessionId}/exercises/${input.exerciseId}/skip`, 'POST', input.payload);
}

export function buildRevertSkipRequest(input: { sessionId: string; exerciseId: string }) {
  return {
    url: `/api/program/sessions/${input.sessionId}/exercises/${input.exerciseId}/skip`,
    init: {
      method: 'DELETE' as const,
      cache: 'no-store' as const,
    },
  };
}

export function buildNoteRequest(input: { sessionId: string; payload: NoteRequestPayload }) {
  return createJsonRequest(`/api/program/sessions/${input.sessionId}/note`, 'PATCH', input.payload);
}

export function buildCompleteSessionRequest(input: {
  sessionId: string;
  payload: ReturnType<typeof buildCompleteSessionPayload>;
}) {
  return createJsonRequest(`/api/program/sessions/${input.sessionId}/complete`, 'POST', input.payload);
}

export function buildDurationCorrectionRequest(input: { sessionId: string; payload: DurationCorrectionRequestPayload }) {
  return createJsonRequest(`/api/program/sessions/${input.sessionId}/duration`, 'PATCH', input.payload);
}

export function getSessionLoggerRequestErrorMessage(kind: SessionLoggerRequestErrorKind): string {
  switch (kind) {
    case 'save_set':
      return 'Impossible de sauvegarder la serie.';
    case 'skip_exercise':
      return 'Impossible de marquer cet exercice comme saute.';
    case 'revert_skip':
      return 'Impossible d annuler le skip.';
    case 'save_note':
      return 'Impossible de sauvegarder la note.';
    case 'complete_session':
      return 'Impossible de terminer la seance.';
    case 'correct_duration':
      return 'Impossible de corriger la duree.';
    default:
      return 'Une erreur est survenue.';
  }
}
