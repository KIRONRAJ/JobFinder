import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReviewJson, runReviewLoop, formatReport, toStoredReview, questionMessage } from './review-loop.js';

const entry = { id: 'a1', company: 'Fujitsu', role: 'On-Site Technician' };
const rev = (issues, extra = {}) => ({ summary: 's', atsScoreConfirmed: true, issues, ...extra });
const fix = (text, rule) => ({ class: 'fixable', text, ...(rule ? { rule } : {}) });

function makeDeps({ gates = [{ ok: true }], reviews, questions = async () => [] }) {
  const calls = { regen: [], rules: [] };
  let g = 0;
  let r = 0;
  return {
    calls,
    runGate: async () => gates[Math.min(g++, gates.length - 1)],
    runReviewer: async () => reviews[Math.min(r++, reviews.length - 1)],
    regenerate: async (_e, fb) => calls.regen.push(fb),
    refresh: async (e) => e,
    addRule: async (x) => calls.rules.push(x),
    addQuestions: questions,
  };
}

test('parseReviewJson: extracts from prose, defaults class, drops needs-fact without an ad line', () => {
  const out = parseReviewJson('here {"summary":"x","issues":[{"text":"a"},{"class":"needs-fact","text":"b","question":"q","factKey":"k"},{"class":"needs-fact","text":"c","adLine":"l","question":"q","factKey":"k"}]} done');
  assert.deepEqual(out.issues.map((i) => i.text), ['a', 'c']);
  assert.equal(out.issues[0].class, 'fixable');
  assert.equal(parseReviewJson('no json'), null);
});

test('clean verdict ends in one pass with no regeneration', async () => {
  const d = makeDeps({ reviews: [rev([])] });
  const r = await runReviewLoop(entry, d);
  assert.equal(r.rounds, 0);
  assert.equal(d.calls.regen.length, 0);
  assert.match(formatReport(entry, r), /^✅/);
  assert.equal(toStoredReview(r).verdict, 'clean');
});

test('fixable issues regenerate, then clean on the next review; learns one rule', async () => {
  const d = makeDeps({ reviews: [rev([fix('IAM overclaim', 'No IAM claims'), fix('x', 'second')]), rev([])] });
  const r = await runReviewLoop(entry, d);
  assert.equal(r.rounds, 1);
  assert.deepEqual(d.calls.rules, ['No IAM claims']);
  assert.match(d.calls.regen[0], /IAM overclaim/);
  assert.deepEqual(r.fixed, ['IAM overclaim', 'x']);
  assert.equal(r.open.length, 0);
});

test('stops at the 2-round cap and reports what is still open', async () => {
  const d = makeDeps({ reviews: [rev([fix('still bad')])] });
  const r = await runReviewLoop(entry, d);
  assert.equal(r.rounds, 2);
  assert.equal(d.calls.regen.length, 2);
  assert.deepEqual(r.open, [{ class: 'fixable', text: 'still bad' }]);
  assert.equal(toStoredReview(r).verdict, 'issues-found');
});

test('needs-fact makes questions and does not regenerate; ad-gap is reported only', async () => {
  const nf = { class: 'needs-fact', text: 't', adLine: 'laptop repair', question: 'Done laptop repair?', factKey: 'laptop' };
  const d = makeDeps({ reviews: [rev([nf, { class: 'ad-gap', text: 'no ITIL' }])], questions: async (_e, qs) => qs });
  const r = await runReviewLoop(entry, d);
  assert.equal(d.calls.regen.length, 0);
  assert.equal(r.questions.length, 1);
  assert.deepEqual(r.open, [{ class: 'ad-gap', text: 'no ITIL' }]);
});

test('gate failure skips the reviewer, regenerates with the gate output, and fails honestly at the cap', async () => {
  const d = makeDeps({ gates: [{ ok: false, output: 'unsupported claim' }], reviews: [rev([])] });
  const r = await runReviewLoop(entry, d);
  assert.equal(r.gateOk, false);
  assert.match(d.calls.regen[0], /unsupported claim/);
  assert.match(formatReport(entry, r), /Gate: FAIL/);
});

test('a failed regeneration attempt is reported as open, not swallowed (Commerce Commission, 8 Oct 2026)', async () => {
  const d = makeDeps({ reviews: [rev([fix('cover letter too short')])] });
  d.regenerate = async () => {
    throw new Error('Generator script failed: Quality gate WARNING or FAILURE in verify-docs.py');
  };
  const r = await runReviewLoop(entry, d);
  assert.equal(r.rounds, 1);
  assert.equal(r.fixed.length, 0);
  assert.ok(r.open.some((o) => o.text.includes('cover letter too short')));
  assert.ok(r.open.some((o) => o.text.includes('Automatic correction attempt failed')));
  assert.equal(toStoredReview(r).verdict, 'issues-found');
});

test('an unusable reviewer verdict is never reported as clean', async () => {
  const r = await runReviewLoop(entry, makeDeps({ reviews: [null] }));
  assert.equal(toStoredReview(r).verdict, 'issues-found');
  assert.doesNotMatch(formatReport(entry, r), /^✅/);
});

test('question message carries y/n/t buttons keyed by id', () => {
  const m = questionMessage({ id: 'q1', label: 'L', question: 'Q?' });
  assert.deepEqual(m.replyMarkup.inline_keyboard[0].map((b) => b.callback_data), ['rq:q1:y', 'rq:q1:n', 'rq:q1:t']);
});

test('Fujitsu regression: the original overclaim phrasings trip the mechanical gate', () => {
  const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'verify-docs.py');
  const py = `
import importlib.util, re, sys
spec = importlib.util.spec_from_file_location('v', ${JSON.stringify(script)})
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
cases = ['I bring a strong conceptual foundation in identity and access management.', 'hands-on hardware diagnostics and warranty handling', 'a solid foundation with device configuration']
for c in cases:
    assert any(re.search(p, c, re.I) for _, p in m.UNSUPPORTED_CLAIM_PATTERNS), c
print('ok')`;
  assert.equal(execFileSync('python3', ['-c', py]).toString().trim(), 'ok');
});
