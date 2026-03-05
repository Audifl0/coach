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

type TrendsSummaryCardProps = {
  initialData: ProgramTrendsSummaryResponse;
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

export function TrendsSummaryCard({ initialData, drilldownExerciseKey = null }: TrendsSummaryCardProps) {
  const [state, setState] = useState<TrendsSummaryState>(() => createDefaultTrendsSummaryState(initialData));
  const [isDrilldownOpen, setIsDrilldownOpen] = useState(false);
  const metricCards = useMemo(() => mapMetricCards(state.data), [state.data]);
  const toggleOptions = useMemo(() => createSummaryToggleOptions(), []);

  useEffect(() => {
    let cancelled = false;

    async function loadPeriodData() {
      if (state.period === initialData.period) {
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

        setState((current) => ({
          ...current,
          data: parsed,
          isLoading: false,
          errorMessage: null,
        }));
      } catch {
        if (cancelled) {
          return;
        }

        setState((current) => ({
          ...current,
          isLoading: false,
          errorMessage: 'Unable to load trends',
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
            onClick={() => setState((current) => ({ ...current, period: toggle.period }))}
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
