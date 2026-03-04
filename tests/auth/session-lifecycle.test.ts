import assert from 'node:assert/strict';
import test from 'node:test';

import { InvalidCredentialsError, SignupConflictError, createAuthService } from '../../src/lib/auth/auth';
import { createLoginHandler } from '../../src/app/api/auth/login/route';
import { createSignupHandler } from '../../src/app/api/auth/signup/route';

type UserRecord = {
  id: string;
  username: string;
  passwordHash: string;
};

type SessionRecord = {
  id: string;
  sessionTokenHash: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

function createMemoryRepo() {
  const users = new Map<string, UserRecord>();
  const sessions: SessionRecord[] = [];
  let userCounter = 1;
  let sessionCounter = 1;

  const repo = {
    async findUserByUsername(username: string) {
      return users.get(username) ?? null;
    },
    async createUser(input: { username: string; passwordHash: string }) {
      if (users.has(input.username)) {
        throw new Error('P2002');
      }

      const user: UserRecord = {
        id: `user_${userCounter++}`,
        username: input.username,
        passwordHash: input.passwordHash,
      };

      users.set(user.username, user);
      return user;
    },
    async createSession(input: { sessionTokenHash: string; userId: string; expiresAt: Date }) {
      const session: SessionRecord = {
        id: `session_${sessionCounter++}`,
        sessionTokenHash: input.sessionTokenHash,
        userId: input.userId,
        expiresAt: input.expiresAt,
        revokedAt: null,
      };

      sessions.push(session);
      return session;
    },
  };

  return {
    repo,
    users,
    sessions,
  };
}

test('signup and login creates account with hashed password and rejects duplicate usernames', async () => {
  const db = createMemoryRepo();
  const auth = createAuthService(db.repo);
  const signupHandler = createSignupHandler(auth);

  const signupResponse = await signupHandler(
    new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username: 'coach', password: 'secret123' }),
      headers: { 'content-type': 'application/json' },
    }),
  );

  assert.equal(signupResponse.status, 201);
  const signupBody = await signupResponse.json();
  assert.equal(signupBody.username, 'coach');

  const persisted = db.users.get('coach');
  assert.ok(persisted);
  assert.notEqual(persisted.passwordHash, 'secret123');

  const duplicateResponse = await signupHandler(
    new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username: 'coach', password: 'secret123' }),
      headers: { 'content-type': 'application/json' },
    }),
  );

  assert.equal(duplicateResponse.status, 409);
  assert.deepEqual(await duplicateResponse.json(), { error: 'Username is already in use' });

  await assert.rejects(() => auth.signup({ username: 'coach', password: 'secret123' }), SignupConflictError);
});

test('signup and login returns generic login failures for wrong password and unknown account', async () => {
  const db = createMemoryRepo();
  const auth = createAuthService(db.repo);
  const signupHandler = createSignupHandler(auth);
  const loginHandler = createLoginHandler(auth);

  await signupHandler(
    new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username: 'coach', password: 'secret123' }),
      headers: { 'content-type': 'application/json' },
    }),
  );

  const wrongPasswordResponse = await loginHandler(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'coach', password: 'wrong-pass' }),
      headers: { 'content-type': 'application/json' },
    }),
  );
  const unknownUserResponse = await loginHandler(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'missing', password: 'wrong-pass' }),
      headers: { 'content-type': 'application/json' },
    }),
  );

  assert.equal(wrongPasswordResponse.status, 401);
  assert.equal(unknownUserResponse.status, 401);
  assert.deepEqual(await wrongPasswordResponse.json(), { error: 'Invalid username or password' });
  assert.deepEqual(await unknownUserResponse.json(), { error: 'Invalid username or password' });

  await assert.rejects(() => auth.login({ username: 'coach', password: 'wrong-pass' }), InvalidCredentialsError);
  await assert.rejects(() => auth.login({ username: 'missing', password: 'wrong-pass' }), InvalidCredentialsError);
});

test('signup and login issues persistent secure session cookies and stores token hash only', async () => {
  const db = createMemoryRepo();
  const auth = createAuthService(db.repo);
  const signupHandler = createSignupHandler(auth);
  const loginHandler = createLoginHandler(auth);

  await signupHandler(
    new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username: 'coach', password: 'secret123' }),
      headers: { 'content-type': 'application/json' },
    }),
  );

  const loginResponse = await loginHandler(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'coach', password: 'secret123' }),
      headers: { 'content-type': 'application/json' },
    }),
  );

  assert.equal(loginResponse.status, 200);
  assert.equal(db.sessions.length, 1);
  const expiresAtMs = db.sessions[0].expiresAt.getTime();
  assert.ok(expiresAtMs > Date.now() + 25 * 24 * 60 * 60 * 1000);
  assert.ok(expiresAtMs < Date.now() + 31 * 24 * 60 * 60 * 1000);
  const cookie = loginResponse.headers.get('set-cookie');
  assert.ok(cookie);
  assert.match(cookie, /coach_session=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Max-Age=2592000/);
  const token = cookie.split(';')[0].split('=')[1];
  assert.ok(token);
  assert.notEqual(db.sessions[0].sessionTokenHash, token);
});
