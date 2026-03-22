import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  WorkerCorpusLibraryDetail,
  WorkerCorpusLibraryEntry,
  WorkerCorpusLibraryResponse,
  WorkerCorpusOverviewSection,
  WorkerCorpusOverviewResponse,
  WorkerCorpusRunDetail,
  WorkerCorpusRunRow,
  WorkerCorpusRunsResponse,
  WorkerCorpusStatusResponse,
  WorkerCorpusSnapshotDetail,
} from '@/lib/program/contracts';
import {
  parseWorkerCorpusLibraryDetail,
  parseWorkerCorpusLibraryResponse,
  parseWorkerCorpusOverviewResponse,
  parseWorkerCorpusOverviewSection,
  parseWorkerCorpusRunDetail,
  parseWorkerCorpusRunsResponse,
  parseWorkerCorpusSnapshotDetail,
  parseWorkerCorpusStatusResponse,
} from '@/lib/program/contracts';
import {
  parseAdaptiveKnowledgeDiscoveryTelemetry,
  parseAdaptiveKnowledgeRankingTelemetry,
  parseCorpusRunReport,
  parseCorpusSnapshotManifest,
  parseNormalizedEvidenceRecord,
  parseValidatedSynthesis,
  type AdaptiveKnowledgeDiscoveryTelemetry,
  type AdaptiveKnowledgeRankingTelemetry,
  type CorpusRunReport,
  type CorpusSnapshotManifest,
  type NormalizedEvidenceRecord,
  type StructuredStudyExtraction,
  type ValidatedSynthesis,
} from '../../../scripts/adaptive-knowledge/contracts';
import type { CuratedKnowledgeBible } from '../../../scripts/adaptive-knowledge/curation';
import { readAdaptiveKnowledgeWorkerState } from '../../../scripts/adaptive-knowledge/worker-state';
import { loadWorkerCorpusLiveRun } from '../services/worker-corpus-live-run';
import { readWorkerControlState } from './worker-control';

type Pointer = {
  snapshotId: string;
  snapshotDir: string;
  promotedAt: string | null;
};

type Severity = WorkerCorpusRunRow['severity'];

type ArtifactState = 'candidate' | 'validated';

type SnapshotArtifacts = {
  snapshotId: string;
  artifactState: ArtifactState;
  snapshotDir: string;
  runReport: CorpusRunReport;
  manifest: CorpusSnapshotManifest | null;
  validatedSynthesis: ValidatedSynthesis | null;
  diff: {
    previousSnapshotId: string | null;
    currentSnapshotId: string;
    evidenceRecordDelta: number;
    principleDelta: number;
  } | null;
};

type SourcesArtifact = {
  records: NormalizedEvidenceRecord[];
  discovery: AdaptiveKnowledgeDiscoveryTelemetry | null;
  ranking: AdaptiveKnowledgeRankingTelemetry | null;
  connectorSummaries: Array<{
    source: string;
    skipped: boolean;
    attempts: number;
    rawResults: number | null;
    recordsFetched: number;
    recordsSkipped: number;
    nextCursor: string | null;
    skipReasons: {
      disallowedDomain: number;
      stalePublication: number;
      alreadySeen: number;
      invalidUrl: number;
      offTopic: number;
    } | null;
    error: {
      message: string;
      attempts: number;
    } | null;
  }>;
};

type WorkerCorpusDashboardInput = {
  knowledgeRootDir?: string;
  now?: Date;
};

const DEFAULT_ROOT_DIR = path.join(process.cwd(), '.planning', 'knowledge', 'adaptive-coaching');

function round1(value: number): number {
  return Number(value.toFixed(1));
}

function hoursBetween(now: Date, iso: string | null): number | null {
  if (!iso) {
    return null;
  }

  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return round1(Math.max(0, (now.getTime() - parsed) / 3_600_000));
}

