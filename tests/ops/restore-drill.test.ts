import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(__dirname, '..', '..');

async function readScript(relativePath: string): Promise<string> {
  return readFile(path.join(projectRoot, relativePath), 'utf8');
}

test('restore script enforces strict SQL replay semantics', async () => {
  const restoreScript = await readScript('infra/scripts/restore.sh');

  assert.match(restoreScript, /ON_ERROR_STOP=1|ON_ERROR_STOP=on/);
  assert.match(restoreScript, /--single-transaction/);
  assert.match(restoreScript, /psql\s+-X/);
});

test('restore script requires dedicated drill database and blocks production target', async () => {
  const restoreScript = await readScript('infra/scripts/restore.sh');

  assert.match(restoreScript, /RESTORE_TARGET_DB/);
  assert.match(restoreScript, /RESTORE_TARGET_DB is required/);
  assert.match(restoreScript, /must not match production/i);
});

test('backup and restore scripts fail clearly when required env contract is missing', async () => {
  const backupScript = await readScript('infra/scripts/backup.sh');
  const restoreScript = await readScript('infra/scripts/restore.sh');

  assert.match(backupScript, /BACKUP_PASSPHRASE is required/);
  assert.match(restoreScript, /BACKUP_PASSPHRASE is required/);
  assert.match(restoreScript, /RESTORE_TARGET_DB is required/);
});

test('restore drill wrapper enforces deterministic stage order and evidence logging', async () => {
  const drillScript = await readScript('infra/scripts/run-restore-drill.sh');

  assert.match(drillScript, /backup\.sh/);
  assert.match(drillScript, /restore\.sh/);
  assert.match(drillScript, /smoke/i);
  assert.match(drillScript, /evidence/i);
  assert.match(drillScript, /set -euo pipefail/);
});

test('systemd timer schedules persistent monthly restore drills', async () => {
  const timerUnit = await readScript('infra/systemd/coach-restore-drill.timer');

  assert.match(timerUnit, /OnCalendar=monthly/);
  assert.match(timerUnit, /Persistent=true/);
  assert.match(timerUnit, /Unit=coach-restore-drill\.service/);
});

test('systemd service runs drill script as oneshot with predictable evidence directory', async () => {
  const serviceUnit = await readScript('infra/systemd/coach-restore-drill.service');

  assert.match(serviceUnit, /Type=oneshot/);
  assert.match(serviceUnit, /ExecStart=.*run-restore-drill\.sh/);
  assert.match(serviceUnit, /RESTORE_DRILL_EVIDENCE_DIR/);
});
