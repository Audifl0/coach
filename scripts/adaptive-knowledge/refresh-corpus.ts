import path from 'node:path';

import { runAdaptiveKnowledgePipeline, type AdaptivePipelineRunResult, type RunAdaptiveKnowledgePipelineInput } from './pipeline-run';
import { loadWorkerControlState } from './control-state';
import {
  acquireAdaptiveKnowledgeLease,
  heartbeatAdaptiveKnowledgeLease,
  releaseAdaptiveKnowledgeLease,
} from './worker-state';

function formatRefreshCompletionMessage(result: AdaptivePipelineRunResult): string {
  const mode = (result as { runReport?: { mode?: string } }).runReport?.mode ?? 'refresh';
  const productivity = (result.runReport as {
    productivity?: {
      executedWorkItems: number;
      usefulDelta: { documents: number; studyCards: number; contradictions: number; doctrine: number };
      noProgressReasons: string[];
    };
  } | undefined)?.productivity;

  if (!productivity) {
    return `[OK] Adaptive knowledge worker completed (${mode}) - run=${result.runId} candidate=${result.candidateDir}`;
  }

  const totalUsefulDelta =
    productivity.usefulDelta.documents +
    productivity.usefulDelta.studyCards +
    productivity.usefulDelta.contradictions +
    productivity.usefulDelta.doctrine;

  const productivityMessage =
    totalUsefulDelta > 0
      ? `executed=${productivity.executedWorkItems}; documents=${productivity.usefulDelta.documents}; studyCards=${productivity.usefulDelta.studyCards}; contradictions=${productivity.usefulDelta.contradictions}; doctrine=${productivity.usefulDelta.doctrine}`
      : `completed without useful delta; reasons=${productivity.noProgressReasons.join(',') || 'none'}`;

  return `[OK] Adaptive knowledge worker completed (${result.runReport.mode}) - run=${result.runId} candidate=${result.candidateDir}; ${productivityMessage}`;
}

type ExitCode = 0 | 1 | 3;
type WorkerCommandStatus = 'completed' | 'failed' | 'blocked-by-lease' | 'paused-by-operator';

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
  const controlState = await loadWorkerControlState(outputRootDir);

  if (controlState.mode === 'paused') {
    log.warn(
      `[WARN] adaptive knowledge worker start blocked by operator pause: updatedAt=${controlState.updatedAt} reason=${controlState.reason ?? 'none'}`,
    );
    return {
      status: 'paused-by-operator',
      exitCode: 3,
    };
  }

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
      currentItemKind: mode === 'refresh' ? 'backlog-execution' : null,
      lastCompletedItemKind: null,
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
      currentItemKind:
        (result as { runReport?: { productivity?: { currentItemKind?: string | null } } }).runReport?.productivity?.currentItemKind ?? null,
      lastCompletedItemKind:
        (result as { runReport?: { productivity?: { lastCompletedItemKind?: string | null } } }).runReport?.productivity?.lastCompletedItemKind ?? null,
    });
    leaseReleased = true;
    log.log(formatRefreshCompletionMessage(result));
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
