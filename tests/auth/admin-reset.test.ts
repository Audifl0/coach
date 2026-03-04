import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminResetService, GenericResetResponseError } from '../../src/lib/auth/admin-reset';

type UserRecord = {
  id: string;
  username: string;
  passwordHash: string;
};

type SessionRecord = {
  id: string;
  userId: string;
  sessionTokenHash: string;
  revokedAt: Date | null;
};

function createMemoryRepo() {
  const users = new Map<string, UserRecord>();
  const sessions: SessionRecord[] = [];

  users.set('coach', {
    id: 'user_1',
    username: 'coach',
    passwordHash: 'salt:hash',
  });

  sessions.push({ id: 'session_1', userId: 'user_1', sessionTokenHash: 'token-1', revokedAt: null });
  sessions.push({ id: 'session_2', userId: 'user_1', sessionTokenHash: 'token-2', revokedAt: null });

  const repo = {
    async findUserByUsername(username: string) {
      return users.get(username) ?? null;
    },
    async updatePasswordHash(userId: string, passwordHash: string) {
      for (const user of users.values()) {
        if (user.id === userId) {
          user.passwordHash = passwordHash;
          return;
        }
      }

      throw new Error('missing-user');
    },
    async revokeActiveSessionsForUser(userId: string) {
      let revoked = 0;
      for (const session of sessions) {
        if (session.userId === userId && session.revokedAt === null) {
          session.revokedAt = new Date();
          revoked += 1;
        }
      }
      return revoked;
    },
  };

  return {
    repo,
    users,
    sessions,
  };
}

test('admin reset updates password hash and revokes existing sessions', async () => {
  const db = createMemoryRepo();
  const reset = createAdminResetService(db.repo);

  const beforeHash = db.users.get('coach')?.passwordHash;
  assert.equal(beforeHash, 'salt:hash');

  const result = await reset.resetPasswordByAdmin({
    username: 'coach',
    newPassword: 'new-secret-123',
  });

  const afterHash = db.users.get('coach')?.passwordHash;
  assert.ok(afterHash);
  assert.notEqual(afterHash, beforeHash);
  assert.equal(result.sessionsRevoked, 2);
  assert.equal(db.sessions.every((session) => session.revokedAt instanceof Date), true);
});

test('admin reset returns generic response behavior for unknown usernames', async () => {
  const db = createMemoryRepo();
  const reset = createAdminResetService(db.repo);

  await assert.rejects(
    () =>
      reset.resetPasswordByAdmin({
        username: 'unknown-user',
        newPassword: 'new-secret-123',
      }),
    GenericResetResponseError,
  );
});
