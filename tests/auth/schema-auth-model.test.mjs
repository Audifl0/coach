import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schemaPath = new URL('../../prisma/schema.prisma', import.meta.url);
const migrationPath = new URL('../../prisma/migrations/0001_init_auth/migration.sql', import.meta.url);

test('schema defines username-first auth models', () => {
  const schema = readFileSync(schemaPath, 'utf8');

  assert.match(schema, /model\s+User\s*\{/);
  assert.match(schema, /username\s+String\s+@unique/);
  assert.match(schema, /passwordHash\s+String/);

  assert.match(schema, /model\s+Session\s*\{/);
  assert.match(schema, /sessionTokenHash\s+String\s+@unique/);
  assert.match(schema, /userId\s+String/);
  assert.match(schema, /expiresAt\s+DateTime/);
  assert.match(schema, /@@index\(\[userId\]\)/);
});

test('migration creates user and session tables with constraints', () => {
  const migration = readFileSync(migrationPath, 'utf8');

  assert.match(migration, /CREATE TABLE\s+"User"/i);
  assert.match(migration, /CREATE TABLE\s+"Session"/i);
  assert.match(migration, /CREATE UNIQUE INDEX\s+"User_username_key"/i);
  assert.match(migration, /FOREIGN KEY\s*\("userId"\)\s*REFERENCES\s*"User"\s*\("id"\)/i);
  assert.match(migration, /CREATE UNIQUE INDEX\s+"Session_sessionTokenHash_key"/i);
  assert.match(migration, /CREATE INDEX\s+"Session_userId_idx"/i);
});
