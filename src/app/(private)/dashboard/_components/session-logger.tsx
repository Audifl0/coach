'use client';

import { useEffect, useMemo, useState } from 'react';

import type { LoggedSetEntry, LoggerState } from './session-logger-state';
import {
  MAX_NOTE_LENGTH,
  buildCompleteSessionPayload,
  buildSessionLoggerHydration,
  buildSkipPayload,
  clampSessionNote,
  formatElapsedSeconds,
  reduceLoggerStateAfterCompletion,
  reduceLoggerStateAfterSetSaved,
  type HydratableSession,
  upsertLoggedSet,
} from './session-logger-state';
import {
  buildCompleteSessionRequest,
  buildDurationCorrectionRequest,
  buildNoteRequest,
  buildRevertSkipRequest,
  buildSaveSetRequest,
  buildSkipRequest,
  getSessionLoggerRequestErrorMessage,
} from './session-logger-client';

export {
  buildCompleteSessionPayload,
  buildSessionLoggerHydration,
  buildSkipPayload,
  createInitialLoggerState,
  formatElapsedSeconds,
  reduceLoggerStateAfterCompletion,
  reduceLoggerStateAfterSetSaved,
  upsertLoggedSet,
} from './session-logger-state';
export {
  buildCompleteSessionRequest,
  buildDurationCorrectionRequest,
  buildNoteRequest,
  buildRevertSkipRequest,
  buildSaveSetRequest,
  buildSkipRequest,
  getSessionLoggerRequestErrorMessage,
} from './session-logger-client';

const SKIP_REASON_OPTIONS = [
  { value: 'pain', label: 'Douleur' },
  { value: 'fatigue', label: 'Fatigue excessive' },
  { value: 'equipment_unavailable', label: 'Materiel indisponible' },
  { value: 'time', label: 'Manque de temps' },
] as const;

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
      const request = buildSaveSetRequest({
        sessionId: session.id,
        exerciseId,
        payload,
      });
      const response = await fetch(request.url, request.init);

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
      setErrorMessage(getSessionLoggerRequestErrorMessage('save_set'));
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
      const request = buildSkipRequest({
        sessionId: session.id,
        exerciseId,
        payload,
      });
      const response = await fetch(request.url, request.init);

      if (!response.ok) {
        throw new Error('Unable to skip');
      }

      setSkipState((previous) => ({
        ...previous,
        [exerciseId]: { skipped: true, ...payload },
      }));
    } catch {
      setErrorMessage(getSessionLoggerRequestErrorMessage('skip_exercise'));
    }
  }

  async function revertSkip(exerciseId: string) {
    setErrorMessage(null);

    try {
      const request = buildRevertSkipRequest({
        sessionId: session.id,
        exerciseId,
      });
      const response = await fetch(request.url, request.init);

      if (!response.ok) {
        throw new Error('Unable to revert skip');
      }

      setSkipState((previous) => ({
        ...previous,
        [exerciseId]: { skipped: false, reasonCode: '' },
      }));
    } catch {
      setErrorMessage(getSessionLoggerRequestErrorMessage('revert_skip'));
    }
  }

  async function saveNote() {
    setErrorMessage(null);
    setSavingNote(true);

    try {
      const request = buildNoteRequest({
        sessionId: session.id,
        payload: { note: clampSessionNote(note) ?? null },
      });
      const response = await fetch(request.url, request.init);

      if (!response.ok) {
        throw new Error('Unable to save note');
      }
    } catch {
      setErrorMessage(getSessionLoggerRequestErrorMessage('save_note'));
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
      const request = buildCompleteSessionRequest({
        sessionId: session.id,
        payload,
      });
      const response = await fetch(request.url, request.init);

      if (!response.ok) {
        throw new Error('Unable to complete');
      }

      setLoggerState((previous) => reduceLoggerStateAfterCompletion(previous, { nowMs: Date.now() }));
      setIsCompleted(true);
    } catch {
      setErrorMessage(getSessionLoggerRequestErrorMessage('complete_session'));
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
      const request = buildDurationCorrectionRequest({
        sessionId: session.id,
        payload: { effectiveDurationSec: Math.round(value * 60) },
      });
      const response = await fetch(request.url, request.init);

      if (!response.ok) {
        throw new Error('Unable to correct duration');
      }
    } catch {
      setErrorMessage(getSessionLoggerRequestErrorMessage('correct_duration'));
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
