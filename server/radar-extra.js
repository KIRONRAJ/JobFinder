// Radar sources and ad checks beyond SEEK/LinkedIn: Adzuna (API), a small employer
// watchlist (SmartRecruiters), and the rows the daily Claude run writes (Indeed + job-alert
// emails). Plus the NZ eligibility check on the full ad text.

import crypto from 'node:crypto';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRadarState, updateRadarState, ingestListings } from './job-radar.js';
import { extractAdText } from './ad-snapshot.js';
import { isFetchableUrl } from './safe-url.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CLAUDE_FILE = path.join(__dirname, '..', 'data', 'radar-claude.json');
export const SEEK_ALERT_FILE = path.join(__dirname, '..', 'data', 'radar-seek-alerts.json');
export const EMPLOYERS_FILE = path.join(__dirname, '..', 'data', 'radar-employers.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ---- Adzuna: free trial key is 25 calls in total, so at most one call a day ----
const ADZUNA_TRIAL_CAP = 24;

export async function searchAdzuna({ fetchImpl = fetch, file, env = process.env, now = Date.now() } = {}) {
  const { ADZUNA_APP_ID: id, ADZUNA_APP_KEY: key } = env;
  if (!id || !key) return [];
  const day = new Date(now).toDateString();
  const { adzuna } = await readRadarState(file);
  if (adzuna?.day === day || (adzuna?.total || 0) >= ADZUNA_TRIAL_CAP) return [];
  // Counted before the call: a failed attempt still may have used one of the 25.
  await updateRadarState((s) => { s.adzuna = { day, total: (s.adzuna?.total || 0) + 1 }; }, file);
  const qs = new URLSearchParams({
    app_id: id, app_key: key, results_per_page: '50', where: 'Wellington', distance: '30',
    what_or: 'service desk helpdesk "it support" technician "systems administrator" "desktop support"',
    max_days_old: '7', sort_by: 'date',
  });
  const res = await fetchImpl(`https://api.adzuna.com/v1/api/jobs/nz/search/1?${qs}`, {
    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Adzuna ${res.status}`);
  return ((await res.json()).results || []).map((j) => ({
    id: `az:${j.id}`,
    source: 'adzuna',
    title: j.title || '',
    company: j.company?.display_name || '',
    location: j.location?.display_name || '',
    listedAt: j.created || '',
    teaser: j.description || '',
    salary: j.salary_min && j.salary_max && j.salary_is_predicted !== '1' ? `$${Math.round(j.salary_min)} - $${Math.round(j.salary_max)}` : '',
    url: j.redirect_url,
  }));
}

// ---- Employer watchlist: data/radar-employers.json = [{ "ats": "smartrecruiters", "slug": "...", "name": "..." }] ----
// Only SmartRecruiters is built: it is the one public ATS API with a verified NZ employer (Air New Zealand).
// Add Greenhouse/Lever/Workday here when a watched employer needs it.
export async function fetchEmployerListings({ fetchImpl = fetch, file = EMPLOYERS_FILE } = {}) {
  let employers = [];
  try { employers = JSON.parse(await fsPromises.readFile(file, 'utf8')); } catch { return []; }
  const out = [];
  for (const e of employers.filter((x) => x.ats === 'smartrecruiters' && x.slug)) {
    try {
      const res = await fetchImpl(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(e.slug)}/postings?country=nz&limit=100`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`SmartRecruiters ${res.status}`);
      for (const p of (await res.json()).content || []) {
        out.push({
          id: `sr:${e.slug}:${p.id}`, source: 'employer', title: p.name || '', company: e.name || p.company?.name || e.slug,
          location: p.location?.fullLocation || '', listedAt: p.releasedDate || '', teaser: '', salary: '',
          url: `https://jobs.smartrecruiters.com/${p.company?.identifier || e.slug}/${p.id}`,
        });
      }
    } catch (err) {
      console.error(`radar fetch: employer "${e.slug}" failed:`, err.message);
    }
  }
  return out;
}

export async function fetchApiSources(opts = {}) {
  const out = [];
  try { out.push(...(await searchAdzuna(opts))); } catch (err) { console.error('radar fetch: Adzuna failed:', err.message); }
  out.push(...(await fetchEmployerListings({ fetchImpl: opts.fetchImpl })));
  return out;
}

// ---- Rows written by the Claude run (Indeed + job-alert emails) ----
const CLAUDE_SOURCES = new Set(['indeed', 'trademe', 'jobsgovt', 'seek', 'linkedin', 'recruiter']);

/** A stable id per posting, so the same ad from a search and from an alert email collapses. */
function claudeId(source, url) {
  const u = String(url);
  const seek = u.match(/seek\.com[^/]*\/job\/(\d+)/)?.[1];
  if (seek) return seek;
  const li = u.match(/linkedin\.com\/jobs\/view\/(?:[^/?]*-)?(\d+)/)?.[1];
  if (li) return `li:${li}`;
  const tm = u.match(/trademe\.co\.nz.*?\/listing\/(\d+)|trademe\.co\.nz.*?(\d{8,})/)?.slice(1).find(Boolean);
  if (tm) return `tm:${tm}`;
  if (source === 'indeed') return `in:${u.split('?')[0].split('/').filter(Boolean).pop()}`;
  return `ex:${crypto.createHash('sha1').update(u.split('?')[0]).digest('hex').slice(0, 12)}`;
}

