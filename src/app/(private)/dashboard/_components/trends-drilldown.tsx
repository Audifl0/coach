'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';

import {
  parseProgramTrendsExerciseResponse,
  type ProgramTrendQueryInput,
  type ProgramTrendsExerciseResponse,
} from '@/lib/program/contracts';

type TrendPeriod = ProgramTrendQueryInput['period'];

type TrendsDrilldownProps = {
  period: TrendPeriod;
  exerciseKey: string;
  data?: ProgramTrendsExerciseResponse;
};

type TrendsDrilldownState = {
  data: ProgramTrendsExerciseResponse | null;
  isLoading: boolean;
  errorMessage: string | null;
};

export function buildExerciseTrendRequestPath(input: { period: TrendPeriod; exerciseKey: string }): string {
  return `/api/program/trends/${input.exerciseKey}?period=${input.period}`;
}

export function mapExerciseSeries(data: ProgramTrendsExerciseResponse): {
  repsPoints: Array<{ date: string; value: number }>;
  loadPoints: Array<{ date: string; value: number }>;
} {
  return {
    repsPoints: data.points.map((point) => ({ date: point.date, value: point.reps })),
    loadPoints: data.points.map((point) => ({ date: point.date, value: point.load })),
  };
}

export function TrendsDrilldown({ period, exerciseKey, data }: TrendsDrilldownProps) {
  const [state, setState] = useState<TrendsDrilldownState>(() => ({
    data: data ?? null,
    isLoading: false,
    errorMessage: null,
  }));

  useEffect(() => {
    let cancelled = false;

    async function loadSeries() {
      if (data && data.period === period && data.exercise.key === exerciseKey) {
        setState({ data, isLoading: false, errorMessage: null });
        return;
      }

      setState((current) => ({ ...current, isLoading: true, errorMessage: null }));
      try {
        const response = await fetch(buildExerciseTrendRequestPath({ period, exerciseKey }), {
          method: 'GET',
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error('Unable to load exercise trends');
        }

        const parsed = parseProgramTrendsExerciseResponse(await response.json());
        if (cancelled) {
          return;
        }

        setState({
          data: parsed,
          isLoading: false,
          errorMessage: null,
        });
      } catch {
        if (cancelled) {
          return;
        }

        setState({
          data: null,
          isLoading: false,
          errorMessage: 'Unable to load exercise trends',
        });
      }
    }

    void loadSeries();
    return () => {
      cancelled = true;
    };
  }, [data, exerciseKey, period]);

  const mapped = useMemo(() => (state.data ? mapExerciseSeries(state.data) : null), [state.data]);
  const exerciseLabel = state.data?.exercise.displayName ?? exerciseKey;

  return (
    <section aria-label="trends-drilldown">
      <h3>{exerciseLabel}</h3>
      {state.isLoading ? <p>Loading exercise trends...</p> : null}
      {state.errorMessage ? <p>{state.errorMessage}</p> : null}
      {mapped ? (
        <div>
          <article>
            <h4>Reps evolution</h4>
            <LineChart width={320} height={120} data={mapped.repsPoints}>
              <XAxis dataKey="date" hide />
              <YAxis hide />
              <Tooltip />
              <Line dataKey="value" stroke="#1f2937" dot={false} strokeWidth={2} />
            </LineChart>
          </article>
          <article>
            <h4>Load evolution</h4>
            <LineChart width={320} height={120} data={mapped.loadPoints}>
              <XAxis dataKey="date" hide />
              <YAxis hide />
              <Tooltip />
              <Line dataKey="value" stroke="#334155" dot={false} strokeWidth={2} />
            </LineChart>
          </article>
        </div>
      ) : null}
    </section>
  );
}
