import type { WorkerCorpusOverviewResponse } from '@/lib/program/contracts';

type WorkerStatusCardProps =
  | {
      loadState: 'ready';
      live: WorkerCorpusOverviewResponse['live'];
    }
  | {
      loadState: 'empty' | 'error';
      live?: never;
    };

function describeLiveState(state: WorkerCorpusOverviewResponse['live']['state']): string {
  switch (state) {
    case 'idle':
      return 'Idle';
    case 'started':
      return 'Started';
    case 'heartbeat':
      return 'Heartbeat';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'blocked-by-lease':
      return 'Blocked by lease';
    case 'stale':
      return 'Stale';
    default:
      return state;
  }
}

export function WorkerStatusCard(props: WorkerStatusCardProps) {
  if (props.loadState === 'error') {
    return (
      <section aria-label="worker-status-card">
        <h2>Worker status</h2>
        <p>Unable to load worker status.</p>
      </section>
    );
  }

  if (props.loadState === 'empty') {
    return (
      <section aria-label="worker-status-card">
        <h2>Worker status</h2>
        <p>No worker run detected yet.</p>
      </section>
    );
  }

  const live = props.loadState === 'ready' ? props.live : null;
  if (!live) {
    return null;
  }

  return (
    <section aria-label="worker-status-card">
      <h2>Worker status</h2>
      <p>Status: {describeLiveState(live.state)}</p>
      <p>Severity: {live.severity}</p>
      <p>Mode: {live.mode ?? 'n/a'}</p>
      <p>Run ID: {live.runId ?? 'n/a'}</p>
      <p>Started at: {live.startedAt ?? 'n/a'}</p>
      <p>Heartbeat at: {live.heartbeatAt ?? 'n/a'}</p>
      <p>Lease expires at: {live.leaseExpiresAt ?? 'n/a'}</p>
      <p>Heartbeat stale: {live.isHeartbeatStale ? 'yes' : 'no'}</p>
      <p>Message: {live.message ?? 'n/a'}</p>
    </section>
  );
}
