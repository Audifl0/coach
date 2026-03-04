import { enforcePasswordPolicy, hashPassword } from './password';

type ResetUserRecord = {
  id: string;
};

export type AdminResetRepository = {
  findUserByUsername(username: string): Promise<ResetUserRecord | null>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
  revokeActiveSessionsForUser(userId: string): Promise<number>;
};

export type AdminResetInput = {
  username: string;
  newPassword: string;
};

export type AdminResetResult = {
  sessionsRevoked: number;
};

export class GenericResetResponseError extends Error {
  constructor(message = 'Unable to complete password reset request') {
    super(message);
    this.name = 'GenericResetResponseError';
  }
}

function normalizeUsername(username: string): string {
  return username.trim();
}

export function createAdminResetService(repository: AdminResetRepository) {
  return {
    async resetPasswordByAdmin(input: AdminResetInput): Promise<AdminResetResult> {
      const username = normalizeUsername(input.username);

      if (!username || !input.newPassword) {
        throw new GenericResetResponseError();
      }

      enforcePasswordPolicy(input.newPassword);

      const user = await repository.findUserByUsername(username);

      if (!user) {
        throw new GenericResetResponseError();
      }

      const passwordHash = hashPassword(input.newPassword);
      await repository.updatePasswordHash(user.id, passwordHash);
      const sessionsRevoked = await repository.revokeActiveSessionsForUser(user.id);

      return { sessionsRevoked };
    },
  };
}

export async function resetPasswordByAdmin(
  repository: AdminResetRepository,
  input: AdminResetInput,
): Promise<AdminResetResult> {
  return createAdminResetService(repository).resetPasswordByAdmin(input);
}
