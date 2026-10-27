import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreListing, learnedSignal, formatDigest, buildDigest, markRadarDecision, readRadarState, ingestListings, parseLinkedInCards, radarSnapshot, parseSalary } from './job-radar.js';
import { ingestSeekAlerts, claudeListings, analyzeAd, enrichCandidates, searchAdzuna, fetchEmployerListings } from './radar-extra.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

const now = Date.parse('2026-10-06T00:00:00Z');
const listing = (o = {}) => ({
  id: '1', title: 'Service Desk Analyst', company: 'Acme', teaser: 'Level 1 IT support for users',
  listedAt: '2026-10-05T00:00:00Z', url: 'https://nz.seek.com/job/1', ...o,
});

test('job-radar: drops tracked, seen and senior listings', () => {
  const state = { seen: { 9: { decision: 'skipped' } } };
  assert.ok(scoreListing(listing(), { apps: [], state, now }));
  assert.equal(scoreListing(listing({ id: '9' }), { apps: [], state, now }), null);
  assert.equal(scoreListing(listing({ title: 'Senior Service Desk Analyst' }), { apps: [], state, now }), null);
  assert.equal(scoreListing(listing({ company: 'Government Communications Security Bureau NZ' }), { apps: [], state, now }), null);
  assert.equal(scoreListing(listing({ listedAt: '2026-09-01T00:00:00Z' }), { apps: [], state, now }), null);
  assert.equal(scoreListing(listing(), { apps: [{ company: 'ACME', role: 'Service Desk Analyst' }], state, now }), null);
  assert.equal(scoreListing(listing(), { apps: [{ link: 'https://nz.seek.com/job/1?x' }], state, now }), null);
});

test('job-radar: skips of an archetype push it down, pursued roles push it up', () => {
  const base = scoreListing(listing(), { apps: [], state: { seen: {} }, now });
  const arch = base.archetype;
  const skips = { seen: Object.fromEntries([2, 3, 4, 5].map((i) => [i, { decision: 'skipped', archetype: arch }])) };
  assert.ok(scoreListing(listing(), { apps: [], state: skips, now }).score < base.score);
  const apps = [{ archetype: arch, status: 'interview', company: 'Other', role: 'X' }];
  assert.ok(scoreListing(listing(), { apps, state: { seen: {} }, now }).score > base.score);
  assert.deepEqual(learnedSignal(apps, skips).pursued, { [arch]: 2 });
});

test('job-radar: digest buttons carry the SEEK id and fit Telegram callback limits', () => {
  const picks = [scoreListing(listing({ id: '95046494' }), { apps: [], state: { seen: {} }, now })];
  const { text, replyMarkup } = formatDigest({ picks, scanned: 40 });
  assert.match(text, /Service Desk Analyst/);
  const [log, skip] = replyMarkup.inline_keyboard[0];
  assert.equal(log.callback_data, 'radar:log:95046494');
  assert.equal(skip.callback_data, 'radar:skip:95046494');
  assert.equal(formatDigest({ picks: [], scanned: 5 }).replyMarkup, undefined);
});

test('job-radar: shown picks are not shown twice, decisions persist', async () => {
  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'radar-')), 'r.json');
  const fetchImpl = async () => ({ ok: true, json: async () => ({ data: [{ id: 7, title: 'IT Support Technician', companyName: 'Acme', teaser: 'help desk support' }] }) });
  const first = await buildDigest({ apps: [], fetchImpl, queries: ['x'], file });
  assert.equal(first.picks.length, 1);
  const second = await buildDigest({ apps: [], fetchImpl, queries: ['x'], file });
  assert.equal(second.picks.length, 0);
  await markRadarDecision('7', 'skipped', file);
  const s = await readRadarState(file);
  assert.equal(s.seen['7'].decision, 'skipped');
  assert.ok(s.seen['7'].archetype);
});

test('job-radar: RADAR_SAVED_SEARCHES contains Upper Hutt, Lower Hutt, and ICT Wellington', async () => {
  const { RADAR_SAVED_SEARCHES } = await import('./job-radar.js');
  assert.equal(RADAR_SAVED_SEARCHES.length, 3);
  const [upperHutt, lowerHutt, ict] = RADAR_SAVED_SEARCHES;
  assert.equal(upperHutt.name, 'Upper Hutt');
  assert.equal(upperHutt.whereid, '32670');
  assert.equal(lowerHutt.name, 'Lower Hutt');
  assert.equal(lowerHutt.whereid, '32559');
  assert.equal(ict.name, 'ICT in All Wellington');
  assert.equal(ict.classification, '6281');
});

