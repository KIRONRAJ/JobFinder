// Cron-like job: run the /gmailfetch sweep every 5 hours (survives restarts via a small state file).
// Polls every 10 minutes and runs once 5 hours have passed since the last run. If Claude is busy it
// just tries again at the next poll. Telegram is only pinged when the sweep actually wrote something.

import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', 'data');
export const GMAIL_SCHEDULE_FILE = path.join(DATA, 'gmailfetch-schedule.json');
const AUDIT_FILE = path.join(DATA, 'audit-log.jsonl');

async function auditLines(file) {
  try { return (await fsPromises.readFile(file, 'utf8')).split('\n').filter(Boolean).length; } catch { return 0; }
}

export function createGmailTick({
  run, notify, file = GMAIL_SCHEDULE_FILE, auditFile = AUDIT_FILE, intervalMs = 5 * 3_600_000, count = 5, now = Date.now,
}) {
  return async function tick() {
    let state = {};
    try { state = JSON.parse(await fsPromises.readFile(file, 'utf8')); } catch { /* first run */ }
    if (!state.lastRunAt) {
      // First start: the cadence begins now, so a deploy does not trigger a sweep out of the blue.
      await fsPromises.writeFile(file, JSON.stringify({ lastRunAt: now() }));
      return 'initialised';
    }
    if (now() - state.lastRunAt < intervalMs) return 'not-due';
    const before = await auditLines(auditFile);
    const res = await run({ count });
    if (res?.busy) return 'busy'; // not stamped: retried at the next poll
    await fsPromises.writeFile(file, JSON.stringify({ lastRunAt: now(), lastOk: !!res?.ok }));
    if (!res?.ok) { console.error('gmail schedule: sweep failed:', res?.error); return 'failed'; }
    if ((await auditLines(auditFile)) > before) {
      await notify(`📨 Auto mailbox check (every 5h): new mail filed.\n\n${String(res.summary || '').slice(0, 3500)}`);
      return 'notified';
    }
    return 'quiet';
  };
}

export function startGmailSchedule({ run, notify, pollMs = 10 * 60_000, ...rest }) {
  const tick = createGmailTick({ run, notify, ...rest });
  const safe = () => tick().catch((err) => console.error('gmail schedule: tick failed:', err.message));
  safe();
  setInterval(safe, pollMs);
  console.log('  gmail schedule: on (mailbox sweep every 5h, Telegram only when something is filed)');
}
