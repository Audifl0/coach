import type { WorkerCorpusDeliverablesResponse } from '@/lib/program/contracts';

import styles from './worker-corpus-dashboard.module.css';

type Props = {
  deliverables: WorkerCorpusDeliverablesResponse;
};

function formatMaybe(value: string | null | undefined, fallback = 'n/a') {
  return value && value.length > 0 ? value : fallback;
}

export function WorkerCorpusSourceCard({ deliverables }: Props) {
  return (
    <article className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>Source et provenance</h2>
          <p className={styles.panelText}>Snapshot actif, run source et état de validation publié.</p>
        </div>
        <span className={styles.badge}>{formatMaybe(deliverables.source.severity)}</span>
      </div>
      <div className={styles.artifactStats}>
        <div className={styles.kv}><span className={styles.label}>Snapshot</span><strong>{formatMaybe(deliverables.source.snapshotId)}</strong></div>
        <div className={styles.kv}><span className={styles.label}>Run</span><strong>{formatMaybe(deliverables.source.runId)}</strong></div>
        <div className={styles.kv}><span className={styles.label}>Généré</span><strong>{formatMaybe(deliverables.source.generatedAt)}</strong></div>
        <div className={styles.kv}><span className={styles.label}>Promu</span><strong>{formatMaybe(deliverables.source.promotedAt)}</strong></div>
        <div className={styles.kv}><span className={styles.label}>État</span><strong>{formatMaybe(deliverables.source.artifactState)}</strong></div>
      </div>
      {deliverables.source.qualityGateReasons.length > 0 ? (
        <div className={styles.chips}>
          {deliverables.source.qualityGateReasons.map((reason) => (
            <span key={reason} className={styles.chip}>{reason}</span>
          ))}
        </div>
      ) : (
        <div className={styles.panelText}>Aucun motif de quality gate bloquant.</div>
      )}
    </article>
  );
}
