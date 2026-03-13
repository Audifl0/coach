'use client';

import { startTransition, useEffect, useState } from 'react';

import {
  parseWorkerCorpusControlResponse,
  parseWorkerCorpusLibraryDetail,
  parseWorkerCorpusLibraryResponse,
  parseWorkerCorpusRunDetail,
  parseWorkerCorpusRunsResponse,
  parseWorkerCorpusSnapshotDetail,
  parseWorkerCorpusStatusResponse,
  type WorkerCorpusLibraryDetail,
  type WorkerCorpusLibraryResponse,
  type WorkerCorpusOverviewSection,
  type WorkerCorpusRunDetail,
  type WorkerCorpusRunRow,
  type WorkerCorpusSnapshotDetail,
  type WorkerCorpusStatusResponse,
} from '@/lib/program/contracts';
import styles from './worker-corpus-dashboard.module.css';

type WorkerCorpusDashboardClientProps = {
  initialSection: WorkerCorpusOverviewSection;
  initialStatus: WorkerCorpusStatusResponse;
  initialRuns: WorkerCorpusRunRow[];
  initialRunDetail: WorkerCorpusRunDetail | null;
  initialSnapshotDetail: WorkerCorpusSnapshotDetail | null;
  initialLibrary: WorkerCorpusLibraryResponse;
  initialLibraryDetail: WorkerCorpusLibraryDetail | null;
};

function formatMaybe(value: string | number | null | undefined, fallback = 'n/a'): string {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  return String(value);
}

function severityClass(severity: 'healthy' | 'degraded' | 'critical'): string {
  switch (severity) {
    case 'healthy':
      return styles.good;
    case 'degraded':
      return styles.warn;
    default:
      return styles.bad;
  }
}

function describeControlState(control: WorkerCorpusStatusResponse['control']): string {
  if (control.state === 'running') {
    return `PID ${formatMaybe(control.pid)} · ${formatMaybe(control.mode)}`;
  }

  if (control.state === 'paused') {
    return `Pausee · ${formatMaybe(control.pauseRequestedAt)}`;
  }

  if (control.state === 'failed') {
    return control.message ?? 'controle en echec';
  }

  return control.message ?? 'aucun processus detache';
}

function describeLiveState(status: WorkerCorpusStatusResponse['live']): string {
  return `${status.state} · ${formatMaybe(status.mode)} · lease ${formatMaybe(status.leaseExpiresAt)}`;
}

function describeCampaignState(control: WorkerCorpusStatusResponse['control']): string {
  const campaign = control.campaign;
  if (!campaign) {
    return 'aucune campagne bootstrap persistante';
  }

  return `${campaign.status} · jobs ${campaign.backlog.pending + campaign.backlog.running + campaign.backlog.blocked + campaign.backlog.completed + campaign.backlog.exhausted}`;
}

export function resolveWorkerCorpusRefreshInterval(state: WorkerCorpusStatusResponse['live']['state']): number {
  return state === 'started' || state === 'heartbeat' ? 10_000 : 30_000;
}

async function fetchJson<T>(input: RequestInfo, parser: (payload: unknown) => T, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    cache: 'no-store',
    ...init,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `HTTP ${response.status}`);
  }

  return parser(await response.json());
}

