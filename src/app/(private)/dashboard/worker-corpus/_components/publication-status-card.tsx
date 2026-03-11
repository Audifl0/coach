import type { WorkerCorpusOverviewResponse } from '@/lib/program/contracts';

type PublicationStatusCardProps =
  | {
      loadState: 'ready';
      publication: WorkerCorpusOverviewResponse['publication'];
    }
  | {
      loadState: 'empty' | 'error';
      publication?: never;
    };

export function PublicationStatusCard(props: PublicationStatusCardProps) {
  if (props.loadState === 'error') {
    return (
      <section aria-label="publication-status-card">
        <h2>Publication</h2>
        <p>Unable to load publication status.</p>
      </section>
    );
  }

  if (props.loadState === 'empty') {
    return (
      <section aria-label="publication-status-card">
        <h2>Publication</h2>
        <p>No active snapshot yet.</p>
      </section>
    );
  }

  const { publication } = props;

  return (
    <section aria-label="publication-status-card">
      <h2>Publication</h2>
      <p>Severity: {publication.severity}</p>
      <p>Active snapshot: {publication.activeSnapshotId ?? 'none'}</p>
      <p>Promoted at: {publication.promotedAt ?? 'n/a'}</p>
      <p>Rollback snapshot: {publication.rollbackSnapshotId ?? 'none'}</p>
      <p>Rollback available: {publication.rollbackAvailable ? 'yes' : 'no'}</p>
      <p>Snapshot age (hours): {publication.snapshotAgeHours ?? 'n/a'}</p>
      <p>Evidence records: {publication.evidenceRecordCount ?? 'n/a'}</p>
      <p>Principles: {publication.principleCount ?? 'n/a'}</p>
      <p>Domains: {publication.sourceDomains.length > 0 ? publication.sourceDomains.join(', ') : 'n/a'}</p>
      <p>
        Quality gate reasons:{' '}
        {publication.qualityGateReasons.length > 0 ? publication.qualityGateReasons.join(', ') : 'none'}
      </p>
    </section>
  );
}
