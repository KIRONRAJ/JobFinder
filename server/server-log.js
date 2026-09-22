// Reads this service's own journald output for Settings → Server log.
//
// The unit (/etc/systemd/system/jobsearchhq.service) writes no log file, so
// journald is the only place the server's stdout/stderr lands. It is a
// *rotating window*, not an archive — the permanent trail is
// data/audit-log.jsonl behind /api/audit-log. Two different questions: the
// audit log says what changed, this says whether the process was healthy.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Hardcoded, never taken from the request — this endpoint reads one unit. */
const UNIT = 'jobsearchhq.service';
const DEFAULT_LINES = 200;
export const MAX_LINES = 2000;

export function clampLines(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 1) return DEFAULT_LINES;
  return Math.min(v, MAX_LINES);
}

/**
 * `journalctl -o json` emits one JSON object per line. Skips anything
 * unparseable rather than failing the whole read, same tolerance as
 * /api/audit-log — a log viewer that 500s on one bad record is useless
 * precisely when you need it.
 */
export function parseJournal(stdout) {
  const rows = [];
  for (const line of stdout.split('\n')) {
    if (!line) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    const micros = Number(rec.__REALTIME_TIMESTAMP);
    if (!Number.isFinite(micros)) continue;
    // An array means the line wasn't valid UTF-8, which is when something has
    // already gone wrong — decode it rather than dropping the evidence.
    const message = Array.isArray(rec.MESSAGE)
      ? Buffer.from(rec.MESSAGE).toString('utf8')
      : rec.MESSAGE;
    if (typeof message !== 'string') continue;
    rows.push({
      at: Math.round(micros / 1000),
      priority: Number(rec.PRIORITY) || 6,
      message,
    });
  }
  // Newest first, matching /api/audit-log so both tabs read the same direction.
  return rows.reverse();
}

export async function readServerLog(lines) {
  // execFile, not exec — no shell, and the only interpolated value is an
  // integer that clampLines has already bounded.
  const { stdout } = await execFileAsync(
    'journalctl',
    [
      '-u',
      UNIT,
      '-n',
      String(clampLines(lines)),
      '--no-pager',
      '-o',
      'json',
      '--output-fields=MESSAGE,PRIORITY',
    ],
    { maxBuffer: 32 * 1024 * 1024 }
  );
  return parseJournal(stdout);
}
