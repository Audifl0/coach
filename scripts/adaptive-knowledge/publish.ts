import { access, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

type SnapshotPointer = {
  snapshotId: string;
  snapshotDir: string;
  promotedAt: string;
};

type PromoteCandidateSnapshotInput = {
  outputRootDir: string;
  snapshotId: string;
  candidateDir: string;
  now: Date;
};

type RollbackCorpusSnapshotInput = {
  outputRootDir: string;
  runId: string;
  now: Date;
  reportPath?: string;
};

export type PromoteCandidateSnapshotResult = {
  activePointerPath: string;
  rollbackPointerPath: string;
  pointer: SnapshotPointer;
  previousSnapshotId: string | null;
};

export type RollbackCorpusSnapshotResult = {
  restoredSnapshotId: string;
};

async function writeJsonAtomically(targetPath: string, payload: unknown): Promise<void> {
  const tmpPath = `${targetPath.replace(/\.json$/, '')}.tmp.json`;
  await writeFile(tmpPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  await rename(tmpPath, targetPath);
}

async function readJsonIfPresent<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function ensureCandidateArtifactsExist(candidateDir: string): Promise<void> {
  await access(path.join(candidateDir, 'sources.json'));
  await access(path.join(candidateDir, 'principles.json'));
  await access(path.join(candidateDir, 'run-report.json'));
}

function toValidatedSnapshotDir(candidateDir: string): string {
  if (path.basename(candidateDir) === 'candidate') {
    return path.join(path.dirname(candidateDir), 'validated');
  }
  return candidateDir;
}

export async function promoteCandidateSnapshot(
  input: PromoteCandidateSnapshotInput,
): Promise<PromoteCandidateSnapshotResult> {
  await ensureCandidateArtifactsExist(input.candidateDir);

  const activePointerPath = path.join(input.outputRootDir, 'active.json');
  const rollbackPointerPath = path.join(input.outputRootDir, 'rollback.json');
  const currentActive = await readJsonIfPresent<SnapshotPointer>(activePointerPath);

  if (currentActive) {
    await writeJsonAtomically(rollbackPointerPath, currentActive);
  }

  const validatedSnapshotDir = toValidatedSnapshotDir(input.candidateDir);
  if (validatedSnapshotDir !== input.candidateDir) {
    await rename(input.candidateDir, validatedSnapshotDir);
  }

  const pointer: SnapshotPointer = {
    snapshotId: input.snapshotId,
    snapshotDir: validatedSnapshotDir,
    promotedAt: input.now.toISOString(),
  };

  await writeJsonAtomically(activePointerPath, pointer);

  return {
    activePointerPath,
    rollbackPointerPath,
    pointer,
    previousSnapshotId: currentActive?.snapshotId ?? null,
  };
}

export async function rollbackCorpusSnapshot(
  input: RollbackCorpusSnapshotInput,
): Promise<RollbackCorpusSnapshotResult> {
  const activePointerPath = path.join(input.outputRootDir, 'active.json');
  const rollbackPointerPath = path.join(input.outputRootDir, 'rollback.json');
  const rollbackPointer = await readJsonIfPresent<SnapshotPointer>(rollbackPointerPath);
  if (!rollbackPointer) {
    throw new Error('rollback pointer not found');
  }

  await writeJsonAtomically(activePointerPath, {
    ...rollbackPointer,
    promotedAt: input.now.toISOString(),
  });

  if (input.reportPath) {
    const existing = (await readJsonIfPresent<{ runId?: string; events?: Array<Record<string, unknown>> }>(
      input.reportPath,
    )) ?? { runId: input.runId, events: [] };
    const events = Array.isArray(existing.events) ? existing.events : [];
    events.push({
      type: 'rollback',
      runId: input.runId,
      snapshotId: rollbackPointer.snapshotId,
      occurredAt: input.now.toISOString(),
    });
    await writeJsonAtomically(input.reportPath, {
      runId: existing.runId ?? input.runId,
      events,
    });
  }

  return {
    restoredSnapshotId: rollbackPointer.snapshotId,
  };
}
