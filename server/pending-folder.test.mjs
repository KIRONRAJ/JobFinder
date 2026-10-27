import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deletePendingFolder } from './pending-folder.js';

async function setup() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pend-'));
  for (const f of ['Pending to Apply/Acme', 'Applied/Acme', 'Pending to Apply/Shared']) {
    await fs.mkdir(path.join(dir, f), { recursive: true });
    await fs.writeFile(path.join(dir, f, 'x.txt'), 'x');
  }
  return dir;
}
const fallbackDir = (e) => `Pending to Apply/${e.company}`;
const exists = (p) => fs.access(p).then(() => true, () => false);

test('removes an unapplied role folder', async () => {
  const dir = await setup();
  const ok = await deletePendingFolder({ careerDir: dir, entry: { company: 'Acme', status: 'researching', folderPath: 'Pending to Apply/Acme' }, remaining: [], fallbackDir });
  assert.equal(ok, true);
  assert.equal(await exists(path.join(dir, 'Pending to Apply/Acme')), false);
});

test('falls back to the company folder when folderPath is empty', async () => {
  const dir = await setup();
  const ok = await deletePendingFolder({ careerDir: dir, entry: { company: 'Acme', status: 'researching', folderPath: '' }, remaining: [], fallbackDir });
  assert.equal(ok, true);
});

test('keeps a folder another remaining entry still uses', async () => {
  const dir = await setup();
  const ok = await deletePendingFolder({ careerDir: dir, entry: { company: 'Shared', status: 'researching', folderPath: 'Pending to Apply/Shared' }, remaining: [{ company: 'Shared', status: 'researching', folderPath: 'Pending to Apply/Shared' }], fallbackDir });
  assert.equal(ok, false);
  assert.equal(await exists(path.join(dir, 'Pending to Apply/Shared')), true);
});

test('never touches Applied/ or anything outside Pending to Apply', async () => {
  const dir = await setup();
  assert.equal(await deletePendingFolder({ careerDir: dir, entry: { company: 'Acme', status: 'applied', folderPath: 'Applied/Acme' }, remaining: [], fallbackDir }), false);
  assert.equal(await deletePendingFolder({ careerDir: dir, entry: { company: 'Acme', status: 'researching', folderPath: 'Applied/Acme' }, remaining: [], fallbackDir }), false);
  assert.equal(await deletePendingFolder({ careerDir: dir, entry: { company: 'x', status: 'researching', folderPath: 'Pending to Apply/../Applied' }, remaining: [], fallbackDir }), false);
  assert.equal(await exists(path.join(dir, 'Applied/Acme')), true);
});
