import type { WorkerCorpusSnapshotDetail } from '@/lib/program/contracts';

type SnapshotDetailPanelProps =
  | {
      loadState: 'ready';
      detail: WorkerCorpusSnapshotDetail;
    }
  | {
      loadState: 'empty' | 'error';
      detail?: never;
    };

export function SnapshotDetailPanel(props: SnapshotDetailPanelProps) {
  if (props.loadState === 'error') {
    return (
      <section aria-label="snapshot-detail-panel">
        <h2>Snapshot detail</h2>
        <p>Unable to load snapshot detail.</p>
      </section>
    );
  }

  if (props.loadState === 'empty') {
    return (
      <section aria-label="snapshot-detail-panel">
        <h2>Snapshot detail</h2>
        <p>No snapshot selected.</p>
      </section>
    );
  }

  const detail = props.loadState === 'ready' ? props.detail : null;
  if (!detail) {
    return null;
  }

  return (
    <section aria-label="snapshot-detail-panel">
      <h2>Snapshot detail</h2>
      <p>Snapshot ID: {detail.snapshotId}</p>
      <p>Artifact state: {detail.artifactState}</p>
      <p>Severity: {detail.severity}</p>
      <p>Active snapshot: {detail.isActiveSnapshot ? 'yes' : 'no'}</p>
      <p>Rollback snapshot: {detail.isRollbackSnapshot ? 'yes' : 'no'}</p>
      <p>Generated at: {detail.generatedAt ?? 'n/a'}</p>
      <p>Promoted at: {detail.promotedAt ?? 'n/a'}</p>
      <p>Snapshot age (hours): {detail.snapshotAgeHours ?? 'n/a'}</p>
      <p>Evidence records: {detail.evidenceRecordCount ?? 'n/a'}</p>
      <p>Principles: {detail.principleCount ?? 'n/a'}</p>
      <p>Domains: {detail.sourceDomains.length > 0 ? detail.sourceDomains.join(', ') : 'n/a'}</p>
      <p>Quality gate reasons: {detail.qualityGateReasons.length > 0 ? detail.qualityGateReasons.join(', ') : 'none'}</p>
      <p>
        Model:{' '}
        {detail.modelRun ? `${detail.modelRun.provider}/${detail.modelRun.model}` : 'n/a'}
      </p>
      {detail.diff ? (
        <p>
          Diff: prev={detail.diff.previousSnapshotId ?? 'none'} evidenceDelta={detail.diff.evidenceRecordDelta} principleDelta=
          {detail.diff.principleDelta}
        </p>
      ) : (
        <p>Diff: n/a</p>
      )}
    </section>
  );
}
