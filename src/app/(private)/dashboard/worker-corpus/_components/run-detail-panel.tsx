import type { WorkerCorpusRunDetail } from '@/lib/program/contracts';

type RunDetailPanelProps =
  | {
      loadState: 'ready';
      detail: WorkerCorpusRunDetail;
    }
  | {
      loadState: 'empty' | 'error';
      detail?: never;
    };

export function RunDetailPanel(props: RunDetailPanelProps) {
  if (props.loadState === 'error') {
    return (
      <section aria-label="run-detail-panel">
        <h2>Run detail</h2>
        <p>Unable to load run detail.</p>
      </section>
    );
  }

  if (props.loadState === 'empty') {
    return (
      <section aria-label="run-detail-panel">
        <h2>Run detail</h2>
        <p>No run selected.</p>
      </section>
    );
  }

  const detail = props.loadState === 'ready' ? props.detail : null;
  if (!detail) {
    return null;
  }

  return (
    <section aria-label="run-detail-panel">
      <h2>Run detail</h2>
      <p>Run ID: {detail.runId}</p>
      <p>Outcome: {detail.outcome}</p>
      <p>Severity: {detail.severity}</p>
      <p>Mode: {detail.mode}</p>
      <p>Generated at: {detail.generatedAt ?? 'n/a'}</p>
      <p>Coverage record count: {detail.coverageRecordCount ?? 'n/a'}</p>
      <p>Contradictions: {detail.contradictionCount}</p>
      <p>
        Model:{' '}
        {detail.modelRun ? `${detail.modelRun.provider}/${detail.modelRun.model}` : 'n/a'}
      </p>
      <p>Quality gate reasons: {detail.qualityGateReasons.length > 0 ? detail.qualityGateReasons.join(', ') : 'none'}</p>
      <ul>
        {detail.stageReports.map((stage) => (
          <li key={stage.stage}>
            {stage.stage} - {stage.status} - {stage.message ?? 'n/a'}
          </li>
        ))}
      </ul>
    </section>
  );
}
