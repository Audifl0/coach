import type { WorkerCorpusRunRow } from '@/lib/program/contracts';

type RecentRunsCardProps =
  | {
      loadState: 'ready';
      runs: WorkerCorpusRunRow[];
    }
  | {
      loadState: 'empty' | 'error';
      runs?: never;
    };

export function RecentRunsCard(props: RecentRunsCardProps) {
  if (props.loadState === 'error') {
    return (
      <section aria-label="recent-runs-card">
        <h2>Recent runs</h2>
        <p>Unable to load recent runs.</p>
      </section>
    );
  }

  if (props.loadState === 'empty') {
    return (
      <section aria-label="recent-runs-card">
        <h2>Recent runs</h2>
        <p>No completed or candidate run available yet.</p>
      </section>
    );
  }

  const runs = props.loadState === 'ready' ? props.runs : null;
  if (!runs) {
    return null;
  }

  return (
    <section aria-label="recent-runs-card">
      <h2>Recent runs</h2>
      <ul>
        {runs.map((run) => (
          <li key={run.runId}>
            <strong>{run.runId}</strong> - {run.outcome} - {run.severity} - {run.finalStage}
            <br />
            Started: {run.startedAt}
            <br />
            Completed: {run.completedAt}
            <br />
            Active snapshot: {run.isActiveSnapshot ? 'yes' : 'no'}
            <br />
            Rollback snapshot: {run.isRollbackSnapshot ? 'yes' : 'no'}
            <br />
            Message: {run.finalMessage ?? 'n/a'}
            <br />
            Quality gate reasons: {run.qualityGateReasons.length > 0 ? run.qualityGateReasons.join(', ') : 'none'}
          </li>
        ))}
      </ul>
    </section>
  );
}