function parseDate(s) {
  const t = Date.parse(/\d{4}/.test(String(s)) ? `${s} UTC` : '');
  return Number.isNaN(t) ? '' : new Date(t).toISOString();
}

export function claudeListings(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r?.url && r?.title && /^https?:\/\//.test(r.url))
    .map((r) => {
      const source = CLAUDE_SOURCES.has(r.source) ? r.source : 'other';
      const pay = r.compensation && r.compensation !== 'N/A' ? String(r.compensation) : '';
      return {
        id: claudeId(source, r.url), source, title: String(r.title), company: String(r.company || ''),
        location: String(r.location || ''), listedAt: parseDate(r.postedOn), teaser: '', salary: pay, url: String(r.url),
      };
    });
}

export function buildClaudePrompt() {
  return [
    'Job radar fetch. Two read-only jobs. Write nothing except the JSON file named at the end. Never send, reply, label, archive or delete any email.',
    '',
    '1. Indeed: use the Indeed search_jobs tool (country_code NZ) for:',
    '   - "IT support service desk" in Upper Hutt, Lower Hutt and Wellington',
    '   - "helpdesk technician", "systems administrator" and "network technician" in Wellington',
    '   Rows from this job get "source": "indeed".',
    '',
    '2. Job-alert emails: search Gmail (search_threads) for `newer_than:3d` messages from job-alert senders (not SEEK; it has its own check): LinkedIn, Trade Me,',
    '   jobs.govt.nz / NZ Government Jobs, Indeed, Hays, Randstad, Robert Walters, Talent International, Absolute IT, Potentia.',
    '   Read at most the 15 newest alert emails. Extract every NZ role listed in them. Use the direct job URL, not a tracking redirect, when the real URL is visible.',
    '   "source" is one of: seek, linkedin, trademe, jobsgovt, indeed, recruiter.',
    '',
    `Merge everything into ONE JSON array and write it to ${CLAUDE_FILE} with the Write tool.`,
    'Each element: {"source","title","company","location","postedOn","url","compensation"} using what the result or email shows (use "" when absent).',
    'Do not log, analyse or comment on the roles. Reply with one line: how many roles you wrote.',
  ].join('\n');
}

// ---- NZ eligibility check on the full ad text ----
// Drop only when the ad says citizens/PR only; the candidate holds an open work visa (to 1 Aug 2029).
const CITIZEN_ONLY = [
  /\b(?:nz|new zealand)\s+(?:citizens?|citizenship)\b[^.\n]{0,40}\b(?:only|required|essential|mandatory)\b/i,
  /\b(?:must|need to|required to)\s+(?:be|hold|have)\s+(?:a\s+|an\s+)?(?:current\s+)?(?:nz|new zealand)\s+(?:citizen|citizenship|permanent resident)/i,
  /\b(?:citizens?|permanent residents?)\s+(?:and\s+(?:permanent\s+)?residents?\s+)?only\b/i,
  /\b(?:unable|not able|cannot)\s+to\s+(?:consider|accept)\s+(?:applicants?|applications?)\s+(?:on|with|holding)\s+(?:a\s+)?(?:work|temporary)\s+visa/i,
];
const RESIDENCY = /\b(?:nz|new zealand)\s+resid(?:ent|ency)\b[^.\n]{0,40}\b(?:required|essential|must)\b|\b(?:must|need to)\s+(?:be|hold)\s+(?:a\s+)?(?:nz|new zealand)\s+resident/i;
const CLEARANCE = /\b(?:security clearance|nzsis|baseline vetting|nv1|nv2|police vetting)\b/i;
const CLOSED = /\bno longer (?:available|accepting)|(?:this|the)\s+(?:job|ad|listing|position|vacancy)\s+(?:has|is|was)\s+(?:expired|closed|filled|removed)|applications?\s+(?:have\s+)?closed/i;

export function analyzeAd(text) {
  return {
    closed: CLOSED.test(text),
    citizenOnly: CITIZEN_ONLY.some((re) => re.test(text)),
    residency: RESIDENCY.test(text),
    clearance: CLEARANCE.test(text),
  };
}

async function checkAd(c, fetchImpl) {
  const liId = c.id.startsWith('li:') && c.id.slice(3);
  const url = liId ? `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${liId}` : c.url;
  if (!isFetchableUrl(url)) return null;
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    // A redirect must not have carried us somewhere non-public.
    if (res.url && !isFetchableUrl(res.url)) return null;
    if (res.status === 404 || res.status === 410) return { closed: true };
    if (!res.ok) return null;
    const text = extractAdText(await res.text());
    return text ? analyzeAd(text) : null;
  } catch {
    return null;
  }
}

