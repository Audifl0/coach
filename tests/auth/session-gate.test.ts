import assert from 'node:assert/strict';
import test from 'node:test';

import { validateSessionToken } from '../../src/lib/auth/session-gate';
import { hashSessionToken } from '../../src/lib/auth/auth';

type SessionRecord = {
  id: string;
  userId: string;
  sessionTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

function createSessionRepo() {
  const sessions = new Map<string, SessionRecord>();

  return {
    sessions,
    repo: {
      async findActiveSessionByTokenHash(sessionTokenHash: string) {
        const session = sessions.get(sessionTokenHash);
        if (!session) {
          return null;
        }

        return {
          id: session.id,
          userId: session.userId,
          expiresAt: session.expiresAt,
          revokedAt: session.revokedAt,
        };
      },
    },
  };
}

test('returns authenticated session context for active token hash', async () => {
  const memory = createSessionRepo();
  const token = 'token-valid';
  const tokenHash = hashSessionToken(token);

  memory.sessions.set(tokenHash, {
    id: 'session_1',
    userId: 'user_1',
    sessionTokenHash: tokenHash,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
  });

  const result = await validateSessionToken(token, memory.repo);

  assert.deepEqual(result, { userId: 'user_1', sessionId: 'session_1' });
});

test('returns null when token is missing', async () => {
  const memory = createSessionRepo();

  const result = await validateSessionToken(undefined, memory.repo);

  assert.equal(result, null);
});

test('returns null when token hash does not map to a persisted session', async () => {
  const memory = createSessionRepo();

  const result = await validateSessionToken('forged-token', memory.repo);

  assert.equal(result, null);
});

test('returns null when session is revoked', async () => {
  const memory = createSessionRepo();
  const token = 'token-revoked';
  const tokenHash = hashSessionToken(token);

  memory.sessions.set(tokenHash, {
    id: 'session_2',
    userId: 'user_2',
    sessionTokenHash: tokenHash,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: new Date(),
  });

  const result = await validateSessionToken(token, memory.repo);

  assert.equal(result, null);
});

test('returns null when session is expired', async () => {
  const memory = createSessionRepo();
  const token = 'token-expired';
  const tokenHash = hashSessionToken(token);

  memory.sessions.set(tokenHash, {
    id: 'session_3',
    userId: 'user_3',
    sessionTokenHash: tokenHash,
    expiresAt: new Date(Date.now() - 1_000),
    revokedAt: null,
  });

  const result = await validateSessionToken(token, memory.repo);

  assert.equal(result, null);
});
