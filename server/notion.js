/**
 * Direct Notion sync for the Job Search HQ database.
 *
 * Reads its credentials from App/.env (NOTION_TOKEN, NOTION_DATA_SOURCE_ID).
 * Everything here degrades quietly: if no token is configured, every call
 * becomes a no-op so the app still works fully offline. Notion is a mirror,
 * never a blocker for a local edit.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.resolve(__dirname, '..', '.env');

// Data sources (/v1/data_sources/…, parent.data_source_id) only exist from
// 2025-09-03 onward; pinning an older version makes every call here 404/400.
const NOTION_VERSION = '2025-09-03';

/**
 * Resolve the env file. Editors and file pickers make it easy to end up with a
 * FOLDER named `.env` containing a file also named `.env`; without this the
 * read just fails and sync disables itself silently, which is a miserable
 * thing to debug.
 */
function resolveEnvFile() {
  try {
    if (fs.statSync(ENV_FILE).isDirectory()) {
      const nested = path.join(ENV_FILE, '.env');
      if (fs.existsSync(nested)) {
        console.warn(
          '\n  Note: App/.env is a FOLDER. Reading App/.env/.env instead.\n' +
            '  Move that file to App/.env (a plain file) to tidy this up.\n'
        );
        return nested;
      }
    }
  } catch {
    /* nothing there — handled by the caller */
  }
  return ENV_FILE;
}