test('job-radar: scores proximity bonuses and filters out non-target jobs', () => {
  const baseListing = listing({ location: 'Wellington Central, Wellington' });
  const baseScore = scoreListing(baseListing, { apps: [], state: { seen: {} }, now }).score;

  const upperListing = listing({ location: 'Upper Hutt, Wellington' });
  const upperScored = scoreListing(upperListing, { apps: [], state: { seen: {} }, now });
  assert.ok(upperScored.score > baseScore, 'Upper Hutt gets proximity boost');
  assert.ok(upperScored.reasons.some((r) => r.includes('Upper Hutt')));

  const lowerListing = listing({ location: 'Lower Hutt, Wellington' });
  const lowerScored = scoreListing(lowerListing, { apps: [], state: { seen: {} }, now });
  assert.ok(lowerScored.score > baseScore, 'Lower Hutt gets proximity boost');

  const nonTarget = listing({ title: 'Dog Daycare Handler', location: 'Upper Hutt, Wellington' });
  assert.equal(scoreListing(nonTarget, { apps: [], state: { seen: {} }, now }), null);

  const cleaner = listing({ title: 'Office Cleaner', location: 'Lower Hutt, Wellington' });
  assert.equal(scoreListing(cleaner, { apps: [], state: { seen: {} }, now }), null);
});

test('job-radar: formatDigest supports alert mode header', () => {
  const picks = [scoreListing(listing({ id: '101' }), { apps: [], state: { seen: {} }, now })];
  const { text } = formatDigest({ picks, scanned: 10 }, { isAlert: true });
  assert.match(text, /NEW SEEK JOB ALERT/);
});


test('job-radar: ingest stores candidates once across sources, and a skip teaches the scorer', async () => {
  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'radar-')), 'r.json');
  const recent = new Date().toISOString();
  const li = { id: 'li:1', source: 'linkedin', title: 'Service Desk Analyst', company: 'Acme', location: 'Wellington', listedAt: recent, teaser: '', url: 'https://x/1' };
  const dup = { ...li, id: 'in:abc', source: 'indeed' };
  assert.equal((await ingestListings([li, dup], { apps: [], file })).added, 1);
  assert.equal((await ingestListings([li], { apps: [], file })).added, 0);
  await markRadarDecision('li:1', 'skipped', file);
  const state = await readRadarState(file);
  assert.equal(state.candidates['li:1'].status, 'skipped');
  assert.ok(state.seen['li:1'].archetype);
  assert.equal((await radarSnapshot(file)).items.length, 1);
});

test('job-radar: indeed rows and linkedin cards parse to the listing shape', () => {
  const [row] = claudeListings([{ source: 'indeed', title: 'T', company: 'C', url: 'https://to.indeed.com/aa1', postedOn: 'October 09, 2026', compensation: 'N/A' }]);
  assert.equal(row.id, 'in:aa1');
  assert.equal(row.salary, '');
  const html = '<li><div data-entity-urn="urn:li:jobPosting:42"><h3 class="base-search-card__title"> Help Desk </h3><h4 class="base-search-card__subtitle"><a href="x"> Acme </a></h4><span class="job-search-card__location"> Wellington </span><time datetime="2026-10-13"></time></div></li>';
  assert.deepEqual(parseLinkedInCards(html).map((c) => [c.id, c.title, c.company, c.listedAt]), [['li:42', 'Help Desk', 'Acme', '2026-10-13']]);
});

