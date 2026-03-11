'use client';

import React, { useEffect, useState } from 'react';

import {
  parseWorkerCorpusRunsResponse,
  parseWorkerCorpusStatusResponse,
  type WorkerCorpusRunRow,
  type WorkerCorpusStatusResponse,
} from '@/lib/program/contracts';
import { PublicationStatusCard } from './publication-status-card';
import { RecentRunsCard } from './recent-runs-card';
import { WorkerStatusCard } from './worker-status-card';

type WorkerCorpusLiveClientProps = {
  initialStatus: WorkerCorpusStatusResponse;
  initialRuns: WorkerCorpusRunRow[];
};

export function resolveWorkerCorpusRefreshInterval(state: WorkerCorpusStatusResponse['live']['state']): number {
  return state === 'started' || state === 'heartbeat' ? 10_000 : 30_000;
}

export function WorkerCorpusLiveClient(props: WorkerCorpusLiveClientProps) {
  const [status, setStatus] = useState(props.initialStatus);
  const [runs, setRuns] = useState(props.initialRuns);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const delayMs = resolveWorkerCorpusRefreshInterval(status.live.state);

    const timeoutId = setTimeout(() => {
      void (async () => {
        try {
          const [statusResponse, runsResponse] = await Promise.all([
            fetch('/api/worker-corpus/status', { method: 'GET', cache: 'no-store' }),
            fetch('/api/worker-corpus/runs?limit=6', { method: 'GET', cache: 'no-store' }),
          ]);

          if (!statusResponse.ok || !runsResponse.ok) {
            throw new Error('Unable to refresh worker corpus dashboard');
          }

          const nextStatus = parseWorkerCorpusStatusResponse(await statusResponse.json());
          const nextRuns = parseWorkerCorpusRunsResponse(await runsResponse.json());
          if (cancelled) {
            return;
          }

          setStatus(nextStatus);
          setRuns(nextRuns.runs);
          setErrorMessage(null);
        } catch {
          if (!cancelled) {
            setErrorMessage('Live refresh unavailable');
          }
        }
      })();
    }, delayMs);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [status.live.state]);

  return (
    <>
      {errorMessage ? <p>{errorMessage}</p> : null}
      <WorkerStatusCard loadState="ready" live={status.live} />
      <PublicationStatusCard loadState="ready" publication={status.publication} />
      <RecentRunsCard loadState="ready" runs={runs} />
    </>
  );
}
