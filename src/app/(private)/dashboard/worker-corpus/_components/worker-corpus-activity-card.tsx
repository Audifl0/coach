import type { WorkerCorpusOverviewSection } from '@/lib/program/contracts';

import styles from './worker-corpus-dashboard.module.css';

type Props = {
  section: WorkerCorpusOverviewSection;
};

function formatMaybe(value: string | number | null | undefined, fallback = 'n/a'): string {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function formatHeartbeatAge(ageSec: number | null | undefined): string {
  if (ageSec === null || ageSec === undefined || Number.isNaN(ageSec)) return 'n/a';
  return `${Math.max(0, Math.round(ageSec))}s`;
}

function getLiveRunBadgeLabel(status: string, active: boolean): string {
  if (status === 'stale') return 'Stale';
  if (status === 'running' || active) return 'Actif';
  return 'Idle';
}

function getLiveRunBadgeClassName(status: string, active: boolean): string {
  if (status === 'stale') return styles.warnBadge;
  if (status === 'running' || active) return styles.goodBadge;
  return styles.badge;
}

export function WorkerCorpusActivityCard({ section }: Props) {
  const data = section.status === 'ready' ? section.data : null;
  const liveRun = data?.liveRun ?? null;
  const operatorMode = data?.operatorMode ?? 'running';

  return (
    <article className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>Activité du worker</h2>
          <p className={styles.panelText}>État opérateur, stage courant, heartbeat et progression simple.</p>
        </div>
        <span className={`${styles.badge} ${getLiveRunBadgeClassName(liveRun?.status ?? 'idle', liveRun?.active ?? false)}`}>
          {getLiveRunBadgeLabel(liveRun?.status ?? 'idle', liveRun?.active ?? false)}
        </span>
      </div>
      <div className={styles.contentStack}>
        <div className={styles.controlHeaderRow}>
          <strong>{operatorMode === 'paused' ? 'En pause' : 'En marche'}</strong>
          <span className={styles.badge}>{liveRun?.currentStage ?? 'Aucun run actif'}</span>
        </div>
        <div className={styles.panelText}>{liveRun?.liveMessage ?? 'Aucun run actif détecté'}</div>
        {liveRun?.currentWorkItemLabel ? <div className={styles.liveRunItem}>{liveRun.currentWorkItemLabel}</div> : null}
        <div className={styles.liveRunMetaRow}>
          <span>Type courant {formatMaybe(liveRun?.currentWorkItemKind)}</span>
          <span>Dernier {formatMaybe(liveRun?.lastCompletedItemKind)}</span>
        </div>
        <div className={styles.liveRunMetaRow}>
          <span>Heartbeat {formatMaybe(liveRun?.lastHeartbeatAt)}</span>
          <span>{formatHeartbeatAge(liveRun?.heartbeatAgeSec)}</span>
        </div>
        <div className={styles.liveRunCounters}>
          <span className={styles.chip}>pending {liveRun?.progress.queue ?? 0}</span>
          <span className={styles.chip}>documents {liveRun?.progress.documents ?? 0}</span>
          <span className={styles.chip}>questions {liveRun?.progress.questions ?? 0}</span>
          <span className={styles.chip}>doctrine {liveRun?.progress.doctrine ?? 0}</span>
        </div>
      </div>
    </article>
  );
}