test('job-radar: tracked, duplicate, repost and week-old candidates never show', async () => {
  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'radar-')), 'r.json');
  const recent = new Date().toISOString();
  const mk = (id, o = {}) => ({ id, source: 'indeed', title: 'Service Desk Analyst', company: 'Acme Ltd', location: 'Wellington', listedAt: recent, teaser: '', url: `https://x/${id}`, ...o });
  // tracked under a looser title and company name
  assert.equal((await ingestListings([mk('in:1')], { apps: [{ company: 'Acme', role: 'Service Desk Analyst (Level 1)', status: 'applied' }], file })).added, 0);
  // two sources, one role
  assert.equal((await ingestListings([mk('li:2'), mk('in:3', { company: 'Acme' })], { apps: [], file })).added, 1);
  // skipped once, reposted under a new id
  await markRadarDecision('li:2', 'skipped', file);
  assert.equal((await ingestListings([mk('li:99')], { apps: [], file })).added, 0);
  // applied after it was fetched: hidden at read time
  assert.equal((await radarSnapshot(file, [{ company: 'Acme', role: 'Service Desk Analyst', status: 'applied' }])).items.length, 0);
  // older than a week: gone
  const st = JSON.parse(await fs.readFile(file, 'utf8'));
  st.candidates['li:2'].fetchedAt = Date.now() - 8 * 86_400_000;
  await fs.writeFile(file, JSON.stringify(st));
  assert.equal((await radarSnapshot(file, [])).items.length, 0);
});

test('radar: alert-email rows get stable ids so one ad from two places collapses', () => {
  const rows = claudeListings([
    { source: 'seek', title: 'A', company: 'C', url: 'https://nz.seek.com/job/12345678?ref=x' },
    { source: 'linkedin', title: 'B', company: 'D', url: 'https://nz.linkedin.com/jobs/view/service-desk-at-acme-4478788802?x=1' },
    { source: 'trademe', title: 'E', company: 'F', url: 'https://www.trademe.co.nz/a/jobs/computing-it/listing/5555555555' },
    { source: 'bogus', title: 'G', company: 'H', url: 'https://example.com/jobs/1?utm=1' },
    { title: 'no url' },
  ]);
  assert.deepEqual(rows.map((r) => [r.id, r.source]), [['12345678', 'seek'], ['li:4478788802', 'linkedin'], ['tm:5555555555', 'trademe'], [rows[3].id, 'other']]);
});

test('radar: salary parsing and NZ scoring', () => {
  assert.deepEqual(parseSalary('$65,000 - $75,000'), { min: 65000, max: 75000 });
  assert.deepEqual(parseSalary('$30 - $35 per hour'), { min: 62400, max: 72800 });
  assert.equal(parseSalary(''), null);
  const base = scoreListing(listing({ location: 'Wellington' }), { apps: [], state: { seen: {} }, now });
  const low = scoreListing(listing({ location: 'Wellington', salary: '$45,000 - $50,000' }), { apps: [], state: { seen: {} }, now });
  const good = scoreListing(listing({ location: 'Wellington', salary: '$65,000 - $75,000', title: 'Hybrid Service Desk Analyst' }), { apps: [], state: { seen: {} }, now });
  assert.ok(low.score < base.score && good.score > base.score);
});

test('radar: ad check flags citizen-only and closed ads, not plain right-to-work wording', () => {
  assert.equal(analyzeAd('Applicants must be a NZ citizen or hold permanent residence.').citizenOnly, true);
  assert.equal(analyzeAd('NZ citizenship is essential for this role.').citizenOnly, true);
  assert.equal(analyzeAd('You must have the right to work in New Zealand.').citizenOnly, false);
  assert.equal(analyzeAd('This job has expired.').closed, true);
  assert.equal(analyzeAd('Ability to obtain a security clearance.').clearance, true);
});

test('radar: enrichment drops a citizen-only candidate and remembers it', async () => {
  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'radar-')), 'r.json');
  const mk = (id, title) => ({ id, source: 'seek', title, company: `Co ${id}`, location: 'Wellington', listedAt: new Date().toISOString(), teaser: '', url: `https://nz.seek.com/job/${id}` });
  await ingestListings([mk('1', 'Service Desk Analyst'), mk('2', 'Helpdesk Technician')], { apps: [], file });
  const body = (t) => `<div data-automation="jobAdDetails">${t.repeat(20)}</div>`;
  const fetchImpl = async (url) => ({ ok: true, status: 200, text: async () => body(url.endsWith('/1') ? 'Applicants must be a NZ citizen. ' : 'Great team, friendly desk. ') });
  const r = await enrichCandidates({ file, fetchImpl });
  assert.deepEqual(r, { checked: 2, dropped: 1 });
  const st = await readRadarState(file);
  assert.equal(st.candidates['1'], undefined);
  assert.equal(st.seen['1'].decision, 'filtered');
  assert.equal(st.candidates['2'].checked, true);
});