function parseBlockedReasons(message: string | undefined): string[] {
  if (!message?.startsWith('blocked:')) {
    return [];
  }

  return message
    .slice('blocked:'.length)
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function deriveRunOutcome(report: CorpusRunReport): WorkerCorpusRunRow['outcome'] {
  const publishStage = report.stageReports.find((stage) => stage.stage === 'publish');
  if (publishStage?.message?.startsWith('progressing:')) {
    return 'running';
  }
  if (publishStage?.status === 'succeeded') {
    return 'succeeded';
  }
  if (publishStage?.message === 'check-mode-no-publish') {
    return 'succeeded';
  }
  if (publishStage?.message?.startsWith('blocked:')) {
    return 'blocked';
  }
  if (report.stageReports.some((stage) => stage.status === 'failed')) {
    return 'failed';
  }

  return 'running';
}

function deriveSeverityForRun(report: CorpusRunReport): Severity {
  const publishStage = report.stageReports.find((stage) => stage.stage === 'publish');
  if (report.stageReports.some((stage) => stage.status === 'failed')) {
    return 'critical';
  }
  if (publishStage?.message?.startsWith('progressing:')) {
    return 'healthy';
  }
  if (publishStage?.message?.startsWith('blocked:')) {
    return 'degraded';
  }
  return 'healthy';
}

function deriveLiveSeverity(input: {
  state: Awaited<ReturnType<typeof readAdaptiveKnowledgeWorkerState>>;
  now: Date;
}): Severity {
  const state = input.state;
  if (!state) {
    return 'degraded';
  }
  if (state.status === 'failed' || state.status === 'blocked-by-lease' || state.status === 'stale') {
    return 'critical';
  }
  if (Date.parse(state.leaseExpiresAt) <= input.now.getTime()) {
    return 'degraded';
  }
  return 'healthy';
}

function deriveLiveState(
  state: Awaited<ReturnType<typeof readAdaptiveKnowledgeWorkerState>>,
  now: Date,
): WorkerCorpusOverviewResponse['live'] {
  if (!state) {
    return {
      state: 'idle',
      severity: 'degraded',
      runId: null,
      mode: null,
      startedAt: null,
      heartbeatAt: null,
      leaseExpiresAt: null,
      message: null,
      isHeartbeatStale: false,
    };
  }

  const leaseExpiresAtMs = Date.parse(state.leaseExpiresAt);
  const isHeartbeatStale = !Number.isNaN(leaseExpiresAtMs) && leaseExpiresAtMs <= now.getTime();

  return {
    state: state.status,
    severity: deriveLiveSeverity({ state, now }),
    runId: state.runId,
    mode: state.mode,
    startedAt: state.startedAt,
    heartbeatAt: state.heartbeatAt,
    leaseExpiresAt: state.leaseExpiresAt,
    message: state.message ?? null,
    isHeartbeatStale,
  };
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function readPointer(filePath: string): Promise<Pointer | null> {
  const raw = await readJson<Record<string, unknown>>(filePath);
  if (!raw || typeof raw.snapshotId !== 'string' || typeof raw.snapshotDir !== 'string') {
    return null;
  }

  return {
    snapshotId: raw.snapshotId,
    snapshotDir: raw.snapshotDir,
    promotedAt: typeof raw.promotedAt === 'string' ? raw.promotedAt : null,
  };
}

async function readValidatedSynthesisArtifact(snapshotDir: string): Promise<ValidatedSynthesis | null> {
  const raw = await readJson<Record<string, unknown>>(path.join(snapshotDir, 'validated-synthesis.json'));
  if (!raw) {
    return null;
  }

  try {
    return parseValidatedSynthesis({
      principles: raw.principles,
      studyExtractions: raw.studyExtractions,
      rejectedClaims: raw.rejectedClaims,
      coverage: raw.coverage,
      contradictions: raw.contradictions,
      modelRun: raw.modelRun,
    });
  } catch {
    return null;
  }
}

async function readSourcesArtifact(snapshotDir: string): Promise<SourcesArtifact | null> {
  const raw = await readJson<Record<string, unknown>>(path.join(snapshotDir, 'sources.json'));
  if (!raw) {
    return null;
  }

  const records = Array.isArray(raw.records)
    ? raw.records
        .map((record) => {
          try {
            return parseNormalizedEvidenceRecord(record);
          } catch {
            return null;
          }
        })
        .filter((record): record is NormalizedEvidenceRecord => record !== null)
    : [];

  let discovery: AdaptiveKnowledgeDiscoveryTelemetry | null = null;
  if (raw.discovery) {
    try {
      discovery = parseAdaptiveKnowledgeDiscoveryTelemetry(raw.discovery);
    } catch {
      discovery = null;
    }
  }

  let ranking: AdaptiveKnowledgeRankingTelemetry | null = null;
  if (raw.ranking) {
    try {
      ranking = parseAdaptiveKnowledgeRankingTelemetry(raw.ranking);
    } catch {
      ranking = null;
    }
  }

  return {
    records,
    discovery,
    ranking,
    connectorSummaries: Array.isArray(raw.sources)
      ? raw.sources
          .map((source) => {
            if (!source || typeof source !== 'object') {
              return null;
            }

            const candidate = source as Record<string, unknown>;
            const telemetry =
              candidate.telemetry && typeof candidate.telemetry === 'object'
                ? (candidate.telemetry as Record<string, unknown>)
                : {};
            const skipReasons =
              telemetry.skipReasons && typeof telemetry.skipReasons === 'object'
                ? (telemetry.skipReasons as Record<string, unknown>)
                : null;
            const error =
              candidate.error && typeof candidate.error === 'object'
                ? (candidate.error as Record<string, unknown>)
                : null;

            return {
              source: typeof candidate.source === 'string' ? candidate.source : 'unknown',
              skipped: Boolean(candidate.skipped),
              attempts: typeof telemetry.attempts === 'number' ? telemetry.attempts : 0,
              rawResults: typeof telemetry.rawResults === 'number' ? telemetry.rawResults : null,
              recordsFetched: typeof candidate.recordsFetched === 'number' ? candidate.recordsFetched : 0,
              recordsSkipped: typeof candidate.recordsSkipped === 'number' ? candidate.recordsSkipped : 0,
              nextCursor: typeof telemetry.nextCursor === 'string' ? telemetry.nextCursor : null,
              skipReasons: skipReasons
                ? {
                    disallowedDomain:
                      typeof skipReasons.disallowedDomain === 'number' ? skipReasons.disallowedDomain : 0,
                    stalePublication:
                      typeof skipReasons.stalePublication === 'number' ? skipReasons.stalePublication : 0,
                    alreadySeen: typeof skipReasons.alreadySeen === 'number' ? skipReasons.alreadySeen : 0,
                    invalidUrl: typeof skipReasons.invalidUrl === 'number' ? skipReasons.invalidUrl : 0,
                    offTopic: typeof skipReasons.offTopic === 'number' ? skipReasons.offTopic : 0,
                  }
                : null,
              error: error
                ? {
                    message: typeof error.message === 'string' ? error.message : 'unknown',
                    attempts: typeof error.attempts === 'number' ? error.attempts : 0,
                  }
                : null,
            };
          })
          .filter((summary): summary is SourcesArtifact['connectorSummaries'][number] => summary !== null)
      : [],
  };
}

async function readKnowledgeBibleArtifact(snapshotDir: string): Promise<CuratedKnowledgeBible | null> {
  const raw = await readJson<CuratedKnowledgeBible>(path.join(snapshotDir, 'knowledge-bible.json'));
  return raw ?? null;
}

async function readSnapshotArtifacts(
  snapshotDir: string,
  snapshotId: string,
  artifactState: ArtifactState,
): Promise<SnapshotArtifacts | null> {
  const runReportRaw = await readJson<unknown>(path.join(snapshotDir, 'run-report.json'));
  if (!runReportRaw) {
    return null;
  }

  let runReport: CorpusRunReport;
  try {
    runReport = parseCorpusRunReport(runReportRaw);
  } catch {
    return null;
  }

  const manifestRaw = await readJson<unknown>(path.join(snapshotDir, 'manifest.json'));
  const manifest = manifestRaw ? safeParseManifest(manifestRaw) : null;
  const validatedSynthesis = await readValidatedSynthesisArtifact(snapshotDir);
  const diff = await readJson<SnapshotArtifacts['diff']>(path.join(snapshotDir, 'diff.json'));

  return {
    snapshotId,
    artifactState,
    snapshotDir,
    runReport,
    manifest,
    validatedSynthesis,
    diff,
  };
}

function safeParseManifest(raw: unknown): CorpusSnapshotManifest | null {
  try {
    return parseCorpusSnapshotManifest(raw);
  } catch {
    return null;
  }
}

function buildLibraryEntry(
  artifact: SnapshotArtifacts,
  pointers: { active: Pointer | null; rollback: Pointer | null },
): WorkerCorpusLibraryEntry {
  return {
    snapshotId: artifact.snapshotId,
    runId: artifact.runReport.runId,
    mode: artifact.runReport.mode,
    artifactState: artifact.artifactState,
    outcome: deriveRunOutcome(artifact.runReport),
    severity: deriveSeverityForRun(artifact.runReport),
    generatedAt: artifact.manifest?.generatedAt ?? null,
    promotedAt: pointers.active?.snapshotId === artifact.snapshotId ? pointers.active.promotedAt : null,
    evidenceRecordCount: artifact.manifest?.evidenceRecordCount ?? artifact.validatedSynthesis?.coverage.recordCount ?? null,
    principleCount: artifact.manifest?.principleCount ?? artifact.validatedSynthesis?.principles.length ?? null,
    contradictionCount: artifact.validatedSynthesis?.contradictions.length ?? 0,
    sourceDomains: artifact.manifest?.sourceDomains ?? artifact.validatedSynthesis?.coverage.sourceDomains ?? [],
    coveredTags: artifact.validatedSynthesis?.coverage.coveredTags ?? [],
    qualityGateReasons: parseBlockedReasons(
      artifact.runReport.stageReports.find((stage) => stage.stage === 'publish')?.message,
    ),
    isActiveSnapshot: pointers.active?.snapshotId === artifact.snapshotId,
    isRollbackSnapshot: pointers.rollback?.snapshotId === artifact.snapshotId,
  };
}

async function listSnapshotArtifacts(knowledgeRootDir: string): Promise<SnapshotArtifacts[]> {
  const snapshotsRoot = path.join(knowledgeRootDir, 'snapshots');
  let snapshotIds: string[] = [];
  try {
    const entries = await readdir(snapshotsRoot, { withFileTypes: true });
    snapshotIds = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }

  const artifacts = await Promise.all(
    snapshotIds.map(async (snapshotId) => {
      const validatedDir = path.join(snapshotsRoot, snapshotId, 'validated');
      const candidateDir = path.join(snapshotsRoot, snapshotId, 'candidate');
      const validated = await readSnapshotArtifacts(validatedDir, snapshotId, 'validated');
      if (validated) {
        return validated;
      }
      return readSnapshotArtifacts(candidateDir, snapshotId, 'candidate');
    }),
  );

  return artifacts.filter((artifact): artifact is SnapshotArtifacts => artifact !== null);
}

function buildRunRow(
  artifact: SnapshotArtifacts,
  pointers: { active: Pointer | null; rollback: Pointer | null },
): WorkerCorpusRunRow {
  const finalStage = artifact.runReport.stageReports[artifact.runReport.stageReports.length - 1]!;
  const qualityGateReasons = parseBlockedReasons(
    artifact.runReport.stageReports.find((stage) => stage.stage === 'publish')?.message,
  );

  return {
    runId: artifact.runReport.runId,
    snapshotId: artifact.runReport.snapshotId,
    mode: artifact.runReport.mode,
    startedAt: artifact.runReport.startedAt,
    completedAt: artifact.runReport.completedAt,
    artifactState: artifact.artifactState,
    outcome: deriveRunOutcome(artifact.runReport),
    severity: deriveSeverityForRun(artifact.runReport),
    finalStage: finalStage.stage,
    finalMessage: finalStage.message ?? null,
    evidenceRecordCount: artifact.manifest?.evidenceRecordCount ?? artifact.validatedSynthesis?.coverage.recordCount ?? null,
    principleCount: artifact.manifest?.principleCount ?? artifact.validatedSynthesis?.principles.length ?? null,
    sourceDomains: artifact.manifest?.sourceDomains ?? artifact.validatedSynthesis?.coverage.sourceDomains ?? [],
    qualityGateReasons,
    isActiveSnapshot: pointers.active?.snapshotId === artifact.snapshotId,
    isRollbackSnapshot: pointers.rollback?.snapshotId === artifact.snapshotId,
  };
}

function sortNewestFirst<T extends { startedAt?: string | null; generatedAt?: string | null }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    const leftTime = Date.parse(left.startedAt ?? left.generatedAt ?? '') || 0;
    const rightTime = Date.parse(right.startedAt ?? right.generatedAt ?? '') || 0;
    return rightTime - leftTime;
  });
}

