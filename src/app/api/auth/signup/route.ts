import { NextResponse } from 'next/server';

import { AuthValidationError, SignupConflictError, createAuthService } from '@/lib/auth/auth';

type AuthService = ReturnType<typeof createAuthService>;

export function createSignupHandler(authService: AuthService) {
  return async function signupRouteHandler(request: Request): Promise<Response> {
    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    try {
      const signup = await authService.signup(payload);
      return NextResponse.json(
        { id: signup.id, username: signup.username },
        { status: 201 },
      );
    } catch (error) {
      if (error instanceof AuthValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      if (error instanceof SignupConflictError) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }

      return NextResponse.json({ error: 'Unable to create account' }, { status: 500 });
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
  return createSignupHandler(auth)(request);
}
