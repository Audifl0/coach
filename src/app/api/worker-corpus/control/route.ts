import type { NextRequest } from 'next/server';

import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { pauseWorkerControl, readWorkerControlState, startWorkerControl } from '@/server/dashboard/worker-control';
import {
  createWorkerCorpusControlGetHandler,
  createWorkerCorpusControlPostHandler,
} from './route-handlers';

async function buildDefaultDeps() {
  const repository = await buildDefaultSessionGateRepository();
  return {
    resolveSession: () => validateSessionFromCookies(repository),
    readControl: () => readWorkerControlState(),
    startWorker: ({ mode }: { mode: 'bootstrap' | 'refresh' | 'check' }) => startWorkerControl({ mode }),
    pauseWorker: () => pauseWorkerControl(),
  };
}

export async function GET(_request: NextRequest): Promise<Response> {
  return createWorkerCorpusControlGetHandler(await buildDefaultDeps())();
}

export async function POST(request: NextRequest): Promise<Response> {
  return createWorkerCorpusControlPostHandler(await buildDefaultDeps())(request);
}