function derivePublicationSeverity(input: {
  activePointer: Pointer | null;
  activeArtifact: SnapshotArtifacts | null;
  snapshotAgeHours: number | null;
}): Severity {
  if (!input.activePointer || !input.activeArtifact) {
    return 'degraded';
  }

  const publishStageMessage = input.activeArtifact.runReport.stageReports.find(
    (stage) => stage.stage === 'publish',
  )?.message;
  if (parseBlockedReasons(publishStageMessage).length > 0) {
    return 'degraded';
  }

  if ((input.snapshotAgeHours ?? 0) >= 72) {
    return 'critical';
  }

  if ((input.snapshotAgeHours ?? 0) >= 24) {
    return 'degraded';
  }

  return 'healthy';
}

export async function loadWorkerCorpusOverview(
  input: WorkerCorpusDashboardInput = {},
): Promise<WorkerCorpusOverviewSection> {
  const knowledgeRootDir = input.knowledgeRootDir ?? DEFAULT_ROOT_DIR;
  const now = input.now ?? new Date();

  try {
    const [workerState, controlState, liveRun, activePointer, rollbackPointer, snapshotArtifacts] = await Promise.all([
      readAdaptiveKnowledgeWorkerState(knowledgeRootDir),
      readWorkerControlState({ knowledgeRootDir, now }),
      loadWorkerCorpusLiveRun({ knowledgeRootDir, now }),
      readPointer(path.join(knowledgeRootDir, 'active.json')),
      readPointer(path.join(knowledgeRootDir, 'rollback.json')),
      listSnapshotArtifacts(knowledgeRootDir),
    ]);

    if (!workerState && !activePointer && snapshotArtifacts.length === 0 && controlState.state === 'idle') {
      return parseWorkerCorpusOverviewSection({ status: 'empty' });
    }

    const recentRuns = sortNewestFirst(
      snapshotArtifacts.map((artifact) =>
        buildRunRow(artifact, {
          active: activePointer,
          rollback: rollbackPointer,
        }),
      ),
    ).slice(0, 6);

    const activeArtifact = activePointer
      ? snapshotArtifacts.find((artifact) => artifact.snapshotId === activePointer.snapshotId) ?? null
      : null;
    const snapshotAgeHours = hoursBetween(now, activePointer?.promotedAt ?? null);
    const lastRunAgeHours = hoursBetween(now, recentRuns[0]?.completedAt ?? null);

    const overview = parseWorkerCorpusOverviewResponse({
      generatedAt: now.toISOString(),
      operatorMode: controlState.state === 'paused' ? 'paused' : 'running',
      operatorUpdatedAt: controlState.pauseRequestedAt ?? controlState.startedAt ?? controlState.stoppedAt ?? null,
      runActive: Boolean(workerState) && (deriveLiveState(workerState, now).state === 'started' || deriveLiveState(workerState, now).state === 'heartbeat'),
      control: controlState,
      live: deriveLiveState(workerState, now),
      liveRun,
      publication: {
        severity: derivePublicationSeverity({
          activePointer,
          activeArtifact,
          snapshotAgeHours,
        }),
        activeSnapshotId: activePointer?.snapshotId ?? null,
        activeSnapshotDir: activePointer?.snapshotDir ?? null,
        promotedAt: activePointer?.promotedAt ?? null,
        rollbackSnapshotId: rollbackPointer?.snapshotId ?? null,
        rollbackSnapshotDir: rollbackPointer?.snapshotDir ?? null,
        rollbackAvailable: Boolean(rollbackPointer),
        snapshotAgeHours,
        evidenceRecordCount: activeArtifact?.manifest?.evidenceRecordCount ?? null,
        principleCount: activeArtifact?.manifest?.principleCount ?? null,
        sourceDomains: activeArtifact?.manifest?.sourceDomains ?? [],
        qualityGateReasons: activeArtifact
          ? parseBlockedReasons(activeArtifact.runReport.stageReports.find((stage) => stage.stage === 'publish')?.message)
          : [],
        lastRunAgeHours,
      },
      recentRuns,
    });

    return parseWorkerCorpusOverviewSection({
      status: 'ready',
      data: overview,
    });
  } catch {
    return parseWorkerCorpusOverviewSection({
      status: 'error',
    });
  }
}

