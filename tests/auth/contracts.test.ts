import test from 'node:test';
import assert from 'node:assert/strict';

import { validateLoginInput, validateSignupInput, type SessionContext } from '../../src/lib/auth/contracts.ts';
import { requireAccountScope } from '../../src/server/dal/account-scope.ts';

test('auth contracts reject missing username/password fields', () => {
  assert.throws(() => validateSignupInput({}), /username/i);
  assert.throws(() => validateLoginInput({}), /username/i);
});

test('auth contracts accept valid username/password payloads', () => {
  assert.deepEqual(validateSignupInput({ username: 'coach', password: 'secret123' }), {
    username: 'coach',
    password: 'secret123',
  });

  assert.deepEqual(validateLoginInput({ username: 'coach', password: 'secret123' }), {
    username: 'coach',
    password: 'secret123',
  });
});

test('account scope guard requires authenticated user context', () => {
  assert.throws(() => requireAccountScope(null), /authenticated/i);
  assert.throws(() => requireAccountScope({ userId: '' } as SessionContext), /authenticated/i);
});

test('account scope guard returns authenticated account identity', () => {
  const scoped = requireAccountScope({ userId: 'user_123' } as SessionContext);

  assert.deepEqual(scoped, { userId: 'user_123' });
});
