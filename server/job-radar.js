// Job radar: scans Kironraj's 3 SEEK saved searches (Upper Hutt, Lower Hutt, and ICT Wellington),
// drops anything already tracked or seen, ranks candidates with the archetype router
// plus local proximity bonuses and past decisions, and sends picks to Telegram with
// Log / Skip buttons. Skips feed back as a penalty on that archetype.

import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeJobArchetype, ARCHETYPE_LABELS } from './archetype-router.mjs';
import { sendTelegram } from './notify-telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RADAR_STATE_FILE = path.join(__dirname, '..', 'data', 'job-radar.json');

// Kironraj's 3 exact SEEK saved searches:
// 1. Upper Hutt (near home)
// 2. Lower Hutt (close commute)
// 3. Information & Communication Technology in All Wellington
export const RADAR_SAVED_SEARCHES = [
  {
    name: 'Upper Hutt',
    where: 'Upper Hutt',
    whereid: '32670',
    distance: '0',
    sortMode: 'ListedDate',
  },
  {
    name: 'Lower Hutt',
    where: 'Lower Hutt',
    whereid: '32559',
    distance: '0',
    sortMode: 'ListedDate',
  },
  {
    name: 'ICT in All Wellington',
    where: 'All Wellington',
    whereid: '1019',
    classification: '6281',
    subclassification: '6287,6290,6285,6301,6302,6284,6286,6300,6303',
    sortMode: 'ListedDate',
  },
];

export const RADAR_QUERIES = RADAR_SAVED_SEARCHES;

const SENIOR_RE = /\b(senior|snr|lead|manager|head of|principal|architect|director|chief)\b/i;
// Citizenship-only employers (Candidate Key Facts)
const CLOSED_EMPLOYER_RE = /\b(GCSB|Government Communications Security Bureau|NZSIS|Security Intelligence Service)\b/i;
// Exclude non-target trades, hospitality, labour, retail food, or domestic care roles that appear in broad local searches
const NON_TARGET_RE = /\b(cleaner|cleaning|chef|cook|barista|waiter|waitress|kitchen|daycare|cattery|hairdresser|barber|plumber|electrician|builder|carpenter|labourer|driver|driller|painter|mechanic|nurse|caregiver|dental|veterinary|forklift|packer|assembler|childcare|kelly club|programme coordinator|holiday programme|youth worker|after school|team member|retail|sales assistant|store|warehouse|production operator|lab technician|laboratory|quality (?:assurance|control) technician|security (?:guard|officer))\b/i;
// Local support/technical keywords for roles in Upper/Lower Hutt that are relevant to IT/Tech background
const LOCAL_TECH_RE = /\b(technician|technology|technical|systems?|it support|helpdesk|service desk|network|security|hardware|electronics|data|desktop|cloud|infrastructure|telecom|dispatch|field service)\b/i;

// Commutable from home: Hutt Valley, Wellington city, Porirua and the Kāpiti coast.
const WELLINGTON_REGION_RE = /wellington|porirua|k[aā]piti|paraparaumu|petone|hutt/i;

// Not open to relocation: roles based in another region are dropped unless they are remote/hybrid.
const OTHER_REGION_RE = /auckland|christchurch|canterbury|otago|dunedin|hamilton|waikato|tauranga|bay of plenty|queenstown|nelson|tasman|palmerston|manawat|hawke|napier|hastings|taranaki|new plymouth|northland|whangarei|invercargill|southland|gisborne|rotorua|marlborough|blenheim|timaru|whanganui|wanganui/i;

const MAX_AGE_DAYS = 21;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export function seekJobUrl(id) {
  return `https://nz.seek.com/job/${id}`;
}

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** "$65,000 - $75,000", "$65k+", "$30 - $35 per hour" -> annual {min,max}, or null. */
export function parseSalary(label) {
  const text = String(label || '');
  const nums = [...text.matchAll(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k)?/gi)]
    .map((m) => parseFloat(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1))
    .filter((n) => n >= 15);
  if (!nums.length) return null;
  const hourly = /hour|\bhr\b|p\/h|\bph\b/i.test(text) || Math.max(...nums) < 200;
  const f = hourly ? 2080 : 1;
  return { min: Math.min(...nums) * f, max: Math.max(...nums) * f };
}