export async function loadWorkerCorpusStatus(
  input: WorkerCorpusDashboardInput = {},
): Promise<WorkerCorpusStatusResponse | null> {
  const section = await loadWorkerCorpusOverview(input);
  if (section.status !== 'ready') {
    return null;
  }

  return parseWorkerCorpusStatusResponse({
    generatedAt: section.data.generatedAt,
    control: section.data.control,
    live: section.data.live,
    publication: section.data.publication,
  });
}

export async function listWorkerCorpusRuns(
  input: WorkerCorpusDashboardInput & { limit?: number } = {},
): Promise<WorkerCorpusRunsResponse> {
  const section = await loadWorkerCorpusOverview(input);
  if (section.status !== 'ready') {
    return parseWorkerCorpusRunsResponse({
      generatedAt: (input.now ?? new Date()).toISOString(),
      runs: [],
    });
  }

  return parseWorkerCorpusRunsResponse({
    generatedAt: section.data.generatedAt,
    runs: section.data.recentRuns.slice(0, Math.max(1, input.limit ?? 10)),
  });
}

export async function getWorkerCorpusRunDetail(
  runId: string,
  input: WorkerCorpusDashboardInput = {},
): Promise<WorkerCorpusRunDetail | null> {
  const knowledgeRootDir = input.knowledgeRootDir ?? DEFAULT_ROOT_DIR;
  const artifacts = await listSnapshotArtifacts(knowledgeRootDir);
  const activePointer = await readPointer(path.join(knowledgeRootDir, 'active.json'));
  const rollbackPointer = await readPointer(path.join(knowledgeRootDir, 'rollback.json'));
  const artifact = artifacts.find((item) => item.runReport.runId === runId);
  if (!artifact) {
    return null;
  }

  return parseWorkerCorpusRunDetail({
    ...buildRunRow(artifact, { active: activePointer, rollback: rollbackPointer }),
    generatedAt: artifact.manifest?.generatedAt ?? null,
    stageReports: artifact.runReport.stageReports.map((stage) => ({
      ...stage,
      message: stage.message ?? null,
    })),
    modelRun: artifact.validatedSynthesis
      ? {
          provider: artifact.validatedSynthesis.modelRun.provider,
          model: artifact.validatedSynthesis.modelRun.model,
          requestId: artifact.validatedSynthesis.modelRun.requestId,
          latencyMs:
            artifact.validatedSynthesis.modelRun.totalLatencyMs ?? artifact.validatedSynthesis.modelRun.latencyMs ?? null,
        }
      : null,
    contradictionCount: artifact.validatedSynthesis?.contradictions.length ?? 0,
    coverageRecordCount: artifact.validatedSynthesis?.coverage.recordCount ?? null,
  });
}

