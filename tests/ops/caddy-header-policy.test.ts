import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(__dirname, '..', '..');

async function readProjectFile(relativePath: string): Promise<string> {
  return readFile(path.join(projectRoot, relativePath), 'utf8');
}

test('caddy config includes low-risk browser hardening headers at the HTTPS entrypoint', async () => {
  const caddyfile = await readProjectFile('infra/caddy/Caddyfile');

  assert.match(caddyfile, /X-Content-Type-Options\s+"?nosniff"?/i);
  assert.match(caddyfile, /Referrer-Policy\s+"?strict-origin-when-cross-origin"?/i);
  assert.match(caddyfile, /Permissions-Policy/i);
  assert.match(caddyfile, /X-Frame-Options\s+"?DENY"?/i);
  assert.match(caddyfile, /Content-Security-Policy-Report-Only|frame-ancestors/i);
  assert.doesNotMatch(caddyfile, /Content-Security-Policy\s+"/i);
});

test('deploy docs include Caddy reload and header verification steps on existing smoke path', async () => {
  const deployDoc = await readProjectFile('docs/operations/vps-deploy.md');

  assert.match(deployDoc, /docker compose --env-file \/opt\/coach\/\.env\.production (exec|restart|up).*caddy/i);
  assert.match(deployDoc, /X-Content-Type-Options/i);
  assert.match(deployDoc, /Referrer-Policy/i);
  assert.match(deployDoc, /Permissions-Policy/i);
  assert.match(deployDoc, /release-proof/i);
});
