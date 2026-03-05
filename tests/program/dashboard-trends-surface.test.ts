import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ProgramTrendsSummaryResponse } from '../../src/lib/program/contracts';
import {
  TrendsSummaryCard,
  createDefaultTrendsSummaryState,
  createSummaryToggleOptions,
} from '../../src/app/(private)/dashboard/_components/trends-summary-card';

function createSummaryFixture(): ProgramTrendsSummaryResponse {
  return {
    period: '30d',
    generatedAt: '2026-03-05T12:00:00.000Z',
    metrics: {
      volume: {
        kpi: 12450,
        unit: 'kg',
        points: [
          { date: '2026-03-03', value: 3500 },
          { date: '2026-03-04', value: 4400 },
          { date: '2026-03-05', value: 4550 },
        ],
      },
      intensity: {
        kpi: 81.4,
        unit: 'kg',
        points: [
          { date: '2026-03-03', value: 78.2 },
          { date: '2026-03-04', value: 80.5 },
          { date: '2026-03-05', value: 85.5 },
        ],
      },
      adherence: {
        kpi: 0.75,
        unit: 'ratio',
        points: [
          { date: '2026-03-03', value: 0.66 },
          { date: '2026-03-04', value: 0.75 },
          { date: '2026-03-05', value: 0.8 },
        ],
      },
    },
  };
}

test('summary card renders exactly three KPI mini-chart cards for volume intensity and adherence', () => {
  const html = renderToStaticMarkup(React.createElement(TrendsSummaryCard, { initialData: createSummaryFixture() }));

  assert.equal((html.match(/data-testid="trend-metric-card"/g) ?? []).length, 3);
  assert.match(html, /Volume/);
  assert.match(html, /Intensity/);
  assert.match(html, /Adherence/);
  assert.match(html, /12,450/);
});

test('summary state defaults to 30d and exposes only 7d 30d 90d toggles', () => {
  const state = createDefaultTrendsSummaryState(createSummaryFixture());
  const toggles = createSummaryToggleOptions();

  assert.equal(state.period, '30d');
  assert.deepEqual(
    toggles.map((item) => item.period),
    ['7d', '30d', '90d'],
  );
});

test('summary helpers remain visual-only and never output delta arrows or interpretation badges', () => {
  const html = renderToStaticMarkup(React.createElement(TrendsSummaryCard, { initialData: createSummaryFixture() }));

  assert.equal(html.includes('▲'), false);
  assert.equal(html.includes('▼'), false);
  assert.equal(html.includes('badge'), false);
  assert.equal(html.includes('delta'), false);
});
