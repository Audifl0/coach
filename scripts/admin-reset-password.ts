import process from 'node:process';
import readline from 'node:readline/promises';

import { prisma } from '../src/lib/db/prisma';
import { GenericResetResponseError, resetPasswordByAdmin } from '../src/lib/auth/admin-reset';

const GENERIC_MESSAGE = 'Password reset request processed. If the account exists, credentials have been rotated and active sessions revoked.';

async function promptForResetInput() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const username = (await rl.question('Username to reset: ')).trim();
    const newPassword = await rl.question('New password: ');
    const confirmation = (await rl.question(`Type RESET ${username} to confirm: `)).trim();

    return { username, newPassword, confirmation };
  } finally {
    rl.close();
  }
}

async function main() {
  const { username, newPassword, confirmation } = await promptForResetInput();

  if (!username || !newPassword) {
    console.error('Reset aborted: username and password are required.');
    process.exitCode = 1;
    return;
  }

  if (confirmation !== `RESET ${username}`) {
    console.error('Reset aborted: confirmation phrase did not match.');
    process.exitCode = 1;
    return;
  }

  try {
    await resetPasswordByAdmin(
      {
        async findUserByUsername(value) {
          return prisma.user.findUnique({
            where: { username: value },
            select: { id: true },
          });
        },
        async updatePasswordHash(userId, passwordHash) {
          await prisma.user.update({
            where: { id: userId },
            data: { passwordHash },
          });
        },
        async revokeActiveSessionsForUser(userId) {
          const revoked = await prisma.session.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          return revoked.count;
        },
      },
      {
        username,
        newPassword,
      },
    );

    console.log(GENERIC_MESSAGE);
  } catch (error) {
    if (error instanceof GenericResetResponseError) {
      console.log(GENERIC_MESSAGE);
      return;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Reset failed: ${message}`);
    process.exitCode = 1;
  }
}

void main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Reset failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
