import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertAccountOwnership,
  buildAccountScopedWhere,
  requireAccountScope,
} from '../../src/server/dal/account-scope';

test('account isolation rejects missing authenticated account context', () => {
  assert.throws(
    () => requireAccountScope(null),
    /authenticated session context is required/i,
  );
});

test('account isolation rejects mismatched account context', () => {
  const scope = requireAccountScope({ userId: 'user_1' });

  assert.throws(
    () => assertAccountOwnership(scope, 'user_2'),
    /mismatched account context/i,
  );

  assert.throws(
    () => buildAccountScopedWhere(scope, { userId: 'user_2' }),
    /mismatched account context/i,
  );
});

test('account isolation allows only account-owned data query filters', () => {
  const scope = requireAccountScope({ userId: 'user_1' });

  assert.doesNotThrow(() => assertAccountOwnership(scope, 'user_1'));

  const scoped = buildAccountScopedWhere(scope);
  assert.deepEqual(scoped, { userId: 'user_1' });

  const scopedExistingFilter = buildAccountScopedWhere(scope, { userId: 'user_1', status: 'active' });
  assert.deepEqual(scopedExistingFilter, { userId: 'user_1', status: 'active' });
});
