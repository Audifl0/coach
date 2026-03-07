import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(__dirname, '..', '..');

async function readProjectFile(relativePath: string): Promise<string> {
  return readFile(path.join(projectRoot, relativePath), 'utf8');
}

function assertInOrder(content: string, patterns: RegExp[]): void {
  let cursor = -1;

  for (const pattern of patterns) {
    const nextIndex = content.slice(cursor + 1).search(pattern);
    assert.notEqual(nextIndex, -1, `Expected to find ${pattern} after index ${cursor}.`);
    cursor += nextIndex + 1;
  }
}

test('release-proof package script points at the repo-native shell wrapper', async () => {
  const packageJson = JSON.parse(await readProjectFile('package.json')) as {
    scripts?: Record<string, string>;
  };

  assert.equal(
    packageJson.scripts?.['release:proof'],
    'bash infra/scripts/release-proof.sh',
  );
});

test('release-proof wrapper executes the narrow release gates in deterministic order', async () => {
  const releaseProofScript = await readProjectFile('infra/scripts/release-proof.sh');

  assert.match(releaseProofScript, /set -euo pipefail/);
  assertInOrder(releaseProofScript, [
    /pnpm typecheck/,
    /pnpm test/,
    /pnpm build/,
    /deploy\.sh/,
    /smoke-test-https\.sh/,
    /smoke-authenticated-dashboard\.mjs/,
  ]);
});

test('release-proof wrapper reuses existing deploy and smoke primitives instead of reimplementing them', async () => {
  const releaseProofScript = await readProjectFile('infra/scripts/release-proof.sh');

  assert.match(releaseProofScript, /deploy\.sh/);
  assert.match(releaseProofScript, /smoke-test-https\.sh/);
  assert.match(releaseProofScript, /smoke-authenticated-dashboard\.mjs/);
  assert.doesNotMatch(releaseProofScript, /docker compose|docker-compose/);
  assert.doesNotMatch(releaseProofScript, /curl .*\/api\/auth\/login/);
});

test('release-proof wrapper requires authenticated sanity as an explicit post-deploy stage', async () => {
  const releaseProofScript = await readProjectFile('infra/scripts/release-proof.sh');
  const deployScript = await readProjectFile('infra/scripts/deploy.sh');

  assert.match(releaseProofScript, /node "\$SCRIPT_DIR\/smoke-authenticated-dashboard\.mjs"/);
  assert.match(deployScript, /DEPLOY_SKIP_POST_DEPLOY_SMOKE/);
});

test('release-proof runbook documents prerequisites, evidence contract, and deploy handoff', async () => {
  const [releaseProofRunbook, deployRunbook] = await Promise.all([
    readProjectFile('docs/operations/release-proof.md'),
    readProjectFile('docs/operations/vps-deploy.md'),
  ]);

  assert.match(releaseProofRunbook, /APP_DOMAIN/);
  assert.match(releaseProofRunbook, /OPS_SMOKE_USERNAME/);
  assert.match(releaseProofRunbook, /OPS_SMOKE_PASSWORD/);
  assert.match(releaseProofRunbook, /OPS_SMOKE_EXPECTED_FOCUS_LABEL/);
  assert.match(releaseProofRunbook, /corepack pnpm release:proof -- \/opt\/coach\/\.env\.production/);
  assert.match(releaseProofRunbook, /==> typecheck/);
  assert.match(releaseProofRunbook, /==> deploy/);
  assert.match(releaseProofRunbook, /smoke_business_data=ok/);
  assert.match(releaseProofRunbook, /Release proof passed\./);
  assert.match(releaseProofRunbook, /Stop Conditions/i);
  assert.match(releaseProofRunbook, /vps-deploy\.md/);
  assert.match(deployRunbook, /release-proof\.md/);
});