function loadEnv() {
  const out = {};
  try {
    for (const line of fs.readFileSync(resolveEnvFile(), 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      out[trimmed.slice(0, eq).trim()] = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
    }
  } catch {
    /* no .env — sync stays disabled */
  }
  return out;
}

const env = loadEnv();
const TOKEN = env.NOTION_TOKEN || process.env.NOTION_TOKEN || '';
const DATA_SOURCE_ID =
  env.NOTION_DATA_SOURCE_ID ||
  process.env.NOTION_DATA_SOURCE_ID ||
  'a2baefc0-4c98-4014-88b3-581ccae744b6';

export const notionEnabled = Boolean(TOKEN);

// The tracker and Notion use different vocabularies for the same fields.
const STATUS_MAP = {
  researching: 'Researching',
  applied: 'Applied',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};
const FIT_MAP = { strong: 'Strong', good: 'Good', stretch: 'Stretch' };
const COVER_MAP = { no: 'Not drafted', draft: 'Drafted', sent: 'Sent' };
const CV_MAP = { queued: 'Queued', drafted: 'Drafted', sent: 'Sent' };
const RESUME_MAP = { CV: 'Full CV', Resume: 'One-page Resume' };
const ARRANGEMENT_MAP = { onsite: 'Onsite', hybrid: 'Hybrid', remote: 'Remote' };

const title = (v) => ({ title: [{ text: { content: String(v || '') } }] });
const text = (v) =>
  v ? { rich_text: [{ text: { content: String(v).slice(0, 1900) } }] } : { rich_text: [] };
const select = (v) => (v ? { select: { name: v } } : { select: null });
const url = (v) => ({ url: v || null });
const date = (v) => (v ? { date: { start: v } } : { date: null });
const email = (v) => ({ email: v || null });
const phone = (v) => ({ phone_number: v || null });
const number = (v) => ({ number: typeof v === 'number' ? v : null });
const multi = (v) =>
  Array.isArray(v) ? { multi_select: v.filter(Boolean).map((name) => ({ name })) } : { multi_select: [] };
const checkbox = (v) => ({ checkbox: Boolean(v) });

function propertiesFor(a) {
  return {
    Role: title(a.role),
    Company: text(a.company),
    Location: text(a.location),
    'Role Type': select(a.type),
    'Employment Type': select(a.employment === 'internship' ? 'Internship' : 'Job'),
    Status: select(STATUS_MAP[a.status]),
    Fit: select(FIT_MAP[a.fit]),
    'Job Ad Link': url(a.link),
    'Cover Letter': select(COVER_MAP[a.cover ?? 'no']),
    'CV Status': select(CV_MAP[a.cvStatus]),
    'Resume Version': select(RESUME_MAP[a.resume] ?? 'Not sent yet'),
    'Date Applied': date(a.date),
    'Closing Date': date(a.deadline),
    'Tracking Link': url(a.trackingUrl),
    'Tracking Ref': text(a.trackingRef),
    Contact: text(a.contactName),
    'Contact Email': email(a.contactEmail),
    'Contact Phone': phone(a.contactPhone),
    'Next Action': text(a.nextAction),
    'Next Action Due': date(a.nextActionDue),
    'Follow-up Due': date(a.followUpDue),
    Salary: text(a.salary),
    'Work Arrangement': select(ARRANGEMENT_MAP[a.workArrangement]),
    Source: select(a.source),
    'Priority Rank': number(a.priority?.rank),
    'ATS Score': number(a.analysis?.score?.overall),
    'Interview Date': date(a.interview?.when ? a.interview.when.slice(0, 10) : null),
    Notes: text(a.notes),
    'Folder Path': text(a.folderPath),
    'Match Key': text(a.matchKey),
  };
}

// ---------- outreach (direct-to-company + recruiters) ----------

const OUTREACH_DS = {
  company: env.NOTION_OUTREACH_COMPANIES_DS_ID || process.env.NOTION_OUTREACH_COMPANIES_DS_ID || '',
  recruiter:
    env.NOTION_OUTREACH_RECRUITERS_DS_ID || process.env.NOTION_OUTREACH_RECRUITERS_DS_ID || '',
};

const OUTREACH_STATUS_MAP = {
  'to-contact': 'To contact',
  emailed: 'Emailed',
  replied: 'Replied',
  'in-conversation': 'In conversation',
  'no-reply': 'No reply',
  closed: 'Closed',
};

/**
 * Deliberately does NO branching on `kind`. Both outreach databases are created
 * with the same union schema, so this one property list is always valid against
 * either. That matters because this writer sends every property on every write
 * and a single unknown property name 400s the entire row — a kind-branched
 * version would make that failure mode reachable again. Unused columns per kind
 * are simply hidden in the Notion view.
 */
function outreachPropertiesFor(e) {
  return {
    Name: title(e.name),
    Kind: select(e.kind === 'recruiter' ? 'Recruiter' : 'Company'),
    Website: url(e.website),
    'Careers Page': url(e.careersUrl),
    'Portal URL': url(e.portalUrl),
    LinkedIn: url(e.linkedin),
    Location: text(e.location),
    Sector: select(e.sector),
    Specialisms: multi(e.specialisms),
    'Locations Covered': multi(e.locationsCovered),
    Registered: checkbox(e.registered),
    'What They Do': text(e.whatTheyDo),
    'Why Interesting': text(e.whyInteresting),
    Status: select(OUTREACH_STATUS_MAP[e.status]),
    'Priority Tier': number(e.priorityTier),
    'Contact Name': text(e.contactName),
    'Contact Role': text(e.contactRole),
    'Contact Email': email(e.contactEmail),
    'Contact Phone': phone(e.contactPhone),
    'First Emailed': date(e.firstEmailedOn),
    'Last Emailed': date(e.lastEmailedOn),
    'Emails Sent': number((e.emails ?? []).length),
    Replied: date(e.repliedOn),
    'Follow-up Due': date(e.followUpDue),
    'Next Action': text(e.nextAction),
    'Next Action Due': date(e.nextActionDue),
    Notes: text(e.notes),
    'Folder Path': text(e.folderPath),
    'Match Key': text(e.matchKey),
  };
}

/**
 * Same create-or-update-by-Match-Key contract as syncPage, but routed to one of
 * two databases by `kind`. Returns null (a quiet no-op) when that kind's data
 * source id isn't configured yet, so the app works before the databases exist.
 */
export async function syncOutreachPage(entry) {
  const dataSourceId = OUTREACH_DS[entry.kind];
  if (!notionEnabled || !dataSourceId) return null;

  const properties = outreachPropertiesFor(entry);

  if (entry.notionPageId) {
    await notionFetch(`/pages/${entry.notionPageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties }),
    });
    return entry.notionPageId;
  }

  const found = await notionFetch(`/data_sources/${dataSourceId}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: { property: 'Match Key', rich_text: { equals: entry.matchKey } },
      page_size: 1,
    }),
  }).catch(() => null);

  const existing = found?.results?.[0];
  if (existing) {
    await notionFetch(`/pages/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties }),
    });
    return existing.id;
  }

  const created = await notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'data_source_id', data_source_id: dataSourceId },
      properties,
    }),
  });
  return created.id;
}

/** Whether outreach mirroring is actually configured, for /api/health. */
export const outreachNotionEnabled = () =>
  Boolean(notionEnabled && (OUTREACH_DS.company || OUTREACH_DS.recruiter));

async function notionFetch(endpoint, options = {}) {
  const res = await fetch(`https://api.notion.com/v1${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * Create or update the row for one application. Returns the Notion page id so
 * the caller can persist it and update in place next time instead of
 * creating a duplicate row.
 */
export async function syncPage(entry) {
  if (!notionEnabled) return null;

  const properties = propertiesFor(entry);

  if (entry.notionPageId) {
    await notionFetch(`/pages/${entry.notionPageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties }),
    });
    return entry.notionPageId;
  }

  // No stored id — look for an existing row by Match Key before creating one,
  // so a database populated by the older Claude-driven sync doesn't get
  // duplicated the first time this runs.
  const found = await notionFetch(`/data_sources/${DATA_SOURCE_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: { property: 'Match Key', rich_text: { equals: entry.matchKey } },
      page_size: 1,
    }),
  }).catch(() => null);

  const existing = found?.results?.[0];
  if (existing) {
    await notionFetch(`/pages/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties }),
    });
    return existing.id;
  }

  const created = await notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'data_source_id', data_source_id: DATA_SOURCE_ID },
      properties,
    }),
  });
  return created.id;
}

/**
 * Notion's API has no hard delete — archiving removes the row from the
 * database view, which is the closest available equivalent.
 */
export async function archivePage(pageId) {
  if (!notionEnabled || !pageId) return;
  await notionFetch(`/pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ archived: true }),
  });
}

