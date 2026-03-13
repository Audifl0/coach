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

export function resolveMode(argv: string[]): 'bootstrap' | 'refresh' | 'check' {
  if (argv.includes('--bootstrap')) {
    return 'bootstrap';
  }
  return argv.includes('--check') ? 'check' : 'refresh';
}

function resolveOutputRootDir(input?: string): string {
  return input ?? process.env.ADAPTIVE_KNOWLEDGE_OUTPUT_ROOT_DIR ?? path.join(process.cwd(), '.planning', 'knowledge', 'adaptive-coaching');
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

  let leaseReleased = false;
  const releaseOnSignal = async (signal: NodeJS.Signals) => {
    if (leaseReleased) {
      return;
    }

    leaseReleased = true;
    try {
      await releaseAdaptiveKnowledgeLease({
        outputRootDir,
        runId,
        status: 'failed',
        now: new Date(),
        message: `paused-by-signal:${signal}`,
      });
    } catch (error) {
      log.warn(
        `[WARN] adaptive knowledge worker failed to release lease after ${signal}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  const handleSigterm = () => {
    void releaseOnSignal('SIGTERM').finally(() => {
      process.exit(130);
    });
  };
  const handleSigint = () => {
    void releaseOnSignal('SIGINT').finally(() => {
      process.exit(130);
    });
  };

  process.once('SIGTERM', handleSigterm);
  process.once('SIGINT', handleSigint);

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
      message:
        mode === 'check'
          ? 'check completed without publishing'
          : mode === 'bootstrap'
            ? 'bootstrap completed'
            : 'refresh completed',
    });
    leaseReleased = true;
    log.log(`[OK] Adaptive knowledge worker completed (${mode}) - run=${result.runId} candidate=${result.candidateDir}`);
    return {
      status: 'completed',
      exitCode: 0,
      result,
    };
  } catch (error) {
    if (!leaseReleased) {
      await releaseAdaptiveKnowledgeLease({
        outputRootDir,
        runId,
        status: 'failed',
        now: new Date(now.getTime() + 200),
        message: error instanceof Error ? error.message : String(error),
      });
      leaseReleased = true;
    }
    log.error('[ERROR] refresh-corpus failed:', error instanceof Error ? error.message : String(error));
    return {
      status: 'failed',
      exitCode: 1,
    };
  } finally {
    process.off('SIGTERM', handleSigterm);
    process.off('SIGINT', handleSigint);
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
