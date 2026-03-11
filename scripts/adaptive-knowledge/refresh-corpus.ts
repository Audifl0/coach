import path from 'node:path';

import { runAdaptiveKnowledgePipeline, type AdaptivePipelineRunResult, type RunAdaptiveKnowledgePipelineInput } from './pipeline-run';
import {
  acquireAdaptiveKnowledgeLease,
  heartbeatAdaptiveKnowledgeLease,
  releaseAdaptiveKnowledgeLease,
} from './worker-state';

type ExitCode = 0 | 1 | 3;
type WorkerCommandStatus = 'completed' | 'failed' | 'blocked-by-lease';

type RunRefreshCorpusCommandDeps = {
  outputRootDir?: string;
  now?: Date;
  runPipeline?: (input?: RunAdaptiveKnowledgePipelineInput) => Promise<AdaptivePipelineRunResult>;
  log?: Pick<Console, 'log' | 'error' | 'warn'>;
};

export function resolveMode(argv: string[]): 'refresh' | 'check' {
  return argv.includes('--check') ? 'check' : 'refresh';
}

function resolveOutputRootDir(input?: string): string {
  return input ?? path.join(process.cwd(), '.planning', 'knowledge', 'adaptive-coaching');
}

export async function runRefreshCorpusCommand(
  argv: string[] = process.argv,
  deps: RunRefreshCorpusCommandDeps = {},
): Promise<{
  status: WorkerCommandStatus;
  exitCode: ExitCode;
  result?: AdaptivePipelineRunResult;
}> {
  const mode = resolveMode(argv);
  const now = deps.now ?? new Date();
  const outputRootDir = resolveOutputRootDir(deps.outputRootDir);
  const runPipeline = deps.runPipeline ?? runAdaptiveKnowledgePipeline;
  const log = deps.log ?? console;
  const runId = now.toISOString().replace(/[:.]/g, '-');

  const lease = await acquireAdaptiveKnowledgeLease({
    outputRootDir,
    runId,
    mode,
    now,
  });

  if (!lease.acquired) {
    log.warn(
      `[WARN] adaptive knowledge worker blocked by active lease: run=${lease.state?.runId ?? 'unknown'} status=${lease.state?.status ?? 'unknown'}`,
    );
    return {
      status: 'blocked-by-lease',
      exitCode: 3,
    };
  }

  try {
    await heartbeatAdaptiveKnowledgeLease({
      outputRootDir,
      runId,
      now: new Date(now.getTime() + 100),
      message: 'pipeline-starting',
    });
    const result = await runPipeline({
      mode,
      outputRootDir,
      runId,
      now,
    });
    await releaseAdaptiveKnowledgeLease({
      outputRootDir,
      runId,
      status: 'completed',
      now: new Date(now.getTime() + 200),
      message: mode === 'check' ? 'check completed without publishing' : 'refresh completed',
    });
    log.log(`[OK] Adaptive knowledge worker completed (${mode}) - run=${result.runId} candidate=${result.candidateDir}`);
    return {
      status: 'completed',
      exitCode: 0,
      result,
    };
  } catch (error) {
    await releaseAdaptiveKnowledgeLease({
      outputRootDir,
      runId,
      status: 'failed',
      now: new Date(now.getTime() + 200),
      message: error instanceof Error ? error.message : String(error),
    });
    log.error('[ERROR] refresh-corpus failed:', error instanceof Error ? error.message : String(error));
    return {
      status: 'failed',
      exitCode: 1,
    };
  }
}

async function main(): Promise<ExitCode> {
  const result = await runRefreshCorpusCommand(process.argv);
  return result.exitCode;
}

if (require.main === module) {
  main().then((code) => {
    process.exit(code);
  });
}