// ---------- reconcile: read back, user-owned fields only ----------
//
// Sync in the other direction has never existed — `syncPage` only pushes, so
// an edit made in Notion (the phone/cross-device fallback) is silently
// overwritten by the next local write. This reads a page back and reduces it
// to the same narrow set of user-writable fields the PATCH route accepts —
// never `analysis`, `evidenceMap`, `priority`, `interview`, `rejection`,
// `tasks`, which have no sensible Notion representation and would corrupt
// the AI layer if pulled back in.
const STATUS_MAP_REV = Object.fromEntries(Object.entries(STATUS_MAP).map(([k, v]) => [v, k]));
const FIT_MAP_REV = Object.fromEntries(Object.entries(FIT_MAP).map(([k, v]) => [v, k]));
const ARRANGEMENT_MAP_REV = Object.fromEntries(
  Object.entries(ARRANGEMENT_MAP).map(([k, v]) => [v, k])
);

function plainText(prop) {
  if (!prop) return '';
  const parts = prop.rich_text || prop.title || [];
  return parts.map((p) => p.plain_text ?? p.text?.content ?? '').join('');
}

/** Reads one Notion page and returns the user-owned Application fields it
 *  carries, using the exact same key names the PATCH route accepts — so the
 *  diff/apply step downstream can reuse `api.update` unchanged. */
export async function fetchUserFields(pageId) {
  if (!notionEnabled || !pageId) return null;
  const page = await notionFetch(`/pages/${pageId}`, { method: 'GET' });
  const p = page.properties || {};
  const out = {};
  if (p.Status?.select?.name) out.status = STATUS_MAP_REV[p.Status.select.name];
  if (p.Fit?.select?.name) out.fit = FIT_MAP_REV[p.Fit.select.name];
  if (p['Date Applied']?.date?.start) out.date = p['Date Applied'].date.start;
  if (p['Closing Date']?.date?.start) out.deadline = p['Closing Date'].date.start;
  if (p['Follow-up Due']?.date?.start !== undefined)
    out.followUpDue = p['Follow-up Due'].date?.start || '';
  if (p['Next Action Due']?.date?.start) out.nextActionDue = p['Next Action Due'].date.start;
  const nextAction = plainText(p['Next Action']);
  if (nextAction) out.nextAction = nextAction;
  const notes = plainText(p.Notes);
  if (notes) out.notes = notes;
  const contactName = plainText(p.Contact);
  if (contactName) out.contactName = contactName;
  if (p['Contact Email']?.email) out.contactEmail = p['Contact Email'].email;
  if (p['Contact Phone']?.phone_number) out.contactPhone = p['Contact Phone'].phone_number;
  const salary = plainText(p.Salary);
  if (salary) out.salary = salary;
  if (p['Work Arrangement']?.select?.name)
    out.workArrangement = ARRANGEMENT_MAP_REV[p['Work Arrangement'].select.name];
  const trackingRef = plainText(p['Tracking Ref']);
  if (trackingRef) out.trackingRef = trackingRef;
  if (p['Tracking Link']?.url) out.trackingUrl = p['Tracking Link'].url;
  return out;
}