/** Read the full ad for the best unchecked candidates and drop closed or citizen-only ones. */
export async function enrichCandidates({ file, fetchImpl = fetch, limit = 12 } = {}) {
  const state = await readRadarState(file);
  const todo = Object.values(state.candidates || {})
    .filter((c) => c.status === 'new' && !c.checked)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  const results = new Map();
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(todo.slice(i, i + 4).map(async (c) => results.set(c.id, await checkAd(c, fetchImpl))));
  }
  if (!results.size) return { checked: 0, dropped: 0 };
  let dropped = 0;
  await updateRadarState((s) => {
    for (const [id, r] of results) {
      const c = s.candidates?.[id];
      if (!c) continue;
      if (r?.closed || r?.citizenOnly) {
        // Remembered as answered, so the same role can't come back from another source.
        s.seen[id] = { decision: 'filtered', decidedAt: Date.now(), archetype: c.archetype, title: c.title, company: c.company };
        delete s.candidates[id];
        dropped += 1;
        continue;
      }
      c.checked = true;
      if (r?.clearance) c.reasons.push('🔒 security clearance');
      if (r?.residency) { c.reasons.push('⚠ residency required?'); c.score -= 5; }
    }
  }, file);
  return { checked: results.size, dropped };
}

// ---- SEEK saved-search alert emails (jobmail@s.seek.co.nz) ----
export const FIT_SCORE = 60;

export function buildSeekAlertPrompt(processedIds = []) {
  return [
    'SEEK alert check. Read-only on Gmail (never send, label, archive or delete). Write nothing except the JSON file named below.',
    '',
    '1. Gmail search_threads with query `from:jobmail@s.seek.co.nz newer_than:7d`, pageSize 20.',
    `2. Skip threads whose id is in this already-processed list: ${JSON.stringify(processedIds)}.`,
    '   For every other thread call get_thread (messageFormat PLAIN_TEXT) and extract EVERY job it lists, including the "Jobs you may have missed" section.',
    `3. Write ONE JSON object to ${SEEK_ALERT_FILE} with the Write tool:`,
    '   {"emails":[{"id":"<thread id>"}],"rows":[{"title","company","location","compensation","url","emailDate"}]}',
    '   "emails" lists every thread you read, even if it had no jobs. "url" is the job link exactly as it appears in the email (the tracking link is fine).',
    '   "emailDate" is the email\'s date as an ISO string. Use "" for anything the email does not show.',
    'Do not analyse the roles. Reply with one line: how many threads and roles you wrote.',
  ].join('\n');
}

/** SEEK email links are tracking redirects; one hop gives the real /job/<id> URL. */
async function resolveSeekId(url, fetchImpl) {
  const direct = String(url).match(/seek\.com[^/]*\/job\/(\d+)/)?.[1];
  if (direct) return direct;
  if (!/^https:\/\/url\.s\.seek\.co\.nz\//.test(String(url))) return null;
  try {
    const res = await fetchImpl(url, { redirect: 'manual', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) });
    return res.headers.get('location')?.match(/\/job\/(\d+)/)?.[1] || null;
  } catch {
    return null;
  }
}

/** Rows from the SEEK alert emails -> radar. Returns the new roles that fit (score >= FIT_SCORE) for Telegram. */
export async function ingestSeekAlerts({ data, apps, fetchImpl = fetch, file } = {}) {
  const rows = (Array.isArray(data?.rows) ? data.rows : []).filter((r) => r?.title && r?.url);
  const emails = (Array.isArray(data?.emails) ? data.emails : []).filter((e) => e?.id).map((e) => String(e.id));
  const listings = [];
  for (let i = 0; i < rows.length; i += 4) {
    await Promise.all(rows.slice(i, i + 4).map(async (r) => {
      const id = await resolveSeekId(r.url, fetchImpl);
      if (!id) return;
      const sent = Date.parse(r.emailDate || '');
      listings.push({
        id, source: 'seek', title: String(r.title), company: String(r.company || ''), location: String(r.location || ''),
        salary: /\d/.test(r.compensation || '') ? String(r.compensation) : '', teaser: '',
        listedAt: new Date(Number.isNaN(sent) ? Date.now() : sent).toISOString(), url: `https://nz.seek.com/job/${id}`,
      });
    }));
  }
  const { added, fresh } = await ingestListings(listings, { apps, file });
  if (added) await enrichCandidates({ file, fetchImpl });
  const state = await readRadarState(file);
  const fits = fresh.map((f) => state.candidates?.[f.id]).filter((c) => c && c.score >= FIT_SCORE);
  await updateRadarState((s) => {
    s.processedEmails = [...(s.processedEmails || []), ...emails].slice(-200);
    // Marked shown so neither the 30-minute poll nor the morning digest sends the same role again.
    for (const c of fits) s.seen[c.id] = { decision: 'shown', at: Date.now(), archetype: c.archetype, title: c.title, company: c.company };
  }, file);
  return { emails: emails.length, rows: rows.length, resolved: listings.length, added, fits };
}
