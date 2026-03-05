import React from 'react';
import type { AdaptiveForecastViewModel } from '@/lib/adaptive-coaching/forecast';

export function AdaptiveForecastCard({ forecast }: { forecast: AdaptiveForecastViewModel }) {
  const title = forecast.prudenceLabel ?? forecast.title;

  return (
    <section aria-label="adaptive-forecast-card">
      <h2>{title}</h2>
      <p>{forecast.actionLabel}</p>
      {forecast.prudenceReason ? <p>{forecast.prudenceReason}</p> : null}
      <p>
        Readiness projetee: {forecast.projection.projectedReadiness}/5 - RPE projete: {forecast.projection.projectedRpe}
      </p>
      <p>
        Ajustement: {forecast.projection.progressionDeltaLoadPct}% charge, {forecast.projection.progressionDeltaReps}
        {' '}
        reps
      </p>
      <ul>
        {forecast.reasons.slice(0, 3).map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <p>Sources: {forecast.evidenceTags.slice(0, 3).join(', ')}</p>
    </section>
  );
}
