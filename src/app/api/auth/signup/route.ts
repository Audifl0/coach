import { defaultAuthLogger } from '@/lib/auth/auth-logger';
import { createAuthService } from '@/lib/auth/auth';
import { resolveClientIp } from '@/lib/auth/client-ip';
import { defaultAuthRateLimiter } from '@/lib/auth/rate-limit';
import { createSignupHandler } from '../handlers';

const runtimeSignupLimiter = defaultAuthRateLimiter;
const runtimeSignupLogger = defaultAuthLogger;

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
  return createSignupHandler(auth, {
    limiter: runtimeSignupLimiter,
    logger: runtimeSignupLogger,
    resolveClientIp,
  })(request);
}
