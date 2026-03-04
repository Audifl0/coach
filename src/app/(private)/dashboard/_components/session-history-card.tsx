'use client';

import { useEffect, useMemo, useState } from 'react';

import { parseProgramHistoryListResponse, type HistoryQueryInput } from '@/lib/program/contracts';

type HistoryPeriod = HistoryQueryInput['period'];

type HistoryRow = {
  id: string;
  date: string;
  duration: number;
  exerciseCount: number;
  totalLoad: number;
};

type HistoryViewRow = {
  id: string;
  dateLabel: string;
  durationLabel: string;
  exerciseCountLabel: string;
  totalLoadLabel: string;
};

type HistoryViewState = {
  state: 'ready' | 'empty' | 'error';
  rows: HistoryViewRow[];
  errorMessage: string | null;
};

type HistoryDetailSet = {
  setIndex: number;
  weight: number;
  reps: number;
  rpe: number | null;
};

type HistoryDetailExercise = {
  id: string;
  displayName: string;
  loggedSets: HistoryDetailSet[];
};

type HistoryDetailSession = {
  session: {
    id: string;
    exercises: HistoryDetailExercise[];
  };
};

export function buildHistoryQueryString(input: { period: HistoryPeriod; from?: string; to?: string }): string {
  if (input.period !== 'custom') {
    return `period=${input.period}`;
  }

  if (!input.from || !input.to) {
    return 'period=custom';
  }

  return `period=custom&from=${input.from}&to=${input.to}`;
}

export function buildHistoryViewState(input: {
  sessions: HistoryRow[] | null;
  errorMessage?: string;
}): HistoryViewState {
  if (input.errorMessage) {
    return {
      state: 'error',
      rows: [],
      errorMessage: input.errorMessage,
    };
  }

  const sessions = input.sessions ?? [];
  if (sessions.length === 0) {
    return {
      state: 'empty',
      rows: [],
      errorMessage: null,
    };
  }

  return {
    state: 'ready',
    errorMessage: null,
    rows: sessions.map((session) => ({
      id: session.id,
      dateLabel: session.date,
      durationLabel: `${Math.floor(session.duration / 60)} min`,
      exerciseCountLabel: `${session.exerciseCount} exercices`,
      totalLoadLabel: `${Math.round(session.totalLoad)} kg`,
    })),
  };
}

export function mapSessionDetailToGroupedSets(detail: HistoryDetailSession): Array<{
  id: string;
  displayName: string;
  sets: HistoryDetailSet[];
}> {
  return detail.session.exercises.map((exercise) => ({
    id: exercise.id,
    displayName: exercise.displayName,
    sets: [...exercise.loggedSets].sort((a, b) => a.setIndex - b.setIndex),
  }));
}

function asHistoryDetail(value: unknown): HistoryDetailSession {
  const raw = value as {
    session?: {
      id?: unknown;
      exercises?: Array<{
        id?: unknown;
        displayName?: unknown;
        loggedSets?: Array<{
          setIndex?: unknown;
          weight?: unknown;
          reps?: unknown;
          rpe?: unknown;
        }>;
      }>;
    };
  };

  return {
    session: {
      id: String(raw.session?.id ?? ''),
      exercises: (raw.session?.exercises ?? []).map((exercise) => ({
        id: String(exercise.id ?? ''),
        displayName: String(exercise.displayName ?? ''),
        loggedSets: (exercise.loggedSets ?? []).map((setItem) => ({
          setIndex: Number(setItem.setIndex ?? 0),
          weight: Number(setItem.weight ?? 0),
          reps: Number(setItem.reps ?? 0),
          rpe: setItem.rpe === null || typeof setItem.rpe === 'undefined' ? null : Number(setItem.rpe),
        })),
      })),
    },
  };
}

export function SessionHistoryCard() {
  const [period, setPeriod] = useState<HistoryPeriod>('7d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sessions, setSessions] = useState<HistoryRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionGroupedSets, setSelectedSessionGroupedSets] = useState<
    Array<{ id: string; displayName: string; sets: HistoryDetailSet[] }>
  >([]);

  const query = useMemo(() => buildHistoryQueryString({ period, from, to }), [period, from, to]);
  const view = useMemo(() => buildHistoryViewState({ sessions, errorMessage: errorMessage ?? undefined }), [sessions, errorMessage]);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch(`/api/program/history?${query}`, {
          method: 'GET',
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error('Unable to load program history');
        }

        const parsed = parseProgramHistoryListResponse(await response.json());
        if (cancelled) {
          return;
        }

        setSessions(parsed.sessions);
      } catch {
        if (!cancelled) {
          setSessions([]);
          setErrorMessage('Impossible de charger l historique.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [query]);

  async function loadSessionDetail(sessionId: string) {
    setSelectedSessionId(sessionId);
    setDetailLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/program/sessions/${sessionId}`, {
        method: 'GET',
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Unable to load session detail');
      }

      const detail = asHistoryDetail(await response.json());
      setSelectedSessionGroupedSets(mapSessionDetailToGroupedSets(detail));
    } catch {
      setSelectedSessionGroupedSets([]);
      setErrorMessage('Impossible de charger le detail de la seance.');
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <section aria-label="session-history-card">
      <h2>Historique recent</h2>

      <div>
        <button type="button" onClick={() => setPeriod('7d')}>7j</button>
        <button type="button" onClick={() => setPeriod('30d')}>30j</button>
        <button type="button" onClick={() => setPeriod('90d')}>90j</button>
        <button type="button" onClick={() => setPeriod('custom')}>Custom</button>
      </div>

      {period === 'custom' ? (
        <div>
          <label>
            Du
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            Au
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
        </div>
      ) : null}

      {isLoading ? <p>Chargement historique...</p> : null}
      {view.state === 'error' ? <p>{view.errorMessage}</p> : null}
      {view.state === 'empty' ? <p>Aucune seance sur cette periode.</p> : null}

      {view.state === 'ready' ? (
        <ul>
          {view.rows.map((row) => (
            <li key={row.id}>
              <button type="button" onClick={() => loadSessionDetail(row.id)}>
                {row.dateLabel} - {row.durationLabel} - {row.exerciseCountLabel} - {row.totalLoadLabel}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {detailLoading ? <p>Chargement detail...</p> : null}
      {selectedSessionId && selectedSessionGroupedSets.length > 0 ? (
        <div>
          <h3>Detail seance</h3>
          <ul>
            {selectedSessionGroupedSets.map((exercise) => (
              <li key={exercise.id}>
                <strong>{exercise.displayName}</strong>
                <ul>
                  {exercise.sets.map((setItem) => (
                    <li key={`${exercise.id}-${setItem.setIndex}`}>
                      Set {setItem.setIndex}: {setItem.weight}kg x {setItem.reps}
                      {setItem.rpe === null ? '' : ` (RPE ${setItem.rpe})`}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
