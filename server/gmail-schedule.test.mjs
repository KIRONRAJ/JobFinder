import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createGmailTick } from './gmail-schedule.js';

const H = 3_600_000;

test('gmail schedule: starts the clock on first boot, runs after 5h, retries when busy, pings only when filed', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gs-'));
  const file = path.join(dir, 's.json');
  const auditFile = path.join(dir, 'audit.jsonl');
  let t = 1_000_000;
  const calls = [];
  const sent = [];
  let result = { ok: true, summary: 'nothing' };
  let fileOnRun = false;
  const tick = createGmailTick({
    file, auditFile, now: () => t,
    run: async (o) => { calls.push(o.count); if (fileOnRun) await fs.appendFile(auditFile, '{"a":1}\n'); return result; },
    notify: async (m) => sent.push(m),
  });
  assert.equal(await tick(), 'initialised');
  assert.equal(calls.length, 0);
  t += 4 * H;
  assert.equal(await tick(), 'not-due');
  t += 1 * H;
  result = { busy: true };
  assert.equal(await tick(), 'busy');
  result = { ok: true, summary: 'nothing' };
  assert.equal(await tick(), 'quiet');
  assert.deepEqual(calls, [5, 5]);
  assert.equal(sent.length, 0);
  t += 5 * H;
  fileOnRun = true;
  result = { ok: true, summary: 'Added: Acme' };
  assert.equal(await tick(), 'notified');
  assert.match(sent[0], /Added: Acme/);
  t += 1 * H;
  assert.equal(await tick(), 'not-due');
});
