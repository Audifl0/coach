import type { NextRequest } from 'next/server';

import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { listWorkerCorpusLibrary } from '@/server/dashboard/worker-dashboard';
import { createWorkerCorpusLibraryGetHandler } from './route-handlers';

async function buildDefaultDeps() {
  const repository = await buildDefaultSessionGateRepository();
  return {
    resolveSession: () => validateSessionFromCookies(repository),
    listLibrary: () => listWorkerCorpusLibrary(),
  };
}

export async function GET(_request: NextRequest): Promise<Response> {
  return createWorkerCorpusLibraryGetHandler(await buildDefaultDeps())();
}
