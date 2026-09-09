import express from 'express';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec, spawn } from 'node:child_process';
import os from 'node:os';
import crypto from 'node:crypto';
import notifier from 'node-notifier';
import {
  syncPage,
  archivePage,
  notionEnabled,
  syncOutreachPage,
  outreachNotionEnabled,
  fetchUserFields,
} from './notion.js';
import { startTelegramNotifier, findCvDocument } from './notify-telegram.js';
import { startTelegramCommands } from './telegram-commands.js';
import { startMorningBriefing } from './telegram-briefing.js';
import { startCvWorker, fetchJobText } from './cv-worker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// App/server -> App -> "Career and Job"
const APP_DIR = path.resolve(__dirname, '..');
const CAREER_DIR = path.resolve(APP_DIR, '..');
const DATA_FILE = path.join(APP_DIR, 'data', 'applications.json');
const AUDIT_FILE = path.join(APP_DIR, 'data', 'audit-log.jsonl');
const LEARNING_LOOP_FILE = path.join(APP_DIR, 'data', 'learning-loop.json');
const UPSKILL_REPORT_FILE = path.join(APP_DIR, 'data', 'upskill-report.json');
const STUDY_PROGRESS_FILE = path.join(APP_DIR, 'data', 'study-progress.json');
const REFRESHER_CONFIDENCE_FILE = path.join(APP_DIR, 'data', 'refresher-confidence.json');
const INTERVIEW_BANK_FILE = path.join(APP_DIR, 'data', 'interview-bank.json');
const SKILL_GUIDES_DIR = path.join(CAREER_DIR, 'Required Documents', 'Skill Guides');
const OUTREACH_FILE = path.join(APP_DIR, 'data', 'outreach.json');
const NOTION_QUEUE_FILE = path.join(APP_DIR, 'data', 'notion-queue.json');
const ASSESSMENTS_FILE = path.join(APP_DIR, 'data', 'assessments.json');
const WALLPAPER_CACHE_FILE = path.join(APP_DIR, 'data', 'wallpaper-cache.json');
const EVENTS_FILE = path.join(APP_DIR, 'data', 'events.json');
/** Everything the outreach sections write lives under this one folder, which
 *  relocateFolder() never touches — see deleteOutreachFolder() for the guard. */
const OUTREACH_DIR_NAME = 'Outreach';
const REQUESTS_DIR = path.join(APP_DIR, 'requests');
const ENV_FILE = path.join(APP_DIR, '.env');

/**
 * Loads App/.env into process.env, overriding any ambient environment
 * variable of the same name. This app only ever runs on this one machine
 * (no separate deploy environment with its own env vars to defer to), so
 * .env is the single source of truth — a stray User-level env var from an
 * unrelated tool (e.g. another app also exporting TELEGRAM_BOT_TOKEN
 * globally) must never silently win over this app's own secret. Nothing did
 * this before — notion.js has its own private env reader that only
 * populates a local object, never process.env, which left `TAILSCALE_IP` in
 * .env.example dead on arrival. Needed now because APP_PASSWORD_HASH/
 * SESSION_SECRET below must actually be visible here. Duplicated from
 * notion.js's version rather than shared, to avoid touching code that
 * already works.
 */
function loadEnvFile() {
  let file = ENV_FILE;
  try {
    if (fsSync.statSync(ENV_FILE).isDirectory()) {
      const nested = path.join(ENV_FILE, '.env');
      if (fsSync.existsSync(nested)) file = nested;
    }
  } catch {
    /* no .env at all — fine, everything below has its own fallback */
  }
  try {
    for (const line of fsSync.readFileSync(file, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
      process.env[key] = value;
    }
  } catch {
    /* no .env — fine */
  }
}
loadEnvFile();

const PORT = Number(process.env.PORT) || 5178;
const STALE_APPLIED_DAYS = 7;
const DEADLINE_SOON_DAYS = 3;
const RENOTIFY_AFTER_MS = 3 * 24 * 60 * 60 * 1000; // don't re-nag on the same entry more than once every 3 days

const app = express();
app.use(express.json({ limit: '2mb' }));

/**
 * Loopback binding is not enough on its own: any page the user visits could
 * POST to http://localhost:5178 from their own browser, and this server can
 * spawn Claude with permissions bypassed. Vite proxies /api same-origin, so
 * legitimate requests never carry a cross-site fetch metadata header.
 *
 * The origin allowlist also covers Tailscale's whole CGNAT block
 * (100.64.0.0/10, second octet 64-127 — the range every Tailscale IP is
 * assigned from) rather than one hardcoded address, so it keeps working if
 * this machine's tailnet IP is ever reassigned. Still bounded to loopback +
 * tailnet only — a request whose Origin is an ordinary home Wi-Fi/LAN
 * address (192.168.x.x etc.) is not covered by this and gets rejected.
 */
app.use((req, res, next) => {
  const site = req.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') {
    return res.status(403).json({ error: 'Cross-site requests are not allowed.' });
  }
  const origin = req.get('origin');
  if (
    origin &&
    !/^https?:\/\/(localhost|127\.0\.0\.1|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}|servo|[a-z0-9-]+\.ts\.net)(:\d+)?$/i.test(
      origin
    )
  ) {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }
  next();
});

// ---------- auth (single shared password, no accounts) ----------

/**
 * A signed, HttpOnly session cookie gates every /api/* route below except
 * login/session/logout. Single-user by design — one shared password, no
 * accounts, no session store (the cookie itself is the whole session,
 * verified on every request via its HMAC signature).
 *
 * Deliberately no `Secure` flag on the cookie: the app is served over plain
 * http:// (Tailscale's WireGuard tunnel is the real transport encryption
 * here, not TLS at the HTTP layer) — setting Secure would make the browser
 * silently stop sending the cookie and break login entirely.
 */
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function ensureSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const secret = crypto.randomBytes(32).toString('hex');
  process.env.SESSION_SECRET = secret;
  try {
    fsSync.appendFileSync(
      ENV_FILE,
      `\n# Auto-generated on first run — signs session cookies. Changing this logs everyone out.\nSESSION_SECRET=${secret}\n`
    );
  } catch (err) {
    console.warn(
      `  could not persist SESSION_SECRET to .env (${err.message}) — sessions won't survive a restart`
    );
  }
  return secret;
}
const SESSION_SECRET = ensureSessionSecret();

