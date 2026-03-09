import assert from 'node:assert/strict';
import test from 'node:test';

import { GenericResetResponseError } from '../../src/lib/auth/admin-reset';
import {
  GENERIC_MESSAGE,
  promptForResetInput,
  runAdminResetFlow,
} from '../../scripts/admin-reset-password';
import { promptSecret } from '../../scripts/lib/secret-prompt';

test('promptForResetInput requires username, password, and RESET confirmation in order', async () => {
  const prompts: string[] = [];
  let closed = false;

  const rl = {
    async question(prompt: string) {
      prompts.push(prompt);
      if (prompt === 'Username to reset: ') {
        return ' coach ';
      }
      if (prompt === 'Type RESET coach to confirm: ') {
        return ' RESET coach ';
      }
      return '';
    },
    close() {
      closed = true;
    },
  };

  const result = await promptForResetInput(rl, async (prompt) => {
    prompts.push(prompt);
    return 'new-password';
  });

  assert.equal(result.username, 'coach');
  assert.equal(result.newPassword, 'new-password');
  assert.equal(result.confirmation, 'RESET coach');
  assert.deepEqual(prompts, ['Username to reset: ', 'New password: ', 'Type RESET coach to confirm: ']);
  assert.equal(closed, false);
});

test('promptSecret requests hidden terminal echo for password prompts', async () => {
  const optionsSeen: unknown[] = [];

  const questioner = {
    async question(prompt: string, options?: unknown) {
      assert.equal(prompt, 'New password: ');
      optionsSeen.push(options);
      return 'hidden-secret';
    },
  };

  const value = await promptSecret(questioner, 'New password: ');
  assert.equal(value, 'hidden-secret');
  assert.deepEqual(optionsSeen, [{ hideEchoBack: true }]);
});

test('runAdminResetFlow keeps generic completion semantics for known and unknown usernames', async () => {
  const successLogs: string[] = [];
  const successErrors: string[] = [];
  const successCalls: Array<{ username: string; newPassword: string }> = [];

  const successCode = await runAdminResetFlow({
    promptInput: async () => ({
      username: 'coach',
      newPassword: 'new-password-123',
      confirmation: 'RESET coach',
    }),
    resetPassword: async (payload) => {
      successCalls.push(payload);
    },
    log: (line) => {
      successLogs.push(line);
    },
    error: (line) => {
      successErrors.push(line);
    },
  });

  assert.equal(successCode, 0);
  assert.deepEqual(successCalls, [{ username: 'coach', newPassword: 'new-password-123' }]);
  assert.deepEqual(successLogs, [GENERIC_MESSAGE]);
  assert.deepEqual(successErrors, []);

  const missingLogs: string[] = [];
  const missingErrors: string[] = [];
  const missingCode = await runAdminResetFlow({
    promptInput: async () => ({
      username: 'missing',
      newPassword: 'new-password-123',
      confirmation: 'RESET missing',
    }),
    resetPassword: async () => {
      throw new GenericResetResponseError();
    },
    log: (line) => {
      missingLogs.push(line);
    },
    error: (line) => {
      missingErrors.push(line);
    },
  });

  assert.equal(missingCode, 0);
  assert.deepEqual(missingLogs, [GENERIC_MESSAGE]);
  assert.deepEqual(missingErrors, []);
});
