'use client';

import { useState } from 'react';

import {
  type ProgramSessionDetailResponse,
  parseProgramSessionDetailResponse,
  type ProgramSessionSummary,
  type ProgramTodayResponse,
} from '@/lib/program/contracts';
import { requestProgramGeneration } from '@/lib/program/generation-client';
import { SessionLogger } from './session-logger';

type TodayWorkoutCardProps =
  | {
      loadState?: 'ready' | 'empty';
      data: ProgramTodayResponse;
    }
  | {
      loadState: 'error';
      data?: never;
    };

export function getPrimaryActionLabel(primaryAction: ProgramTodayResponse['primaryAction']): string {
  if (primaryAction === 'start_workout') {
    return 'Commencer seance';
  }

  return 'Commencer';
}

export function resolveDisplayedSession(input: Pick<ProgramTodayResponse, 'todaySession' | 'nextSession'>): {
  session: ProgramSessionSummary | null;
  mode: 'today' | 'next' | 'none';
} {
  if (input.todaySession) {
    return { session: input.todaySession, mode: 'today' };
  }

  if (input.nextSession) {
    return { session: input.nextSession, mode: 'next' };
  }

  return { session: null, mode: 'none' };
}

function formatRestRange(restMinSec: number, restMaxSec: number): string {
  if (restMinSec === restMaxSec) {
    return `${restMinSec}s`;
  }

  return `${restMinSec}-${restMaxSec}s`;
}

export function TodayWorkoutCard(props: TodayWorkoutCardProps) {
  if (props.loadState === 'error') {
    return (
      <section aria-label="today-workout-card">
        <h2>Seance du jour</h2>
        <p>Impossible de charger la seance du jour.</p>
      </section>
    );
  }

  const data = props.data;
  const [detailOpen, setDetailOpen] = useState(false);
  const [loggerOpen, setLoggerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [detailSession, setDetailSession] = useState<ProgramSessionDetailResponse['session'] | null>(null);
  const [generationPending, setGenerationPending] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const { session, mode } = resolveDisplayedSession(data);
  const actionLabel = getPrimaryActionLabel(data.primaryAction);

  if (!session) {
    async function handleGenerateProgram() {
      try {
        setGenerationPending(true);
        setGenerationError(null);
        await requestProgramGeneration();
        window.location.reload();
      } catch (error) {
        setGenerationError(error instanceof Error ? error.message : 'Impossible de generer le programme.');
      } finally {
        setGenerationPending(false);
      }
    }

    return (
      <section aria-label="today-workout-card">
        <h2>Seance du jour</h2>
        <p>Aucune seance planifiee pour le moment.</p>
        <button type="button" onClick={handleGenerateProgram} disabled={generationPending}>
          {generationPending ? 'Generation du programme...' : 'Generer mon programme'}
        </button>
        {generationError ? <p role="alert">{generationError}</p> : null}
      </section>
    );
  }

  const activeSession: ProgramSessionSummary = session;
  const detail = detailSession && detailSession.id === activeSession.id ? detailSession : null;
  const loggerSession = detail ?? activeSession;
  const showResumeAction = loggerSession.state === 'started' && !('completedAt' in loggerSession && loggerSession.completedAt);

  async function ensureSessionDetail(): Promise<ProgramSessionDetailResponse['session'] | null> {
    if (detail) {
      return detail;
    }

    try {
      setLoading(true);
      setErrorMessage(null);

      const response = await fetch(`/api/program/sessions/${activeSession.id}`, {
        method: 'GET',
        cache: 'no-store',
      });

      if (!response.ok) {
        setErrorMessage('Impossible de charger les details de la seance.');
        return null;
      }

      const parsed = parseProgramSessionDetailResponse(await response.json());
      setDetailSession(parsed.session);
      return parsed.session;
    } catch {
      setErrorMessage('Impossible de charger les details de la seance.');
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleDetails() {
    if (detailOpen) {
      setDetailOpen(false);
      return;
    }

    setDetailOpen(true);
    if (detail) {
      return;
    }

    await ensureSessionDetail();
  }

  async function handleToggleLogger() {
    if (loggerOpen) {
      setLoggerOpen(false);
      return;
    }

    setLoggerOpen(true);
    if (activeSession.state === 'started') {
      await ensureSessionDetail();
    }
  }

  return (
    <section aria-label="today-workout-card">
      <h2>{mode === 'today' ? 'Seance du jour' : 'Prochaine seance planifiee'}</h2>
      <p>
        {activeSession.focusLabel} - {activeSession.exercises.length} exercice(s)
      </p>
      <p>Date: {activeSession.scheduledDate}</p>
      <div>
        <button type="button" onClick={handleToggleLogger}>
          {loggerOpen ? 'Masquer suivi seance' : (showResumeAction ? 'Reprendre seance' : actionLabel)}
        </button>
        <button type="button" onClick={handleToggleDetails}>
          {detailOpen ? 'Masquer les exercices' : 'Voir les exercices'}
        </button>
      </div>

      {loggerOpen ? <SessionLogger session={loggerSession} /> : null}

      {loading ? <p>Chargement des details...</p> : null}
      {errorMessage ? <p>{errorMessage}</p> : null}

      {detailOpen && detail ? (
        <ul>
          {detail.exercises.map((exercise) => (
            <li key={exercise.id}>
              <strong>{exercise.displayName}</strong>
              <div>Series: {exercise.sets}</div>
              <div>Repetitions: {exercise.targetReps}</div>
              <div>Charge cible: {exercise.targetLoad}</div>
              <div>Repos: {formatRestRange(exercise.restMinSec, exercise.restMaxSec)}</div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
