'use client';

import { useState } from 'react';

import {
  parseProgramSessionDetailResponse,
  type ProgramSessionSummary,
  type ProgramTodayResponse,
} from '@/lib/program/contracts';
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
  const [detailSession, setDetailSession] = useState<ProgramSessionSummary | null>(null);

  const { session, mode } = resolveDisplayedSession(data);
  const actionLabel = getPrimaryActionLabel(data.primaryAction);

  if (!session) {
    return (
      <section aria-label="today-workout-card">
        <h2>Seance du jour</h2>
        <p>Aucune seance planifiee pour le moment.</p>
      </section>
    );
  }

  const activeSession: ProgramSessionSummary = session;
  const detail = detailSession && detailSession.id === activeSession.id ? detailSession : null;

  async function handleToggleDetails() {
    if (detailOpen) {
      setDetailOpen(false);
      return;
    }

    setDetailOpen(true);
    if (detail) {
      return;
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
        return;
      }

      const parsed = parseProgramSessionDetailResponse(await response.json());
      setDetailSession(parsed.session);
    } catch {
      setErrorMessage('Impossible de charger les details de la seance.');
    } finally {
      setLoading(false);
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
        <button type="button" onClick={() => setLoggerOpen((current) => !current)}>
          {loggerOpen ? 'Masquer suivi seance' : (activeSession.state === 'started' ? 'Reprendre seance' : actionLabel)}
        </button>
        <button type="button" onClick={handleToggleDetails}>
          {detailOpen ? 'Masquer les exercices' : 'Voir les exercices'}
        </button>
      </div>

      {loggerOpen ? <SessionLogger session={activeSession} /> : null}

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