export async function getWorkerCorpusSnapshotDetail(
  snapshotId: string,
  input: WorkerCorpusDashboardInput = {},
): Promise<WorkerCorpusSnapshotDetail | null> {
  const knowledgeRootDir = input.knowledgeRootDir ?? DEFAULT_ROOT_DIR;
  const now = input.now ?? new Date();
  const artifacts = await listSnapshotArtifacts(knowledgeRootDir);
  const activePointer = await readPointer(path.join(knowledgeRootDir, 'active.json'));
  const rollbackPointer = await readPointer(path.join(knowledgeRootDir, 'rollback.json'));
  const artifact = artifacts.find((item) => item.snapshotId === snapshotId);
  if (!artifact) {
    return null;
  }

  const runSeverity = deriveSeverityForRun(artifact.runReport);

  return parseWorkerCorpusSnapshotDetail({
    snapshotId: artifact.snapshotId,
    artifactState: artifact.artifactState,
    generatedAt: artifact.manifest?.generatedAt ?? null,
    promotedAt: activePointer?.snapshotId === snapshotId ? activePointer.promotedAt : null,
    severity: runSeverity,
    isActiveSnapshot: activePointer?.snapshotId === snapshotId,
    isRollbackSnapshot: rollbackPointer?.snapshotId === snapshotId,
    snapshotAgeHours: hoursBetween(
      now,
      activePointer?.snapshotId === snapshotId ? activePointer.promotedAt : artifact.manifest?.generatedAt ?? null,
    ),
    evidenceRecordCount: artifact.manifest?.evidenceRecordCount ?? null,
    principleCount: artifact.manifest?.principleCount ?? null,
    sourceDomains: artifact.manifest?.sourceDomains ?? [],
    diff: artifact.diff,
    qualityGateReasons: parseBlockedReasons(
      artifact.runReport.stageReports.find((stage) => stage.stage === 'publish')?.message,
    ),
    modelRun: artifact.validatedSynthesis
      ? {
          provider: artifact.validatedSynthesis.modelRun.provider,
          model: artifact.validatedSynthesis.modelRun.model,
          requestId: artifact.validatedSynthesis.modelRun.requestId,
          latencyMs:
            artifact.validatedSynthesis.modelRun.totalLatencyMs ?? artifact.validatedSynthesis.modelRun.latencyMs ?? null,
        }
      : null,
    contradictionCount: artifact.validatedSynthesis?.contradictions.length ?? 0,
    coverageRecordCount: artifact.validatedSynthesis?.coverage.recordCount ?? null,
  });
}

