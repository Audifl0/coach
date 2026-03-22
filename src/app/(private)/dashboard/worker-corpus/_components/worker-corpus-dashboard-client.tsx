'use client';

import { useState } from 'react';

import type {
  WorkerCorpusLibraryDetail,
  WorkerCorpusOverviewSection,
  WorkerCorpusRunDetail,
  WorkerCorpusSnapshotDetail,
  WorkerCorpusSupervisionResponse,
} from '@/lib/program/contracts';
import styles from './worker-corpus-dashboard.module.css';

type WorkerCorpusDashboardClientProps = {
  initialSection: WorkerCorpusOverviewSection;
  initialSupervision: WorkerCorpusSupervisionResponse;
  initialRunDetail: WorkerCorpusRunDetail | null;
  initialSnapshotDetail: WorkerCorpusSnapshotDetail | null;
  initialLibraryDetail: WorkerCorpusLibraryDetail | null;
  onRefresh?: () => void;
};

function formatMaybe(value: string | number | null | undefined, fallback = 'n/a'): string {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  return String(value);
}

function sumRecord(values: Record<string, number>): number {
  return Object.values(values).reduce((total, value) => total + value, 0);
}

export function resolveWorkerCorpusRefreshInterval(): number {
  return 30_000;
}

export function WorkerCorpusDashboardClient(props: WorkerCorpusDashboardClientProps) {
  const [pendingAction, setPendingAction] = useState<'start' | 'pause' | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const supervision = props.initialSupervision;
  const sectionReady = props.initialSection.status === 'ready';
  const sectionSummary =
    props.initialSection.status === 'ready'
      ? `${props.initialSection.data.recentRuns.length} recent runs · active snapshot ${formatMaybe(
          props.initialSection.data.publication.activeSnapshotId,
          'none',
        )}`
      : props.initialSection.status === 'empty'
        ? 'No published worker artifacts yet.'
        : 'Worker overview unavailable.';

  const operatorMode = sectionReady ? props.initialSection.data.operatorMode : 'running';
  const operatorUpdatedAt = sectionReady ? props.initialSection.data.operatorUpdatedAt : null;
  const runActive = sectionReady ? props.initialSection.data.runActive : false;
  const startDisabled = pendingAction !== null || (sectionReady && operatorMode === 'running' && runActive);
  const pauseDisabled = pendingAction !== null || !sectionReady || operatorMode === 'paused';

  async function submitControl(action: 'start' | 'pause') {
    setPendingAction(action);
    setFeedback(null);

    try {
      const response = await fetch('/api/worker-corpus/control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(action === 'start' ? { action, mode: 'refresh' } : { action }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setFeedback({ kind: 'error', message: body?.error ?? 'Commande impossible.' });
        return;
      }

      setFeedback({
        kind: 'success',
        message: action === 'start' ? 'Démarrage demandé.' : 'Pause opérateur activée.',
      });
      props.onRefresh?.();
    } catch {
      setFeedback({ kind: 'error', message: 'Erreur réseau. Réessayez.' });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className={styles.shell}>
      <div className={styles.frame}>
        <section className={styles.hero}>
          <span className={styles.eyebrow}>Worker corpus supervision</span>
          <h1 className={styles.heroTitle}>Read-only scientific supervision for the worker corpus.</h1>
          <p className={styles.heroText}>
            Diagnostic surface for workflow queues, document-state distribution, scientific question maturity, doctrine revision state,
            and recent research activity. No write actions are exposed here.
          </p>
          <div className={styles.heroMeta}>
            <div className={styles.metaCard}>
              <div className={styles.metaLabel}>Generated</div>
              <div className={styles.metaValue}>{supervision.generatedAt}</div>
            </div>
            <div className={styles.metaCard}>
              <div className={styles.metaLabel}>Workflow</div>
              <div className={styles.metaValue}>{supervision.workflow.queueDepth} queued · {supervision.workflow.blockedItems} blocked</div>
            </div>
            <div className={styles.metaCard}>
              <div className={styles.metaLabel}>Questions</div>
              <div className={styles.metaValue}>{supervision.questions.total} tracked · {supervision.questions.blockingContradictionCount} blocking contradictions</div>
            </div>
            <div className={styles.metaCard}>
              <div className={styles.metaLabel}>Doctrine</div>
              <div className={styles.metaValue}>{supervision.doctrine.activePrinciples} active · {supervision.doctrine.reopenedPrinciples} reopened</div>
            </div>
          </div>
        </section>

        <section className={styles.statsGrid}>
          <article className={`${styles.metricCard} ${styles.metricFeature}`}>
            <div className={styles.metaLabel}>Contrôle opérateur</div>
            <h2 className={styles.metricTitle}>État du worker</h2>
            <div className={styles.controlHeaderRow}>
              <span className={styles.statValue}>{operatorMode === 'paused' ? 'En pause' : 'En marche'}</span>
              <span className={styles.badge}>{operatorUpdatedAt ?? 'mise à jour inconnue'}</span>
            </div>
            <div className={styles.muted}>
              {runActive ? 'Run actif détecté.' : 'Aucun run actif détecté.'}
            </div>
            {operatorMode === 'paused' ? (
              <div className={styles.operatorHint}>Le worker n’acceptera pas de nouveau run tant qu’il reste en pause.</div>
            ) : null}
            {feedback ? (
              <div className={styles.messageBar} role="status">{feedback.message}</div>
            ) : null}
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => void submitControl('start')}
                disabled={startDisabled}
              >
                {pendingAction === 'start' ? 'Démarrage...' : 'Démarrer'}
              </button>
              <button
                type="button"
                className={`${styles.actionButton} ${styles.secondaryButton}`}
                onClick={() => void submitControl('pause')}
                disabled={pauseDisabled}
              >
                {pendingAction === 'pause' ? 'Pause...' : 'Mettre en pause'}
              </button>
            </div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metaLabel}>Workflow status</div>
            <h2 className={styles.metricTitle}>Queue depth</h2>
            <div className={styles.statValue}>{supervision.workflow.queueDepth}</div>
            <div className={styles.muted}>pending {supervision.workflow.byStatus.pending} · running {supervision.workflow.byStatus.running} · blocked {supervision.workflow.byStatus.blocked}</div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metaLabel}>Document library status</div>
            <h2 className={styles.metricTitle}>Tracked documents</h2>
            <div className={styles.statValue}>{supervision.documents.total}</div>
            <div className={styles.muted}>linked {supervision.documents.byState.linked} · extractible {supervision.documents.byState.extractible}</div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metaLabel}>Scientific questions</div>
            <h2 className={styles.metricTitle}>Question maturity</h2>
            <div className={styles.statValue}>{supervision.questions.byCoverage.mature}</div>
            <div className={styles.muted}>mature · {supervision.questions.byCoverage.blocked} blocked · {supervision.questions.byPublication.published} published</div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metaLabel}>Published doctrine</div>
            <h2 className={styles.metricTitle}>Recent revisions</h2>
            <div className={styles.statValue}>{supervision.doctrine.recentRevisions.length}</div>
            <div className={styles.muted}>active {supervision.doctrine.activePrinciples} · reopened {supervision.doctrine.reopenedPrinciples}</div>
          </article>
        </section>

        <section className={styles.detailGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Workflow status</h2>
                <p className={styles.panelText}>Queue summary by status and by workflow family.</p>
              </div>
              <span className={styles.badge}>queue depth {supervision.workflow.queueDepth}</span>
            </div>
            <div className={styles.contentStack}>
              <div className={styles.chips}>
                <span className={styles.chip}>pending {supervision.workflow.byStatus.pending}</span>
                <span className={styles.chip}>running {supervision.workflow.byStatus.running}</span>
                <span className={styles.chip}>blocked {supervision.workflow.byStatus.blocked}</span>
                <span className={styles.chip}>completed {supervision.workflow.byStatus.completed}</span>
                <span className={styles.chip}>failed {supervision.workflow.byStatus.failed}</span>
              </div>
              <div className={styles.contentStack}>
                {supervision.workflow.queues.length === 0 ? (
                  <div className={styles.emptyState}>No queued work items.</div>
                ) : (
                  supervision.workflow.queues.map((queue) => (
                    <div key={queue.queueName} className={styles.stageItem}>
                      <div className={styles.stageHead}>
                        <strong>{queue.queueName}</strong>
                        <span className={styles.badge}>{queue.total}</span>
                      </div>
                      <div className={styles.panelText}>
                        pending {queue.pending} · running {queue.running} · blocked {queue.blocked} · completed {queue.completed} · failed {queue.failed}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Document library status</h2>
                <p className={styles.panelText}>Distribution of document states across the adaptive knowledge library.</p>
              </div>
              <span className={styles.badge}>{supervision.documents.total}</span>
            </div>
            <div className={styles.chips}>
              {Object.entries(supervision.documents.byState).map(([state, count]) => (
                <span key={state} className={styles.chip}>{state} {count}</span>
              ))}
            </div>
          </article>
        </section>

        <section className={styles.mainGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Scientific questions</h2>
                <p className={styles.panelText}>Question maturity, publication state, and contradiction pressure.</p>
              </div>
              <span className={styles.badge}>question maturity</span>
            </div>
            <div className={styles.contentStack}>
              <div className={styles.chips}>
                <span className={styles.chip}>empty {supervision.questions.byCoverage.empty}</span>
                <span className={styles.chip}>partial {supervision.questions.byCoverage.partial}</span>
                <span className={styles.chip}>developing {supervision.questions.byCoverage.developing}</span>
                <span className={styles.chip}>mature {supervision.questions.byCoverage.mature}</span>
                <span className={styles.chip}>blocked {supervision.questions.byCoverage.blocked}</span>
                <span className={styles.chip}>published {supervision.questions.byPublication.published}</span>
                <span className={styles.chip}>reopened {supervision.questions.byPublication.reopened}</span>
              </div>
              <div className={styles.contentStack}>
                {supervision.questions.notableQuestions.length === 0 ? (
                  <div className={styles.emptyState}>No notable question pressure detected.</div>
                ) : (
                  supervision.questions.notableQuestions.map((question) => (
                    <div key={question.questionId} className={styles.stageItem}>
                      <div className={styles.stageHead}>
                        <strong>{question.label}</strong>
                        <span className={styles.badge}>{question.publicationStatus}</span>
                      </div>
                      <div className={styles.panelText}>
                        {question.coverageStatus} · readiness {formatMaybe(question.publicationReadiness)} · linked studies {question.linkedStudyCount}
                      </div>
                      <div className={styles.chips}>
                        <span className={styles.chip}>contradictions {question.contradictionCount}</span>
                        <span className={styles.chip}>blocking {question.blockingContradictionCount}</span>
                        <span className={styles.chip}>{formatMaybe(question.updatedAt)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Published doctrine</h2>
                <p className={styles.panelText}>Doctrine revision summary with recent publication and reopening events.</p>
              </div>
              <span className={styles.badge}>recent revisions</span>
            </div>
            <div className={styles.chips}>
              <span className={styles.chip}>active {supervision.doctrine.activePrinciples}</span>
              <span className={styles.chip}>reopened {supervision.doctrine.reopenedPrinciples}</span>
              <span className={styles.chip}>superseded {supervision.doctrine.supersededPrinciples}</span>
            </div>
            <div className={styles.contentStack}>
              {supervision.doctrine.recentRevisions.length === 0 ? (
                <div className={styles.emptyState}>No doctrine revisions published yet.</div>
              ) : (
                supervision.doctrine.recentRevisions.map((revision) => (
                  <div key={revision.revisionId} className={styles.stageItem}>
                    <div className={styles.stageHead}>
                      <strong>{revision.principleId}</strong>
                      <span className={styles.badge}>{revision.changeType}</span>
                    </div>
                    <div className={styles.panelText}>{revision.reason}</div>
                    <div className={styles.panelText}>{revision.changedAt}</div>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>

        <section className={styles.readerGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Recent research activity</h2>
                <p className={styles.panelText}>Compact journal inferred from queue movement, dossiers, questions, and doctrine revisions.</p>
              </div>
              <span className={styles.badge}>{supervision.recentResearchJournal.length}</span>
            </div>
            <div className={styles.contentStack}>
              {supervision.recentResearchJournal.length === 0 ? (
                <div className={styles.emptyState}>No recent research activity recorded.</div>
              ) : (
                supervision.recentResearchJournal.map((entry) => (
                  <div key={`${entry.kind}-${entry.id}-${entry.at}`} className={styles.stageItem}>
                    <div className={styles.stageHead}>
                      <strong>{entry.title}</strong>
                      <span className={styles.badge}>{entry.kind}</span>
                    </div>
                    <div className={styles.panelText}>{entry.detail}</div>
                    <div className={styles.panelText}>{entry.at}</div>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className={styles.readerCard}>
            <div className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Published runtime snapshot</h2>
                <p className={styles.panelText}>Small read-only bridge back to the currently published worker outputs.</p>
              </div>
              <span className={styles.badge}>{sectionReady ? 'ready' : props.initialSection.status}</span>
            </div>
            <div className={`${styles.contentStack} ${styles.scroll}`}>
              <section className={styles.readerSection}>
                <div className={styles.readerHead}>
                  <strong>Overview</strong>
                  <span className={styles.badge}>{props.initialSection.status}</span>
                </div>
                <div className={styles.panelText}>{sectionSummary}</div>
              </section>

              <section className={styles.readerSection}>
                <div className={styles.readerHead}>
                  <strong>Lead run detail</strong>
                  <span className={styles.badge}>{props.initialRunDetail?.runId ?? 'none'}</span>
                </div>
                {!props.initialRunDetail ? (
                  <div className={styles.emptyState}>No lead run selected.</div>
                ) : (
                  <div className={styles.artifactStats}>
                    <div className={styles.kv}><span className={styles.label}>Outcome</span><strong>{props.initialRunDetail.outcome}</strong></div>
                    <div className={styles.kv}><span className={styles.label}>Coverage</span><strong>{formatMaybe(props.initialRunDetail.coverageRecordCount)}</strong></div>
                    <div className={styles.kv}><span className={styles.label}>Contradictions</span><strong>{props.initialRunDetail.contradictionCount}</strong></div>
                    <div className={styles.kv}><span className={styles.label}>Stages</span><strong>{props.initialRunDetail.stageReports.length}</strong></div>
                  </div>
                )}
              </section>

              <section className={styles.readerSection}>
                <div className={styles.readerHead}>
                  <strong>Active snapshot detail</strong>
                  <span className={styles.badge}>{props.initialSnapshotDetail?.snapshotId ?? 'none'}</span>
                </div>
                {!props.initialSnapshotDetail ? (
                  <div className={styles.emptyState}>No active snapshot available.</div>
                ) : (
                  <div className={styles.artifactStats}>
                    <div className={styles.kv}><span className={styles.label}>Artifact state</span><strong>{props.initialSnapshotDetail.artifactState}</strong></div>
                    <div className={styles.kv}><span className={styles.label}>Coverage</span><strong>{formatMaybe(props.initialSnapshotDetail.coverageRecordCount)}</strong></div>
                    <div className={styles.kv}><span className={styles.label}>Contradictions</span><strong>{props.initialSnapshotDetail.contradictionCount}</strong></div>
                    <div className={styles.kv}><span className={styles.label}>Source domains</span><strong>{props.initialSnapshotDetail.sourceDomains.length}</strong></div>
                  </div>
                )}
              </section>

              <section className={styles.readerSection}>
                <div className={styles.readerHead}>
                  <strong>Published corpus detail</strong>
                  <span className={styles.badge}>{props.initialLibraryDetail?.entry.snapshotId ?? 'none'}</span>
                </div>
                {!props.initialLibraryDetail ? (
                  <div className={styles.emptyState}>No published corpus detail available.</div>
                ) : (
                  <div className={styles.artifactStats}>
                    <div className={styles.kv}><span className={styles.label}>Principles</span><strong>{props.initialLibraryDetail.principles.length}</strong></div>
                    <div className={styles.kv}><span className={styles.label}>Sources</span><strong>{props.initialLibraryDetail.sources.length}</strong></div>
                    <div className={styles.kv}><span className={styles.label}>Study extractions</span><strong>{props.initialLibraryDetail.studyExtractions.length}</strong></div>
                    <div className={styles.kv}><span className={styles.label}>Knowledge bible</span><strong>{props.initialLibraryDetail.knowledgeBible?.principles.length ?? 0}</strong></div>
                  </div>
                )}
              </section>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
