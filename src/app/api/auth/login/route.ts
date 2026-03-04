import { NextResponse } from 'next/server';

import {
  AuthValidationError,
  GENERIC_AUTH_ERROR_MESSAGE,
  InvalidCredentialsError,
  createAuthService,
} from '@/lib/auth/auth';

type AuthService = ReturnType<typeof createAuthService>;

export function createLoginHandler(authService: AuthService) {
  return async function loginRouteHandler(request: Request): Promise<Response> {
    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    try {
      const login = await authService.login(payload);
      const response = NextResponse.json(
        { userId: login.userId, username: login.username },
        { status: 200 },
      );

      response.cookies.set({
        name: login.cookie.name,
        value: login.cookie.token,
        path: login.cookie.path,
        httpOnly: login.cookie.httpOnly,
        secure: login.cookie.secure,
        sameSite: login.cookie.sameSite,
        expires: login.cookie.expires,
        maxAge: login.cookie.maxAge,
      });

      return response;
    } catch (error) {
      if (error instanceof AuthValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      if (error instanceof InvalidCredentialsError) {
        return NextResponse.json({ error: GENERIC_AUTH_ERROR_MESSAGE }, { status: 401 });
      }

      return NextResponse.json({ error: 'Unable to sign in' }, { status: 500 });
    }
  };
}

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
  return createLoginHandler(auth)(request);
}
