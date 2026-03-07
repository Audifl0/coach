import { defaultAuthLogger } from '@/lib/auth/auth-logger';
import { createAuthService } from '@/lib/auth/auth';
import { resolveClientIp } from '@/lib/auth/client-ip';
import { defaultAuthRateLimiter } from '@/lib/auth/rate-limit';
import { createLoginHandler } from '../handlers';

const runtimeLoginLimiter = defaultAuthRateLimiter;
const runtimeLoginLogger = defaultAuthLogger;

async function buildDefaultAuthService() {
  const { prisma } = await import('@/lib/db/prisma');
  return createAuthService({
    findUserByUsername(username) {
      return prisma.user.findUnique({ where: { username } });
    },
    createUser(input) {
      return prisma.user.create({
        data: {
          username: input.username,
          passwordHash: input.passwordHash,
        },
      });
    },
    createSession(input) {
      return prisma.session.create({
        data: {
          userId: input.userId,
          sessionTokenHash: input.sessionTokenHash,
          expiresAt: input.expiresAt,
        },
      });
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  const auth = await buildDefaultAuthService();
  return createLoginHandler(auth, {
    limiter: runtimeLoginLimiter,
    logger: runtimeLoginLogger,
    resolveClientIp,
  })(request);
}
