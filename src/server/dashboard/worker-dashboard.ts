import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  WorkerCorpusOverviewSection,
  WorkerCorpusOverviewResponse,
  WorkerCorpusRunDetail,
  WorkerCorpusRunRow,
  WorkerCorpusRunsResponse,
  WorkerCorpusStatusResponse,
  WorkerCorpusSnapshotDetail,
} from '@/lib/program/contracts';
import {
  parseWorkerCorpusOverviewResponse,
  parseWorkerCorpusOverviewSection,
  parseWorkerCorpusRunDetail,
  parseWorkerCorpusRunsResponse,
  parseWorkerCorpusSnapshotDetail,
  parseWorkerCorpusStatusResponse,
} from '@/lib/program/contracts';
import {
  parseCorpusRunReport,
  parseCorpusSnapshotManifest,
  parseValidatedSynthesis,
  type CorpusRunReport,
  type CorpusSnapshotManifest,
  type ValidatedSynthesis,
} from '../../../scripts/adaptive-knowledge/contracts';
import { readAdaptiveKnowledgeWorkerState } from '../../../scripts/adaptive-knowledge/worker-state';

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
      rejectedClaims: raw.rejectedClaims,
      coverage: raw.coverage,
      contradictions: raw.contradictions,
      modelRun: raw.modelRun,
    });
  } catch {
    return null;
  }
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

function sortNewestFirst<T extends { startedAt?: string; generatedAt?: string }>(rows: T[]): T[] {
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
    const [workerState, activePointer, rollbackPointer, snapshotArtifacts] = await Promise.all([
      readAdaptiveKnowledgeWorkerState(knowledgeRootDir),
      readPointer(path.join(knowledgeRootDir, 'active.json')),
      readPointer(path.join(knowledgeRootDir, 'rollback.json')),
      listSnapshotArtifacts(knowledgeRootDir),
    ]);

    if (!workerState && !activePointer && snapshotArtifacts.length === 0) {
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
      live: deriveLiveState(workerState, now),
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
