import { NextResponse } from 'next/server';

import { SESSION_COOKIE_NAME, hashSessionToken } from '@/lib/auth/auth';

type RevokeSessionByHash = (sessionTokenHash: string) => Promise<boolean>;

function readSessionTokenFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    return null;
  }

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const [name, ...rest] = pair.trim().split('=');
    if (name !== SESSION_COOKIE_NAME) {
      continue;
    }

    const value = rest.join('=').trim();
    if (value.length > 0) {
      return value;
    }
  }

  return null;
}

function buildLogoutResponse() {
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}

export function createLogoutHandler(revokeSessionByTokenHash: RevokeSessionByHash) {
  return async function logoutRouteHandler(request: Request): Promise<Response> {
    const sessionToken = readSessionTokenFromCookie(request.headers.get('cookie'));

    if (!sessionToken) {
      return buildLogoutResponse();
    }

    const sessionTokenHash = hashSessionToken(sessionToken);
    await revokeSessionByTokenHash(sessionTokenHash);

    return buildLogoutResponse();
  };
}

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