/** Same employer and same role, tolerating "Service Desk Analyst" vs "Service Desk Analyst (Level 1)" and "Acme" vs "Acme Ltd". */
export function sameRole(aCompany, aTitle, bCompany, bTitle) {
  const [ac, bc, at, bt] = [norm(aCompany), norm(bCompany), norm(aTitle), norm(bTitle)];
  if (!ac || !bc || !at || !bt) return false;
  return (ac === bc || ac.includes(bc) || bc.includes(ac)) && (at === bt || at.includes(bt) || bt.includes(at));
}

export async function searchSeek(keywords = '', {
  fetchImpl = fetch,
  where = 'All Wellington',
  whereid,
  distance,
  classification,
  subclassification,
  sortMode,
  pageSize = '30',
} = {}) {
  const params = { siteKey: 'NZ-Main', page: '1', pageSize: String(pageSize), locale: 'en-NZ' };
  if (where) params.where = where;
  if (whereid) params.whereid = String(whereid);
  if (distance !== undefined && distance !== null) params.distance = String(distance);
  if (keywords) params.keywords = keywords;
  if (classification) params.classification = String(classification);
  if (subclassification) params.subclassification = String(subclassification);
  if (sortMode) params.sortMode = sortMode;

  const qs = new URLSearchParams(params);
  const res = await fetchImpl(`https://nz.seek.com/api/jobsearch/v5/search?${qs}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`SEEK search ${res.status}`);
  const body = await res.json();
  return (body.data || []).map((j) => ({
    id: String(j.id),
    title: j.title || '',
    company: j.companyName || j.advertiser?.description || '',
    location: j.locations?.[0]?.label || '',
    teaser: j.teaser || '',
    salary: j.salaryLabel || '',
    listedAt: j.listingDate || '',
    url: seekJobUrl(j.id),
  }));
}

/** Archetype counts from real decisions: applied-or-further roles, and radar skips. */
export function learnedSignal(apps, state) {
  const pursued = {};
  const skipped = {};
  for (const a of apps) {
    if (a.archetype && a.status !== 'researching' && a.status !== 'withdrawn') {
      pursued[a.archetype] = (pursued[a.archetype] || 0) + (a.status === 'interview' || a.status === 'offer' ? 2 : 1);
    }
  }
  for (const s of Object.values(state.seen || {})) {
    if (s.decision === 'skipped' && s.archetype) skipped[s.archetype] = (skipped[s.archetype] || 0) + 1;
  }
  return { pursued, skipped };
}

/** Already in the tracker in any status (applied, pending, rejected...), by link or by employer + role. */
export function isTracked(l, apps) {
  return apps.some((a) => (a.link || '').includes(`/job/${l.id}`) || sameRole(a.company, a.role, l.company, l.title));
}

/** null when the listing should not be shown at all. */
export function scoreListing(l, { apps, state, signal = learnedSignal(apps, state), now = Date.now() }) {
  if (state.seen?.[l.id] || SENIOR_RE.test(l.title) || CLOSED_EMPLOYER_RE.test(l.company) || NON_TARGET_RE.test(l.title)) return null;
  if (OTHER_REGION_RE.test(l.location) && !/\b(remote|hybrid|work from home)\b/i.test(`${l.title} ${l.location}`)) return null;
  const ageDays = l.listedAt ? (now - Date.parse(l.listedAt)) / 86_400_000 : 0;
  if (ageDays > MAX_AGE_DAYS) return null;
  if (isTracked(l, apps)) return null;
  // A repost under a new id of something already answered must not come back.
  if (Object.values(state.seen || {}).some((v) => v.decision !== 'shown' && sameRole(v.company, v.title, l.company, l.title))) return null;

  const locLower = (l.location || '').toLowerCase();
  const isUpperHutt = locLower.includes('upper hutt');
  const isLowerHutt = locLower.includes('lower hutt') || locLower.includes('petone') || locLower.includes('seaview');

  const route = routeJobArchetype({ title: l.title, jdText: l.teaser });
  let archetype = route.archetype || route.signalA?.key || null;

  // If role is in Upper/Lower Hutt and title has technical/support/admin/operations keywords, allow as it_support_services
  if (!archetype && (isUpperHutt || isLowerHutt)) {
    if (LOCAL_TECH_RE.test(l.title)) {
      archetype = 'it_support_services';
    }
  }

  if (!archetype) return null;

  const reasons = [ARCHETYPE_LABELS[archetype] || 'Technical Support & IT Services'];
  let score = 50 + (route.confidence === 'high' ? 10 : 0);
  const pursued = Math.min((signal.pursued[archetype] || 0) * 3, 20);
  const skipped = Math.min((signal.skipped[archetype] || 0) * 4, 24);
  score += pursued - skipped;
  if (pursued) reasons.push('matches roles you pursue');
  if (skipped >= 8) reasons.push('you often skip this type');

  if (isUpperHutt) {
    score += 25;
    reasons.push('📍 Upper Hutt (near home)');
  } else if (isLowerHutt) {
    score += 15;
    reasons.push('📍 Lower Hutt (easy commute)');
  }

  if (!isUpperHutt && !isLowerHutt && WELLINGTON_REGION_RE.test(l.location)) score += 5;
  if (/\b(hybrid|remote|work from home|wfh)\b/i.test(`${l.title} ${l.teaser} ${l.location}`)) {
    score += 5;
    reasons.push('🏠 hybrid/remote');
  }
  // Target is $60-75k (12 Oct answers): flag clearly low pay, nudge up clearly in-range pay.
  const pay = parseSalary(l.salary);
  if (pay && pay.max < 55_000) {
    score -= 15;
    reasons.push('💰 below your range');
  } else if (pay && pay.min >= 60_000) {
    score += 5;
    reasons.push(`💰 ${l.salary}`);
  }

  if (l.searchSource) {
    reasons.push(`🔎 Saved search: ${l.searchSource}`);
  }

  if (l.listedAt && ageDays <= 3) {
    score += 15;
    reasons.push('new this week');
  }
  return { ...l, archetype, score, reasons };
}

export async function readRadarState(file = RADAR_STATE_FILE) {
  try {
    return JSON.parse(await fsPromises.readFile(file, 'utf8'));
  } catch {
    return { seen: {} };
  }
}

async function writeRadarState(state, file = RADAR_STATE_FILE) {
  const tmp = `${file}.tmp`;
  await fsPromises.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fsPromises.rename(tmp, file);
}

// One writer at a time: the morning send and a button tap can overlap.
let stateChain = Promise.resolve();
export function updateRadarState(mutate, file) {
  const run = stateChain.then(async () => {
    const state = await readRadarState(file);
    mutate(state);
    await writeRadarState(state, file);
    return state;
  });
  stateChain = run.catch(() => {});
  return run;
}

export function markRadarDecision(id, decision, file) {
  return updateRadarState((s) => {
    const c = s.candidates?.[id];
    // Carry the archetype across so a skip from the Radar page teaches the scorer too.
    s.seen[id] = { ...(c ? { archetype: c.archetype, title: c.title, company: c.company } : {}), ...(s.seen[id] || {}), decision, decidedAt: Date.now() };
    if (c) c.status = decision;
  }, file);
}

const CANDIDATE_KEEP_DAYS = 7;

/** Everything goes after a week, whatever its status: decisions live on in `seen`, logged roles in the tracker. */
function pruneCandidates(state, now = Date.now()) {
  for (const [id, c] of Object.entries(state.candidates || {})) {
    if (now - c.fetchedAt > CANDIDATE_KEEP_DAYS * 86_400_000) delete state.candidates[id];
  }
}

function addCandidates(state, picks, now = Date.now()) {
  state.candidates ||= {};
  for (const p of picks) {
    const { id, source = 'seek', title, company, location, salary, url, listedAt, archetype, score, reasons } = p;
    state.candidates[id] = {
      ...(state.candidates[id] || { status: 'new', fetchedAt: now }),
      id, source, title, company, location, salary, url, listedAt, archetype, score, reasons,
    };
  }
  pruneCandidates(state, now);
}

// ---- LinkedIn (public guest endpoint, no login) ----
const decodeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export function parseLinkedInCards(html) {
  const out = [];
  for (const card of html.split('<li>').slice(1)) {
    const id = card.match(/jobPosting:(\d+)/)?.[1];
    const title = card.match(/base-search-card__title">\s*([^<]+?)\s*</)?.[1];
    if (!id || !title) continue;
    const company = card.match(/base-search-card__subtitle">[\s\S]*?>\s*([^<>]+?)\s*<\/a>/)?.[1] || card.match(/base-search-card__subtitle">\s*([^<]+?)\s*</)?.[1] || '';
    out.push({
      id: `li:${id}`,
      source: 'linkedin',
      title: decodeHtml(title),
      company: decodeHtml(company),
      location: decodeHtml(card.match(/job-search-card__location">\s*([^<]+?)\s*</)?.[1] || ''),
      listedAt: card.match(/datetime="([^"]+)"/)?.[1] || '',
      teaser: '',
      salary: '',
      url: `https://www.linkedin.com/jobs/view/${id}`,
    });
  }
  return out;
}

