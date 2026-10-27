import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractAdText, needsAdSnapshot, adTextBlocker } from './ad-snapshot.js';

const body = 'Provide Level 1 technical support across connectivity, hardware and access issues. '.repeat(4);

test('ad-snapshot: pulls the SEEK jobAdDetails block, not page chrome', () => {
  const html = `<html><nav>Sign in</nav><div class="x"><div data-automation="jobAdDetails"><div><p>About</p>
    <ul><li><p>${body}</p></li></ul><div>inner</div></div></div><footer>Footer chrome</footer></div></html>`;
  const t = extractAdText(html);
  assert.match(t, /^About\n/);
  assert.match(t, /- Provide Level 1/);
  assert.match(t, /inner/);
  assert.doesNotMatch(t, /Sign in|Footer chrome/);
});

test('ad-snapshot: pulls verbatim text from window.SEEK_REDUX_DATA', () => {
  const reduxPayload = {
    jobdetails: {
      result: {
        job: {
          content: `<div><p>Key responsibilities:</p><p>${body}</p><ul><li>Monitor SIEM alerts</li><li>Triage security incidents</li></ul></div>`,
        },
      },
    },
  };
  const html = `<html><head><script>window.SEEK_REDUX_DATA = ${JSON.stringify(reduxPayload)};</script></head><body>Chrome</body></html>`;
  const t = extractAdText(html);
  assert.match(t, /^Key responsibilities:/);
  assert.match(t, /- Monitor SIEM alerts/);
  assert.match(t, /- Triage security incidents/);
  assert.doesNotMatch(t, /Chrome/);
});

test('ad-snapshot: falls back to JSON-LD JobPosting description', () => {
  const ld = JSON.stringify({ '@type': 'JobPosting', description: `&lt;p&gt;${body}&lt;/p&gt;` });
  const t = extractAdText(`<script type="application/ld+json">${ld}</script>`);
  assert.match(t, /^Provide Level 1/);
});

test('ad-snapshot: a page with no ad container yields nothing', () => {
  assert.equal(extractAdText(`<html><p>${body}</p></html>`), '');
  assert.equal(extractAdText(''), '');
});

test('ad-snapshot: needsAdSnapshot only picks live, unsnapshotted, fetchable entries', () => {
  const now = Date.now();
  const base = { status: 'researching', link: 'https://nz.seek.com/job/1', created: now };
  assert.equal(needsAdSnapshot(base, now), true);
  assert.equal(needsAdSnapshot({ ...base, adSnapshotAt: now }, now), false);
  assert.equal(needsAdSnapshot({ ...base, status: 'rejected' }, now), false);
  assert.equal(needsAdSnapshot({ ...base, link: 'http://127.0.0.1/x' }, now), false);
  assert.equal(needsAdSnapshot({ ...base, adSnapshotTriedAt: now - 1000 }, now), false);
  assert.equal(needsAdSnapshot({ ...base, adSnapshotTriedAt: now - 25 * 3_600_000 }, now), true);
  assert.equal(needsAdSnapshot({ ...base, status: 'applied', created: now - 8 * 86_400_000 }, now), false);
  assert.equal(needsAdSnapshot({ ...base, created: now - 8 * 86_400_000 }, now), false);
});

test('ad-snapshot: only a summary blocks CV generation', () => {
  assert.ok(adTextBlocker({ jobTextKind: 'summary' }));
  assert.equal(adTextBlocker({ jobTextKind: 'verbatim' }), null);
  assert.equal(adTextBlocker({}), null);
});

test('ad-snapshot: archive names are per role so one company folder can hold several ads', async () => {
  const { adFileBase } = await import('./ad-snapshot.js');
  const a = adFileBase('Datacom', 'Service Desk Analyst');
  const b = adFileBase('Datacom', 'Customer Support Consultant - Smartly');
  assert.notEqual(a, b);
  assert.equal(a, 'Job Ad - Service Desk Analyst');
});
