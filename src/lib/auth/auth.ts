import { createHash, randomBytes } from 'node:crypto';

import { validateLoginInput, validateSignupInput } from './contracts';
import { PasswordPolicyError, enforcePasswordPolicy, hashPassword, verifyPassword } from './password';
import {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  SESSION_MAX_AGE_SECONDS,
  SESSION_ROLLING_WINDOW_MS,
} from './session-contract';

export const GENERIC_AUTH_ERROR_MESSAGE = 'Invalid username or password';
export {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  SESSION_MAX_AGE_SECONDS,
  SESSION_ROLLING_WINDOW_MS,
};

type UserRecord = {
  id: string;
  username: string;
  passwordHash: string;
};

type SessionRecord = {
  id: string;
};

type CreateUserInput = {
  username: string;
  passwordHash: string;
};

type CreateSessionInput = {
  sessionTokenHash: string;
  userId: string;
  expiresAt: Date;
};

export type SessionCookie = {
  token: string;
  name: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  maxAge: number;
  expires: Date;
};

export type AuthRepository = {
  findUserByUsername(username: string): Promise<UserRecord | null>;
  createUser(input: CreateUserInput): Promise<UserRecord>;
  createSession(input: CreateSessionInput): Promise<SessionRecord>;
};

export type SignupResult = {
  id: string;
  username: string;
};

export type LoginResult = {
  userId: string;
  username: string;
  sessionId: string;
  cookie: SessionCookie;
};

export class AuthValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthValidationError';
  }
}

export class SignupConflictError extends Error {
  constructor(message = 'Username is already in use') {
    super(message);
    this.name = 'SignupConflictError';
  }
}

export class InvalidCredentialsError extends Error {
  constructor(message = GENERIC_AUTH_ERROR_MESSAGE) {
    super(message);
    this.name = 'InvalidCredentialsError';
  }
}

function normalizeUsername(username: string): string {
  return username.trim();
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: string }).code === 'P2002'
  );
}

function buildSessionCookie(token: string, expiresAt: Date): SessionCookie {
  return {
    token,
    name: SESSION_COOKIE_NAME,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_SECONDS,
    expires: expiresAt,
  };
}

export function hashSessionToken(sessionToken: string): string {
  return createHash('sha256').update(sessionToken).digest('hex');
}

export function shouldRollSession(expiresAt: Date, now = Date.now()): boolean {
  return expiresAt.getTime() - now <= SESSION_ROLLING_WINDOW_MS;
}

export function createAuthService(repository: AuthRepository) {
  return {
    async signup(input: unknown): Promise<SignupResult> {
      let parsed: ReturnType<typeof validateSignupInput>;

      try {
        parsed = validateSignupInput(input);
      } catch {
        throw new AuthValidationError('Invalid signup payload');
      }

      const username = normalizeUsername(parsed.username);

      try {
        enforcePasswordPolicy(parsed.password);
      } catch (error) {
        if (error instanceof PasswordPolicyError) {
          throw new AuthValidationError(error.message);
        }
        throw error;
      }

      const existingUser = await repository.findUserByUsername(username);
      if (existingUser) {
        throw new SignupConflictError();
      }

      const passwordHash = hashPassword(parsed.password);

      try {
        const user = await repository.createUser({ username, passwordHash });
        return { id: user.id, username: user.username };
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new SignupConflictError();
        }
        throw error;
      }
    },

    async login(input: unknown): Promise<LoginResult> {
      let parsed: ReturnType<typeof validateLoginInput>;

      try {
        parsed = validateLoginInput(input);
      } catch {
        throw new AuthValidationError('Invalid login payload');
      }

      const username = normalizeUsername(parsed.username);
      const user = await repository.findUserByUsername(username);

      if (!user || !verifyPassword(parsed.password, user.passwordHash)) {
        throw new InvalidCredentialsError();
      }

      const sessionToken = randomBytes(32).toString('base64url');
      const sessionTokenHash = hashSessionToken(sessionToken);
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

      const session = await repository.createSession({
        sessionTokenHash,
        userId: user.id,
        expiresAt,
      });

      return {
        userId: user.id,
        username: user.username,
        sessionId: session.id,
        cookie: buildSessionCookie(sessionToken, expiresAt),
      };
    },
  };
}