export function WorkerCorpusDashboardClient(props: WorkerCorpusDashboardClientProps) {
  const [status, setStatus] = useState(props.initialStatus);
  const [runs, setRuns] = useState(props.initialRuns);
  const [runDetail, setRunDetail] = useState(props.initialRunDetail);
  const [snapshotDetail, setSnapshotDetail] = useState(props.initialSnapshotDetail);
  const [library, setLibrary] = useState(props.initialLibrary);
  const [libraryDetail, setLibraryDetail] = useState(props.initialLibraryDetail);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(props.initialRunDetail?.runId ?? props.initialRuns[0]?.runId ?? null);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(
    props.initialLibraryDetail?.entry.snapshotId ??
      props.initialSnapshotDetail?.snapshotId ??
      props.initialLibrary.entries[0]?.snapshotId ??
      null,
  );
  const [mode, setMode] = useState<'bootstrap' | 'refresh' | 'check'>('bootstrap');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const delayMs = resolveWorkerCorpusRefreshInterval(status.live.state);

    const timeoutId = setTimeout(() => {
      void (async () => {
        try {
          const [nextStatus, nextRuns, nextLibrary] = await Promise.all([
            fetchJson('/api/worker-corpus/status', parseWorkerCorpusStatusResponse),
            fetchJson('/api/worker-corpus/runs?limit=8', parseWorkerCorpusRunsResponse),
            fetchJson('/api/worker-corpus/library', parseWorkerCorpusLibraryResponse),
          ]);

          if (cancelled) {
            return;
          }

          startTransition(() => {
            setStatus(nextStatus);
            setRuns(nextRuns.runs);
            setLibrary(nextLibrary);
          });
        } catch (error) {
          if (!cancelled) {
            setMessage(error instanceof Error ? error.message : 'Live refresh unavailable');
          }
        }
      })();
    }, delayMs);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [status.live.state]);

  async function refreshControlAndLists() {
    const [nextStatus, nextRuns, nextLibrary] = await Promise.all([
      fetchJson('/api/worker-corpus/status', parseWorkerCorpusStatusResponse),
      fetchJson('/api/worker-corpus/runs?limit=8', parseWorkerCorpusRunsResponse),
      fetchJson('/api/worker-corpus/library', parseWorkerCorpusLibraryResponse),
    ]);
    startTransition(() => {
      setStatus(nextStatus);
      setRuns(nextRuns.runs);
      setLibrary(nextLibrary);
    });
  }

  async function handleControl(action: 'start' | 'pause' | 'resume' | 'reset') {
    setPendingAction(action);
    setMessage(null);
    try {
      const response = await fetchJson(
        '/api/worker-corpus/control',
        parseWorkerCorpusControlResponse,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(action === 'start' || action === 'resume' ? { action, mode } : { action }),
        },
      );
      startTransition(() => {
        setStatus((current) => ({
          ...current,
          control: response.control,
        }));
        setMessage(
          action === 'start'
            ? `Worker lance en mode ${mode}`
            : action === 'resume'
              ? `Campagne reprise en mode ${mode}`
              : action === 'reset'
                ? 'Scope bootstrap reinitialise'
                : 'Pause demandee au worker',
        );
      });
      await refreshControlAndLists();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Worker control failed');
    } finally {
      setPendingAction(null);
    }
  }

  async function selectRun(runId: string) {
    setSelectedRunId(runId);
    setMessage(null);
    try {
      const detail = await fetchJson(`/api/worker-corpus/runs/${runId}`, parseWorkerCorpusRunDetail);
      startTransition(() => {
        setRunDetail(detail);
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load run detail');
    }
  }

  async function selectSnapshot(snapshotId: string) {
    setSelectedSnapshotId(snapshotId);
    setMessage(null);
    try {
      const [detail, corpus] = await Promise.all([
        fetchJson(`/api/worker-corpus/snapshots/${snapshotId}`, parseWorkerCorpusSnapshotDetail),
        fetchJson(`/api/worker-corpus/library/${snapshotId}`, parseWorkerCorpusLibraryDetail),
      ]);
      startTransition(() => {
        setSnapshotDetail(detail);
        setLibraryDetail(corpus);
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load snapshot detail');
    }
  }

  const sectionReady = props.initialSection.status === 'ready';
  const campaign = status.control.campaign;
  const totalCampaignJobs = campaign
    ? campaign.backlog.pending +
      campaign.backlog.running +
      campaign.backlog.blocked +
      campaign.backlog.completed +
      campaign.backlog.exhausted
    : 0;
  const headline = sectionReady
    ? `${runs.length} runs traces · ${library.entries.length} snapshots lisibles`
    : props.initialSection.status === 'empty'
      ? 'Aucun artefact worker present pour le moment'
      : 'Le dashboard a demarre, mais les donnees worker n’ont pas pu etre projetees';

  return (
    <div className={styles.shell}>
      <div className={styles.frame}>
        <section className={styles.hero}>
          <span className={styles.eyebrow}>Adaptive Knowledge Worker</span>
          <h1 className={styles.heroTitle}>Pilote, inspecte et lis le corpus produit par le worker.</h1>
          <p className={styles.heroText}>
            Dashboard d’exploitation pour piloter les runs, lire les snapshots publies, verifier la qualite de couverture et
            remonter jusqu’aux principes, sources et extractions qui alimentent la bible de connaissances.
          </p>
          <div className={styles.heroMeta}>
            <div className={styles.metaCard}>
              <div className={styles.metaLabel}>Etat controle</div>
              <div className={styles.metaValue}>{describeControlState(status.control)}</div>
            </div>
            <div className={styles.metaCard}>
              <div className={styles.metaLabel}>Etat live</div>
              <div className={styles.metaValue}>{describeLiveState(status.live)}</div>
            </div>
            <div className={styles.metaCard}>
              <div className={styles.metaLabel}>Publication active</div>
              <div className={styles.metaValue}>{formatMaybe(status.publication.activeSnapshotId, 'aucun snapshot actif')}</div>
            </div>
            <div className={styles.metaCard}>
              <div className={styles.metaLabel}>Campagne bootstrap</div>
              <div className={styles.metaValue}>{describeCampaignState(status.control)}</div>
            </div>
          </div>
        </section>

        <section className={styles.toolbar}>
          <div>
            <div className={styles.label}>Mode de lancement</div>
            <div className={styles.segmented}>
              <button
                type="button"
                className={mode === 'bootstrap' ? styles.activeSegment : undefined}
                onClick={() => setMode('bootstrap')}
                disabled={pendingAction !== null}
              >
                Bootstrap
              </button>
              <button
                type="button"
                className={mode === 'refresh' ? styles.activeSegment : undefined}
                onClick={() => setMode('refresh')}
                disabled={pendingAction !== null}
              >
                Refresh
              </button>
              <button
                type="button"
                className={mode === 'check' ? styles.activeSegment : undefined}
                onClick={() => setMode('check')}
                disabled={pendingAction !== null}
              >
                Check
              </button>
            </div>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.actionButton} onClick={() => void handleControl('start')} disabled={pendingAction !== null}>
              Lancer le worker
            </button>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.secondaryButton}`}
              onClick={() => void handleControl('resume')}
              disabled={pendingAction !== null}
            >
              Reprendre
            </button>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.secondaryButton}`}
              onClick={() => void handleControl('pause')}
              disabled={pendingAction !== null}
            >
              Mettre en pause
            </button>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.ghostButton}`}
              onClick={() => void handleControl('reset')}
              disabled={pendingAction !== null || status.control.state === 'running'}
            >
              Reset scope
            </button>
          </div>
        </section>

        {message ? <div className={styles.messageBar}>{message}</div> : null}

        <section className={styles.statsGrid}>
          <article className={`${styles.metricCard} ${styles.metricFeature}`}>
            <div className={styles.metaLabel}>Campagne</div>
            <h2 className={styles.metricTitle}>Bootstrap longue duree</h2>
            <div className={`${styles.statValue} ${campaign ? severityClass(campaign.status === 'failed' ? 'critical' : campaign.status === 'paused' ? 'degraded' : 'healthy') : styles.warn}`}>
              {campaign ? campaign.status : 'idle'}
            </div>
            <div className={styles.muted}>
              {campaign
                ? `queue ${totalCampaignJobs} · lastRun ${formatMaybe(campaign.lastRunId)}`
                : 'Aucune campagne hydratee'}
            </div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metaLabel}>Worker live</div>
            <h2 className={styles.metricTitle}>Lease et heartbeat</h2>
            <div className={`${styles.statValue} ${severityClass(status.live.severity)}`}>{status.live.state}</div>
            <div className={styles.muted}>Run {formatMaybe(status.live.runId)} · heartbeat stale {status.live.isHeartbeatStale ? 'oui' : 'non'}</div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metaLabel}>Publication</div>
            <h2 className={styles.metricTitle}>Snapshot actif</h2>
            <div className={`${styles.statValue} ${severityClass(status.publication.severity)}`}>
              {formatMaybe(status.publication.activeSnapshotId, 'none')}
            </div>
            <div className={styles.muted}>
              age {formatMaybe(status.publication.snapshotAgeHours)}h · rollback {status.publication.rollbackAvailable ? 'oui' : 'non'}
            </div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metaLabel}>Corpus</div>
            <h2 className={styles.metricTitle}>Volume lisible</h2>
            <div className={styles.statValue}>{library.entries.length}</div>
            <div className={styles.muted}>{headline}</div>
          </article>
        </section>

        <section className={styles.detailGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Campaign progress</h2>
                <p className={styles.panelText}>Progression globale, backlog, publication candidate et budget de collecte visibles sans shell.</p>
              </div>
              <span className={styles.badge}>{campaign?.campaignId ?? 'none'}</span>
            </div>
            {!campaign ? (
              <div className={styles.emptyState}>Aucune campagne bootstrap persistee pour le moment.</div>
            ) : (
              <div className={styles.contentStack}>
                <div className={styles.artifactStats}>
                  <div className={styles.kv}><span className={styles.label}>Canonical library</span><strong>{campaign.progress.canonicalRecordCount}</strong></div>
                  <div className={styles.kv}><span className={styles.label}>Query families</span><strong>{campaign.progress.discoveredQueryFamilies}</strong></div>
                  <div className={styles.kv}><span className={styles.label}>Extraction backlog</span><strong>{campaign.progress.extractionBacklogCount}</strong></div>
                  <div className={styles.kv}><span className={styles.label}>Publication candidates</span><strong>{campaign.progress.publicationCandidateCount}</strong></div>
                </div>
                <div className={styles.chips}>
                  <span className={styles.chip}>pending {campaign.backlog.pending}</span>
                  <span className={styles.chip}>running {campaign.backlog.running}</span>
                  <span className={styles.chip}>blocked {campaign.backlog.blocked}</span>
                  <span className={styles.chip}>completed {campaign.backlog.completed}</span>
                  <span className={styles.chip}>exhausted {campaign.backlog.exhausted}</span>
                </div>
                <div className={styles.chips}>
                  <span className={styles.chip}>cursor jobs {campaign.cursors.activeCursorCount}</span>
                  <span className={styles.chip}>resumable {campaign.cursors.resumableJobCount}</span>
                  <span className={styles.chip}>budget jobs {campaign.budgets.maxJobsPerRun}</span>
                  <span className={styles.chip}>budget pages {campaign.budgets.maxPagesPerJob}</span>
                  <span className={styles.chip}>budget canonical {campaign.budgets.maxCanonicalRecordsPerRun}</span>
                </div>
              </div>
            )}
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Resumption and diagnostics</h2>
                <p className={styles.panelText}>Identifie vite une campagne bloquee, reprenable ou simplement partiellement productive.</p>
              </div>
              <span className={styles.badge}>{campaign?.cursors.sampleJobIds.length ?? 0}</span>
            </div>
            {!campaign ? (
              <div className={styles.emptyState}>Aucun curseur ni job reprenable disponible.</div>
            ) : (
              <div className={styles.contentStack}>
                <div className={styles.artifactStats}>
                  <div className={styles.kv}><span className={styles.label}>Updated</span><strong>{formatMaybe(campaign.updatedAt)}</strong></div>
                  <div className={styles.kv}><span className={styles.label}>Active job</span><strong>{formatMaybe(campaign.activeJobId)}</strong></div>
                  <div className={styles.kv}><span className={styles.label}>Paused at</span><strong>{formatMaybe(status.control.pauseRequestedAt)}</strong></div>
                  <div className={styles.kv}><span className={styles.label}>Control state</span><strong>{status.control.state}</strong></div>
                </div>
                <div className={styles.chips}>
                  {campaign.cursors.sampleJobIds.length > 0 ? (
                    campaign.cursors.sampleJobIds.map((jobId) => <span key={jobId} className={styles.chip}>{jobId}</span>)
                  ) : (
                    <span className={styles.chip}>aucun curseur actif</span>
                  )}
                </div>
              </div>
            )}
          </article>
        </section>

        <section className={styles.mainGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Recent runs</h2>
                <p className={styles.panelText}>Selectionne un run pour inspecter les stages, le verdict et ses signaux operateur.</p>
              </div>
              <span className={styles.badge}>{runs.length}</span>
            </div>
            <div className={styles.list}>
              {runs.length === 0 ? (
                <div className={styles.emptyState}>Aucun run disponible pour le moment.</div>
              ) : (
                runs.map((run) => (
                  <div key={run.runId} className={styles.listItem}>
                    <button
                      type="button"
                      className={`${styles.listButton} ${selectedRunId === run.runId ? styles.listButtonSelected : ''}`}
                      onClick={() => void selectRun(run.runId)}
                    >
                      <div className={styles.listTitleRow}>
                        <span className={styles.titleValue}>{run.runId}</span>
                        <span className={`${styles.badge} ${severityClass(run.severity)}`}>{run.outcome}</span>
                      </div>
                      <div className={styles.kvGrid}>
                        <div className={styles.kv}>
                          <span className={styles.label}>Mode</span>
                          <strong>{run.mode}</strong>
                        </div>
                        <div className={styles.kv}>
                          <span className={styles.label}>Snapshot</span>
                          <strong>{run.snapshotId}</strong>
                        </div>
                        <div className={styles.kv}>
                          <span className={styles.label}>Records</span>
                          <strong>{formatMaybe(run.evidenceRecordCount)}</strong>
                        </div>
                        <div className={styles.kv}>
                          <span className={styles.label}>Principes</span>
                          <strong>{formatMaybe(run.principleCount)}</strong>
                        </div>
                      </div>
                      <div className={styles.chips}>
                        {run.qualityGateReasons.length > 0 ? run.qualityGateReasons.map((reason) => <span key={reason} className={styles.chip}>{reason}</span>) : <span className={styles.chip}>quality gate ok</span>}
                      </div>
                    </button>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Run detail</h2>
                <p className={styles.panelText}>Vision complete du run choisi: stages, couverture, modele et contraintes de publication.</p>
              </div>
              <span className={styles.badge}>{runDetail?.runId ?? 'none'}</span>
            </div>
            {!runDetail ? (
              <div className={styles.emptyState}>Selectionne un run pour afficher son detail.</div>
            ) : (
              <div className={styles.contentStack}>
                <div className={styles.artifactStats}>
                  <div className={styles.kv}><span className={styles.label}>Outcome</span><strong>{runDetail.outcome}</strong></div>
                  <div className={styles.kv}><span className={styles.label}>Final stage</span><strong>{runDetail.finalStage}</strong></div>
                  <div className={styles.kv}><span className={styles.label}>Coverage</span><strong>{formatMaybe(runDetail.coverageRecordCount)}</strong></div>
                  <div className={styles.kv}><span className={styles.label}>Contradictions</span><strong>{runDetail.contradictionCount}</strong></div>
                  <div className={styles.kv}><span className={styles.label}>Model</span><strong>{runDetail.modelRun ? `${runDetail.modelRun.provider}/${runDetail.modelRun.model}` : 'n/a'}</strong></div>
                  <div className={styles.kv}><span className={styles.label}>Latency</span><strong>{formatMaybe(runDetail.modelRun?.latencyMs)}</strong></div>
                </div>
                <div className={styles.stageList}>
                  {runDetail.stageReports.map((stage) => (
                    <div key={stage.stage} className={styles.stageItem}>
                      <div className={styles.stageHead}>
                        <strong>{stage.stage}</strong>
                        <span className={styles.badge}>{stage.status}</span>
                      </div>
                      <div className={styles.panelText}>{stage.message ?? 'n/a'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        </section>

        <section className={styles.readerGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Snapshot library</h2>
                <p className={styles.panelText}>Catalogue des corpus crees. Clique pour lire les artefacts, principes, sources et extractions.</p>
              </div>
              <span className={styles.badge}>{library.entries.length}</span>
            </div>
            <div className={styles.list}>
              {library.entries.length === 0 ? (
                <div className={styles.emptyState}>Aucun snapshot lisible pour le moment.</div>
              ) : (
                library.entries.map((entry) => (
                  <div key={entry.snapshotId} className={styles.listItem}>
                    <button
                      type="button"
                      className={`${styles.listButton} ${selectedSnapshotId === entry.snapshotId ? styles.listButtonSelected : ''}`}
                      onClick={() => void selectSnapshot(entry.snapshotId)}
                    >
                      <div className={styles.listTitleRow}>
                        <span className={styles.titleValue}>{entry.snapshotId}</span>
                        <span className={`${styles.badge} ${severityClass(entry.severity)}`}>{entry.artifactState}</span>
                      </div>
                      <div className={styles.kvGrid}>
                        <div className={styles.kv}><span className={styles.label}>Outcome</span><strong>{entry.outcome}</strong></div>
                        <div className={styles.kv}><span className={styles.label}>Promoted</span><strong>{formatMaybe(entry.promotedAt)}</strong></div>
                        <div className={styles.kv}><span className={styles.label}>Records</span><strong>{formatMaybe(entry.evidenceRecordCount)}</strong></div>
                        <div className={styles.kv}><span className={styles.label}>Principes</span><strong>{formatMaybe(entry.principleCount)}</strong></div>
                      </div>
                      <div className={styles.chips}>
                        {entry.coveredTags.length > 0 ? entry.coveredTags.slice(0, 4).map((tag) => <span key={tag} className={styles.chip}>{tag}</span>) : <span className={styles.chip}>aucun tag derive</span>}
                      </div>
                    </button>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className={styles.readerCard}>
            <div className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Corpus reader</h2>
                <p className={styles.panelText}>Lecture du snapshot: metadata, quality gate, principes retenus, evidences sources et bible curee.</p>
              </div>
              <span className={styles.badge}>{libraryDetail?.entry.snapshotId ?? 'none'}</span>
            </div>
            {!libraryDetail || !snapshotDetail ? (
              <div className={styles.emptyState}>Selectionne un snapshot pour ouvrir son corpus.</div>
            ) : (
              <div className={`${styles.contentStack} ${styles.scroll}`}>
                <section className={styles.readerSection}>
                  <div className={styles.readerHead}>
                    <strong>Snapshot metadata</strong>
                    <span className={`${styles.badge} ${severityClass(snapshotDetail.severity)}`}>{snapshotDetail.artifactState}</span>
                  </div>
                  <div className={styles.artifactStats}>
                    <div className={styles.kv}><span className={styles.label}>Run</span><strong>{libraryDetail.entry.runId}</strong></div>
                    <div className={styles.kv}><span className={styles.label}>Generated</span><strong>{formatMaybe(snapshotDetail.generatedAt)}</strong></div>
                    <div className={styles.kv}><span className={styles.label}>Promoted</span><strong>{formatMaybe(snapshotDetail.promotedAt)}</strong></div>
                    <div className={styles.kv}><span className={styles.label}>Age</span><strong>{formatMaybe(snapshotDetail.snapshotAgeHours)}h</strong></div>
                    <div className={styles.kv}><span className={styles.label}>Coverage</span><strong>{formatMaybe(snapshotDetail.coverageRecordCount)}</strong></div>
                    <div className={styles.kv}><span className={styles.label}>Contradictions</span><strong>{snapshotDetail.contradictionCount}</strong></div>
                  </div>
                  <div className={styles.chips}>
                    {snapshotDetail.sourceDomains.map((domain) => <span key={domain} className={styles.chip}>{domain}</span>)}
                  </div>
                </section>

                <section className={styles.readerSection}>
                  <div className={styles.readerHead}>
                    <strong>Discovery and ranking</strong>
                    <span className={styles.badge}>
                      {libraryDetail.discovery ? `${libraryDetail.discovery.totalQueries} queries` : 'no telemetry'}
                    </span>
                  </div>
                  <div className={styles.artifactStats}>
                    <div className={styles.kv}><span className={styles.label}>Selected</span><strong>{formatMaybe(libraryDetail.ranking?.selectedRecordCount)}</strong></div>
                    <div className={styles.kv}><span className={styles.label}>Rejected</span><strong>{formatMaybe(libraryDetail.ranking?.rejectedRecordCount)}</strong></div>
                    <div className={styles.kv}><span className={styles.label}>Top records</span><strong>{formatMaybe(libraryDetail.ranking?.topRecordIds.length)}</strong></div>
                  </div>
                  <div className={styles.chips}>
                    {libraryDetail.discovery?.coverageGaps.map((gap) => (
                      <span key={gap.topicKey} className={styles.chip}>
                        {gap.topicLabel}:{' '}{gap.status}
                      </span>
                    )) ?? <span className={styles.chip}>Aucun gap</span>}
                  </div>
                </section>

                <section className={styles.readerSection}>
                  <div className={styles.readerHead}>
                    <strong>Connector diagnostics</strong>
                    <span className={styles.badge}>{libraryDetail.connectorSummaries.length}</span>
                  </div>
                  <div className={styles.contentStack}>
                    {libraryDetail.connectorSummaries.map((summary) => (
                      <div key={`${summary.source}-${summary.nextCursor ?? 'none'}`} className={styles.stageItem}>
                        <div className={styles.stageHead}>
                          <strong>{summary.source}</strong>
                          <span className={styles.badge}>
                            raw {formatMaybe(summary.rawResults)} / kept {summary.recordsFetched}
                          </span>
                        </div>
                        <div className={styles.panelText}>
                          attempts {summary.attempts} · skipped {summary.recordsSkipped} · cursor {formatMaybe(summary.nextCursor)}
                        </div>
                        <div className={styles.chips}>
                          <span className={styles.chip}>domain {summary.skipReasons?.disallowedDomain ?? 0}</span>
                          <span className={styles.chip}>stale {summary.skipReasons?.stalePublication ?? 0}</span>
                          <span className={styles.chip}>seen {summary.skipReasons?.alreadySeen ?? 0}</span>
                          <span className={styles.chip}>invalid-url {summary.skipReasons?.invalidUrl ?? 0}</span>
                        </div>
                        {summary.error ? <div className={styles.panelText}>{summary.error.message}</div> : null}
                      </div>
                    ))}
                  </div>
                </section>

                <section className={styles.readerSection}>
                  <div className={styles.readerHead}>
                    <strong>Principes retenus</strong>
                    <span className={styles.badge}>{libraryDetail.principles.length}</span>
                  </div>
                  <div className={styles.contentStack}>
                    {libraryDetail.principles.map((principle) => (
                      <div key={principle.id} className={styles.stageItem}>
                        <div className={styles.stageHead}>
                          <strong>{principle.title}</strong>
                          <span className={styles.badge}>{principle.guardrail}</span>
                        </div>
                        <div className={styles.panelText}>{principle.summaryFr}</div>
                        <div className={styles.panelText}>{principle.guidanceFr}</div>
                        <div className={styles.chips}>
                          <span className={styles.chip}>{principle.evidenceLevel}</span>
                          {principle.provenanceRecordIds.map((recordId) => <span key={recordId} className={styles.chip}>{recordId}</span>)}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className={styles.readerSection}>
                  <div className={styles.readerHead}>
                    <strong>Sources retenues</strong>
                    <span className={styles.badge}>{libraryDetail.sources.length}</span>
                  </div>
                  <div className={styles.contentStack}>
                    {libraryDetail.sources.map((source) => (
                      <div key={source.id} className={styles.stageItem}>
                        <div className={styles.stageHead}>
                          <strong>{source.title}</strong>
                          <span className={styles.badge}>{source.sourceType}</span>
                        </div>
                        <div className={styles.panelText}>{source.summaryEn}</div>
                        <div className={styles.chips}>
                          <span className={styles.chip}>{source.sourceDomain}</span>
                          <span className={styles.chip}>published {formatMaybe(source.publishedAt)}</span>
                          {source.tags.map((tag) => <span key={tag} className={styles.chip}>{tag}</span>)}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className={styles.readerSection}>
                  <div className={styles.readerHead}>
                    <strong>Study extractions</strong>
                    <span className={styles.badge}>{libraryDetail.studyExtractions.length}</span>
                  </div>
                  <div className={styles.contentStack}>
                    {libraryDetail.studyExtractions.map((extraction) => (
                      <div key={extraction.recordId} className={styles.stageItem}>
                        <div className={styles.stageHead}>
                          <strong>{extraction.recordId}</strong>
                          <span className={styles.badge}>{extraction.topicKeys.join(', ') || 'no-topic'}</span>
                        </div>
                        <div className={styles.panelText}>Population: {formatMaybe(extraction.population)}</div>
                        <div className={styles.panelText}>Intervention: {formatMaybe(extraction.intervention)}</div>
                        <div className={styles.chips}>
                          {extraction.outcomes.map((value) => <span key={value} className={styles.chip}>{value}</span>)}
                          {extraction.safetySignals.map((value) => <span key={value} className={styles.chip}>{value}</span>)}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className={styles.readerSection}>
                  <div className={styles.readerHead}>
                    <strong>Knowledge bible</strong>
                    <span className={styles.badge}>{libraryDetail.knowledgeBible?.principles.length ?? 0}</span>
                  </div>
                  {!libraryDetail.knowledgeBible ? (
                    <div className={styles.emptyState}>Aucune bible curee disponible sur ce snapshot.</div>
                  ) : (
                    <div className={styles.contentStack}>
                      {libraryDetail.knowledgeBible.principles.map((principle) => (
                        <div key={principle.id} className={styles.stageItem}>
                          <div className={styles.stageHead}>
                            <strong>{principle.title}</strong>
                            <span className={styles.badge}>{principle.guardrail}</span>
                          </div>
                          <div className={styles.panelText}>{principle.description}</div>
                          <div className={styles.chips}>
                            {principle.tags.map((tag) => <span key={tag} className={styles.chip}>{tag}</span>)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </article>
        </section>
      </div>
    </div>
  );
}
