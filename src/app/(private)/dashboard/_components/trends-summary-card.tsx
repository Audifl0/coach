'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';

import {
  parseProgramTrendsSummaryResponse,
  type ProgramTrendQueryInput,
  type ProgramTrendsSummaryResponse,
} from '@/lib/program/contracts';
import { TrendsDrilldown } from './trends-drilldown';

type TrendPeriod = ProgramTrendQueryInput['period'];

type TrendsSummaryCardProps =
  | {
      loadState?: 'ready';
      initialData: ProgramTrendsSummaryResponse;
      drilldownExerciseKey?: string | null;
    }
  | {
      loadState: 'error';
      initialData?: never;
      drilldownExerciseKey?: string | null;
    };

type TrendsSummaryState = {
  period: TrendPeriod;
  data: ProgramTrendsSummaryResponse;
  isLoading: boolean;
  errorMessage: string | null;
};

type MetricCardView = {
  key: 'volume' | 'intensity' | 'adherence';
  label: 'Volume' | 'Intensity' | 'Adherence';
  kpiLabel: string;
  points: Array<{ date: string; value: number }>;
};

type SummarySelectionParams = {
  currentState: TrendsSummaryState;
  nextPeriod: TrendPeriod;
  initialData: ProgramTrendsSummaryResponse;
};

type SummaryResponseMatchParams = {
  selectedPeriod: TrendPeriod;
  responseData: ProgramTrendsSummaryResponse;
};

function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value);
}

function formatKpi(metric: ProgramTrendsSummaryResponse['metrics']['volume' | 'intensity' | 'adherence']): string {
  if (metric.unit === 'ratio') {
    return `${Math.round(metric.kpi * 100)}%`;
  }

  return `${formatNumber(metric.kpi)} ${metric.unit}`;
}

function mapMetricCards(data: ProgramTrendsSummaryResponse): MetricCardView[] {
  return [
    {
      key: 'volume',
      label: 'Volume',
      kpiLabel: formatKpi(data.metrics.volume),
      points: data.metrics.volume.points,
    },
    {
      key: 'intensity',
      label: 'Intensity',
      kpiLabel: formatKpi(data.metrics.intensity),
      points: data.metrics.intensity.points,
    },
    {
      key: 'adherence',
      label: 'Adherence',
      kpiLabel: formatKpi(data.metrics.adherence),
      points: data.metrics.adherence.points,
    },
  ];
}

export function createSummaryToggleOptions(): Array<{ period: TrendPeriod; label: string }> {
  return [
    { period: '7d', label: '7d' },
    { period: '30d', label: '30d' },
    { period: '90d', label: '90d' },
  ];
}

export function createDefaultTrendsSummaryState(initialData: ProgramTrendsSummaryResponse): TrendsSummaryState {
  return {
    period: initialData.period ?? '30d',
    data: initialData,
    isLoading: false,
    errorMessage: null,
  };
}

export function deriveSummaryStateForPeriodSelection({
  currentState,
  nextPeriod,
  initialData,
}: SummarySelectionParams): TrendsSummaryState {
  if (nextPeriod === initialData.period) {
    return {
      ...currentState,
      period: nextPeriod,
      data: initialData,
      isLoading: false,
      errorMessage: null,
    };
  }

  return {
    ...currentState,
    period: nextPeriod,
    errorMessage: null,
  };
}

export function shouldApplyFetchedSummaryResponse({
  selectedPeriod,
  responseData,
}: SummaryResponseMatchParams): boolean {
  return responseData.period === selectedPeriod;
}

export function TrendsSummaryCard(props: TrendsSummaryCardProps) {
  if (props.loadState === 'error') {
    return (
      <section aria-label="trends-summary-card">
        <h2>Trends</h2>
        <p>Unable to load trends</p>
      </section>
    );
  }

  const { initialData, drilldownExerciseKey = null } = props;
  const [state, setState] = useState<TrendsSummaryState>(() => createDefaultTrendsSummaryState(initialData));
  const [isDrilldownOpen, setIsDrilldownOpen] = useState(false);
  const metricCards = useMemo(() => mapMetricCards(state.data), [state.data]);
  const toggleOptions = useMemo(() => createSummaryToggleOptions(), []);

  useEffect(() => {
    let cancelled = false;

    async function loadPeriodData() {
      if (state.period === initialData.period) {
        if (state.data.period !== state.period) {
          setState((current) => ({
            ...current,
            data: initialData,
            isLoading: false,
            errorMessage: null,
          }));
        }

        return;
      }

      setState((current) => ({
        ...current,
        isLoading: true,
        errorMessage: null,
      }));

      try {
        const response = await fetch(`/api/program/trends?period=${state.period}`, {
          method: 'GET',
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Unable to load trends');
        }

        const parsed = parseProgramTrendsSummaryResponse(await response.json());
        if (cancelled) {
          return;
        }

        if (!shouldApplyFetchedSummaryResponse({ selectedPeriod: state.period, responseData: parsed })) {
          return;
        }

        setState((current) => ({
          ...current,
          data: current.period === state.period ? parsed : current.data,
          isLoading: current.period === state.period ? false : current.isLoading,
          errorMessage: current.period === state.period ? null : current.errorMessage,
        }));
      } catch {
        if (cancelled) {
          return;
        }

        setState((current) => ({
          ...current,
          isLoading: current.period === state.period ? false : current.isLoading,
          errorMessage: current.period === state.period ? 'Unable to load trends' : current.errorMessage,
        }));
      }
    }

    void loadPeriodData();
    return () => {
      cancelled = true;
    };
  }, [initialData.period, state.period]);

  return (
    <section aria-label="trends-summary-card">
      <h2>Trends</h2>
      <div>
        {toggleOptions.map((toggle) => (
          <button
            key={toggle.period}
            type="button"
            onClick={() =>
              setState((current) =>
                deriveSummaryStateForPeriodSelection({
                  currentState: current,
                  nextPeriod: toggle.period,
                  initialData,
                }),
              )
            }
            aria-pressed={state.period === toggle.period}
          >
            {toggle.label}
          </button>
        ))}
      </div>
      {state.isLoading ? <p>Loading trends...</p> : null}
      {state.errorMessage ? <p>{state.errorMessage}</p> : null}
      <div>
        {metricCards.map((metric) => (
          <article key={metric.key} data-testid="trend-metric-card">
            <h3>{metric.label}</h3>
            <p>{metric.kpiLabel}</p>
            <LineChart width={220} height={72} data={metric.points}>
              <XAxis dataKey="date" hide />
              <YAxis hide />
              <Tooltip />
              <Line dataKey="value" stroke="#1f2937" dot={false} strokeWidth={2} />
            </LineChart>
          </article>
        ))}
      </div>
      {drilldownExerciseKey ? (
        <div>
          <button type="button" onClick={() => setIsDrilldownOpen((value) => !value)}>
            {isDrilldownOpen ? 'Hide drilldown' : 'Open drilldown'}
          </button>
        </div>
      ) : null}
      {isDrilldownOpen && drilldownExerciseKey ? (
        <TrendsDrilldown period={state.period} exerciseKey={drilldownExerciseKey} />
      ) : null}
    </section>
  );
}
