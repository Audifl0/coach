import { runAdaptiveKnowledgePipeline } from './pipeline-run';

type ExitCode = 0 | 1;

function resolveMode(argv: string[]): 'refresh' | 'check' {
  return argv.includes('--check') ? 'check' : 'refresh';
}

async function main(): Promise<ExitCode> {
  const mode = resolveMode(process.argv);

  try {
    const result = await runAdaptiveKnowledgePipeline({ mode });
    console.log(
      `[OK] Adaptive knowledge pipeline completed (${mode}) - run=${result.runId} candidate=${result.candidateDir}`,
    );
    return 0;
  } catch (error) {
    console.error('[ERROR] refresh-corpus failed:', error instanceof Error ? error.message : String(error));
    return 1;
  }
}

main().then((code) => {
  process.exit(code);
});
