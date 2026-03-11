import assert from 'node:assert/strict';
import test from 'node:test';

import { requestProgramGeneration } from '../../src/lib/program/generation-client';

test('program generation client posts expected payload and returns parsed response', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      init,
    });

    return new Response(
      JSON.stringify({
        plan: {
          startDate: '2026-03-11',
          endDate: '2026-03-17',
        },
        sessions: [],
        meta: {
          mode: 'hybrid',
          knowledgeSnapshotId: 'snap_1',
        },
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      },
    );
  }) as typeof fetch;

  try {
    const response = await requestProgramGeneration({ regenerate: true, anchorDate: '2026-03-11' });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, '/api/program/generate');
    assert.equal(calls[0]?.init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
      regenerate: true,
      anchorDate: '2026-03-11',
    });
    assert.deepEqual(response, {
      plan: {
        startDate: '2026-03-11',
        endDate: '2026-03-17',
      },
      sessions: [],
      meta: {
        mode: 'hybrid',
        knowledgeSnapshotId: 'snap_1',
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('program generation client surfaces route error messages', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: 'Profile is incomplete' }), {
      status: 400,
      headers: {
        'content-type': 'application/json',
      },
    })) as typeof fetch;

  try {
    await assert.rejects(() => requestProgramGeneration(), /Profile is incomplete/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
