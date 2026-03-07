import { createLogoutHandler } from '../handlers';

async function buildDefaultLogoutHandler() {
  const { prisma } = await import('@/lib/db/prisma');
  return createLogoutHandler(async (sessionTokenHash) => {
    const result = await prisma.session.updateMany({
      where: {
        sessionTokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return result.count > 0;
  });
}

export async function POST(request: Request): Promise<Response> {
  const logoutHandler = await buildDefaultLogoutHandler();
  return logoutHandler(request);
}