export async function listWorkerCorpusLibrary(
  input: WorkerCorpusDashboardInput = {},
): Promise<WorkerCorpusLibraryResponse> {
  const knowledgeRootDir = input.knowledgeRootDir ?? DEFAULT_ROOT_DIR;
  const now = input.now ?? new Date();
  const [artifacts, activePointer, rollbackPointer] = await Promise.all([
    listSnapshotArtifacts(knowledgeRootDir),
    readPointer(path.join(knowledgeRootDir, 'active.json')),
    readPointer(path.join(knowledgeRootDir, 'rollback.json')),
  ]);

  return parseWorkerCorpusLibraryResponse({
    generatedAt: now.toISOString(),
    entries: sortNewestFirst(
      artifacts.map((artifact) =>
        buildLibraryEntry(artifact, {
          active: activePointer,
          rollback: rollbackPointer,
        }),
      ),
    ),
  });
}

export async function getWorkerCorpusLibraryDetail(
  snapshotId: string,
  input: WorkerCorpusDashboardInput = {},
): Promise<WorkerCorpusLibraryDetail | null> {
  const knowledgeRootDir = input.knowledgeRootDir ?? DEFAULT_ROOT_DIR;
  const [artifacts, activePointer, rollbackPointer] = await Promise.all([
    listSnapshotArtifacts(knowledgeRootDir),
    readPointer(path.join(knowledgeRootDir, 'active.json')),
    readPointer(path.join(knowledgeRootDir, 'rollback.json')),
  ]);
  const artifact = artifacts.find((item) => item.snapshotId === snapshotId);
  if (!artifact) {
    return null;
  }

  const [sourcesArtifact, knowledgeBible] = await Promise.all([
    readSourcesArtifact(artifact.snapshotDir),
    readKnowledgeBibleArtifact(artifact.snapshotDir),
  ]);

  return parseWorkerCorpusLibraryDetail({
    entry: buildLibraryEntry(artifact, { active: activePointer, rollback: rollbackPointer }),
    stageReports: artifact.runReport.stageReports.map((stage) => ({
      ...stage,
      message: stage.message ?? null,
    })),
    principles:
      artifact.validatedSynthesis?.principles.map((principle) => ({
        ...principle,
        targetPopulation: principle.targetPopulation ?? null,
        applicationContext: principle.applicationContext ?? null,
        confidence: principle.confidence ?? null,
      })) ?? [],
    sources:
      sourcesArtifact?.records.map((record) => ({
        id: record.id,
        title: record.title,
        sourceType: record.sourceType,
        sourceDomain: record.sourceDomain,
        sourceUrl: record.sourceUrl ?? null,
        publishedAt: record.publishedAt ?? null,
        summaryEn: record.summaryEn,
        tags: record.tags,
        provenanceIds: record.provenanceIds,
        ranking: record.ranking
          ? {
              compositeScore: record.ranking.compositeScore,
              selected: record.ranking.selected,
              reasons: record.ranking.reasons,
            }
          : null,
      })) ?? [],
    studyExtractions:
      artifact.validatedSynthesis?.studyExtractions.map((extraction: StructuredStudyExtraction) => ({
        ...extraction,
        population: extraction.population ?? null,
        intervention: extraction.intervention ?? null,
        applicationContext: extraction.applicationContext ?? null,
        rejectionReason: extraction.rejectionReason ?? null,
      })) ?? [],
    rejectedClaims: artifact.validatedSynthesis?.rejectedClaims ?? [],
    contradictions: artifact.validatedSynthesis?.contradictions ?? [],
    discovery: sourcesArtifact?.discovery
      ? {
          targetTopicKeys: sourcesArtifact.discovery.targetTopicKeys,
          totalQueries: sourcesArtifact.discovery.totalQueries,
          coverageGaps: sourcesArtifact.discovery.coverageGaps.map((gap) => ({
            topicKey: gap.topicKey,
            topicLabel: gap.topicLabel,
            status: gap.status,
            normalizedRecordCount: gap.normalizedRecordCount,
            fetchedRecordCount: gap.fetchedRecordCount,
          })),
        }
      : null,
    ranking: sourcesArtifact?.ranking ?? null,
    connectorSummaries: sourcesArtifact?.connectorSummaries ?? [],
    knowledgeBible,
  });
}
