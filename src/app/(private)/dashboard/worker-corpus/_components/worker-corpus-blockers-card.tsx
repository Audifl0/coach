import type { WorkerCorpusOverviewSection, WorkerCorpusSupervisionResponse } from '@/lib/program/contracts';

import styles from './worker-corpus-dashboard.module.css';

type Props = {
  section: WorkerCorpusOverviewSection;
  supervision: WorkerCorpusSupervisionResponse;
};

function sumRecord(values: Record<string, number>): number {
  return Object.values(values).reduce((total, value) => total + value, 0);
}

export function WorkerCorpusBlockersCard({ section, supervision }: Props) {
  const backlog = section.status === 'ready' ? section.data.backlog : null;
  const weakQuestions = supervision.questions.notableQuestions.filter(
    (question) => question.coverageStatus !== 'mature' || question.publicationStatus !== 'published',
  );

  return (
    <article className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>Blocages et backlog</h2>
          <p className={styles.panelText}>Raisons de stagnation, contradictions bloquantes et questions encore fragiles.</p>
        </div>
        <span className={styles.badge}>{backlog ? sumRecord(backlog.itemsByKind) : 0}</span>
      </div>
      <div className={styles.artifactStats}>
        <div className={styles.kv}><span className={styles.label}>Prêt</span><strong>{backlog?.queueHealth.ready ?? 0}</strong></div>
        <div className={styles.kv}><span className={styles.label}>Bloqué</span><strong>{backlog?.queueHealth.blocked ?? 0}</strong></div>
        <div className={styles.kv}><span className={styles.label}>Contradictions</span><strong>{supervision.questions.blockingContradictionCount}</strong></div>
        <div className={styles.kv}><span className={styles.label}>Questions fragiles</span><strong>{weakQuestions.length}</strong></div>
      </div>
      <div className={styles.chips}>
        {(backlog?.noProgressReasons ?? []).map((reason) => (
          <span key={reason} className={styles.chip}>{reason}</span>
        ))}
        {weakQuestions.map((question) => (
          <span key={question.questionId} className={styles.chip}>{question.label}</span>
        ))}
      </div>
      {!backlog || ((backlog.noProgressReasons?.length ?? 0) === 0 && weakQuestions.length === 0) ? (
        <div className={styles.panelText}>Aucun blocage majeur détecté.</div>
      ) : null}
    </article>
  );
}
