'use client';

import { useEffect, useMemo, useState } from 'react';

import type { ProgramSessionDetailResponse, ProgramSessionSummary } from '@/lib/program/contracts';

type LoggedSetEntry = {
  setIndex: number;
  weight: number;
  reps: number;
  rpe: number | null;
};

type LoggerState = {
  timerStartedAtMs: number | null;
  timerCompletedAtMs: number | null;
};

type HydratedSkipState = {
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

type HydratableSession = ProgramSessionSummary | ProgramSessionDetailResponse['session'];

type CompleteSessionInput = {
  fatigue: number | null;
  readiness: number | null;
  comment?: string;
};

const MAX_NOTE_LENGTH = 280;
const SKIP_REASON_OPTIONS = [
  { value: 'pain', label: 'Douleur' },
  { value: 'fatigue', label: 'Fatigue excessive' },
  { value: 'equipment_unavailable', label: 'Materiel indisponible' },
  { value: 'time', label: 'Manque de temps' },
] as const;

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

type SetDraft = {
  setIndex: string;
  weight: string;
  reps: string;
  rpe: string;
};

function defaultSetDraft(): SetDraft {
  return {
    setIndex: '1',
    weight: '',
    reps: '',
    rpe: '',
  };
}

export function SessionLogger({ session }: { session: HydratableSession }) {
  const [loggerState, setLoggerState] = useState<LoggerState>(() => buildSessionLoggerHydration(session).loggerState);
  const [nowMs, setNowMs] = useState(Date.now());
  const [loggedSets, setLoggedSets] = useState<Record<string, LoggedSetEntry[]>>(() => buildSessionLoggerHydration(session).loggedSets);
  const [setDrafts, setSetDrafts] = useState<Record<string, SetDraft>>({});
  const [skipReasonCode, setSkipReasonCode] = useState<Record<string, string>>({});
  const [skipReasonText, setSkipReasonText] = useState<Record<string, string>>({});
  const [skipState, setSkipState] = useState<Record<string, { skipped: boolean; reasonCode: string; reasonText?: string }>>(() =>
    buildSessionLoggerHydration(session).skipState,
  );
  const [savingSetForExerciseId, setSavingSetForExerciseId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [note, setNote] = useState(() => buildSessionLoggerHydration(session).note);
  const [savingNote, setSavingNote] = useState(false);
  const [fatigue, setFatigue] = useState<number | null>(() => buildSessionLoggerHydration(session).fatigue);
  const [readiness, setReadiness] = useState<number | null>(() => buildSessionLoggerHydration(session).readiness);
  const [comment, setComment] = useState(() => buildSessionLoggerHydration(session).comment);
  const [isCompleted, setIsCompleted] = useState(() => buildSessionLoggerHydration(session).isCompleted);
  const [savingCompletion, setSavingCompletion] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState('');
  const [savingDuration, setSavingDuration] = useState(false);

  useEffect(() => {
    const hydration = buildSessionLoggerHydration(session);
    setLoggerState(hydration.loggerState);
    setLoggedSets(hydration.loggedSets);
    setSkipState(hydration.skipState);
    setNote(hydration.note);
    setFatigue(hydration.fatigue);
    setReadiness(hydration.readiness);
    setComment(hydration.comment);
    setIsCompleted(hydration.isCompleted);
  }, [session]);

  useEffect(() => {
    const shouldTick = loggerState.timerStartedAtMs !== null && loggerState.timerCompletedAtMs === null;
    if (!shouldTick) {
      return;
    }

    const handle = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(handle);
  }, [loggerState.timerCompletedAtMs, loggerState.timerStartedAtMs]);

  const elapsed = useMemo(() => formatElapsedSeconds(loggerState, nowMs), [loggerState, nowMs]);

  async function saveSet(exerciseId: string) {
    const draft = setDrafts[exerciseId] ?? defaultSetDraft();
    const setIndex = Number(draft.setIndex);
    const weight = Number(draft.weight);
    const reps = Number(draft.reps);
    const rpeValue = draft.rpe.trim() ? Number(draft.rpe) : undefined;

    if (!Number.isInteger(setIndex) || setIndex < 1 || !(weight > 0) || !Number.isInteger(reps) || reps < 1) {
      setErrorMessage('Veuillez saisir une serie valide (set, charge, repetitions).');
      return;
    }
    if (typeof rpeValue !== 'undefined' && (!(rpeValue >= 1) || !(rpeValue <= 10))) {
      setErrorMessage('Le RPE doit etre compris entre 1 et 10.');
      return;
    }

    setSavingSetForExerciseId(exerciseId);
    setErrorMessage(null);

    const payload = {
      setIndex,
      weight,
      reps,
      ...(typeof rpeValue === 'undefined' ? {} : { rpe: rpeValue }),
    };

    try {
      const response = await fetch(`/api/program/sessions/${session.id}/exercises/${exerciseId}/sets`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Unable to save set');
      }

      setLoggedSets((previous) => ({
        ...previous,
        [exerciseId]: upsertLoggedSet(previous[exerciseId] ?? [], {
          setIndex,
          weight,
          reps,
          rpe: typeof rpeValue === 'undefined' ? null : rpeValue,
        }),
      }));
      setLoggerState((previous) => reduceLoggerStateAfterSetSaved(previous, { nowMs: Date.now() }));
    } catch {
      setErrorMessage('Impossible de sauvegarder la serie.');
    } finally {
      setSavingSetForExerciseId(null);
    }
  }

  async function submitSkip(exerciseId: string) {
    setErrorMessage(null);

    let payload: { reasonCode: string; reasonText?: string };
    try {
      payload = buildSkipPayload(skipReasonCode[exerciseId] ?? '', skipReasonText[exerciseId] ?? '');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'La raison de skip est requise.');
      return;
    }

    try {
      const response = await fetch(`/api/program/sessions/${session.id}/exercises/${exerciseId}/skip`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Unable to skip');
      }

      setSkipState((previous) => ({
        ...previous,
        [exerciseId]: { skipped: true, ...payload },
      }));
    } catch {
      setErrorMessage('Impossible de marquer cet exercice comme saute.');
    }
  }

  async function revertSkip(exerciseId: string) {
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/program/sessions/${session.id}/exercises/${exerciseId}/skip`, {
        method: 'DELETE',
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Unable to revert skip');
      }

      setSkipState((previous) => ({
        ...previous,
        [exerciseId]: { skipped: false, reasonCode: '' },
      }));
    } catch {
      setErrorMessage('Impossible d annuler le skip.');
    }
  }

  async function saveNote() {
    setErrorMessage(null);
    setSavingNote(true);

    try {
      const response = await fetch(`/api/program/sessions/${session.id}/note`, {
        method: 'PATCH',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: clampComment(note) ?? null }),
      });

      if (!response.ok) {
        throw new Error('Unable to save note');
      }
    } catch {
      setErrorMessage('Impossible de sauvegarder la note.');
    } finally {
      setSavingNote(false);
    }
  }

  async function completeSession() {
    setErrorMessage(null);

    let payload: { fatigue: number; readiness: number; comment?: string };
    try {
      payload = buildCompleteSessionPayload({ fatigue, readiness, comment });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Feedback incomplet.');
      return;
    }

    setSavingCompletion(true);
    try {
      const response = await fetch(`/api/program/sessions/${session.id}/complete`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Unable to complete');
      }

      setLoggerState((previous) => reduceLoggerStateAfterCompletion(previous, { nowMs: Date.now() }));
      setIsCompleted(true);
    } catch {
      setErrorMessage('Impossible de terminer la seance.');
    } finally {
      setSavingCompletion(false);
    }
  }

  async function correctDuration() {
    setErrorMessage(null);
    const value = Number(durationMinutes);
    if (!(value > 0)) {
      setErrorMessage('La duree corrigee doit etre superieure a zero.');
      return;
    }

    setSavingDuration(true);
    try {
      const response = await fetch(`/api/program/sessions/${session.id}/duration`, {
        method: 'PATCH',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ effectiveDurationSec: Math.round(value * 60) }),
      });

      if (!response.ok) {
        throw new Error('Unable to correct duration');
      }
    } catch {
      setErrorMessage('Impossible de corriger la duree.');
    } finally {
      setSavingDuration(false);
    }
  }

  return (
    <section aria-label="session-logger">
      <h3>Journal de seance</h3>
      <p>Session: {session.focusLabel}</p>
      <p>Timer: {loggerState.timerStartedAtMs === null ? '00:00' : elapsed}</p>

      {session.exercises.map((exercise) => {
        const draft = setDrafts[exercise.id] ?? defaultSetDraft();
        const exerciseSets = loggedSets[exercise.id] ?? [];
        const skip = skipState[exercise.id]?.skipped ?? false;

        return (
          <article key={exercise.id}>
            <h4>{exercise.displayName}</h4>
            {exerciseSets.length > 0 ? (
              <ul>
                {exerciseSets.map((savedSet) => (
                  <li key={`${exercise.id}-${savedSet.setIndex}`}>
                    Set {savedSet.setIndex}: {savedSet.weight}kg x {savedSet.reps}
                    {savedSet.rpe === null ? '' : ` (RPE ${savedSet.rpe})`}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Aucune serie enregistree.</p>
            )}

            <div>
              <label>
                Set
                <input
                  value={draft.setIndex}
                  onChange={(event) =>
                    setSetDrafts((previous) => ({
                      ...previous,
                      [exercise.id]: { ...draft, setIndex: event.target.value },
                    }))
                  }
                />
              </label>
              <label>
                Charge
                <input
                  value={draft.weight}
                  onChange={(event) =>
                    setSetDrafts((previous) => ({
                      ...previous,
                      [exercise.id]: { ...draft, weight: event.target.value },
                    }))
                  }
                />
              </label>
              <label>
                Repetitions
                <input
                  value={draft.reps}
                  onChange={(event) =>
                    setSetDrafts((previous) => ({
                      ...previous,
                      [exercise.id]: { ...draft, reps: event.target.value },
                    }))
                  }
                />
              </label>
              <label>
                RPE (optionnel)
                <input
                  value={draft.rpe}
                  onChange={(event) =>
                    setSetDrafts((previous) => ({
                      ...previous,
                      [exercise.id]: { ...draft, rpe: event.target.value },
                    }))
                  }
                />
              </label>
              <button type="button" onClick={() => saveSet(exercise.id)} disabled={savingSetForExerciseId === exercise.id}>
                {savingSetForExerciseId === exercise.id ? 'Sauvegarde...' : 'Sauvegarder set'}
              </button>
            </div>

            <div>
              <label>
                Raison du skip
                <select
                  value={skipReasonCode[exercise.id] ?? ''}
                  onChange={(event) =>
                    setSkipReasonCode((previous) => ({
                      ...previous,
                      [exercise.id]: event.target.value,
                    }))
                  }
                >
                  <option value="">Selectionner</option>
                  {SKIP_REASON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Detail (optionnel)
                <input
                  value={skipReasonText[exercise.id] ?? ''}
                  onChange={(event) =>
                    setSkipReasonText((previous) => ({
                      ...previous,
                      [exercise.id]: event.target.value.slice(0, MAX_NOTE_LENGTH),
                    }))
                  }
                />
              </label>
              {skip ? (
                <button type="button" onClick={() => revertSkip(exercise.id)}>
                  Annuler le skip
                </button>
              ) : (
                <button type="button" onClick={() => submitSkip(exercise.id)}>
                  Skipper exercice
                </button>
              )}
            </div>
          </article>
        );
      })}

      <div>
        <label>
          Note de seance (optionnel, 280 max)
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, MAX_NOTE_LENGTH))}
          />
        </label>
        <button type="button" onClick={saveNote} disabled={savingNote}>
          {savingNote ? 'Sauvegarde note...' : 'Sauvegarder note'}
        </button>
      </div>

      <div>
        <h4>Terminer la seance</h4>
        <label>
          Fatigue (1-5)
          <input
            value={fatigue ?? ''}
            onChange={(event) => setFatigue(event.target.value ? Number(event.target.value) : null)}
          />
        </label>
        <label>
          Readiness (1-5)
          <input
            value={readiness ?? ''}
            onChange={(event) => setReadiness(event.target.value ? Number(event.target.value) : null)}
          />
        </label>
        <label>
          Commentaire (optionnel)
          <textarea value={comment} onChange={(event) => setComment(event.target.value.slice(0, MAX_NOTE_LENGTH))} />
        </label>
        <button type="button" onClick={completeSession} disabled={savingCompletion || isCompleted}>
          {savingCompletion ? 'Finalisation...' : (isCompleted ? 'Seance terminee' : 'Terminer seance')}
        </button>
      </div>

      {isCompleted ? (
        <div>
          <h4>Corriger la duree (dans les 24h)</h4>
          <label>
            Duree (minutes)
            <input value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} />
          </label>
          <button type="button" onClick={correctDuration} disabled={savingDuration}>
            {savingDuration ? 'Correction...' : 'Corriger duree'}
          </button>
        </div>
      ) : null}

      {errorMessage ? <p>{errorMessage}</p> : null}
    </section>
  );
}
