import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { WorkerCorpusDeliverablesResponse } from '@/lib/program/contracts';
import { parseWorkerCorpusDeliverablesResponse } from '@/lib/program/contracts';
import {
  parsePublishedDoctrineSnapshot,
  parseQuestionSynthesisDossier,
  parseValidatedSynthesis,
} from '../../../scripts/adaptive-knowledge/contracts';
import { loadWorkerCorpusSupervision } from './worker-corpus-supervision';

const DEFAULT_ROOT_DIR = path.join(process.cwd(), '.planning', 'knowledge', 'adaptive-coaching');

type Input = {
  knowledgeRootDir?: string;
  now?: Date;
};

async function readJson(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

async function readActivePointer(knowledgeRootDir: string): Promise<{ snapshotId: string; snapshotDir: string; promotedAt: string | null } | null> {
  const raw = (await readJson(path.join(knowledgeRootDir, 'active.json'))) as {
    snapshotId?: string;
    snapshotDir?: string;
    promotedAt?: string | null;
  } | null;
  if (!raw?.snapshotId || !raw?.snapshotDir) {
    return null;
  }
  return {
    snapshotId: raw.snapshotId,
    snapshotDir: raw.snapshotDir,
    promotedAt: typeof raw.promotedAt === 'string' ? raw.promotedAt : null,
  };
}

async function fileAvailable(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadWorkerCorpusDeliverables(input: Input = {}): Promise<WorkerCorpusDeliverablesResponse> {
  const now = input.now ?? new Date();
  const knowledgeRootDir = input.knowledgeRootDir ?? DEFAULT_ROOT_DIR;
  const activePointer = await readActivePointer(knowledgeRootDir);

  if (!activePointer) {
    return parseWorkerCorpusDeliverablesResponse({
      generatedAt: now.toISOString(),
      source: {
        snapshotId: null,
        runId: null,
        generatedAt: null,
        promotedAt: null,
        artifactState: null,
        severity: null,
        qualityGateReasons: [],
      },
      doctrine: [],
      questions: [],
      studyExtractions: [],
      artifacts: {
        booklet: { available: false },
        knowledgeBible: { available: false },
        validatedSynthesis: { available: false },
        runReport: { available: false },
        snapshot: { available: false },
      },
      emptyReason: 'no-active-snapshot',
    });
  }

  const snapshotDir = activePointer.snapshotDir;
  const [runReportRaw, manifestRaw, validatedRaw, doctrineRaw, dossiersRaw, sourcesRaw, supervision] = await Promise.all([
    readJson(path.join(snapshotDir, 'run-report.json')),
    readJson(path.join(snapshotDir, 'manifest.json')),
    readJson(path.join(snapshotDir, 'validated-synthesis.json')),
    readJson(path.join(knowledgeRootDir, 'registry', 'published-doctrine.json')),
    readJson(path.join(knowledgeRootDir, 'registry', 'question-synthesis-dossiers.json')),
    readJson(path.join(snapshotDir, 'sources.json')),
    loadWorkerCorpusSupervision({ knowledgeRootDir, now }).catch(() => null),
  ]);

  const runReport = runReportRaw as { runId?: string; stageReports?: Array<{ stage?: string; message?: string | null }> } | null;
  const manifest = manifestRaw as { generatedAt?: string; evidenceRecordCount?: number; principleCount?: number } | null;
  const validated = validatedRaw ? parseValidatedSynthesis(validatedRaw) : null;
  const doctrineSnapshot = doctrineRaw ? parsePublishedDoctrineSnapshot(doctrineRaw) : { principles: [] };
  const questionDossiers = Array.isArray(dossiersRaw) ? dossiersRaw.map((item) => parseQuestionSynthesisDossier(item)) : [];
  const sourceRecords = ((sourcesRaw as { records?: Array<{ id?: string; title?: string }> } | null)?.records ?? []).map((item) => ({
    id: typeof item.id === 'string' ? item.id : null,
    title: typeof item.title === 'string' ? item.title : null,
  }));

  const doctrine = doctrineSnapshot.principles.slice(0, 5).map((item) => ({
    principleId: item.principleId,
    statementFr: item.statementFr,
    confidenceLevel: item.confidenceLevel,
    conditionsFr: item.conditionsFr,
    limitsFr: item.limitsFr,
    questionIds: item.questionIds,
    publishedAt: item.publishedAt,
  }));

  const questions = (supervision?.questions.notableQuestions ?? []).slice(0, 5).map((question) => ({
    questionId: question.questionId,
    label: question.label,
    coverageStatus: question.coverageStatus,
    publicationStatus: question.publicationStatus,
    publicationReadiness: question.publicationReadiness,
    linkedStudyCount: question.linkedStudyCount,
    contradictionCount: question.contradictionCount,
    summaryFr: questionDossiers.find((item) => item.questionId === question.questionId)?.summaryFr ?? null,
    updatedAt: question.updatedAt,
  }));

  const studyExtractions = (validated?.studyExtractions ?? []).slice(0, 5).map((extraction) => ({
    recordId: extraction.recordId,
    topicKey: extraction.topicKeys[0] ?? null,
    title: sourceRecords.find((record) => record.id === extraction.recordId)?.title ?? null,
    applicationContext: extraction.applicationContext ?? null,
    intervention: extraction.intervention ?? null,
    population: extraction.population ?? null,
    takeaway: extraction.evidenceSignals[0] ?? extraction.outcomes[0] ?? null,
  }));

  const publishMessage = runReport?.stageReports?.find((stage) => stage.stage === 'publish')?.message ?? null;
  const qualityGateReasons = typeof publishMessage === 'string' && publishMessage.startsWith('blocked:')
    ? publishMessage.replace(/^blocked:/, '').split(',').map((item) => item.trim()).filter(Boolean)
    : [];

  return parseWorkerCorpusDeliverablesResponse({
    generatedAt: now.toISOString(),
    source: {
      snapshotId: activePointer.snapshotId,
      runId: typeof runReport?.runId === 'string' ? runReport.runId : activePointer.snapshotId,
      generatedAt: typeof manifest?.generatedAt === 'string' ? manifest.generatedAt : null,
      promotedAt: activePointer.promotedAt,
      artifactState: 'validated',
      severity: qualityGateReasons.length > 0 ? 'degraded' : 'healthy',
      qualityGateReasons,
    },
    doctrine,
    questions,
    studyExtractions,
    artifacts: {
      booklet: { available: await fileAvailable(path.join(snapshotDir, 'booklet-fr.md')) },
      knowledgeBible: { available: await fileAvailable(path.join(snapshotDir, 'knowledge-bible.json')) },
      validatedSynthesis: { available: await fileAvailable(path.join(snapshotDir, 'validated-synthesis.json')) },
      runReport: { available: await fileAvailable(path.join(snapshotDir, 'run-report.json')) },
      snapshot: { available: true },
    },
    emptyReason: doctrine.length === 0 && questions.length === 0 && studyExtractions.length === 0 ? 'no-deliverables' : 'none',
  });
}
