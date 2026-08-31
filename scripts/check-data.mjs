/**
 * Guards the one file in this repo that cannot be reconstructed.
 *
 * applications.json holds months of research across dozens of chat sessions.
 * The "never overwrite, never drop an entry" rule that protects it has always
 * been behavioural: it held because whoever was editing was careful. Every
 * write goes through a hand-rolled script run once, so one bad splice or one
 * `JSON.stringify` of the wrong variable silently loses entries, and the loss
 * only surfaces when someone notices a role missing from the UI weeks later.
 *
 * This makes the invariant structural instead. It compares the working tree
 * against the last commit and fails if anything was lost:
 *   - the file still parses
 *   - no entry id present in HEAD has disappeared
 *   - no matchKey present in HEAD has disappeared
 *   - the entry count has not gone down
 *
 * Additions and in-place edits pass, which is every legitimate operation.
 * Deleting a role is legitimate too but rare and deliberate, so it needs
 * --allow-deletions to say so out loud rather than passing silently.
 *
 * Usage:  node scripts/check-data.mjs [--allow-deletions]
 * Exit 0 = safe, 1 = something was lost, 2 = could not check.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAREER_DIR = path.resolve(APP_DIR, '..');
const REL = 'App/data/applications.json';
const allowDeletions = process.argv.includes('--allow-deletions');

function headVersion() {
  try {
    return execFileSync('git', ['show', `HEAD:${REL}`], {
      cwd: CAREER_DIR,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null; // not committed yet, or not a git repo — nothing to compare against
  }
}

function parseOrDie(text, label) {
  try {
    const list = JSON.parse(text);
    if (!Array.isArray(list)) throw new Error('not an array');
    return list;
  } catch (err) {
    console.error(`FAIL  ${label} is not valid JSON: ${err.message}`);
    process.exit(label === 'working tree' ? 1 : 2);
  }
}

const current = parseOrDie(fs.readFileSync(path.join(CAREER_DIR, REL), 'utf8'), 'working tree');
const previousText = headVersion();
if (previousText === null) {
  console.log(`SKIP  no committed version of ${REL} to compare against (${current.length} entries parse OK)`);
  process.exit(0);
}
const previous = parseOrDie(previousText, 'HEAD');

// Date fields that are typed as ISO strings but get written by hand-rolled
// scripts that bypass TypeScript entirely. One of those wrote an epoch number
// into `task.completedAt` on 20 Aug 2026; `Date.parse` returned NaN, so a
// finished assessment read as outstanding and the banner nagged about work
// already done for a day. A field that doesn't parse is a silent wrong answer,
// not a crash, which is exactly the kind that survives unnoticed.
function unparseableDates(list) {
  const bad = [];
  for (const e of list) {
    for (const t of e.tasks ?? []) {
      for (const field of ['dueAt', 'completedAt']) {
        const v = t[field];
        if (v == null) continue;
        if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) {
          bad.push(`${e.company} — ${t.label ?? t.id}: tasks[].${field} = ${JSON.stringify(v)}`);
        }
      }
    }
  }
  return bad;
}

const keys = (list, field) => new Set(list.map((e) => e && e[field]).filter(Boolean));
const lostIds = [...keys(previous, 'id')].filter((k) => !keys(current, 'id').has(k));
const lostKeys = [...keys(previous, 'matchKey')].filter((k) => !keys(current, 'matchKey').has(k));
const shrank = current.length < previous.length;

const badDates = unparseableDates(current);

if (!lostIds.length && !lostKeys.length && !shrank && !badDates.length) {
  const added = current.length - previous.length;
  console.log(`OK    ${REL}: ${previous.length} -> ${current.length} entries` + (added ? ` (+${added})` : ', none lost'));
  process.exit(0);
}

if (badDates.length && !lostIds.length && !lostKeys.length && !shrank) {
  console.error(`\nFAIL  ${REL} has ${badDates.length} date field(s) that won't parse`);
  for (const b of badDates) console.error(`        - ${b}`);
  console.error('\n      These are typed as ISO 8601 strings. An epoch number here reads as');
  console.error('      "never happened" to anything calling Date.parse.\n');
  process.exit(1);
}

// Name what went missing. A count alone doesn't tell you which role to restore.
const byId = new Map(previous.map((e) => [e.id, e]));
const label = (id) => {
  const e = byId.get(id);
  return e ? `${e.company} — ${e.role}` : id;
};
console.error(`\n${allowDeletions ? 'WARN' : 'FAIL'}  ${REL} lost data since HEAD`);
console.error(`      entries: ${previous.length} -> ${current.length}`);
if (lostIds.length) {
  console.error(`      ${lostIds.length} id(s) gone:`);
  for (const id of lostIds.slice(0, 20)) console.error(`        - ${label(id)}  [${id}]`);
  if (lostIds.length > 20) console.error(`        …and ${lostIds.length - 20} more`);
}
if (lostKeys.length) console.error(`      ${lostKeys.length} matchKey(s) gone: ${lostKeys.slice(0, 10).join(', ')}`);

if (allowDeletions) {
  console.error('      --allow-deletions set, so this is not blocking.\n');
  process.exit(0);
}
console.error(`\n      Restore with:  git checkout HEAD -- "${REL}"`);
console.error('      If the removal was intentional, re-run with --allow-deletions.\n');
process.exit(1);
