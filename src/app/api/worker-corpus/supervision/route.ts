import type { NextRequest } from 'next/server';

import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { loadWorkerCorpusSupervision } from '@/server/services/worker-corpus-supervision';
import { createWorkerCorpusSupervisionGetHandler } from './route-handlers';

async function buildDefaultDeps() {
  const repository = await buildDefaultSessionGateRepository();
  return {
    resolveSession: () => validateSessionFromCookies(repository),
    loadSupervision: () => loadWorkerCorpusSupervision(),
  };
}

export async function GET(_request: NextRequest, _context: RouteContext<'/api/worker-corpus/supervision'>): Promise<Response> {
  return createWorkerCorpusSupervisionGetHandler(await buildDefaultDeps())();
}
