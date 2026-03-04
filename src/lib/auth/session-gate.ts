import { cookies } from 'next/headers';

import { SESSION_COOKIE_NAME, hashSessionToken } from './auth';

export type ActiveSessionRecord = {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type SessionGateRepository = {
  findActiveSessionByTokenHash(sessionTokenHash: string): Promise<ActiveSessionRecord | null>;
};

export type ValidatedSession = {
  userId: string;
  sessionId: string;
};

export async function validateSessionToken(
  sessionToken: string | null | undefined,
  repository: SessionGateRepository,
  now = new Date(),
): Promise<ValidatedSession | null> {
  if (!sessionToken) {
    return null;
  }

  const sessionTokenHash = hashSessionToken(sessionToken);
  const persistedSession = await repository.findActiveSessionByTokenHash(sessionTokenHash);

  if (!persistedSession) {
    return null;
  }

  if (persistedSession.revokedAt) {
    return null;
  }

  if (persistedSession.expiresAt.getTime() <= now.getTime()) {
    return null;
  }

  return {
    userId: persistedSession.userId,
    sessionId: persistedSession.id,
  };
}

export async function validateSessionFromCookies(
  repository: SessionGateRepository,
  now = new Date(),
): Promise<ValidatedSession | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return validateSessionToken(sessionToken, repository, now);
}

export async function buildDefaultSessionGateRepository(): Promise<SessionGateRepository> {
  const { prisma } = await import('@/lib/db/prisma');

  return {
    async findActiveSessionByTokenHash(sessionTokenHash: string) {
      return prisma.session.findFirst({
        where: {
          sessionTokenHash,
          revokedAt: null,
        },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          revokedAt: true,
        },
      });
    },
  };
}