function verifyPassword(password) {
  const hashConfig = process.env.APP_PASSWORD_HASH;
  if (!hashConfig || !password) return false;
  const [saltHex, hashHex] = hashConfig.split(':');
  if (!saltHex || !hashHex) return false;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function signSession() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_MAX_AGE_MS })).toString(
    'base64url'
  );
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySession(token) {
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function setSessionCookie(res, token) {
  const maxAgeSeconds = Math.floor(SESSION_MAX_AGE_MS / 1000);
  res.setHeader(
    'Set-Cookie',
    `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
}

function verifyMcpToken(header) {
  const expected = process.env.MCP_AUTH_TOKEN;
  if (!expected || !header) return false;
  const provided = header.startsWith('Bearer ') ? header.slice(7) : header;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  return providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);
}

function requireAuth(req, res, next) {
  if (verifySession(getCookie(req, 'session'))) return next();
  if (verifyMcpToken(req.get('Authorization'))) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// Cheap defense-in-depth against password guessing — the tailnet boundary is
// the primary control, this just blunts a fast-guessing script. Per-IP,
// in-memory, resets on success or after the window passes.
const LOGIN_ATTEMPTS = new Map();
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function loginRateLimited(ip) {
  const now = Date.now();
  const rec = LOGIN_ATTEMPTS.get(ip);
  if (!rec || rec.resetAt < now) {
    LOGIN_ATTEMPTS.set(ip, { count: 0, resetAt: now + LOGIN_WINDOW_MS });
    return false;
  }
  return rec.count >= LOGIN_MAX_ATTEMPTS;
}
function recordLoginFailure(ip) {
  LOGIN_ATTEMPTS.get(ip)?.count != null && LOGIN_ATTEMPTS.get(ip).count++;
}

app.post('/api/login', (req, res) => {
  const ip = req.ip;
  if (loginRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many attempts — wait a few minutes and try again.' });
  }
  if (!process.env.APP_PASSWORD_HASH) {
    return res
      .status(503)
      .json({ error: 'No password set yet — run "node scripts/set-password.mjs" on the server.' });
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!verifyPassword(password)) {
    recordLoginFailure(ip);
    return res.status(401).json({ error: 'Wrong password.' });
  }
  LOGIN_ATTEMPTS.delete(ip);
  setSessionCookie(res, signSession());
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  res.json({ authenticated: verifySession(getCookie(req, 'session')) });
});

app.post('/api/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// Everything else under /api requires a valid session — registered after the
// three routes above, so those stay reachable to actually log in.
app.use('/api', requireAuth);

// ---------- helpers ----------

function slugify(str) {
  return (str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function matchKeyFor(a) {
  return slugify(`${a.company || ''}|${a.role || ''}`);
}

async function ensureDirs() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.mkdir(REQUESTS_DIR, { recursive: true });
}

async function readData() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

// Write via a temp file + rename so an interrupted write can never leave a
// half-written applications.json behind — this file is the only copy of the
// tracker's data now, so a corrupt write would be a real data loss.
async function writeData(list) {
  await ensureDirs();
  const tmp = `${DATA_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(list, null, 2), 'utf8');
  await fs.rename(tmp, DATA_FILE);
}

// Serializes every read-modify-write against a named data file (applications,
// outreach) so two overlapping writers — two near-simultaneous requests, or a
// background timer racing a request — can't both read the same snapshot and
// have the second writer silently clobber the first's change. There's no
// database transaction underneath this, just a shared JSON file, so this is
// the whole safety net. Route handlers acquire it via the `serializeRequests`
// middleware below (held for the handler's full lifetime, not just the
// write); background jobs like checkStaleApplied call this directly.
const dataLocks = new Map();
function withDataLock(key, fn) {
  const prev = dataLocks.get(key) || Promise.resolve();
  const run = prev.then(fn, fn);
  dataLocks.set(key, run.catch(() => {}));
  return run;
}

// Holds the named lock for a request's entire lifetime (until the response
// finishes or the connection closes), not just around one readData/writeData
// pair — a handler's read, mutate, and write all happen inside that window.
function serializeRequests(key) {
  return (req, res, next) => {
    withDataLock(key, () => {
      let released = false;
      return new Promise((resolve) => {
        const release = () => {
          if (released) return;
          released = true;
          resolve();
        };
        res.on('finish', release);
        res.on('close', release);
        next();
      });
    }).catch(() => {});
  };
}

// Append-only JSONL rather than a JSON array: every write is a bare append with
// no read-modify-write cycle, so concurrent appends can't clobber each other and
// a truncated final line costs one record instead of the whole file. Claude Code
// appends here directly too when it edits applications.json outside the API.
async function appendAudit(event) {
  try {
    await ensureDirs();
    const line = JSON.stringify({ at: Date.now(), actor: 'user', ...event });
    await fs.appendFile(AUDIT_FILE, `${line}\n`, 'utf8');
  } catch (err) {
    // An audit failure must never break the operation it was recording.
    console.error('audit append failed:', err.message);
  }
}

function uid() {
  return `app_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function logActivity(entry, kind, text) {
  entry.activity = [...(entry.activity ?? []), { at: Date.now(), kind, text }];
}

// Mirrors businessDaysFrom in src/types.ts — duplicated rather than shared
// because the client bundle and the server have no common module boundary.
// Public holidays are deliberately ignored; the date is advisory.
const FOLLOW_UP_BUSINESS_DAYS = 8;

function businessDaysFrom(dateStr, n = FOLLOW_UP_BUSINESS_DAYS) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left--;
  }
  // Formatted from the local parts, not toISOString(): the date was built at
  // local midnight, and UTC+12 would roll it back a full day.
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const STATUS_LABEL = {
  researching: 'Researching',
  applied: 'Applied',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

// Mirrors the enum unions in src/types.ts. TypeScript only checks these at
// compile time on the client — a hand-edited PATCH body or a client bug can
// still put a garbage value straight into applications.json with nothing to
// stop it, since there was no runtime check on this side at all. This is
// deliberately narrow: only the fields whose value the UI actually branches
// on by exact string (a typo'd Status renders `undefined` in StatusPill,
// etc.) — not a full schema validator for every field.
const VALID_STATUS = new Set(Object.keys(STATUS_LABEL));
const VALID_FIT = new Set(['strong', 'good', 'stretch']);
const VALID_EMPLOYMENT = new Set(['job', 'internship']);

function findInvalidEnumField(body) {
  if (body.status !== undefined && !VALID_STATUS.has(body.status)) {
    return { field: 'status', allowed: [...VALID_STATUS] };
  }
  if (body.fit !== undefined && !VALID_FIT.has(body.fit)) {
    return { field: 'fit', allowed: [...VALID_FIT] };
  }
  if (body.employment !== undefined && !VALID_EMPLOYMENT.has(body.employment)) {
    return { field: 'employment', allowed: [...VALID_EMPLOYMENT] };
  }
  return null;
}

// ---------- outreach helpers (direct-to-company + recruiters) ----------

const OUTREACH_STATUS_LABEL = {
  'to-contact': 'To contact',
  emailed: 'Emailed',
  replied: 'Replied',
  'in-conversation': 'In conversation',
  'no-reply': 'No reply',
  closed: 'Closed',
};

// Mirrors KIND_META in src/types.ts — same duplication rationale as
// businessDaysFrom: no shared module boundary between bundle and server.
const OUTREACH_KIND_FOLDER = { company: 'Companies', recruiter: 'Recruiters' };

const OUTREACH_FOLLOW_UP_BUSINESS_DAYS = 7;
const OUTREACH_REPLY_TURNAROUND_BUSINESS_DAYS = 2;

function outreachUid() {
  return `out_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Kind is part of the key so a recruiter and a company of the same name
 *  (e.g. a consultancy that both hires and places) don't collide. */
function outreachMatchKeyFor(e) {
  return slugify(`${e.kind || ''}|${e.name || ''}`);
}

async function readOutreach() {
  try {
    const raw = await fs.readFile(OUTREACH_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

// Same temp-file + rename discipline as writeData — outreach.json is likewise
// the only copy of this data.
async function writeOutreach(list) {
  await fs.mkdir(path.dirname(OUTREACH_FILE), { recursive: true });
  const tmp = `${OUTREACH_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(list, null, 2), 'utf8');
  await fs.rename(tmp, OUTREACH_FILE);
}

function outreachFolderFor(entry) {
  const seg = OUTREACH_KIND_FOLDER[entry.kind] || 'Companies';
  return `${OUTREACH_DIR_NAME}/${seg}/${entry.name}`;
}

/**
 * Delete an outreach entry's folder. Deliberately NOT reusing the applications
 * delete path: that one is happy to remove anything resolving inside "Career
 * and Job", which would let a hand-edited folderPath of "Applied/Datacom" take
 * a real job folder with it. This asserts the Outreach/ prefix and refuses
 * anything else, so the blast radius is structurally bounded.
 */
async function deleteOutreachFolder(entry) {
  if (!entry.folderPath) return false;
  const resolved = safeCareerPath(entry.folderPath);
  if (!resolved) return false;
  const outreachRoot = path.resolve(CAREER_DIR, OUTREACH_DIR_NAME);
  if (!resolved.startsWith(outreachRoot + path.sep)) {
    console.warn(
      `refusing to delete outreach folder outside ${OUTREACH_DIR_NAME}/: ${entry.folderPath}`
    );
    return false;
  }
  if (!(await pathExists(resolved))) return false;
  await fs.rm(resolved, { recursive: true, force: true });
  return true;
}

/** The date an entry next needs attention, or '' when none is owed. */
function outreachFollowUpFor(entry) {
  if (entry.status === 'emailed' && entry.lastEmailedOn) {
    return businessDaysFrom(entry.lastEmailedOn, OUTREACH_FOLLOW_UP_BUSINESS_DAYS);
  }
  if (entry.status === 'replied' && entry.repliedOn) {
    return businessDaysFrom(entry.repliedOn, OUTREACH_REPLY_TURNAROUND_BUSINESS_DAYS);
  }
  return '';
}

/**
 * Resolve a user-supplied relative folder path against "Career and Job" and
 * refuse anything that escapes it. folderPath comes from tracker entries, so
 * a bad/hand-edited value must never let a request touch arbitrary disk paths.
 */
function safeCareerPath(relative) {
  if (!relative || typeof relative !== 'string') return null;
  const resolved = path.resolve(CAREER_DIR, relative);
  const base = path.resolve(CAREER_DIR);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

// Statuses whose folder gets moved under a status-named parent (Applied/,
// Interview/, Declined/, ...). rejected/withdrawn roles move to Declined/
// rather than being deleted (changed 14 Aug 2026 — Kironraj wants the old
// CV/CL drafts kept around for later analysis, not scrapped) — the app card
// + Notion row already carry the record, but the drafts themselves stay too.
const ORGANIZE_STATUS_FOLDER = {
  researching: 'Pending to Apply',
  applied: 'Applied',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Declined',
  withdrawn: 'Declined',
};

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Keeps an entry's on-disk CV/CL folder in sync with its status. Mutates
 * entry.folderPath in place; caller is responsible for persisting it.
 */
async function relocateFolder(entry) {
  const current = safeCareerPath(entry.folderPath);
  if (!current || !(await pathExists(current))) return;

  const label = ORGANIZE_STATUS_FOLDER[entry.status];
  if (!label) return; // unmapped status — leave the folder where it is

  const companyName = path.basename(current);
  const destDir = safeCareerPath(path.join(label, companyName));
  if (!destDir || destDir === current) return;

  await fs.mkdir(path.dirname(destDir), { recursive: true });
  if (await pathExists(destDir)) {
    // Same company already has a folder here (a different role applied
    // earlier) — merge files in rather than skipping the move, since
    // filenames are per-role ("CV - Company - Role.docx") and won't collide.
    for (const file of await fs.readdir(current)) {
      const from = path.join(current, file);
      const to = path.join(destDir, file);
      if (await pathExists(to)) {
        console.error(`relocateFolder: file already exists at destination, skipping: ${to}`);
        continue;
      }
      await fs.rename(from, to);
    }
    await fs.rmdir(current).catch(() => {});
  } else {
    await fs.rename(current, destDir);
  }
  entry.folderPath = path.join(label, companyName).split(path.sep).join('/');
}

// ---------- notion ----------

/**
 * Mirror one entry to Notion and persist the returned page id. Deliberately
 * fire-and-forget at the call sites: a Notion outage must never fail or delay
 * a local write, since applications.json is the authoritative copy.
 */
let lastNotionError = null;

// ---------- retry queue ----------
//
// A failed sync used to just be a console.error and a stale row forever — no
// retry, no dead-letter, nothing for /api/health to point at beyond "it
// failed once". This persists the failure so a later drain (on a timer, and
// on next server start) can catch it up once Notion's back, without the
// caller having to remember to retry anything itself.
const NOTION_QUEUE_MAX_ATTEMPTS = 20;

async function readNotionQueue() {
  try {
    return JSON.parse(await fs.readFile(NOTION_QUEUE_FILE, 'utf8'));
  } catch {
    return [];
  }
}

async function writeNotionQueue(list) {
  await ensureDirs();
  // Same temp-then-rename pattern as writeData — this file gets rewritten
  // from a background timer, so an interrupted write shouldn't be able to
  // leave a truncated queue behind.
  const tmp = `${NOTION_QUEUE_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(list, null, 2), 'utf8');
  await fs.rename(tmp, NOTION_QUEUE_FILE);
}

async function enqueueNotionRetry(kind, id) {
  const queue = await readNotionQueue();
  if (queue.some((q) => q.kind === kind && q.id === id)) return;
  queue.push({ kind, id, queuedAt: Date.now(), attempts: 0 });
  await writeNotionQueue(queue);
}

async function drainNotionQueue() {
  if (!notionEnabled) return;
  const queue = await readNotionQueue();
  if (queue.length === 0) return;
  const remaining = [];
  for (const item of queue) {
    try {
      if (item.kind === 'app') {
        const list = await readData();
        const entry = list.find((a) => a.id === item.id);
        if (!entry) continue; // deleted since — drop the retry
        await syncToNotion(entry, { fromQueue: true });
      } else {
        const list = await readOutreach();
        const entry = list.find((e) => e.id === item.id);
        if (!entry) continue;
        await syncOutreachToNotion(entry, { fromQueue: true });
      }
    } catch (err) {
      const attempts = (item.attempts ?? 0) + 1;
      if (attempts >= NOTION_QUEUE_MAX_ATTEMPTS) {
        console.error(
          `Notion retry queue: giving up on ${item.kind} ${item.id} after ${attempts} attempts — ${err.message}`
        );
        continue; // drop it — a permanently broken row shouldn't retry forever
      }
      remaining.push({ ...item, attempts });
    }
  }
  await writeNotionQueue(remaining);
}

async function syncToNotion(entry, { fromQueue = false } = {}) {
  if (!notionEnabled) return;
  let pageId;
  try {
    pageId = await syncPage(entry);
    lastNotionError = null;
  } catch (err) {
    // Recorded so /api/health can tell the UI sync is failing, rather than
    // leaving a permanently green dot over a broken mirror.
    lastNotionError = err.message;
    if (!fromQueue) await enqueueNotionRetry('app', entry.id);
    throw err;
  }
  if (!pageId || pageId === entry.notionPageId) return;

  // Re-read rather than closing over the caller's array: the entry may have
  // been rewritten by another request while the network call was in flight.
  const list = await readData();
  const idx = list.findIndex((a) => a.id === entry.id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], notionPageId: pageId };
  await writeData(list);
}

/** Outreach counterpart to syncToNotion — same fire-and-forget contract, same
 *  re-read-before-write so a concurrent request can't be clobbered. */
async function syncOutreachToNotion(entry, { fromQueue = false } = {}) {
  if (!notionEnabled) return;
  let pageId;
  try {
    pageId = await syncOutreachPage(entry);
    lastNotionError = null;
  } catch (err) {
    lastNotionError = err.message;
    if (!fromQueue) await enqueueNotionRetry('outreach', entry.id);
    throw err;
  }
  if (!pageId || pageId === entry.notionPageId) return;

  const list = await readOutreach();
  const idx = list.findIndex((e) => e.id === entry.id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], notionPageId: pageId };
  await writeOutreach(list);
}

// ---------- stale-applied notifications ----------

function daysSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  then.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - then.getTime()) / 86_400_000);
}

// Runs on startup and on an interval: pops a native toast for any 'applied'
// entry that's crossed the stale threshold, skipping ones already nagged
// about recently so this doesn't fire every single check.
async function checkStaleApplied() {
  try {
    // Goes through the same lock the request middleware uses — this timer
    // reads and conditionally writes applications.json same as any handler,
    // so it races them the same way without it.
    await withDataLock('applications', () => checkStaleAppliedLocked());
  } catch (err) {
    console.error('Stale-applied check failed:', err);
  }
}

async function checkStaleAppliedLocked() {
  try {
    const list = await readData();
    const now = Date.now();
    let changed = false;

    for (const entry of list) {
      // Stale applied — sent something, heard nothing back.
      if (entry.status === 'applied') {
        const days = daysSince(entry.date);
        const due = days !== null && days >= STALE_APPLIED_DAYS;
        const quiet = entry.staleNotifiedAt && now - entry.staleNotifiedAt < RENOTIFY_AFTER_MS;
        if (due && !quiet) {
          notifier.notify({
            title: 'Job Search HQ — follow up?',
            message: `${entry.role} at ${entry.company} — applied ${days}d ago, no update yet.`,
            sound: true,
          });
          entry.staleNotifiedAt = now;
          changed = true;
        }
      }

      // Closing soon — only worth chasing while it's still actionable, so
      // skip anything already applied to, closed, or long past its date.
      if (entry.deadline && (entry.status === 'researching' || entry.status === 'interview')) {
        // daysSince returns null for an unparseable date; negating it would
        // yield -0, which slips through a bare range check as "closes today".
        const since = daysSince(entry.deadline);
        const left = since === null ? null : -since;
        const inWindow = left !== null && left <= DEADLINE_SOON_DAYS && left >= -1;
        const quiet =
          entry.deadlineNotifiedAt && now - entry.deadlineNotifiedAt < RENOTIFY_AFTER_MS;
        if (inWindow && !quiet) {
          notifier.notify({
            title: left < 0 ? 'Job Search HQ — closed' : 'Job Search HQ — closing soon',
            message:
              left < 0
                ? `${entry.role} at ${entry.company} closed ${Math.abs(left)}d ago.`
                : `${entry.role} at ${entry.company} closes ${left === 0 ? 'today' : `in ${left}d`}.`,
            sound: true,
          });
          entry.deadlineNotifiedAt = now;
          changed = true;
        }
      }

      // Assessment/take-home tasks — the ones with a real due timestamp
      // (unlike `deadline`, which is the ad's closing date). Each task tracks
      // its own `notifiedAt` so a snooze on one task doesn't silence others.
      for (const task of entry.tasks ?? []) {
        if (task.completedAt || !task.dueAt) continue;
        const due = Date.parse(task.dueAt);
        if (Number.isNaN(due)) continue;
        const left = due - now;
        const inWindow = left <= DEADLINE_SOON_DAYS * 86_400_000 && left >= -86_400_000;
        const quiet = task.notifiedAt && now - task.notifiedAt < RENOTIFY_AFTER_MS;
        if (inWindow && !quiet) {
          notifier.notify({
            title: left < 0 ? 'Job Search HQ — task overdue' : 'Job Search HQ — task due',
            message: `${task.label} — ${entry.role} at ${entry.company}${left < 0 ? ' (overdue)' : ''}`,
            sound: true,
          });
          task.notifiedAt = now;
          changed = true;
        }
      }
    }

    if (changed) await writeData(list);
  } catch (err) {
    console.error('Stale-applied check failed:', err);
  }
}

// ---------- applications ----------

app.use('/api/applications', serializeRequests('applications'));

app.get('/api/applications', async (_req, res) => {
  try {
    res.json(await readData());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/applications', async (req, res) => {
  try {
    const invalid = findInvalidEnumField(req.body ?? {});
    if (invalid) {
      return res.status(400).json({
        error: `Invalid ${invalid.field}: must be one of ${invalid.allowed.join(', ')}`,
      });
    }
    const list = await readData();
    const now = Date.now();
    const entry = {
      ...req.body,
      id: req.body.id || uid(),
      created: now,
      updated: now,
    };
    entry.matchKey = matchKeyFor(entry);
    entry.statusHistory = [{ status: entry.status, at: now }];
    entry.activity = [];
    logActivity(entry, 'created', `Added — ${STATUS_LABEL[entry.status] ?? entry.status}`);

    if (list.some((a) => a.matchKey === entry.matchKey)) {
      return res
        .status(409)
        .json({ error: `An entry for "${entry.company} — ${entry.role}" already exists.` });
    }

    list.push(entry);
    await writeData(list);
    appendAudit({
      action: 'create',
      entryId: entry.id,
      matchKey: entry.matchKey,
      detail: `${entry.company} — ${entry.role}`,
    });
    syncToNotion(entry).catch((err) => console.error('Notion sync failed:', err.message));
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch('/api/applications/:id', async (req, res) => {
  try {
    const invalid = findInvalidEnumField(req.body ?? {});
    if (invalid) {
      return res.status(400).json({
        error: `Invalid ${invalid.field}: must be one of ${invalid.allowed.join(', ')}`,
      });
    }
    const list = await readData();
    const idx = list.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const now = Date.now();

    // Server-owned fields: a client round-trip carries a stale snapshot of
    // these, and letting the body win would overwrite the server's own log
    // with whatever the page happened to be holding.
    const body = { ...req.body };
    // `analysis`, `priority`, `interview`, `rejection`, `evidenceMap` are all
    // written to disk by Claude, never through this API — stripping them
    // means a stale copy held by an open tab can't overwrite a newer one.
    // The one narrow user-writable slot inside `rejection` is `userNote`,
    // sent via the dedicated `rejectionNote` field; everything else in the
    // object stays Claude's to author.
    const rejectionNote =
      typeof body.rejectionNote === 'string' ? body.rejectionNote : undefined;
    delete body.rejectionNote;
    for (const field of [
      'activity',
      'statusHistory',
      'created',
      'matchKey',
      'notionPageId',
      'analysis',
      'priority',
      'interview',
      'rejection',
      'evidenceMap',
      // `tasks` (assessments/take-home work with a due time) is authored by
      // Claude off the employer's own email, same as the fields above — the
      // due time and the completion time both come from a mail header, not
      // from anything the page can know. Stripped for the same reason: an open
      // tab holding a pre-assessment snapshot must not be able to resurrect a
      // task that has since been marked done.
      'tasks',
    ]) {
      delete body[field];
    }

    const merged = { ...list[idx], ...body, id: list[idx].id, updated: now };
    merged.matchKey = matchKeyFor(merged);

    // Append to the history only on an actual status change, so dragging a
    // card back to the same column or an unrelated field edit doesn't add a
    // no-op entry to the timeline.
    const prev = list[idx];
    if (body.status && body.status !== prev.status) {
      merged.statusHistory = [...(prev.statusHistory ?? []), { status: merged.status, at: now }];
      logActivity(
        merged,
        merged.status === 'applied' ? 'applied' : 'status',
        `${STATUS_LABEL[prev.status] ?? prev.status} → ${STATUS_LABEL[merged.status] ?? merged.status}`
      );
      try {
        await relocateFolder(merged);
      } catch (err) {
        console.error('relocateFolder failed:', err.message);
      }

      // Applying starts the follow-up clock. Only ever set it, never overwrite —
      // a date the user picked by hand outranks the computed default.
      if (merged.status === 'applied' && merged.date && !merged.followUpDue) {
        merged.followUpDue = businessDaysFrom(merged.date);
        if (merged.followUpDue) {
          logActivity(merged, 'note', `Follow-up suggested for ${merged.followUpDue}`);
        }
      }
    }
    if (body.cvStatus && body.cvStatus !== prev.cvStatus) {
      logActivity(merged, 'cv', `CV status → ${body.cvStatus}`);
    }
    if (body.salary && body.salary !== prev.salary) {
      logActivity(merged, 'note', `Salary noted: ${body.salary}`);
    }
    if (body.workArrangement && body.workArrangement !== prev.workArrangement) {
      logActivity(merged, 'note', `Work arrangement: ${body.workArrangement}`);
    }
    if (body.workHours && body.workHours !== prev.workHours) {
      logActivity(merged, 'note', `Hours of work set`);
    }
    if (body.source && body.source !== prev.source) {
      logActivity(merged, 'note', `Source: ${body.source}`);
    }
    if (body.contactEmail && body.contactEmail !== prev.contactEmail) {
      logActivity(merged, 'contact', `Contact email set: ${body.contactEmail}`);
    }
    if (body.contactPhone && body.contactPhone !== prev.contactPhone) {
      logActivity(merged, 'contact', `Contact phone set: ${body.contactPhone}`);
    }
    if (body.followUpDue && body.followUpDue !== prev.followUpDue) {
      logActivity(merged, 'note', `Follow-up due ${body.followUpDue}`);
    }
    if (body.deadline && body.deadline !== prev.deadline) {
      logActivity(merged, 'deadline', `Closing date set to ${body.deadline}`);
      merged.deadlineNotifiedAt = undefined;
    }
    if (body.trackingUrl && body.trackingUrl !== prev.trackingUrl) {
      logActivity(merged, 'note', 'Tracking link added');
    }
    if (body.contactName && body.contactName !== prev.contactName) {
      logActivity(merged, 'contact', `Contact set: ${body.contactName}`);
    }
    if (body.nextAction && body.nextAction !== prev.nextAction) {
      logActivity(merged, 'note', `Next action: ${body.nextAction}`);
    }

    if (rejectionNote !== undefined) {
      const prevNote = prev.rejection?.userNote ?? '';
      const nextNote = rejectionNote.trim();
      if (nextNote !== prevNote) {
        // Preserve any Claude-authored fields already on the rejection block;
        // only userNote is user-editable through this route.
        merged.rejection = { ...(prev.rejection ?? {}), userNote: nextNote };
        logActivity(merged, 'note', nextNote ? 'Rejection reason logged' : 'Rejection reason cleared');
      }
    }

    // Renaming into another entry's identity would silently create a duplicate.
    if (list.some((a, i) => i !== idx && a.matchKey === merged.matchKey)) {
      return res
        .status(409)
        .json({ error: `Another entry already uses "${merged.company} — ${merged.role}".` });
    }

    list[idx] = merged;
    await writeData(list);
    appendAudit({
      action: 'update',
      entryId: merged.id,
      matchKey: merged.matchKey,
      // Field names only — values can hold notes and contact details, and the
      // audit log is a change trail, not a second copy of the data.
      detail: `fields: ${Object.keys(body).join(', ') || '(none)'}`,
    });
    syncToNotion(merged).catch((err) => console.error('Notion sync failed:', err.message));
    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------- follow-up: close the loop the app was leaving open ----------
//
// `followUpDue` was computed and mirrored to Notion but nothing could ever
// close it — it just went overdue forever. These two actions are the whole
// fix: mark it done (clears it, logs it), or push it out a few days without
// losing history the way silently re-editing the date field would.

app.post('/api/applications/:id/follow-up', async (req, res) => {
  try {
    const list = await readData();
    const idx = list.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const { action, days } = req.body ?? {};
    const entry = { ...list[idx] };

    if (action === 'done') {
      if (entry.followUpDue) {
        logActivity(entry, 'note', `Followed up — cleared due ${entry.followUpDue}`);
      }
      entry.followUpDue = '';
    } else if (action === 'snooze') {
      const n = Number.isFinite(days) && days > 0 ? days : 3;
      const base = new Date();
      base.setDate(base.getDate() + n);
      const next = base.toISOString().slice(0, 10);
      logActivity(
        entry,
        'note',
        `Follow-up snoozed ${n}d${entry.followUpDue ? ` (was ${entry.followUpDue})` : ''} → ${next}`
      );
      entry.followUpDue = next;
    } else {
      return res.status(400).json({ error: "action must be 'done' or 'snooze'" });
    }

    entry.updated = Date.now();
    list[idx] = entry;
    await writeData(list);
    appendAudit({ action: 'follow-up', entryId: entry.id, matchKey: entry.matchKey, detail: action });
    syncToNotion(entry).catch((err) => console.error('Notion sync failed:', err.message));
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------- tasks: assessments/take-homes, user-creatable too ----------
//
// `tasks` stays in the Claude-owned strip-list on the main PATCH route (the
// server may back-fill a task's timing from an employer email later), but
// these routes let the user add or tick one by hand without going through
// Claude at all — the gap that left exactly one task on record.

app.post('/api/applications/:id/tasks', async (req, res) => {
  try {
    const list = await readData();
    const idx = list.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const { label, dueAt, note } = req.body ?? {};
    if (!label || !dueAt) return res.status(400).json({ error: 'label and dueAt are required' });

    const entry = { ...list[idx] };
    const task = { id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, label, dueAt, note };
    entry.tasks = [...(entry.tasks ?? []), task];
    logActivity(entry, 'note', `Task added: ${label}`);
    entry.updated = Date.now();
    list[idx] = entry;
    await writeData(list);
    appendAudit({ action: 'task-add', entryId: entry.id, matchKey: entry.matchKey, detail: label });
    syncToNotion(entry).catch((err) => console.error('Notion sync failed:', err.message));
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch('/api/applications/:id/tasks/:taskId', async (req, res) => {
  try {
    const list = await readData();
    const idx = list.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const entry = { ...list[idx] };
    const tasks = entry.tasks ?? [];
    const tIdx = tasks.findIndex((t) => t.id === req.params.taskId);
    if (tIdx === -1) return res.status(404).json({ error: 'Task not found' });

    const body = req.body ?? {};
    const prevTask = tasks[tIdx];
    const nextTask = { ...prevTask, ...body, id: prevTask.id };
    entry.tasks = [...tasks.slice(0, tIdx), nextTask, ...tasks.slice(tIdx + 1)];

    if (body.completedAt && !prevTask.completedAt) {
      logActivity(entry, 'note', `Task done: ${nextTask.label}`);
    }
    entry.updated = Date.now();
    list[idx] = entry;
    await writeData(list);
    appendAudit({ action: 'task-update', entryId: entry.id, matchKey: entry.matchKey, detail: nextTask.label });
    syncToNotion(entry).catch((err) => console.error('Notion sync failed:', err.message));
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/applications/:id/tasks/:taskId', async (req, res) => {
  try {
    const list = await readData();
    const idx = list.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const entry = { ...list[idx] };
    const task = (entry.tasks ?? []).find((t) => t.id === req.params.taskId);
    entry.tasks = (entry.tasks ?? []).filter((t) => t.id !== req.params.taskId);
    if (task) logActivity(entry, 'note', `Task removed: ${task.label}`);
    entry.updated = Date.now();
    list[idx] = entry;
    await writeData(list);
    appendAudit({ action: 'task-delete', entryId: entry.id, matchKey: entry.matchKey, detail: task?.label });
    syncToNotion(entry).catch((err) => console.error('Notion sync failed:', err.message));
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/applications/:id', async (req, res) => {
  try {
    const list = await readData();
    const entry = list.find((a) => a.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Not found' });

    await writeData(list.filter((a) => a.id !== req.params.id));

    // Queue the side-effectful cleanup (company folder + Notion row) for the
    // jobhq loop rather than doing it here — deleting real files and remote
    // rows deserves the loop's confirm-and-verify handling, not a bare API call.
    await ensureDirs();
    const payload = {
      type: 'delete_request',
      id: entry.id,
      matchKey: entry.matchKey || matchKeyFor(entry),
      role: entry.role || '',
      company: entry.company || '',
      folderPath: entry.folderPath || '',
      requestedAt: new Date().toISOString(),
    };
    const file = path.join(
      REQUESTS_DIR,
      `delete_request__${payload.matchKey}__${Date.now()}.json`
    );
    await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');

    if (entry.notionPageId) {
      archivePage(entry.notionPageId).catch((err) =>
        console.error('Notion archive failed:', err.message)
      );
    }

    appendAudit({
      action: 'delete',
      entryId: entry.id,
      matchKey: payload.matchKey,
      detail: `${entry.company} — ${entry.role} (folder: ${entry.folderPath || 'none'})`,
    });

    res.json({ ok: true, queued: path.basename(file) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * One-click discard: removes the entry from applications.json only. The
 * Notion row (and any folder on disk) is left untouched on purpose — Notion
 * stays the permanent log of "already looked at this one" by Match Key, so
 * re-logging the same job later gets caught as a duplicate instead of
 * silently creating a second entry. This is the deliberate opposite of the
 * full DELETE above, which archives the Notion row too.
 */
app.delete('/api/applications/:id/local', async (req, res) => {
  try {
    const list = await readData();
    const entry = list.find((a) => a.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Not found' });

    await writeData(list.filter((a) => a.id !== req.params.id));

    appendAudit({
      action: 'delete-local',
      entryId: entry.id,
      matchKey: entry.matchKey || matchKeyFor(entry),
      detail: `${entry.company} — ${entry.role} (kept in Notion as a dedupe log)`,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------- CV requests ----------

/**
 * True when the drafted CV is newer than both the entry's own last edit and
 * the candidate's standing facts — i.e. re-queuing would redraft an identical
 * document. Deliberately conservative: anything unknown (no folder, no file,
 * an unreadable stat) answers false, so a real redraft is never skipped. A
 * false positive here costs a wasted regeneration; a false negative would
 * silently ship a stale CV.
 */
async function cvLooksCurrent(entry) {
  if (!entry.folderPath) return false;
  try {
    const dir = path.join(CAREER_DIR, entry.folderPath);
    const cv = (await fs.readdir(dir)).find(
      (f) => f.toLowerCase().startsWith('cv - ') && f.toLowerCase().endsWith('.docx'),
    );
    if (!cv) return false;
    const cvAt = (await fs.stat(path.join(dir, cv))).mtimeMs;
    const factsAt = (
      await fs.stat(path.join(CAREER_DIR, 'Project Notes', 'Candidate Key Facts.md'))
    ).mtimeMs;
    // Grace window: the generation run bumps `updated` when it syncs, seconds
    // AFTER writing the docx, so a strict `cvAt > updated` is false even for a
    // CV drafted moments ago — which is why this check never once fired while
    // it lived in the skill. Anything edited well after the draft still counts
    // as stale.
    const GRACE_MS = 10 * 60 * 1000;
    return cvAt > (entry.updated || 0) - GRACE_MS && cvAt > factsAt;
  } catch {
    return false;
  }
}

app.post('/api/cv-request/:id', async (req, res) => {
  try {
    const list = await readData();
    const idx = list.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const entry = list[idx];
    await ensureDirs();

    const payload = {
      type: 'cv_request',
      id: entry.id,
      matchKey: entry.matchKey || matchKeyFor(entry),
      role: entry.role || '',
      company: entry.company || '',
      link: entry.link || '',
      folderPath: entry.folderPath || '',
      // Answered here rather than by Claude (v2.6): the staleness heuristic is
      // three mtime comparisons, so having an agent stat the files costs a
      // round trip to learn what the server already knows.
      redundant: await cvLooksCurrent(entry),
      // Kironraj's own corrections to the fit verdict (24 Aug 2026). Claude
      // must treat these as fact about the candidate and NOT re-derive a
      // contradicting read from the ad — the case that prompted it was a
      // graduate programme whose visa clause was misread as a hard blocker,
      // leaving no way to say "I'm eligible, here's why" short of chat.
      userFacts: entry.userFacts || '',
      requestedAt: new Date().toISOString(),
    };
    const file = path.join(REQUESTS_DIR, `cv_request__${payload.matchKey}__${Date.now()}.json`);
    await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');

    list[idx] = { ...entry, cvStatus: 'queued', updated: Date.now() };
    await writeData(list);

    appendAudit({
      action: 'cv-request',
      entryId: entry.id,
      matchKey: payload.matchKey,
      detail: `queued CV/cover letter for ${entry.company} — ${entry.role}`,
    });

    res.json({ ok: true, queued: path.basename(file), entry: list[idx] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Click-again-to-dequeue: only meaningful before Claude has actually picked
// the request file up (there's no standing watcher — it sits until Kironraj
// says "check pending requests"), so deleting the file is always safe here.
app.delete('/api/cv-request/:id', async (req, res) => {
  try {
    const list = await readData();
    const idx = list.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const entry = list[idx];
    if (entry.cvStatus !== 'queued') return res.status(409).json({ error: 'Not queued' });

    await ensureDirs();
    const matchKey = entry.matchKey || matchKeyFor(entry);
    const files = await fs.readdir(REQUESTS_DIR);
    const mine = files.filter((f) => f.startsWith(`cv_request__${matchKey}__`));
    await Promise.all(mine.map((f) => fs.unlink(path.join(REQUESTS_DIR, f))));

    list[idx] = { ...entry, cvStatus: '', updated: Date.now() };
    await writeData(list);

    appendAudit({
      action: 'cv-request-cancelled',
      entryId: entry.id,
      matchKey,
      detail: `un-queued CV/cover letter for ${entry.company} — ${entry.role}`,
    });

    res.json({ ok: true, entry: list[idx] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------- on-demand reviewer critique (v2.6, 21 Aug 2026) ----------
// The reviewer agent used to run automatically on every CV/cover-letter
// generation, which meant a second full-context agent spawn on every draft
// whether or not the draft was in doubt. It's a judgement call worth paying
// for when Kironraj actually has doubts, so it moved behind this button. The
// mechanical half of what it used to catch (page count, A4, PII, visa wording
// drift, cover-letter length) is now `scripts/verify-docs.py`, which still
// runs on every generation and costs no tokens at all.

app.post('/api/review-request/:id', async (req, res) => {
  try {
    const list = await readData();
    const idx = list.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const entry = list[idx];
    // Nothing to review until something has been drafted — the button is
    // hidden in that state, but a stale tab or a direct POST shouldn't queue
    // an agent to critique files that don't exist.
    if (entry.cvStatus !== 'drafted' && entry.cvStatus !== 'sent') {
      return res.status(409).json({ error: 'No drafted CV/cover letter to review yet' });
    }
    await ensureDirs();

    const payload = {
      type: 'review_request',
      id: entry.id,
      matchKey: entry.matchKey || matchKeyFor(entry),
      role: entry.role || '',
      company: entry.company || '',
      link: entry.link || '',
      folderPath: entry.folderPath || '',
      note: typeof req.body?.note === 'string' ? req.body.note.slice(0, 500) : '',
      requestedAt: new Date().toISOString(),
    };
    const file = path.join(REQUESTS_DIR, `review_request__${payload.matchKey}__${Date.now()}.json`);
    await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');

    list[idx] = { ...entry, reviewStatus: 'queued', updated: Date.now() };
    await writeData(list);

    appendAudit({
      action: 'review-request',
      entryId: entry.id,
      matchKey: payload.matchKey,
      detail: `queued reviewer critique for ${entry.company} — ${entry.role}`,
    });

    res.json({ ok: true, queued: path.basename(file), entry: list[idx] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------- on-demand deep fit analysis (v2.5, 19 Aug 2026) ----------
// Same request-file pattern as CV requests, but runs the ATS/gap/score
// analysis on a still-researching entry so Kironraj can decide apply vs.
// skip before committing to a CV/cover letter, not only after.

app.post('/api/analysis-request/:id', async (req, res) => {
  try {
    const list = await readData();
    const idx = list.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const entry = list[idx];
    await ensureDirs();

    const payload = {
      type: 'analysis_request',
      id: entry.id,
      matchKey: entry.matchKey || matchKeyFor(entry),
      role: entry.role || '',
      company: entry.company || '',
      link: entry.link || '',
      // Same authoritative corrections as cv_request above — a re-run of the
      // fit check must not quietly restore the verdict they contradict.
      userFacts: entry.userFacts || '',
      requestedAt: new Date().toISOString(),
    };
    const file = path.join(REQUESTS_DIR, `analysis_request__${payload.matchKey}__${Date.now()}.json`);
    await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');

    list[idx] = { ...entry, analysisStatus: 'queued', updated: Date.now() };
    await writeData(list);

    appendAudit({
      action: 'analysis-request',
      entryId: entry.id,
      matchKey: payload.matchKey,
      detail: `queued deep fit analysis for ${entry.company} — ${entry.role}`,
    });

    res.json({ ok: true, queued: path.basename(file), entry: list[idx] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------- outreach (direct-to-company + recruiters) ----------

app.use('/api/outreach', serializeRequests('outreach'));

app.get('/api/outreach', async (_req, res) => {
  try {
    res.json(await readOutreach());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/outreach', async (req, res) => {
  try {
    const list = await readOutreach();
    const now = Date.now();
    const entry = {
      status: 'to-contact',
      ...req.body,
      id: req.body.id || outreachUid(),
      created: now,
      updated: now,
    };
    if (entry.kind !== 'company' && entry.kind !== 'recruiter') {
      return res.status(400).json({ error: 'kind must be "company" or "recruiter"' });
    }
    if (!entry.name || !String(entry.name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    entry.matchKey = outreachMatchKeyFor(entry);
    entry.statusHistory = [{ status: entry.status, at: now }];
    entry.activity = [];
    entry.emails = entry.emails ?? [];
    logActivity(entry, 'created', `Added — ${OUTREACH_STATUS_LABEL[entry.status] ?? entry.status}`);

    if (list.some((e) => e.matchKey === entry.matchKey)) {
      return res.status(409).json({ error: `"${entry.name}" is already in this list.` });
    }

    list.push(entry);
    await writeOutreach(list);
    appendAudit({
      action: 'outreach-create',
      entryId: entry.id,
      matchKey: entry.matchKey,
      detail: `${entry.kind}: ${entry.name}`,
    });
    syncOutreachToNotion(entry).catch((err) =>
      console.error('Notion outreach sync failed:', err.message)
    );
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch('/api/outreach/:id', async (req, res) => {
  try {
    const list = await readOutreach();
    const idx = list.findIndex((e) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const now = Date.now();
    const body = { ...req.body };
    // Same rationale as the applications PATCH: a client round-trip carries a
    // stale snapshot of these, so the server's own log always wins.
    for (const field of [
      'activity',
      'statusHistory',
      'created',
      'matchKey',
      'notionPageId',
      'emails',
      'kind',
    ]) {
      delete body[field];
    }

    const prev = list[idx];
    const merged = { ...prev, ...body, id: prev.id, kind: prev.kind, updated: now };
    merged.matchKey = outreachMatchKeyFor(merged);

    if (body.status && body.status !== prev.status) {
      merged.statusHistory = [...(prev.statusHistory ?? []), { status: merged.status, at: now }];
      logActivity(
        merged,
        'status',
        `${OUTREACH_STATUS_LABEL[prev.status] ?? prev.status} → ${
          OUTREACH_STATUS_LABEL[merged.status] ?? merged.status
        }`
      );
      // Only ever set, never overwrite — a hand-picked date outranks the
      // computed default, exactly as with job follow-ups.
      if (!merged.followUpDue) {
        const due = outreachFollowUpFor(merged);
        if (due) {
          merged.followUpDue = due;
          logActivity(merged, 'note', `Follow-up suggested for ${due}`);
        }
      }
      // Terminal statuses stop owing anything.
      if (merged.status === 'no-reply' || merged.status === 'closed') {
        merged.followUpDue = '';
      }
    }
    if (body.contactEmail && body.contactEmail !== prev.contactEmail) {
      logActivity(merged, 'contact', `Contact email: ${body.contactEmail}`);
    }

    list[idx] = merged;
    await writeOutreach(list);
    appendAudit({
      action: 'outreach-update',
      entryId: merged.id,
      matchKey: merged.matchKey,
      detail: `fields: ${Object.keys(body).join(', ') || 'none'}`,
    });
    syncOutreachToNotion(merged).catch((err) =>
      console.error('Notion outreach sync failed:', err.message)
    );
    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Same done/snooze contract as the application route above — outreach
// `followUpDue` was computed and mirrored to Notion but drove nothing either.
app.post('/api/outreach/:id/follow-up', async (req, res) => {
  try {
    const list = await readOutreach();
    const idx = list.findIndex((e) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const { action, days } = req.body ?? {};
    const entry = { ...list[idx] };

    if (action === 'done') {
      if (entry.followUpDue) {
        logActivity(entry, 'note', `Followed up — cleared due ${entry.followUpDue}`);
      }
      entry.followUpDue = '';
    } else if (action === 'snooze') {
      const n = Number.isFinite(days) && days > 0 ? days : 3;
      const base = new Date();
      base.setDate(base.getDate() + n);
      const next = base.toISOString().slice(0, 10);
      logActivity(
        entry,
        'note',
        `Follow-up snoozed ${n}d${entry.followUpDue ? ` (was ${entry.followUpDue})` : ''} → ${next}`
      );
      entry.followUpDue = next;
    } else {
      return res.status(400).json({ error: "action must be 'done' or 'snooze'" });
    }

    entry.updated = Date.now();
    list[idx] = entry;
    await writeOutreach(list);
    appendAudit({ action: 'outreach-follow-up', entryId: entry.id, matchKey: entry.matchKey, detail: action });
    syncOutreachToNotion(entry).catch((err) =>
      console.error('Notion outreach sync failed:', err.message)
    );
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/outreach/:id', async (req, res) => {
  try {
    const list = await readOutreach();
    const entry = list.find((e) => e.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Not found' });

    await writeOutreach(list.filter((e) => e.id !== req.params.id));

    let folderDeleted = false;
    try {
      folderDeleted = await deleteOutreachFolder(entry);
    } catch (err) {
      console.error('deleteOutreachFolder failed:', err.message);
    }

    if (entry.notionPageId) {
      archivePage(entry.notionPageId).catch((err) =>
        console.error('Notion archive failed:', err.message)
      );
    }

    appendAudit({
      action: 'outreach-delete',
      entryId: entry.id,
      matchKey: entry.matchKey,
      detail: `${entry.kind}: ${entry.name}${folderDeleted ? ' (folder deleted)' : ''}`,
    });

    res.json({ ok: true, folderDeleted });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** Queue an intro or follow-up email for Claude to draft. Writes a request
 *  file the same way the CV button does — nothing is drafted synchronously. */
app.post('/api/outreach/:id/email-request', async (req, res) => {
  try {
    const list = await readOutreach();
    const idx = list.findIndex((e) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const template = req.body?.template === 'follow-up' ? 'follow-up' : 'intro';
    const entry = list[idx];
    await ensureDirs();

    const payload = {
      type: 'outreach_email_request',
      id: entry.id,
      matchKey: entry.matchKey,
      kind: entry.kind,
      template,
      company: entry.name,
      role: template === 'intro' ? 'Intro email' : 'Follow-up email',
      website: entry.website || '',
      contactEmail: entry.contactEmail || '',
      contactName: entry.contactName || '',
      folderPath: entry.folderPath || outreachFolderFor(entry),
      requestedAt: new Date().toISOString(),
    };
    const file = path.join(
      REQUESTS_DIR,
      `outreach_email_request__${payload.matchKey}__${Date.now()}.json`
    );
    await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');

    list[idx] = {
      ...entry,
      emailStatus: 'queued',
      folderPath: payload.folderPath,
      updated: Date.now(),
    };
    logActivity(list[idx], 'email-queued', `${template === 'intro' ? 'Intro' : 'Follow-up'} email queued`);
    await writeOutreach(list);

    appendAudit({
      action: 'outreach-email-request',
      entryId: entry.id,
      matchKey: entry.matchKey,
      detail: `queued ${template} email for ${entry.name}`,
    });

    res.json({ ok: true, queued: path.basename(file), entry: list[idx] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** Read back whatever .md drafts Claude has written into the entry's folder,
 *  so the app can show them with a copy button. */
app.get('/api/outreach/:id/emails', async (req, res) => {
  try {
    const list = await readOutreach();
    const entry = list.find((e) => e.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Not found' });

    const rel = entry.folderPath || outreachFolderFor(entry);
    const dir = safeCareerPath(rel);
    if (!dir || !(await pathExists(dir))) return res.json({ items: [] });

    const files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.md'));
    const items = [];
    for (const name of files) {
      const full = path.join(dir, name);
      const [body, stat] = await Promise.all([fs.readFile(full, 'utf8'), fs.stat(full)]);
      items.push({ name, relPath: `${rel}/${name}`, body, mtime: stat.mtimeMs });
    }
    items.sort((a, b) => b.mtime - a.mtime);
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * Records that Kironraj sent an email himself. This app never sends mail and
 * holds no mail credential of any kind — the draft is written to disk, he
 * copies it into his own client, and this route is how the tracker finds out.
 */
app.post('/api/outreach/:id/mark-sent', async (req, res) => {
  try {
    const list = await readOutreach();
    const idx = list.findIndex((e) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const entry = list[idx];
    const emailKind = req.body?.emailKind === 'follow-up' ? 'follow-up' : 'intro';
    const sentOn = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.sentOn || '')
      ? req.body.sentOn
      : new Date().toLocaleDateString('en-CA');
    const now = Date.now();

    const merged = {
      ...entry,
      emails: [
        ...(entry.emails ?? []),
        { kind: emailKind, sentOn, draftPath: req.body?.draftPath || '' },
      ],
      emailStatus: 'sent',
      lastEmailedOn: sentOn,
      firstEmailedOn: entry.firstEmailedOn || sentOn,
      updated: now,
    };
    if (entry.status === 'to-contact') {
      merged.status = 'emailed';
      merged.statusHistory = [...(entry.statusHistory ?? []), { status: 'emailed', at: now }];
    }
    logActivity(merged, 'email-sent', `${emailKind === 'intro' ? 'Intro' : 'Follow-up'} email sent`);

    // Recompute rather than preserve: each nudge restarts the clock, which is
    // the one case where overwriting an existing followUpDue is correct.
    const due = outreachFollowUpFor(merged);
    if (due) {
      merged.followUpDue = due;
      logActivity(merged, 'note', `Follow-up suggested for ${due}`);
    }

    list[idx] = merged;
    await writeOutreach(list);
    appendAudit({
      action: 'outreach-email-sent',
      entryId: merged.id,
      matchKey: merged.matchKey,
      detail: `${emailKind} email to ${merged.name} on ${sentOn}`,
    });
    syncOutreachToNotion(merged).catch((err) =>
      console.error('Notion outreach sync failed:', err.message)
    );
    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------- pending requests (CV/CL + delete queue) ----------

app.get('/api/requests/pending', async (_req, res) => {
  try {
    await ensureDirs();
    const files = await fs.readdir(REQUESTS_DIR);
    const items = [];
    for (const file of files) {
      // Must stay in step with buildProcessRequestsPrompt() below — a type
      // counted here but not handled there leaves the badge stuck forever.
      if (!/^(cv_request|delete_request|outreach_email_request|analysis_request|review_request)__.*\.json$/.test(file)) continue;
      try {
        const raw = await fs.readFile(path.join(REQUESTS_DIR, file), 'utf8');
        const payload = JSON.parse(raw);
        items.push({
          file,
          type: payload.type,
          role: payload.role || '',
          company: payload.company || '',
          requestedAt: payload.requestedAt || null,
        });
      } catch {
        // A malformed request file still counts toward "pending" so the badge
        // isn't silently wrong — just without role/company detail.
        items.push({ file, type: 'unknown', role: '', company: '', requestedAt: null });
      }
    }
    items.sort((a, b) => (a.requestedAt || '').localeCompare(b.requestedAt || ''));
    res.json({ items, count: items.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------- priorities (auto-pick fallback) ----------

/**
 * A rough app-side readiness estimate, used only to rank auto-picked priorities.
 * The full readiness score lives in `src/lib/readiness.ts` (needs FolderStatus)
 * and is what the UI shows on cards; this is a good-enough approximation from
 * the JSON alone.
 */
function estimateReadiness(entry) {
  let done = 0;
  const total = 5;
  if (entry.cvStatus === 'drafted' || entry.cvStatus === 'sent') done++;
  if (entry.contactEmail || entry.contactName) done++;
  if (entry.source) done++;
  const matched = entry.analysis?.ats?.matched?.length ?? 0;
  if (matched >= 3) done++;
  const unsupported = entry.analysis?.ats?.unsupported?.length ?? 0;
  if (unsupported === 0) done++;
  return Math.round((done / total) * 100);
}

function daysUntil(dateStr) {
  const since = daysSince(dateStr);
  return since === null ? null : -since;
}

const INTERVIEW_SILENCE_COURTESY_DAYS = 30;

/** Mirrors `daysSinceInterviewSignal()` in src/types.ts exactly. */
function daysSinceInterviewSignal(entry) {
  const now = Date.now();
  let latest = null;
  for (const h of entry.statusHistory ?? []) {
    if (h.status === 'interview' && (latest === null || h.at > latest)) latest = h.at;
  }
  if (entry.interview?.when) {
    const when = new Date(entry.interview.when).getTime();
    if (!Number.isNaN(when) && when <= now && (latest === null || when > latest)) latest = when;
  }
  if (latest === null) return null;
  return Math.floor((now - latest) / 86_400_000);
}

/**
 * Pick up to three ranked priorities using deterministic rules. This is the
 * "no Claude available" fallback — cheaper than judgement, and never invents
 * a reason it can't cite from the entry itself.
 */
function pickPriorities(list) {
  const now = Date.now();
  const candidates = [];

  for (const a of list) {
    // 1. Interview within 3 days — prepare.
    if (a.status === 'interview' && a.interview?.when) {
      const when = new Date(a.interview.when).getTime();
      const hoursOff = (when - now) / 3_600_000;
      if (hoursOff > 0 && hoursOff <= 72) {
        candidates.push({
          id: a.id,
          score: 1000 - hoursOff,
          reason:
            hoursOff < 24
              ? `Interview in ${Math.max(1, Math.round(hoursOff))}h`
              : `Interview in ${Math.round(hoursOff / 24)}d`,
          action: 'prepare',
        });
      }
    }

    // 2. Applied, follow-up due today or overdue.
    if (a.status === 'applied' && a.followUpDue) {
      const d = daysUntil(a.followUpDue);
      if (d !== null && d <= 0) {
        candidates.push({
          id: a.id,
          score: 800 + Math.min(-d, 30),
          reason: d < 0 ? `Follow-up overdue by ${-d}d` : 'Follow-up due today',
          action: 'follow-up',
        });
      }
    }

    // 3. Researching + deadline within 5 days.
    if (a.status === 'researching' && a.deadline) {
      const d = daysUntil(a.deadline);
      if (d !== null && d >= 0 && d <= 5) {
        const readiness = estimateReadiness(a);
        candidates.push({
          id: a.id,
          score: 900 - d * 10 + (readiness >= 60 ? 20 : 0),
          reason:
            readiness >= 60
              ? `Closes ${d === 0 ? 'today' : `in ${d}d`} · ${readiness}% ready to apply`
              : `Closes ${d === 0 ? 'today' : `in ${d}d`} · only ${readiness}% ready`,
          action: readiness >= 60 ? 'apply' : 'improve',
        });
      }
    }

    // 4. Researching, no deadline — strong fit but weak readiness.
    if (a.status === 'researching' && !a.deadline) {
      const readiness = estimateReadiness(a);
      if (readiness < 60 && (a.fit === 'strong' || a.fit === 'good')) {
        candidates.push({
          id: a.id,
          score: 400 + (a.fit === 'strong' ? 40 : 20) - readiness,
          reason: `${a.fit === 'strong' ? 'Strong' : 'Good'} fit · only ${readiness}% ready`,
          action: 'improve',
        });
      }
    }

    // 5. Interview, gone quiet — no update since the last interview signal.
    if (a.status === 'interview') {
      const days = daysSinceInterviewSignal(a);
      if (days !== null && days >= INTERVIEW_SILENCE_COURTESY_DAYS) {
        candidates.push({
          id: a.id,
          score: 500 + Math.min(days - INTERVIEW_SILENCE_COURTESY_DAYS, 60),
          reason: `No update in ${days}d since interview — worth a follow-up`,
          action: 'follow-up',
        });
      }
    }
  }

  // De-dup by entry id — keep the highest-scoring reason for each entry.
  const byId = new Map();
  for (const c of candidates) {
    const prev = byId.get(c.id);
    if (!prev || c.score > prev.score) byId.set(c.id, c);
  }

  return Array.from(byId.values())
    .sort((x, y) => y.score - x.score)
    .slice(0, 3);
}

app.post('/api/priorities/auto-pick', async (_req, res) => {
  try {
    const list = await readData();
    const picks = pickPriorities(list);
    const pickedById = new Map(picks.map((p, i) => [p.id, { ...p, rank: i + 1 }]));
    const now = Date.now();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const expiresAt = endOfDay.getTime();

    let written = 0;
    let cleared = 0;
    for (const a of list) {
      const pick = pickedById.get(a.id);
      if (pick) {
        a.priority = {
          rank: pick.rank,
          reason: pick.reason,
          action: pick.action,
          setBy: 'app',
          setAt: now,
          expiresAt,
        };
        written++;
      } else if (a.priority && a.priority.setBy === 'app') {
        // Clear stale app-set priorities so they don't linger past today.
        delete a.priority;
        cleared++;
      }
    }

    if (written || cleared) {
      await writeData(list);
      appendAudit({
        action: 'priority-set',
        detail: `auto-picked ${written} priorit${written === 1 ? 'y' : 'ies'}${cleared ? `, cleared ${cleared} stale` : ''}`,
      });
    }

    res.json({ ok: true, picked: written, cleared });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------- audit log ----------

app.get('/api/audit-log', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    let raw = '';
    try {
      raw = await fs.readFile(AUDIT_FILE, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      return res.json([]);
    }
    // Newest first, and skip any half-written line rather than failing the
    // whole request over one bad record.
    const events = raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse()
      .slice(0, limit);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Claude-authored cross-rejection retrospective, regenerated by Claude on
// request (not the app) — the app only ever renders whatever's on disk here,
// same split as `analysis`/`interview`/`rejection` on individual entries.
app.get('/api/learning-loop', async (req, res) => {
  try {
    const raw = await fs.readFile(LEARNING_LOOP_FILE, 'utf8');
    res.json(JSON.parse(raw));
  } catch (err) {
    if (err.code === 'ENOENT') return res.json(null);
    res.status(500).json({ error: String(err) });
  }
});

// Claude-authored consolidated upskilling report, regenerated during /eod
// (only when something actually changed) — same read-only split as
// learning-loop above, the app never writes this file itself.
app.get('/api/upskill-report', async (req, res) => {
  try {
    const raw = await fs.readFile(UPSKILL_REPORT_FILE, 'utf8');
    res.json(JSON.parse(raw));
  } catch (err) {
    if (err.code === 'ENOENT') return res.json(null);
    res.status(500).json({ error: String(err) });
  }
});

// ---------- study guides ----------

/**
 * Splits one guide file into the parts the Study view needs. Every guide in
 * `Required Documents/Skill Guides/` shares one shape (checked by hand, not
 * enforced — see 00-Day-Plan-and-Index.md): a `# Title`, a `**Time budget:
 * ...**` line, then prose, then `## Quiz` (5 numbered questions) and
 * `### Answers` (5 numbered answers, same order). The markdown file itself
 * stays the source of truth — this never writes back to it, only reads.
 */
function parseGuide(file, content) {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const timeMatch = content.match(/\*\*Time budget:\s*(.+?)\*\*/);

  const quizIdx = content.indexOf('## Quiz');
  const body = (quizIdx === -1 ? content : content.slice(0, quizIdx))
    // Strip the title and time-budget lines back out — the client renders
    // its own heading and time chip from the parsed fields above them.
    .replace(/^#\s+.+$/m, '')
    .replace(/\*\*Time budget:.+?\*\*/, '')
    .trim();

  let questions = [];
  let answers = [];
  if (quizIdx !== -1) {
    const quizBlock = content.slice(quizIdx);
    const answersIdx = quizBlock.indexOf('### Answers');
    const questionsBlock = answersIdx === -1 ? quizBlock : quizBlock.slice(0, answersIdx);
    const answersBlock = answersIdx === -1 ? '' : quizBlock.slice(answersIdx);
    questions = extractNumberedItems(questionsBlock);
    answers = extractNumberedItems(answersBlock);
  }

  const quiz = questions.map((question, i) => ({ question, answer: answers[i] ?? '' }));

  return {
    file,
    title: titleMatch ? titleMatch[1].trim() : file,
    timeBudget: timeMatch ? timeMatch[1].trim() : '',
    bodyMarkdown: body,
    quiz,
  };
}

/** Pulls `1. text` / `2. text` items out of a markdown block, joining any
 *  wrapped continuation lines into the same item until the next number. */
function extractNumberedItems(block) {
  const items = [];
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    const m = line.match(/^\d+\.\s+(.+)$/);
    if (m) {
      items.push(m[1].trim());
    } else if (line && items.length > 0 && !line.startsWith('#')) {
      items[items.length - 1] += ` ${line}`;
    }
  }
  return items;
}

/** The "Suggested schedule" table in the index file — parsed into rows
 *  rather than sent as raw markdown, since it's the one guide-pack file that
 *  isn't itself a completable topic. */
function parseSchedule(content) {
  const rows = [];
  for (const line of content.split('\n')) {
    const cells = line
      .trim()
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    // Skip the header row and the `---|---|---` divider row.
    if (cells.length !== 3 || cells[0] === 'Time' || /^-+$/.test(cells[0])) continue;
    rows.push({ time: cells[0], topic: cells[1], file: cells[2].replace(/`/g, '') });
  }
  return rows;
}

const INDEX_GUIDE_FILE = '00-Day-Plan-and-Index.md';

async function readStudyProgress() {
  try {
    const raw = await fs.readFile(STUDY_PROGRESS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

// Same temp-file-then-rename pattern as writeData() — this is a small file
// but it's still the one on-disk record of real completed work, so an
// interrupted write still shouldn't be able to corrupt it.
async function writeStudyProgress(progress) {
  await fs.mkdir(path.dirname(STUDY_PROGRESS_FILE), { recursive: true });
  const tmp = `${STUDY_PROGRESS_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(progress, null, 2), 'utf8');
  await fs.rename(tmp, STUDY_PROGRESS_FILE);
}

app.get('/api/study', async (req, res) => {
  try {
    const dirEntries = await fs.readdir(SKILL_GUIDES_DIR).catch((err) => {
      if (err.code === 'ENOENT') return [];
      throw err;
    });
    const guideFiles = dirEntries.filter((f) => f.endsWith('.md') && f !== INDEX_GUIDE_FILE).sort();

    const guides = [];
    for (const file of guideFiles) {
      const content = await fs.readFile(path.join(SKILL_GUIDES_DIR, file), 'utf8');
      guides.push(parseGuide(file, content));
    }

    let schedule = [];
    try {
      const indexContent = await fs.readFile(path.join(SKILL_GUIDES_DIR, INDEX_GUIDE_FILE), 'utf8');
      schedule = parseSchedule(indexContent);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    const progress = await readStudyProgress();
    res.json({ guides, schedule, progress });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * Role Refreshers confidence: `{ [canonicalTerm]: 'shaky' | 'solid' }`.
 *
 * Keyed by term rather than by role on purpose — knowing what SIEM means is a
 * fact about the reader, not about one application, so five ads asking for it
 * share one rating. `unknown` is the absence of a key rather than a stored
 * value, so the file only ever holds terms actually assessed.
 *
 * User-owned like study progress — Claude never writes this, so it stays
 * outside the applications.json strip-list machinery.
 */
const TERM_CONFIDENCE_VALUES = new Set(['shaky', 'solid']);

async function readTermConfidence() {
  try {
    return JSON.parse(await fs.readFile(REFRESHER_CONFIDENCE_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

app.get('/api/refresher-confidence', async (req, res) => {
  try {
    res.json(await readTermConfidence());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch('/api/refresher-confidence', async (req, res) => {
  try {
    const { term, confidence } = req.body ?? {};
    if (typeof term !== 'string' || !term.trim()) {
      return res.status(400).json({ error: 'term is required' });
    }
    if (confidence !== 'unknown' && !TERM_CONFIDENCE_VALUES.has(confidence)) {
      return res.status(400).json({ error: 'confidence must be unknown, shaky or solid' });
    }

    const map = await readTermConfidence();
    if (confidence === 'unknown') delete map[term];
    else map[term] = confidence;

    await fs.mkdir(path.dirname(REFRESHER_CONFIDENCE_FILE), { recursive: true });
    const tmp = `${REFRESHER_CONFIDENCE_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(map, null, 2), 'utf8');
    await fs.rename(tmp, REFRESHER_CONFIDENCE_FILE);

    res.json(map);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------- interview bank (v2.2) ----------

/**
 * Mixed ownership, unlike every other store in this file. The seeded questions
 * and their answers are Claude-authored prose; the questions Kironraj adds and
 * the "practised" flags are his. Both live in one file because splitting them
 * would mean two round trips to render one list, and the merge rule is trivial:
 * whoever wrote a field last owns it. The `source` field records which is which
 * so a future regeneration pass can tell a seeded answer from a generated one.
 */
const INTERVIEW_CATEGORIES = new Set([
  'behavioural',
  'servicedesk',
  'police',
  'motivation',
  'experience',
]);

async function readInterviewBank() {
  try {
    const parsed = JSON.parse(await fs.readFile(INTERVIEW_BANK_FILE, 'utf8'));
    return {
      version: parsed.version ?? 1,
      updatedAt: parsed.updatedAt ?? null,
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
    };
  } catch (err) {
    if (err.code === 'ENOENT') return { version: 1, updatedAt: null, questions: [] };
    throw err;
  }
}

async function writeInterviewBank(bank) {
  await fs.mkdir(path.dirname(INTERVIEW_BANK_FILE), { recursive: true });
  const payload = { ...bank, updatedAt: new Date().toISOString().slice(0, 10) };
  const tmp = `${INTERVIEW_BANK_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8');
  await fs.rename(tmp, INTERVIEW_BANK_FILE);
  return payload;
}

app.get('/api/interview-bank', async (_req, res) => {
  try {
    res.json(await readInterviewBank());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/interview-bank', async (req, res) => {
  try {
    const question = String(req.body?.question ?? '').trim();
    const category = String(req.body?.category ?? '').trim();
    if (!question) return res.status(400).json({ error: 'A question is required.' });
    if (question.length > 500) return res.status(400).json({ error: 'That question is too long.' });
    if (!INTERVIEW_CATEGORIES.has(category)) {
      return res.status(400).json({ error: 'Unknown category.' });
    }

    const bank = await readInterviewBank();
    const entry = {
      id: `q_user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      category,
      question,
      source: 'user',
      hints: [],
      answer: '',
      createdAt: new Date().toISOString(),
    };
    bank.questions.push(entry);
    const saved = await writeInterviewBank(bank);
    await appendAudit({ action: 'interview-question-added', detail: question.slice(0, 120) });
    res.status(201).json({ bank: saved, entry });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch('/api/interview-bank/:id', async (req, res) => {
  try {
    const bank = await readInterviewBank();
    const entry = bank.questions.find((q) => q.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Unknown question.' });

    const body = req.body ?? {};
    if (typeof body.practised === 'boolean') entry.practised = body.practised;
    if (typeof body.answer === 'string') entry.answer = body.answer;
    if (Array.isArray(body.hints)) entry.hints = body.hints.map(String);
    if (typeof body.notes === 'string') entry.notes = body.notes;

    res.json(await writeInterviewBank(bank));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Only user-added questions are deletable. The seeded set is a curated bank,
// and losing one to a stray click would mean regenerating prose that took real
// grounding work — hiding it is a UI concern, not a reason to destroy the file.
app.delete('/api/interview-bank/:id', async (req, res) => {
  try {
    const bank = await readInterviewBank();
    const entry = bank.questions.find((q) => q.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Unknown question.' });
    if (entry.source !== 'user') {
      return res.status(400).json({ error: 'Seeded questions cannot be deleted.' });
    }
    bank.questions = bank.questions.filter((q) => q.id !== req.params.id);
    res.json(await writeInterviewBank(bank));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * Hand a single question to the real Claude CLI to answer, using the same
 * spawn/stream machinery as the terminal panel. The prompt deliberately names
 * the grounding files rather than pasting facts inline: Candidate Key Facts.md
 * changes, and a prompt that carried a snapshot of it would quietly go stale.
 */
app.post('/api/interview-bank/:id/generate', async (req, res) => {
  try {
    const bank = await readInterviewBank();
    const entry = bank.questions.find((q) => q.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Unknown question.' });

    const prompt = [
      'You are working in the Job Search HQ project (Career and Job).',
      '',
      `Write an interview answer for this question: "${entry.question}"`,
      '',
      'Steps:',
      '1. Read "Project Notes/Candidate Key Facts.md" and',
      '   "Required Documents/Kironraj_Odatt_Peringode_Resume_NZ.txt" first. Every claim in',
      '   the answer must be traceable to those files. Do not invent an employer, a project,',
      '   a certification, a metric or a story that is not evidenced there.',
      '2. Read App/data/interview-bank.json and match the tone, length and structure of the',
      '   existing seeded entries exactly.',
      '3. Update the entry with id "' + entry.id + '" in App/data/interview-bank.json, filling in:',
      '   - "hints": 4 to 5 short bullet strings. These are coaching notes on how to answer',
      '     (what the interviewer is really assessing, which story to pick, what to avoid),',
      '     NOT a summary of the answer.',
      '   - "answer": one long spoken-style paragraph, roughly 180 to 240 words, written in',
      '     first person as Kironraj would actually say it out loud in the room.',
      '   - Set "source" to "generated".',
      '4. Honesty rules: never claim ServiceNow certification (training in progress only),',
      '   never call the Udemy AWS course an AWS certification, cite lapsed cPanel and',
      '   LiteSpeed credentials in the past tense, describe macOS as personal daily use and',
      '   IAM as coursework. If the honest answer includes a gap, say so plainly rather than',
      '   papering over it.',
      '5. Style: no em dashes, no double hyphens, no bullet points inside the answer itself,',
      '   and no corporate filler. It should read like a person talking, not like writing.',
      '',
      'Change only that one entry. Leave every other entry in the file untouched.',
    ].join('\n');

    const runId = startClaudeRun(prompt, `Writing an answer for "${entry.question.slice(0, 60)}"…`);
    await appendAudit({ action: 'interview-answer-generate', detail: entry.question.slice(0, 120) });
    res.status(202).json({ ok: true, runId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// User-owned, not Claude-owned — deliberately NOT folded into the
// applications.json PATCH strip-list logic. That list protects Claude's
// authored fields from a stale tab; this is the opposite case, a field only
// the person using the app ever writes.
app.patch('/api/study/:guide', async (req, res) => {
  try {
    const { guide } = req.params;
    const dirEntries = await fs.readdir(SKILL_GUIDES_DIR).catch((err) => {
      if (err.code === 'ENOENT') return [];
      throw err;
    });
    if (!dirEntries.includes(guide)) {
      return res.status(404).json({ error: 'Unknown guide file' });
    }

    const progress = await readStudyProgress();
    const prev = progress[guide] ?? {};
    const body = req.body ?? {};
    const next = {
      conceptsRead: typeof body.conceptsRead === 'boolean' ? body.conceptsRead : Boolean(prev.conceptsRead),
      exerciseDone: typeof body.exerciseDone === 'boolean' ? body.exerciseDone : Boolean(prev.exerciseDone),
      quizScore:
        typeof body.quizScore === 'number' ? Math.max(0, Math.min(5, Math.round(body.quizScore))) : prev.quizScore,
    };
    // 100% = both boxes ticked AND quiz >= 4/5 — the index file's own rule
    // ("retake any quiz you scored under 4/5 on"), not a separate threshold.
    const complete = next.conceptsRead && next.exerciseDone && (next.quizScore ?? 0) >= 4;
    next.completedAt = complete ? prev.completedAt ?? Date.now() : undefined;
    if (next.completedAt === undefined) delete next.completedAt;

    progress[guide] = next;
    await writeStudyProgress(progress);
    await appendAudit({ action: complete && !prev.completedAt ? 'study-completed' : 'study-progress', detail: guide });
    res.json(next);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------- folders ----------
// Opening the folder in Explorer is now done client-side (see api.ts's
// openFolder) — this server runs on servo, a different machine from the
// browser, so it has no way to launch a program on the client PC.

// Reports whether each entry's company folder actually has CV/cover-letter
// files on disk, so the UI can show real state instead of trusting cvStatus.
app.get('/api/folder-status', async (_req, res) => {
  try {
    const list = await readData();
    const out = {};
    for (const a of list) {
      if (!a.folderPath) continue;
      const dir = safeCareerPath(a.folderPath);
      if (!dir || !fsSync.existsSync(dir)) {
        out[a.id] = { exists: false, cv: false, coverLetter: false };
        continue;
      }
      const files = await fs.readdir(dir);
      out[a.id] = {
        exists: true,
        cv: files.some((f) => /^CV .*\.docx$/i.test(f)),
        coverLetter: files.some((f) => /^Cover Letter .*\.docx$/i.test(f)),
      };
    }
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------- document serving & preview (v5.0) ----------

// Reports and lists available documents (.pdf, .docx) for an application
app.get('/api/applications/:id/documents', async (req, res) => {
  try {
    const list = await readData();
    const entry = list.find((a) => a.id === req.params.id);
    if (!entry || !entry.folderPath) {
      return res.json({ exists: false, files: [] });
    }
    const dir = safeCareerPath(entry.folderPath);
    if (!dir || !fsSync.existsSync(dir)) {
      return res.json({ exists: false, folderPath: entry.folderPath, files: [] });
    }
    const dirFiles = await fs.readdir(dir);
    const files = [];
    for (const f of dirFiles) {
      const ext = path.extname(f).toLowerCase();
      if (!['.pdf', '.docx', '.txt', '.md'].includes(ext)) continue;
      try {
        const st = fsSync.statSync(path.join(dir, f));
        let kind = 'other';
        if (/^CV/i.test(f)) kind = ext === '.pdf' ? 'cvPdf' : 'cvDocx';
        else if (/^Cover Letter/i.test(f)) kind = ext === '.pdf' ? 'coverPdf' : 'coverDocx';
        files.push({
          name: f,
          kind,
          ext: ext.slice(1),
          size: st.size,
          mtime: st.mtimeMs,
          url: `/api/applications/${encodeURIComponent(entry.id)}/documents/${encodeURIComponent(f)}`,
        });
      } catch {}
    }
    const kindOrder = { cvPdf: 1, cvDocx: 2, coverPdf: 3, coverDocx: 4, other: 5 };
    files.sort((a, b) => (kindOrder[a.kind] || 99) - (kindOrder[b.kind] || 99));
    res.json({
      exists: true,
      folderPath: entry.folderPath,
      company: entry.company,
      role: entry.role,
      files,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Streams or downloads a specific document file from an application's folder
app.get('/api/applications/:id/documents/:filename', async (req, res) => {
  try {
    const list = await readData();
    const entry = list.find((a) => a.id === req.params.id);
    if (!entry || !entry.folderPath) {
      return res.status(404).json({ error: 'Application or folder not found' });
    }
    const dir = safeCareerPath(entry.folderPath);
    if (!dir || !fsSync.existsSync(dir)) {
      return res.status(404).json({ error: 'Folder does not exist' });
    }
    const safeName = path.basename(req.params.filename);
    const ext = path.extname(safeName).toLowerCase();
    if (!['.pdf', '.docx', '.txt', '.md'].includes(ext)) {
      return res.status(400).json({ error: 'Unsupported file type' });
    }
    const filePath = path.join(dir, safeName);
    if (!fsSync.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (ext === '.pdf') {
      res.setHeader('Content-Type', 'application/pdf');
    } else if (ext === '.docx') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    } else if (ext === '.md') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    } else {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }

    const isDownload = req.query.download === '1' || req.query.download === 'true';
    res.setHeader('Content-Disposition', `${isDownload ? 'attachment' : 'inline'}; filename="${safeName}"`);
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------- AI Smart Job Ingestion (v5.0) ----------

// Parses job URL or raw text using Gemini Flash to auto-extract structured application fields
app.post('/api/jobs/parse', async (req, res) => {
  try {
    const { url, text } = req.body || {};
    if (!url && !text) {
      return res.status(400).json({ error: 'Please provide either a job URL or job description text.' });
    }

    let jobContent = (text || '').trim();
    if (url && !jobContent) {
      try {
        jobContent = await fetchJobText(url);
      } catch (err) {
        console.warn('fetchJobText error:', err.message);
      }
    }

    if (!jobContent) {
      return res.status(400).json({
        error: 'Could not extract content from the URL. Please paste the job description text.',
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    const prompt = `You are an expert recruitment assistant and job-tracker parser for Kironraj Odatt Peringode (Cyber Security & IT graduate with Master of IT from Whitecliffe College, seeking SOC Analyst, GRC, Network Security, IT Security Support, or Cybersecurity roles in New Zealand).

Analyze this job listing and extract structured application fields as JSON:
- company: string (employer name)
- role: string (exact role title)
- location: string (city or region, e.g. "Wellington", "Auckland", "Remote")
- roleType: string (strictly one of: "SOC Analyst", "GRC", "Network Security", "IT Security Support", "Other")
- employment: string (strictly "job" or "internship")
- workArrangement: string (strictly "onsite", "hybrid", or "remote")
- salary: string (e.g. "$70,000 - $85,000" or empty string if not stated)
- deadline: string (YYYY-MM-DD format if stated, else empty string)
- source: string (strictly one of: "Seek", "LinkedIn", "Summer of Tech", "Trade Me Jobs", "Company site", "Other")
- fit: string (strictly one of: "strong", "good", "stretch")
- tags: array of short strings (e.g. ["SOC", "SOT", "Junior", "Graduate", "Wellington"])
- notes: string (2-3 concise sentences summarizing key requirements, essential tech stack, and why this role is or isn't a strong match)

JOB LISTING:
${jobContent.slice(0, 7000)}`;

    const candidateModels = [
      'gemini-3.5-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
    ];

    let rawJson = null;
    let lastErr = null;

    for (const model of candidateModels) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.1,
              },
            }),
          }
        );

        if (!response.ok) {
          lastErr = new Error(`Gemini ${model} HTTP ${response.status}: ${await response.text()}`);
          continue;
        }

        const data = await response.json();
        const textOut = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textOut) {
          rawJson = textOut;
          break;
        }
      } catch (err) {
        lastErr = err;
      }
    }

    if (!rawJson) {
      return res.status(502).json({ error: lastErr ? lastErr.message : 'Failed to parse job with Gemini' });
    }

    const parsed = JSON.parse(rawJson);
    if (url && !parsed.link) parsed.link = url;
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ---------- assessment prep (v2.4) ----------
//
// Replaces the hardcoded single-deadline AssessmentPrep component. Prep
// content itself is Claude-authored (it comes from the real invite email plus
// Candidate Key Facts, which the app can't derive), so the server only stores,
// serves, and handles the archive/outcome transitions the user drives.

async function readAssessments() {
  try {
    return JSON.parse(await fs.readFile(ASSESSMENTS_FILE, 'utf8'));
  } catch {
    return { version: 1, updatedAt: new Date().toISOString().slice(0, 10), items: [] };
  }
}

async function writeAssessments(store) {
  await ensureDirs();
  store.updatedAt = new Date().toISOString().slice(0, 10);
  const tmp = `${ASSESSMENTS_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
  await fs.rename(tmp, ASSESSMENTS_FILE);
}

app.get('/api/assessments', async (_req, res) => {
  try {
    res.json(await readAssessments());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Standalone calendar events (not tied to a job application, e.g. a study
// open day or workshop) — Claude/the user edit events.json directly, same as
// the audit log. Read-only endpoint, no write route needed yet.
app.get('/api/events', async (_req, res) => {
  try {
    res.json(JSON.parse(await fs.readFile(EVENTS_FILE, 'utf8')));
  } catch {
    res.json({ items: [] });
  }
});

/**
 * Archive (or restore) one assessment. Archiving is deliberately NOT deletion:
 * the prep that got written for a test worth sitting is worth keeping to
 * prepare for the next one, and the outcome is part of the application's
 * history. `outcome` records how it actually went.
 */
app.patch('/api/assessments/:id', async (req, res) => {
  try {
    const store = await readAssessments();
    const idx = store.items.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const body = req.body ?? {};
    const prev = store.items[idx];
    const next = { ...prev };

    if (body.status === 'archived' || body.status === 'upcoming') {
      next.status = body.status;
      next.archivedAt = body.status === 'archived' ? new Date().toISOString().slice(0, 10) : null;
    }
    if (body.outcome !== undefined) next.outcome = body.outcome;
    if (typeof body.outcomeNote === 'string') next.outcomeNote = body.outcomeNote;

    store.items[idx] = next;
    await writeAssessments(store);
    appendAudit({
      action: 'assessment-update',
      matchKey: next.id,
      detail: `${next.company} — ${next.title}: ${next.status}${next.outcome ? ` (${next.outcome})` : ''}`,
    });
    res.json(store);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/assessments/:id', async (req, res) => {
  try {
    const store = await readAssessments();
    const item = store.items.find((a) => a.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    store.items = store.items.filter((a) => a.id !== req.params.id);
    await writeAssessments(store);
    appendAudit({
      action: 'assessment-delete',
      matchKey: req.params.id,
      detail: `${item.company} — ${item.title}`,
    });
    res.json(store);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------- generic outreach documents ----------
//
// The one CV+cover letter pair attached to every cold approach, from a single
// location — deliberately not copied per target and not tailored per
// organisation (see the jobhq skill's "The generic CV" note). This route just
// reports which of the expected files actually exist on disk and when they
// were last written, so the outreach views can show staleness rather than
// linking at a file that may not be there.
const GENERIC_DOCS_DIR = 'Outreach/Generic CV';
const GENERIC_DOCS = [
  { key: 'cvDocx', label: 'CV (Word)', file: 'Kironraj Odatt Peringode - CV.docx' },
  { key: 'cvPdf', label: 'CV (PDF)', file: 'Kironraj Odatt Peringode - CV.pdf' },
  { key: 'coverDocx', label: 'Cover letter (Word)', file: 'Kironraj Odatt Peringode - Cover Letter.docx' },
];

app.get('/api/generic-docs', async (_req, res) => {
  try {
    const dir = safeCareerPath(GENERIC_DOCS_DIR);
    if (!dir || !fsSync.existsSync(dir)) {
      return res.json({ folderPath: GENERIC_DOCS_DIR, exists: false, items: [] });
    }
    const items = [];
    for (const d of GENERIC_DOCS) {
      const full = path.join(dir, d.file);
      let exists = false;
      let updatedAt = null;
      try {
        const st = await fs.stat(full);
        exists = true;
        updatedAt = st.mtimeMs;
      } catch {
        /* missing — reported as exists:false rather than failing the request */
      }
      items.push({ ...d, exists, updatedAt });
    }
    res.json({ folderPath: GENERIC_DOCS_DIR, exists: true, items });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------- export ----------

const CSV_COLUMNS = [
  ['Company', (a) => a.company],
  ['Role', (a) => a.role],
  ['Location', (a) => a.location],
  ['Role type', (a) => a.type],
  ['Employment', (a) => a.employment ?? 'job'],
  ['Status', (a) => a.status],
  ['Fit', (a) => a.fit],
  ['Date applied', (a) => a.date],
  ['Closing date', (a) => a.deadline],
  ['CV status', (a) => a.cvStatus],
  ['Cover letter', (a) => a.cover],
  ['Tracking link', (a) => a.trackingUrl],
  ['Tracking ref', (a) => a.trackingRef],
  ['Contact', (a) => a.contactName],
  ['Contact email', (a) => a.contactEmail],
  ['Contact phone', (a) => a.contactPhone],
  ['Next action', (a) => a.nextAction],
  ['Next action due', (a) => a.nextActionDue],
  ['Follow-up due', (a) => a.followUpDue],
  ['Salary', (a) => a.salary],
  ['Work arrangement', (a) => a.workArrangement],
  ['Hours of work', (a) => a.workHours],
  ['Source', (a) => a.source],
  ['Job ad link', (a) => a.link],
  ['Folder', (a) => a.folderPath],
  ['Notes', (a) => a.notes],
];

function csvCell(value) {
  const s = value === undefined || value === null ? '' : String(value);
  // Excel treats a leading =/+/-/@ as a formula; prefix with a quote so an
  // exported note can never execute as one when the file is opened.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

app.get('/api/export.csv', async (_req, res) => {
  try {
    const list = await readData();
    const rows = [
      CSV_COLUMNS.map(([header]) => csvCell(header)).join(','),
      ...list.map((a) => CSV_COLUMNS.map(([, get]) => csvCell(get(a))).join(',')),
    ];
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="job-search-hq-${stamp}.csv"`);
    // BOM so Excel opens UTF-8 correctly on Windows.
    res.send('﻿' + rows.join('\r\n'));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------- embedded Claude terminal ----------

/**
 * Runs the real `claude` CLI and streams its output back to the page.
 *
 * The prompt is BUILT HERE from a validated job URL rather than passed through
 * from the browser, so the page is a job-logging trigger and not a general
 * command runner. Claude runs with permissions bypassed (the user's explicit
 * choice) which is exactly why the input side stays this narrow.
 */
const CLAUDE_RUNS = new Map();

/**
 * Resolve the Claude binary so it can be spawned WITHOUT a shell. Spawning
 * through a shell would hand both the prompt (which contains newlines) and the
 * URL to the command interpreter — on a process that runs with permissions
 * bypassed, that is a command-injection surface, not just a quoting bug.
 */
function resolveClaudeBinary() {
  const candidates =
    process.platform === 'win32'
      ? [
          path.join(os.homedir(), '.local', 'bin', 'claude.exe'),
          path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'claude', 'claude.exe'),
        ]
      : [path.join(os.homedir(), '.local', 'bin', 'claude'), '/usr/local/bin/claude'];

  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) return candidate;
  }
  // Fall back to PATH lookup; spawn still runs without a shell.
  return process.platform === 'win32' ? 'claude.exe' : 'claude';
}

const CLAUDE_BIN = resolveClaudeBinary();

/**
 * gemini-cli's global npm install has no real .exe — on Windows the `gemini`
 * command is a .cmd/.ps1 shim, which spawn({shell:false}) cannot launch
 * directly (ENOENT). Running node on the package's actual JS entry point
 * sidesteps that without needing shell:true (and the cmd.exe quoting/
 * injection surface that would reopen).
 */
function resolveGeminiEntry() {
  const candidates =
    process.platform === 'win32'
      ? [path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@google', 'gemini-cli', 'bundle', 'gemini.js')]
      : [
          '/usr/local/lib/node_modules/@google/gemini-cli/bundle/gemini.js',
          '/usr/lib/node_modules/@google/gemini-cli/bundle/gemini.js',
        ];

  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) return candidate;
  }
  return null; // Caught at spawn time via the child's 'error' event.
}

const GEMINI_ENTRY = resolveGeminiEntry();

function buildJobhqPrompt(jobUrl) {
  return [
    `Use the jobhq skill to log this job into Job Search HQ: ${jobUrl}`,
    '',
    // The skill is a router as of 21 Aug 2026; naming the reference files the
    // task needs means a cold CLI run loads those and not the other ~70KB.
    'Read references/logging-a-role.md and references/notion.md from the skill',
    "directory. Don't read the other reference files - this task doesn't need them.",
    '',
    'Fetch the ad, assess fit against the real CV and Candidate Key Facts.md,',
    'then add it as a new entry in "Career and Job/App/data/applications.json"',
    'and mirror it to the Notion database. Capture the closing date in the',
    '`deadline` field when the ad states one. Do not touch existing entries',
    'other than the one you are adding. Reply with a short verdict on fit.',
  ].join('\n');
}

/**
 * Free-form counterpart to buildJobhqPrompt — for anything typed into the
 * terminal panel that isn't a bare URL: a pasted rejection email, "check
 * pending requests", "what should I do today", a status update, etc. This
 * widens what a request body can make Claude do (the URL-only prompt above
 * was deliberately narrow so there was nothing to inject even in principle),
 * but the terminal panel sits behind the app's login wall specifically so
 * this Claude runner is never reachable by anyone but Kironraj — see the
 * Tailscale/auth security audit. Not reachable pre-login.
 */
function buildCommandPrompt(text) {
  return [
    "Kironraj typed or pasted this into the Job Search HQ app's terminal panel",
    "(not a full chat session):",
    '',
    '"""',
    text,
    '"""',
    '',
    'Use the jobhq skill (project root "Career and Job/App") to handle it exactly',
    'as you would if this were typed directly into a Claude Code chat session with',
    'that skill loaded. Figure out the intent and act on it — a few examples of',
    'what this might be, not an exhaustive list: a pasted rejection email (log the',
    'rejection, analyse it, regenerate the Learning Loop per the standing routine);',
    'a status update on an already-logged role (applied/interview/offer/rejected);',
    '"check pending requests" or similar (process whatever is in App/requests/);',
    '"what should I do today" or similar (set today\'s AI priorities); a request to',
    'run an ATS analysis, draft a CV/cover letter, or draft an outreach email.',
    'Follow the skill\'s existing instructions for whichever workflow applies,',
    'including its Notion sync and audit-log steps. If the message is genuinely',
    'ambiguous, or is not related to the job search tracker at all, say so plainly',
    'in your reply rather than guessing at an action. Reply with a short, direct',
    'summary of what you did (or why you didn\'t act).',
  ].join('\n');
}

/**
 * The Gmail button's prompt — spelled out in prose rather than passed as a
 * literal "/gmailfetch 10" string, matching buildJobhqPrompt/buildCommandPrompt's
 * existing pattern: a cold-started `claude -p` process isn't the interactive
 * REPL, so there's no guarantee a leading "/word" gets parsed as a slash
 * command rather than literal text. Telling it in plain language to use the
 * skill is the same reliable approach already used for every other button here.
 * `count` only ever comes from the server's own default below, never straight
 * from the request body unvalidated — see the route handler.
 */
function buildGmailfetchPrompt(count) {
  return [
    `Use the gmailfetch skill (Career and Job/App project root) to check the last ${count} emails`,
    'across the whole mailbox (not just the inbox) for job-tracker updates, exactly as if',
    `Kironraj had typed "/gmailfetch ${count}" into a chat session with that skill loaded.`,
    '',
    "Follow the skill's own SKILL.md step by step: fetch, match against",
    '"Career and Job/App/data/applications.json", then classify and log per jobhq\'s existing',
    'rules (references/rejection-learning-loop.md for a rejection, references/notion.md for the',
    'Notion mirror) — read only what the matched emails actually need, skip the rest. Validate',
    'applications.json and audit-log.jsonl after writing. Never send, reply to, archive, or label',
    'any email — read-only, always.',
    '',
    'Reply with a tight summary per the skill\'s own Step 4: one line per matched-and-logged email',
    '(company, role, what changed), one line for matched-but-nothing-new, and a single count for',
    'everything unrelated. If nothing needed logging, say so plainly and stop.',
  ].join('\n');
}

/**
 * Built with no user input at all — the button that triggers this just says
 * "process what's already queued", so there's nothing here for a request body
 * to inject even in principle.
 */
function buildProcessRequestsPrompt() {
  return [
    'Use the jobhq skill to process every pending request file in',
    '"Career and Job/App/requests/" (cv_request__*.json, delete_request__*.json,',
    'outreach_email_request__*.json, analysis_request__*.json and',
    'review_request__*.json).',
    '',
    // The skill is a router as of 21 Aug 2026. Read only what the pending
    // request types actually need - the router lists the full map, but naming
    // them here means the cold CLI run never has to guess.
    'SKILL.md in the skill directory is a router; its detail lives in',
    'references/. Read only the files the pending requests actually need:',
    '  cv_request       -> references/cv-generation.md + references/ats-scoring.md',
    '  analysis_request -> references/ats-scoring.md',
    '  review_request   -> references/reviewer.md',
    '  outreach_email_request -> references/outreach.md',
    '  delete_request   -> references/requests-and-buttons.md',
    'Plus references/notion.md for any of them that writes to Notion, and',
    'references/requests-and-buttons.md for the request-file handling rules.',
    'Skip every reference file no pending request needs.',
    '',
    "Follow the skill's existing instructions for each file type exactly: for a",
    'cv_request, run the staleness check before redrafting, generate the CV and',
    'cover letter (docx + pdf) into the right "Pending to Apply/<Company>" folder,',
    'update applications.json and the matching Notion row, then delete the request',
    'file. For a delete_request, remove the folder and Notion row as instructed,',
    'then delete the request file.',
    '',
    'For an outreach_email_request, the target is a row in',
    '"Career and Job/App/data/outreach.json" (matched by matchKey), not',
    'applications.json. Draft the email using the matching template in',
    '"Career and Job/Outreach/_templates/" — Intro Email - Company.md, Intro Email',
    '- Recruiter.md, or Follow-up Email.md per the request\'s `kind` and',
    '`template` fields — tailored to that specific organisation using its website',
    'and whatever notes the row already carries. Save it as a .md file into the',
    "row's folderPath (already set on the request payload, always under",
    '"Outreach/"). Set that entry\'s emailStatus to "drafted" and log the activity.',
    'NEVER send the email and never use any mail tool — Kironraj copies it out of',
    'the app and sends it himself. Then delete the request file.',
    '',
    'For an analysis_request, run the on-demand deep fit analysis protocol from',
    'the jobhq skill (same ATS/gap/score rules as CV-time analysis, plus the',
    'recommendation verdict) against the still-researching entry, write the',
    '`analysis` block (and refine `evidenceMap` if not already refined), set',
    'analysisStatus to "ready", state the verdict in your reply, then delete the',
    'request file.',
    '',
    'For a review_request, run the reviewer-agent critique from the jobhq skill',
    'against the already-drafted CV and cover letter in the entry\'s folderPath —',
    'one agent, both documents together, nothing read from disk by the agent',
    'itself. Fold genuine findings back in one batched pass, re-run',
    '`python App/scripts/verify-docs.py --match-key <matchKey>` afterwards, set',
    'reviewStatus to "reviewed", then delete the request file.',
    '',
    'Log each change to the audit log. Do not touch',
    'any entry that has no matching request file. If a request is malformed or its',
    'target no longer exists, delete it and note why in your reply rather than',
    'leaving it stuck.',
    '',
    'Progress reporting: before you start, count the pending request files so you',
    'know the total. Immediately after fully finishing each one (including',
    'deleting its request file), print a line in exactly this form on its own,',
    'before moving to the next request: `PROGRESS <n>/<total>: <Company> — <Role',
    'or "Delete">` (n = how many are now done, including this one). Reply with a',
    'short summary of what was processed once all requests are handled.',
  ].join('\n');
}

// Event types confirmed (empirically, against the real CLI) to carry nothing
// worth showing — book-keeping/telemetry, not activity. Anything NOT in this
// set and not otherwise handled below still falls through to a raw dump, so a
// genuinely new event type in a future CLI version degrades to "a bit noisier
// JSON," never to "silently missing."
const SILENT_STREAM_EVENT_TYPES = new Set(['system', 'user', 'rate_limit_event']);

/**
 * Turns one line of Claude's `--output-format stream-json` output into the
 * {stream, line} shape the client already renders.
 */
function translateClaudeStreamJsonLine(raw, push) {
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    push('out', raw);
    return;
  }

  if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
    for (const block of event.message.content) {
      if (block.type === 'text' && block.text) {
        push('out', block.text);
      } else if (block.type === 'tool_use') {
        push('meta', `→ ${summarizeToolUse(block.name, block.input)}`);
      }
      // Other block types (e.g. "thinking") are deliberately skipped — not
      // useful to a non-technical reader watching this pane.
    }
    return;
  }

  if (event.type === 'result') {
    // On success, event.result just mirrors the final assistant text block
    // already streamed live above — pushing it again would repeat the last
    // paragraph. On a non-success subtype (error, max-turns, etc.) it may be
    // the only place the failure reason appears, so still surface it there.
    if (event.result && event.subtype && event.subtype !== 'success') {
      push('err', event.result);
    }
    const seconds = typeof event.duration_ms === 'number' ? Math.round(event.duration_ms / 1000) : null;
    push('meta', seconds !== null ? `✓ Finished in ${seconds}s` : '✓ Finished');
    return;
  }

  // Tool-result echoes ("user" events) are skipped deliberately, not just as
  // an unrecognized type — the preceding tool_use meta line already said what
  // happened, and echoing results back (can be a full file's contents) would
  // flood the pane rather than inform it.
  if (SILENT_STREAM_EVENT_TYPES.has(event.type)) return;

  // Genuinely unrecognized event type — surface it rather than dropping it.
  push('out', raw);
}

// Confirmed empirically (a real `-p "reply with pong" --output-format
// stream-json` call) against gemini-cli 0.58.0: {"type":"init",...},
// {"type":"message","role":"user"|"assistant","content","delta"}, and
// {"type":"result","status":"success"|"error","error"?,"stats"}. No tool_use
// event was observed yet (that call made no tool calls) — a real jobhq run
// will exercise that path; until then an unrecognized event still falls
// through to a raw dump below rather than being silently dropped.
function translateGeminiStreamJsonLine(raw, push) {
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    push('out', raw);
    return;
  }

  if (event.type === 'message') {
    if (event.role === 'assistant' && event.content) push('out', event.content);
    // role: 'user' just echoes the prompt we already know — skip it.
    return;
  }

  if (event.type === 'result') {
    if (event.status === 'error' && event.error?.message) push('err', event.error.message);
    const seconds =
      typeof event.stats?.duration_ms === 'number' ? Math.round(event.stats.duration_ms / 1000) : null;
    push('meta', seconds !== null ? `✓ Finished in ${seconds}s` : '✓ Finished');
    return;
  }

  // tool_call / tool_result event names are a guess pending a real jobhq run —
  // handle by shape rather than a specific type string, so this doesn't
  // silently miss whatever gemini-cli actually calls them.
  const toolName = event.name || event.tool_name || event.function?.name;
  if (toolName) {
    push('meta', `→ ${summarizeToolUse(toolName, event.args || event.input || event.function?.arguments)}`);
    return;
  }

  if (event.type === 'init') return; // session bookkeeping only

  // Genuinely unrecognized event type — surface it rather than dropping it.
  push('out', raw);
}

const PROVIDERS = {
  claude: {
    bin: CLAUDE_BIN,
    args: (prompt) => ['-p', prompt, '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose'],
    translateLine: translateClaudeStreamJsonLine,
    label: 'Claude',
  },
  gemini: {
    bin: process.execPath, // node itself — see resolveGeminiEntry
    args: (prompt) => [
      GEMINI_ENTRY ?? 'gemini', // null falls through to a clear ENOENT rather than a confusing arg-shift
      '-p',
      prompt,
      '--yolo',
      '--output-format',
      'stream-json',
    ],
    translateLine: translateGeminiStreamJsonLine,
    label: 'Gemini',
  },
};

function summarizeToolUse(name, input) {
  const pathArg = input?.file_path || input?.path;
  if (pathArg) {
    // Absolute Windows paths are long and front-truncating them would cut
    // off the one part that's actually useful — the filename.
    const base = String(pathArg).split(/[\\/]/).filter(Boolean).pop() || String(pathArg);
    return `${name}(${base})`;
  }
  const arg = input?.command || input?.pattern || input?.query || '';
  const short = String(arg).length > 60 ? `${String(arg).slice(0, 57)}…` : String(arg);
  return short ? `${name}(${short})` : name;
}

/**
 * Shared by both /api/claude/run (a job URL) and /api/claude/process-requests
 * (no input at all) — everything past "what's the prompt and what do we tell
 * the user while it runs" is identical: spawn, stream, track for cancel/replay.
 * `provider` selects which CLI binary/flags/stream-json dialect to use — see
 * the PROVIDERS registry above.
 */
function startClaudeRun(promptText, startMessage, provider = 'claude') {
  const providerConfig = PROVIDERS[provider] ?? PROVIDERS.claude;
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const run = {
    id: runId,
    lines: [],
    done: false,
    exitCode: null,
    listeners: new Set(),
    child: null,
    startedAt: Date.now(),
  };
  CLAUDE_RUNS.set(runId, run);

  const push = (stream, text) => {
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      const event = { stream, line };
      run.lines.push(event);
      for (const send of run.listeners) send(event);
    }
  };

  // shell: false is load-bearing — see resolveClaudeBinary above.
  // stream-json gives one NDJSON event per assistant message/tool call as it
  // happens, instead of plain -p mode's single buffered dump at the very
  // end — that's what makes the log actually look real-time.
  const child = spawn(providerConfig.bin, providerConfig.args(promptText), {
    cwd: CAREER_DIR,
    shell: false,
    windowsHide: true,
    // The prompt rides in argv; leaving stdin open makes these CLIs wait a
    // few seconds and warn about missing piped input on every single run.
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  run.child = child;

  push('meta', startMessage);
  push('meta', 'This can take a few minutes; output arrives when it finishes.');

  // stdout arrives in arbitrary chunks — a single NDJSON line can span more
  // than one 'data' event, so buffer until a newline actually closes a line.
  let stdoutBuffer = '';
  child.stdout.on('data', (b) => {
    stdoutBuffer += b.toString();
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) providerConfig.translateLine(line, push);
    }
  });
  child.on('close' /* flush any trailing partial line */, () => {
    if (stdoutBuffer.trim()) providerConfig.translateLine(stdoutBuffer, push);
  });
  child.stderr.on('data', (b) => push('err', b.toString()));
  child.on('close', (code) => {
    run.done = true;
    run.exitCode = code;
    run.child = null;
    push(
      'meta',
      run.cancelled ? '✗ Stopped' : code === 0 ? '✓ Finished' : `✗ Exited with code ${code}`
    );
    for (const send of run.listeners) send({ stream: 'done', line: String(code) });
    // Keep the transcript around briefly so a reconnecting page can read it.
    setTimeout(() => CLAUDE_RUNS.delete(runId), 10 * 60 * 1000);
  });
  child.on('error', (err) => {
    push('err', `Could not start ${providerConfig.label}: ${err.message}`);
    run.done = true;
    for (const send of run.listeners) send({ stream: 'done', line: '1' });
  });

  return runId;
}

app.post('/api/claude/run', async (req, res) => {
  try {
    const jobUrl = String(req.body?.jobUrl ?? '').trim();

    let parsed;
    try {
      parsed = new URL(jobUrl);
    } catch {
      return res.status(400).json({ error: 'That does not look like a URL.' });
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return res.status(400).json({ error: 'Only http(s) job links are supported.' });
    }

    const provider = req.body?.provider === 'gemini' ? 'gemini' : 'claude';
    const runId = startClaudeRun(
      buildJobhqPrompt(parsed.href),
      `Running ${PROVIDERS[provider].label} against ${parsed.hostname}…`,
      provider
    );
    res.status(202).json({ ok: true, runId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * Free-text counterpart to /api/claude/run, for the terminal panel's input
 * when it isn't a bare URL — a pasted rejection email, a status update, "check
 * pending requests", "what should I do today", etc. See buildCommandPrompt's
 * comment for why widening this is fine given the auth gate in front of it.
 */
app.post('/api/claude/command', async (req, res) => {
  try {
    const text = String(req.body?.text ?? '').trim();
    if (!text) return res.status(400).json({ error: 'Nothing to send.' });
    if (text.length > 20000) {
      return res.status(400).json({ error: "That's too long — trim it down and try again." });
    }
    const provider = req.body?.provider === 'gemini' ? 'gemini' : 'claude';
    const runId = startClaudeRun(
      buildCommandPrompt(text),
      `Running ${PROVIDERS[provider].label} against your request…`,
      provider
    );
    res.status(202).json({ ok: true, runId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * Manual trigger for the "on-demand, not a standing watcher" loop described in
 * the jobhq skill: instead of Kironraj typing "check requests" in chat, this
 * button does the same thing — spawn Claude with the same instructions it
 * would already follow, against whatever's sitting in App/requests/ right now.
 */
app.post('/api/claude/process-requests', async (req, res) => {
  try {
    const provider = req.body?.provider === 'gemini' ? 'gemini' : 'claude';
    const runId = startClaudeRun(
      buildProcessRequestsPrompt(),
      `Running ${PROVIDERS[provider].label} against the pending requests queue…`,
      provider
    );
    res.status(202).json({ ok: true, runId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * The homescreen "Gmail" button — one press runs the gmailfetch skill against
 * the last N emails, same real-CLI-spawn mechanism as "Process pending" above.
 * `count` is clamped rather than trusted outright: this route sits behind the
 * app's login wall same as every other /api/claude/* route, but there's no
 * reason to let a stray huge number spawn an unbounded mailbox sweep.
 */
app.post('/api/claude/gmailfetch', async (req, res) => {
  try {
    const provider = req.body?.provider === 'gemini' ? 'gemini' : 'claude';
    const requested = Number(req.body?.count);
    const count = Number.isFinite(requested) && requested > 0 ? Math.min(Math.round(requested), 50) : 10;
    const runId = startClaudeRun(
      buildGmailfetchPrompt(count),
      `Running ${PROVIDERS[provider].label} against your last ${count} emails…`,
      provider
    );
    res.status(202).json({ ok: true, runId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/claude/cancel/:runId', (req, res) => {
  const run = CLAUDE_RUNS.get(req.params.runId);
  if (!run) return res.status(404).json({ error: 'No such run' });
  if (run.child) {
    run.cancelled = true;
    // On Windows a plain kill leaves the child's own subprocesses behind.
    if (process.platform === 'win32') {
      exec(`taskkill /pid ${run.child.pid} /T /F`, () => {});
    } else {
      run.child.kill('SIGTERM');
    }
  }
  res.json({ ok: true });
});

app.get('/api/claude/stream/:runId', (req, res) => {
  const run = CLAUDE_RUNS.get(req.params.runId);
  if (!run) return res.status(404).json({ error: 'No such run' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  for (const event of run.lines) send(event);
  if (run.done) {
    send({ stream: 'done', line: String(run.exitCode ?? 0) });
    return res.end();
  }

  run.listeners.add(send);
  req.on('close', () => run.listeners.delete(send));
});

// ---------- daily wallpaper (Pexels) ----------
//
// One random photo per calendar day, cached to disk so the free-tier Pexels
// quota only ever takes one hit a day no matter how many times the app is
// opened. The API key lives in App/.env and is read server-side only — it
// never reaches the client bundle, which is why this is a proxy route rather
// than the browser calling Pexels directly.

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function readWallpaperCache() {
  try {
    return JSON.parse(await fs.readFile(WALLPAPER_CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

async function writeWallpaperCache(entry) {
  await ensureDirs();
  const tmp = `${WALLPAPER_CACHE_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(entry, null, 2), 'utf8');
  await fs.rename(tmp, WALLPAPER_CACHE_FILE);
}

// Tech-only (30 Aug 2026, on request) — was curated/random across all of
// Pexels; a themed search query keeps every pick in the same visual family
// as the rest of the app instead of landing on e.g. a wedding photo. Rotated
// randomly per fetch so daily variety doesn't collapse to one repeated look.
const WALLPAPER_QUERIES = [
  'technology abstract',
  'circuit board macro',
  'server room',
  'coding screen',
  'data center',
  'cybersecurity',
  'computer chip',
  'network cables',
  'programming code',
  'futuristic technology',
];

// Local fallback pack (30 Aug 2026) — 6 tech photos bundled under
// public/wallpapers/fallback/ (served statically by Vite, same as
// public/source-logos/) so the feature still works with no network, an
// expired key, or a Pexels outage. Read once and cached in memory — these
// files don't change at runtime, only via re-running the fetch script.
const FALLBACK_MANIFEST_FILE = path.join(APP_DIR, 'public', 'wallpapers', 'fallback', 'manifest.json');
let fallbackManifestCache = null;
async function readFallbackManifest() {
  if (fallbackManifestCache) return fallbackManifestCache;
  try {
    fallbackManifestCache = JSON.parse(await fs.readFile(FALLBACK_MANIFEST_FILE, 'utf8'));
  } catch {
    fallbackManifestCache = [];
  }
  return fallbackManifestCache;
}

async function fallbackWallpaperEntry(today) {
  const manifest = await readFallbackManifest();
  if (manifest.length === 0) return null;
  const pick = manifest[Math.floor(Math.random() * manifest.length)];
  return {
    date: today,
    url: `/wallpapers/fallback/${pick.file}`,
    avgColor: pick.avgColor,
    photographer: pick.photographer,
    photographerUrl: pick.photographerUrl,
    pageUrl: pick.pageUrl,
    source: 'local',
  };
}

app.get('/api/wallpaper', async (req, res) => {
  const apiKey = process.env.PEXELS_API_KEY;
  const today = todayLocal();
  const cached = await readWallpaperCache();
  const forceRefresh = req.query.refresh === '1';
  if (!forceRefresh && cached?.date === today) return res.json(cached);

  if (apiKey) {
    try {
      const query = WALLPAPER_QUERIES[Math.floor(Math.random() * WALLPAPER_QUERIES.length)];
      // Pexels search caps around 8000 results per query — page 1-40 at
      // per_page 1 stays safely inside that for every query on the list above.
      const page = 1 + Math.floor(Math.random() * 40);
      const resp = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=landscape&per_page=1&page=${page}`,
        { headers: { Authorization: apiKey } }
      );
      if (!resp.ok) throw new Error(`Pexels ${resp.status}`);
      const data = await resp.json();
      const photo = data.photos?.[0];
      if (!photo) throw new Error('Pexels returned no photo');

      const entry = {
        date: today,
        url: photo.src.large2x || photo.src.large,
        avgColor: photo.avg_color || null,
        photographer: photo.photographer,
        photographerUrl: photo.photographer_url,
        pageUrl: photo.url,
      };
      await writeWallpaperCache(entry);
      return res.json(entry);
    } catch (err) {
      console.warn(`Wallpaper: Pexels fetch failed (${err.message}), falling back`);
    }
  }

  // No key, or the live fetch above failed — a stale cached pick beats a
  // fresh network call, and the bundled local pack beats nothing at all.
  if (cached) return res.json(cached);
  const fallback = await fallbackWallpaperEntry(today);
  if (fallback) return res.json(fallback);
  res.status(502).json({ error: 'Pexels unreachable and no local fallback photos found.' });
});

app.get('/api/health', async (_req, res) => {
  const queue = await readNotionQueue().catch(() => []);
  res.json({
    ok: true,
    dataFile: DATA_FILE,
    notion: notionEnabled,
    notionOutreach: outreachNotionEnabled(),
    notionError: lastNotionError,
    notionQueueLength: queue.length,
  });
});

// ---------- Notion reconcile: read back, review, never auto-apply ----------
//
// Dry-run only. Diffs the user-owned fields on each Notion-linked entry
// against what Notion currently holds and returns the drift — it never
// writes anything itself. Applying a field is a normal PATCH the client
// issues afterward, so it goes through the exact same activity-logging and
// re-sync path as any other edit. Claude-owned fields (analysis,
// evidenceMap, priority, interview, rejection, tasks) are never touched —
// fetchUserFields() doesn't even read them off the Notion page.
app.post('/api/notion/reconcile', async (_req, res) => {
  try {
    if (!notionEnabled) return res.status(400).json({ error: 'Notion sync is not configured.' });
    const list = await readData();
    const linked = list.filter((a) => a.notionPageId);
    const drift = [];
    for (const entry of linked) {
      let remote;
      try {
        remote = await fetchUserFields(entry.notionPageId);
      } catch (err) {
        continue; // a page-level read failure shouldn't fail the whole reconcile
      }
      if (!remote) continue;
      const fields = [];
      for (const [key, remoteValue] of Object.entries(remote)) {
        let localValue = entry[key] ?? '';
        // `text()` in notion.js truncates rich_text at 1900 chars on the way
        // out — comparing against the untruncated local value here would
        // flag every long notes field as "drifted" purely because of our own
        // push-side truncation, never because anything actually changed.
        if (key === 'notes' && typeof localValue === 'string' && localValue.length > 1900) {
          localValue = localValue.slice(0, 1900);
        }
        if (String(remoteValue ?? '') !== String(localValue ?? '')) {
          fields.push({ field: key, local: entry[key] ?? '', notion: remoteValue });
        }
      }
      if (fields.length > 0) {
        drift.push({ id: entry.id, role: entry.role, company: entry.company, fields });
      }
    }
    res.json({ checked: linked.length, drift });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Individual routes and background timers are already wrapped in their own
// try/catch, but that only covers what those authors thought to guard. This
// is the last-resort net: without it, one unguarded throw or unawaited
// rejection anywhere takes down the whole process, and the tracker is dead
// for the rest of the day until someone notices and restarts it by hand.
// Log and keep running rather than exit — a local single-user tool staying
// up in a slightly-off state beats going dark outright.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server kept running):', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection (server kept running):', reason);
});

// Serve static production build if present (e.g. built via npm run build)
const DIST_DIR = path.join(APP_DIR, 'dist');
const hasDist = fsSync.existsSync(DIST_DIR);
if (hasDist) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res, next) => {
    // API routes and missing static assets in /assets/ must not fall back to index.html
    if (req.path.startsWith('/api/') || req.path.startsWith('/assets/')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

await ensureDirs();

function detectTailscaleIp() {
  if (process.env.TAILSCALE_IP) return process.env.TAILSCALE_IP;
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      const family = typeof net.family === 'string' ? net.family : (net.family === 4 ? 'IPv4' : 'IPv6');
      if (family === 'IPv4' && !net.internal && net.address.startsWith('100.')) {
        return net.address;
      }
    }
  }
  return null;
}

// Bound to loopback AND the Tailscale interface specifically — never
// 0.0.0.0. This server can spawn Claude with permissions bypassed, so
// "reachable from the tailnet Kironraj already controls" is as far as this
// goes; the ordinary home Wi-Fi/LAN is deliberately not covered by either
// bind, and the origin-check middleware above enforces the same boundary
// regardless of which interface a request arrives on.
const TAILSCALE_IP = process.env.TAILSCALE_IP || detectTailscaleIp() || '127.0.0.1';
app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Job Search HQ API  →  http://localhost:${PORT}`);
  console.log(`  web UI: ${hasDist ? `on (serving ${DIST_DIR})` : 'off (no dist folder found)'}`);
  console.log(`  data: ${DATA_FILE}`);
  console.log(`  requests: ${REQUESTS_DIR}`);
  console.log(`  notion sync: ${notionEnabled ? 'on' : 'off (no NOTION_TOKEN in App/.env)'}\n`);
  const telegramHandlers = {
    getApplications: readData,
    updateApplication: async (idOrKey, mutator, auditAction = 'update', auditDetail = '') => {
      return withDataLock('applications', async () => {
        const list = await readData();
        const idx = list.findIndex((a) => a.id === idOrKey || a.matchKey === idOrKey);
        if (idx === -1) return null;
        const original = list[idx];
        const updated = mutator({ ...original });
        list[idx] = updated;
        await writeData(list);
        await appendAudit({
          action: auditAction,
          entryId: updated.id,
          matchKey: updated.matchKey,
          detail: auditDetail || `${updated.company} — ${updated.role}`,
        });
        syncToNotion(updated).catch((err) => console.error('Notion sync failed:', err.message));
        return updated;
      });
    },
    createApplication: async (entry) => {
      return withDataLock('applications', async () => {
        const list = await readData();
        const now = Date.now();
        const fullEntry = {
          ...entry,
          id: entry.id || uid(),
          created: now,
          updated: now,
        };
        fullEntry.matchKey = matchKeyFor(fullEntry);
        fullEntry.statusHistory = [{ status: fullEntry.status || 'researching', at: now }];
        fullEntry.activity = [{ at: now, kind: 'created', text: 'Captured via Telegram' }];

        const existing = list.find(
          (a) => a.matchKey === fullEntry.matchKey || (entry.link && a.link === entry.link)
        );
        if (existing) {
          return { existing: true, entry: existing };
        }

        list.push(fullEntry);
        await writeData(list);
        await appendAudit({
          action: 'create',
          entryId: fullEntry.id,
          matchKey: fullEntry.matchKey,
          detail: `${fullEntry.company} — ${fullEntry.role}`,
        });
        syncToNotion(fullEntry).catch((err) => console.error('Notion sync failed:', err.message));
        return { existing: false, entry: fullEntry };
      });
    },
    deleteApplication: async (idOrKey) => {
      return withDataLock('applications', async () => {
        const list = await readData();
        const idx = list.findIndex((a) => a.id === idOrKey || a.matchKey === idOrKey);
        if (idx === -1) return false;
        const [removed] = list.splice(idx, 1);
        await writeData(list);
        await appendAudit({
          action: 'delete',
          entryId: removed.id,
          matchKey: removed.matchKey,
          detail: `${removed.company} — ${removed.role}`,
        });
        return true;
      });
    },
    queueCvRequest: async (idOrKey) => {
      return withDataLock('applications', async () => {
        const list = await readData();
        const idx = list.findIndex((a) => a.id === idOrKey || a.matchKey === idOrKey);
        if (idx === -1) return null;
        const entry = list[idx];
        await ensureDirs();
        const payload = {
          type: 'cv_request',
          id: entry.id,
          matchKey: entry.matchKey || matchKeyFor(entry),
          role: entry.role || '',
          company: entry.company || '',
          link: entry.link || '',
          folderPath: entry.folderPath || '',
          redundant: await cvLooksCurrent(entry),
          userFacts: entry.userFacts || '',
          requestedAt: new Date().toISOString(),
        };
        const file = path.join(REQUESTS_DIR, `cv_request__${payload.matchKey}__${Date.now()}.json`);
        await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');

        list[idx] = { ...entry, cvStatus: 'queued', updated: Date.now() };
        await writeData(list);

        await appendAudit({
          action: 'cv-request',
          entryId: entry.id,
          matchKey: payload.matchKey,
          detail: `queued CV/cover letter for ${entry.company} — ${entry.role} (via Telegram)`,
        });

        return list[idx];
      });
    },
    findCvFile: async (idOrKey) => {
      const list = await readData();
      const entry = list.find((a) => a.id === idOrKey || a.matchKey === idOrKey);
      if (!entry) return null;
      return findCvDocument(entry.matchKey, entry.id);
    },
    isGmailFetchBusy: () => {
      for (const r of CLAUDE_RUNS.values()) {
        if (!r.done && r.child) return true;
      }
      return false;
    },
    runGmailFetch: async ({ count = 10, provider = 'claude' } = {}) => {
      for (const r of CLAUDE_RUNS.values()) {
        if (!r.done && r.child) {
          return { ok: false, busy: true, error: 'A run is already in flight' };
        }
      }
      const safeCount = Number.isFinite(count) && count > 0 ? Math.min(Math.round(count), 50) : 10;
      const runId = startClaudeRun(
        buildGmailfetchPrompt(safeCount),
        `Running ${PROVIDERS[provider].label} against your last ${safeCount} emails…`,
        provider
      );
      const run = CLAUDE_RUNS.get(runId);
      if (!run) return { ok: false, error: 'Could not start run' };

      return new Promise((resolve) => {
        const outputLines = [];
        const errLines = [];

        const listener = (event) => {
          if (event.stream === 'out') {
            outputLines.push(event.line);
          } else if (event.stream === 'err') {
            errLines.push(event.line);
          } else if (event.stream === 'done') {
            run.listeners.delete(listener);
            const code = Number(event.line);
            if (code === 0) {
              const summary = outputLines.join('\n').trim();
              resolve({
                ok: true,
                count: safeCount,
                summary: summary || 'No job updates found in the checked emails.',
              });
            } else {
              resolve({
                ok: false,
                count: safeCount,
                error: errLines.join('\n').trim() || `Process exited with code ${code}`,
              });
            }
          }
        };

        run.listeners.add(listener);
      });
    },
  };

  startTelegramNotifier();
  startTelegramCommands(telegramHandlers);
  startMorningBriefing({ getApplications: readData });
  startCvWorker();
});
app
  .listen(PORT, TAILSCALE_IP, () => {
    console.log(`  tailnet   →  http://${TAILSCALE_IP}:${PORT}\n`);
  })
  .on('error', (err) => {
    // Tailscale not running, or this IP isn't currently assigned to this
    // machine — degrade to loopback-only rather than crashing the app.
    console.warn(
      `  tailnet bind skipped (${err.code}) — Tailscale IP ${TAILSCALE_IP} unreachable, continuing on loopback only\n`
    );
  });

checkStaleApplied();
setInterval(checkStaleApplied, 30 * 60 * 1000);

drainNotionQueue().catch((err) => console.error('Notion queue drain failed:', err.message));
setInterval(() => drainNotionQueue().catch((err) => console.error('Notion queue drain failed:', err.message)), 10 * 60 * 1000);
