'use client';

import { useState } from 'react';

import type {
  WorkerCorpusDeliverablesResponse,
  WorkerCorpusLibraryDetail,
  WorkerCorpusOverviewSection,
  WorkerCorpusRunDetail,
  WorkerCorpusSnapshotDetail,
  WorkerCorpusSupervisionResponse,
} from '@/lib/program/contracts';
import { WorkerCorpusActivityCard } from './worker-corpus-activity-card';
import { WorkerCorpusBlockersCard } from './worker-corpus-blockers-card';
import { WorkerCorpusDeliverablesPanel } from './worker-corpus-deliverables-panel';
import { WorkerCorpusSourceCard } from './worker-corpus-source-card';
import styles from './worker-corpus-dashboard.module.css';

type WorkerCorpusDashboardClientProps = {
  initialSection: WorkerCorpusOverviewSection;
  initialSupervision: WorkerCorpusSupervisionResponse;
  initialDeliverables: WorkerCorpusDeliverablesResponse;
  initialRunDetail: WorkerCorpusRunDetail | null;
  initialSnapshotDetail: WorkerCorpusSnapshotDetail | null;
  initialLibraryDetail: WorkerCorpusLibraryDetail | null;
  initialView?: 'livrables' | 'supervision';
  onRefresh?: () => void;
};

function formatMaybe(value: string | number | null | undefined, fallback = 'n/a'): string {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  return String(value);
}

export function resolveWorkerCorpusRefreshInterval(): number {
  return 30_000;
}

export function WorkerCorpusDashboardClient(props: WorkerCorpusDashboardClientProps) {
  const [pendingAction, setPendingAction] = useState<'start' | 'pause' | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [view, setView] = useState<'livrables' | 'supervision'>(props.initialView ?? 'livrables');

  const supervision = props.initialSupervision;
  const sectionData = props.initialSection.status === 'ready' ? props.initialSection.data : null;
  const sectionReady = sectionData !== null;
  const operatorMode = sectionData?.operatorMode ?? 'running';
  const operatorUpdatedAt = sectionData?.operatorUpdatedAt ?? null;
  const runActive = sectionData?.runActive ?? false;
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
          <span className={styles.eyebrow}>Worker corpus dashboard</span>
          <h1 className={styles.heroTitle}>Livrables d&apos;abord pour le worker corpus.</h1>
          <p className={styles.heroText}>
            Les sorties concrètes restent au premier plan. Les surfaces détaillées de supervision restent disponibles sans dominer l&apos;écran.
          </p>
          <div className={styles.heroMeta}>
            <div className={styles.metaCard}>
              <div className={styles.metaLabel}>Généré</div>
              <div className={styles.metaValue}>{props.initialDeliverables.generatedAt}</div>
            </div>
            <div className={styles.metaCard}>
              <div className={styles.metaLabel}>Snapshot actif</div>
              <div className={styles.metaValue}>{formatMaybe(props.initialDeliverables.source.snapshotId, 'aucun')}</div>
            </div>
            <div className={styles.metaCard}>
              <div className={styles.metaLabel}>Doctrine</div>
              <div className={styles.metaValue}>{props.initialDeliverables.doctrine.length} publiée</div>
            </div>
            <div className={styles.metaCard}>
              <div className={styles.metaLabel}>Questions</div>
              <div className={styles.metaValue}>{props.initialDeliverables.questions.length} notables</div>
            </div>
          </div>
        </section>

        <section className={styles.toolbar}>
          <div className={styles.segmented} role="tablist" aria-label="Vue dashboard worker corpus">
            <button type="button" className={view === 'livrables' ? styles.activeSegment : undefined} onClick={() => setView('livrables')}>
              Livrables
            </button>
            <button type="button" className={view === 'supervision' ? styles.activeSegment : undefined} onClick={() => setView('supervision')}>
              Supervision
            </button>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.actionButton} onClick={() => void submitControl('start')} disabled={startDisabled}>
              {pendingAction === 'start' ? 'Démarrage...' : 'Démarrer'}
            </button>
            <button type="button" className={`${styles.actionButton} ${styles.secondaryButton}`} onClick={() => void submitControl('pause')} disabled={pauseDisabled}>
              {pendingAction === 'pause' ? 'Pause...' : 'Mettre en pause'}
            </button>
          </div>
        </section>

        {feedback ? <div className={styles.messageBar} role="status">{feedback.message}</div> : null}
        {operatorMode === 'paused' ? (
          <div className={styles.operatorHint}>Le worker n’acceptera pas de nouveau run tant qu’il reste en pause.</div>
        ) : null}

        {view === 'livrables' ? (
          <>
            <section className={styles.mainGrid}>
              <WorkerCorpusActivityCard section={props.initialSection} />
              <WorkerCorpusSourceCard deliverables={props.initialDeliverables} />
            </section>

            <section className={styles.mainGrid}>
              <WorkerCorpusBlockersCard section={props.initialSection} supervision={props.initialSupervision} />
              <article className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>État opérateur</h2>
                    <p className={styles.panelText}>Contrôle rapide du worker et état publié courant.</p>
                  </div>
                  <span className={styles.badge}>{operatorMode === 'paused' ? 'En pause' : 'En marche'}</span>
                </div>
                <div className={styles.artifactStats}>
                  <div className={styles.kv}><span className={styles.label}>Mis à jour</span><strong>{formatMaybe(operatorUpdatedAt)}</strong></div>
                  <div className={styles.kv}><span className={styles.label}>Run actif</span><strong>{runActive ? 'oui' : 'non'}</strong></div>
                  <div className={styles.kv}><span className={styles.label}>Quality gates</span><strong>{props.initialDeliverables.source.qualityGateReasons.length}</strong></div>
                  <div className={styles.kv}><span className={styles.label}>Empty reason</span><strong>{props.initialDeliverables.emptyReason}</strong></div>
                </div>
              </article>
            </section>

            <WorkerCorpusDeliverablesPanel deliverables={props.initialDeliverables} />
          </>
        ) : (
          <>
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
                  <span className={styles.badge}>{props.initialSection.status}</span>
                </div>
                <div className={`${styles.contentStack} ${styles.scroll}`}>
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
                      </div>
                    )}
                  </section>
                </div>
              </article>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