export async function searchLinkedIn(keywords, { location = 'Wellington, New Zealand', fetchImpl = fetch } = {}) {
  const qs = new URLSearchParams({ keywords, location, f_TPR: 'r1209600', start: '0' });
  const res = await fetchImpl(`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${qs}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`LinkedIn search ${res.status}`);
  return parseLinkedInCards(await res.text());
}

const LINKEDIN_QUERIES = ['service desk', 'IT support', 'helpdesk technician', 'desktop support', 'systems administrator'];
/**
 * Score and store a batch of listings from any source. Unlike the digest this does
 * not mark anything "shown", so a fetch never uses up the Telegram digest's picks.
 */
export async function ingestListings(listings, { apps, file } = {}) {
  const state = await readRadarState(file);
  const signal = learnedSignal(apps, state);
  const have = Object.values(state.candidates || {});
  const fresh = [];
  for (const l of listings) {
    if (state.candidates?.[l.id] || have.some((c) => sameRole(c.company, c.title, l.company, l.title))) continue;
    const scored = scoreListing(l, { apps, state, signal });
    if (scored) { fresh.push(scored); have.push(scored); }
  }
  if (fresh.length) await updateRadarState((s) => addCandidates(s, fresh), file);
  return { added: fresh.length, scanned: listings.length, fresh };
}

/** SEEK + LinkedIn directly (no tokens). Indeed is added by the Claude run that follows. */
export async function fetchDirectSources({ apps, fetchImpl, file } = {}) {
  const found = [];
  for (const q of RADAR_SAVED_SEARCHES) {
    try { found.push(...(await searchSeek(q.keywords || '', { ...q, fetchImpl })).map((l) => ({ ...l, source: 'seek' }))); }
    catch (err) { console.error(`radar fetch: SEEK "${q.name}" failed:`, err.message); }
  }
  for (const kw of LINKEDIN_QUERIES) {
    try { found.push(...(await searchLinkedIn(kw, { fetchImpl }))); }
    catch (err) {
      console.error(`radar fetch: LinkedIn "${kw}" failed:`, err.message);
      if (/429/.test(err.message)) break; // rate limited: more queries only dig the hole deeper
    }
    if (fetchImpl === fetch) await new Promise((r) => setTimeout(r, 2500)); // be gentle with the guest endpoint
  }
  return ingestListings(found, { apps, file });
}

export async function radarSnapshot(file, apps = []) {
  const state = await readRadarState(file);
  const items = [];
  for (const c of Object.values(state.candidates || {}).sort((a, b) => b.score - a.score)) {
    if (Date.now() - c.fetchedAt > CANDIDATE_KEEP_DAYS * 86_400_000) continue;
    // Applied or tracked since it was fetched: hide it. Highest score wins among duplicates.
    if (isTracked(c, apps) || items.some((i) => sameRole(i.company, i.title, c.company, c.title))) continue;
    items.push(c);
  }
  return { items, lastFetchedAt: state.lastFetchedAt || null };
}

export function stampFetch(file) {
  return updateRadarState((s) => { s.lastFetchedAt = Date.now(); pruneCandidates(s); }, file);
}


export async function buildDigest({ apps, fetchImpl, limit = 5, queries = RADAR_SAVED_SEARCHES, file } = {}) {
  const state = await readRadarState(file);
  const signal = learnedSignal(apps, state);
  const byId = new Map();
  for (const q of queries) {
    try {
      const results = typeof q === 'string'
        ? await searchSeek(q, { fetchImpl })
        : await searchSeek(q.keywords || '', { ...q, fetchImpl });
      for (const l of results) {
        if (!byId.has(l.id)) {
          byId.set(l.id, { ...l, searchSource: typeof q === 'object' ? q.name : undefined });
        }
      }
    } catch (err) {
      console.error(`job radar: search "${typeof q === 'string' ? q : q?.name}" failed:`, err.message);
    }
  }
  const sameAd = new Set();
  const picks = [...byId.values()]
    .map((l) => scoreListing(l, { apps, state, signal }))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .filter((p) => {
      const k = `${norm(p.company)}|${norm(p.title)}`;
      return !sameAd.has(k) && sameAd.add(k);
    })
    .slice(0, limit);
  if (picks.length) {
    await updateRadarState((s) => {
      for (const p of picks) {
        s.seen[p.id] = { decision: 'shown', at: Date.now(), archetype: p.archetype, title: p.title, company: p.company };
      }
      addCandidates(s, picks.map((p) => ({ ...p, source: 'seek' })));
    }, file);
  }
  return { picks, scanned: byId.size };
}

export function formatDigest({ picks, scanned }, { isAlert = false } = {}) {
  if (!picks.length) {
    return {
      text: `🔭 Job digest: scanned ${scanned} listings across your 3 saved searches, nothing new worth your time today.`,
      replyMarkup: undefined,
    };
  }
  const header = isAlert
    ? `🔔 NEW SEEK JOB ALERT · ${picks.length} new role${picks.length > 1 ? 's' : ''} found:`
    : `🔭 JOB DIGEST · top ${picks.length} of ${scanned} new SEEK listings across your 3 saved searches:`;

  const lines = [header, ''];
  picks.forEach((p, i) => {
    lines.push(`${i + 1}. ${p.title}`, `   🏢 ${p.company}${p.location ? ` · ${p.location}` : ''}`);
    if (p.salary) lines.push(`   💰 ${p.salary}`);
    lines.push(`   🧭 ${p.reasons.join(' · ')}`, `   🔗 ${p.url}`, '');
  });
  lines.push('Log it runs the normal fit check. Skip teaches the digest.');
  const inline_keyboard = picks.map((p, i) => [
    { text: `✅ Log ${i + 1}`, callback_data: `radar:log:${p.id}` },
    { text: `⏭ Skip ${i + 1}`, callback_data: `radar:skip:${p.id}` },
  ]);
  return { text: lines.join('\n'), replyMarkup: { inline_keyboard } };
}

export function startJobRadar({
  getApplications,
  token = process.env.TELEGRAM_BOT_TOKEN,
  chatId = process.env.TELEGRAM_CHAT_ID,
  sendTelegramImpl = sendTelegram,
  dailyFetch,
  pollIntervalMs = 30 * 60 * 1000,
} = {}) {
  if (!token || !chatId) return;
  let lastMorningSent = '';
  let lastFetchDay = '';

  async function check() {
    try {
      const now = new Date();
      // First poll after 8am each day refreshes the Radar page (SEEK, LinkedIn, Adzuna, Indeed, alert emails).
      if (dailyFetch && now.getHours() >= 8 && lastFetchDay !== now.toDateString()) {
        lastFetchDay = now.toDateString();
        const { lastFetchedAt } = await radarSnapshot();
        if (!lastFetchedAt || new Date(lastFetchedAt).toDateString() !== lastFetchDay) await dailyFetch();
      }
      const isMorningSlot = now.getHours() === 8 && now.getMinutes() >= 50;
      const today = now.toDateString();

      // Morning digest at 8:50 AM daily
      if (isMorningSlot && lastMorningSent !== today) {
        lastMorningSent = today;
        const digest = await buildDigest({ apps: await getApplications() });
        const { text, replyMarkup } = formatDigest(digest);
        await sendTelegramImpl(text, { token, chatId, replyMarkup });
        return;
      }

      // Periodic check: only alert if there are genuine new picks!
      const digest = await buildDigest({ apps: await getApplications() });
      if (digest.picks.length > 0) {
        const { text, replyMarkup } = formatDigest(digest, { isAlert: true });
        await sendTelegramImpl(text, { token, chatId, replyMarkup });
      }
    } catch (err) {
      console.error('job radar: check failed:', err.message);
    }
  }

  // Periodic poll every 30 minutes
  setInterval(check, pollIntervalMs);
  console.log('  job radar: on (scanning 3 saved searches every 30m, morning digest 8:50 AM, /jobs on demand)');
}
