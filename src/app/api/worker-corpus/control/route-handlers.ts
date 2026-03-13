import {
  parseWorkerCorpusControlCommand,
  parseWorkerCorpusControlResponse,
} from '@/lib/program/contracts';

export type WorkerCorpusControlRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  readControl: () => Promise<unknown>;
  startWorker: (input: { mode: 'bootstrap' | 'refresh' | 'check' }) => Promise<unknown>;
  pauseWorker: () => Promise<unknown>;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

export function createWorkerCorpusControlGetHandler(deps: WorkerCorpusControlRouteDeps) {
  return async function GET(): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    try {
      return json(parseWorkerCorpusControlResponse({ control: await deps.readControl() }), 200);
    } catch {
      return json({ error: 'Unable to load worker control state' }, 500);
    }
  };
}

export function createWorkerCorpusControlPostHandler(deps: WorkerCorpusControlRouteDeps) {
  return async function POST(request: Request): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    let command;
    try {
      command = parseWorkerCorpusControlCommand(await request.json());
    } catch {
      return json({ error: 'Invalid worker control command' }, 400);
    }

    try {
      const control =
        command.action === 'start'
          ? await deps.startWorker({ mode: command.mode })
          : await deps.pauseWorker();
      return json(parseWorkerCorpusControlResponse({ control }), 200);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Unable to execute worker control command' }, 500);
    }
  };
}