test('radar: Adzuna runs once a day and only with credentials; employer watchlist maps SmartRecruiters', async () => {
  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'radar-')), 'r.json');
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: true, json: async () => ({ results: [{ id: 9, title: 'IT Support', company: { display_name: 'Acme' }, location: { display_name: 'Wellington' }, created: '2026-10-19T00:00:00Z', redirect_url: 'https://www.adzuna.co.nz/land/ad/9', description: 'desk' }] }) }; };
  assert.deepEqual(await searchAdzuna({ file, fetchImpl, env: {} }), []);
  const env = { ADZUNA_APP_ID: 'id', ADZUNA_APP_KEY: 'key' };
  const first = await searchAdzuna({ file, fetchImpl, env });
  assert.equal(first[0].id, 'az:9');
  assert.deepEqual(await searchAdzuna({ file, fetchImpl, env }), []);
  assert.equal(calls, 1);
  const empFile = path.join(path.dirname(file), 'e.json');
  await fs.writeFile(empFile, JSON.stringify([{ ats: 'smartrecruiters', slug: 'acme', name: 'Acme' }]));
  const sr = async () => ({ ok: true, json: async () => ({ content: [{ id: '77', name: 'Service Desk', company: { identifier: 'Acme' }, location: { fullLocation: 'Wellington, NZ' }, releasedDate: '2026-10-19T00:00:00Z' }] }) });
  const [job] = await fetchEmployerListings({ fetchImpl: sr, file: empFile });
  assert.deepEqual([job.id, job.company, job.url], ['sr:acme:77', 'Acme', 'https://jobs.smartrecruiters.com/Acme/77']);
});

test('radar: roles in other regions are dropped unless remote', () => {
  const o = { apps: [], state: { seen: {} }, now };
  assert.equal(scoreListing(listing({ location: 'Auckland, Auckland, New Zealand' }), o), null);
  assert.equal(scoreListing(listing({ location: 'Christchurch' }), o), null);
  assert.ok(scoreListing(listing({ location: 'Auckland (Remote)' }), o));
  assert.ok(scoreListing(listing({ location: 'Lower Hutt, Wellington' }), o));
});

test('radar: retail and plant roles in the Hutt are not tech roles', () => {
  const o = { apps: [], state: { seen: {} }, now };
  for (const title of ['Security Team Member - Fixed Term', 'Power Tools/Hardware Team Member', 'Quality Assurance Technician']) {
    assert.equal(scoreListing(listing({ title, location: 'Upper Hutt, Wellington' }), o), null, title);
  }
  assert.ok(scoreListing(listing({ title: 'IT Support Technician', location: 'Upper Hutt, Wellington' }), o));
});

test('radar: SEEK alert emails resolve tracking links, add new roles, notify only fits, and are not reprocessed', async () => {
  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'radar-')), 'r.json');
  const track = (n) => `https://url.s.seek.co.nz/ss/c/${n}`;
  const fetchImpl = async (url) => {
    if (url.startsWith('https://url.s.seek.co.nz/')) return { headers: { get: () => `https://nz.seek.com/job/9000${url.slice(-1)}?tracking=x` } };
    return { ok: true, status: 200, text: async () => '' };
  };
  const data = {
    emails: [{ id: 'm1' }],
    rows: [
      { title: 'SOC Analyst', company: 'Cache Group', location: 'Wellington Central, Wellington', url: track(1), emailDate: new Date().toISOString() },
      { title: 'Senior Network Engineer', company: 'AC3', location: 'Wellington Central, Wellington', url: track(2), emailDate: new Date().toISOString() },
      { title: 'Service Desk Analyst', company: 'Acme', location: 'Wellington', url: 'https://example.com/not-seek', emailDate: new Date().toISOString() },
    ],
  };
  const out = await ingestSeekAlerts({ data, apps: [], fetchImpl, file });
  assert.deepEqual([out.emails, out.rows, out.resolved, out.added], [1, 3, 2, 1]); // senior dropped, non-seek link unresolved
  assert.deepEqual(out.fits.map((c) => c.id), ['90001']);
  const st = await readRadarState(file);
  assert.deepEqual(st.processedEmails, ['m1']);
  assert.equal(st.seen['90001'].decision, 'shown');
  const again = await ingestSeekAlerts({ data, apps: [], fetchImpl, file });
  assert.equal(again.fits.length, 0);
  assert.equal(again.added, 0);
});
