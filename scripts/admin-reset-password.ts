import readline from 'node:readline/promises';
import process from 'node:process';

import { GenericResetResponseError, resetPasswordByAdmin } from '../src/lib/auth/admin-reset';
import { promptSecret } from './lib/secret-prompt';

export const GENERIC_MESSAGE =
  'Password reset request processed. If the account exists, credentials have been rotated and active sessions revoked.';

type PromptReader = {
  question(prompt: string): Promise<string>;
  close(): void;
};

type PromptInput = {
  username: string;
  newPassword: string;
  confirmation: string;
};

type RunAdminResetFlowDeps = {
  promptInput: () => Promise<PromptInput>;
  resetPassword: (input: { username: string; newPassword: string }) => Promise<void>;
  log?: (line: string) => void;
  error?: (line: string) => void;
};

export async function promptForResetInput(
  prompt: PromptReader,
  askSecret: (message: string) => Promise<string> = (message) => promptSecret(prompt, message),
): Promise<PromptInput> {
  const username = (await prompt.question('Username to reset: ')).trim();
  const newPassword = await askSecret('New password: ');
  const confirmation = (await prompt.question(`Type RESET ${username} to confirm: `)).trim();

  return { username, newPassword, confirmation };
}

function validateInput(input: PromptInput): string | null {
  if (!input.username || !input.newPassword) {
    return 'Reset aborted: username and password are required.';
  }

  if (input.confirmation !== `RESET ${input.username}`) {
    return 'Reset aborted: confirmation phrase did not match.';
  }

  return null;
}

export async function runAdminResetFlow({
  promptInput,
  resetPassword,
  log = console.log,
  error: errorWriter = console.error,
}: RunAdminResetFlowDeps): Promise<number> {
  const { username, newPassword, confirmation } = await promptInput();
  const validationError = validateInput({ username, newPassword, confirmation });
  if (validationError) {
    errorWriter(validationError);
    return 1;
  }

  try {
    await resetPassword({ username, newPassword });
    log(GENERIC_MESSAGE);
    return 0;
  } catch (caughtError) {
    if (caughtError instanceof GenericResetResponseError) {
      log(GENERIC_MESSAGE);
      return 0;
    }

    const message = caughtError instanceof Error ? caughtError.message : 'Unknown error';
    errorWriter(`Reset failed: ${message}`);
    return 1;
  }
}

async function loadPrismaClient() {
  const loaded = await import('../src/lib/db/prisma');
  return loaded.prisma;
}

async function runCli() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const prisma = await loadPrismaClient();
    const exitCode = await runAdminResetFlow({
      promptInput: () => promptForResetInput(rl),
      async resetPassword({ username, newPassword }) {
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
      },
    });
    process.exitCode = exitCode;
    await prisma.$disconnect();
  } finally {
    rl.close();
  }
}

if (import.meta.main) {
  void runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Reset failed: ${message}`);
    process.exitCode = 1;
  });
}
