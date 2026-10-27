// v6.6.0: after the worker drafts a CV + cover letter, gate it, have an independent reviewer read it,
// regenerate the letter from the findings (bounded), and report what is left. Everything external is
// injected so the loop is testable without Claude, Python or Telegram.
import { execFile } from 'node:child_process';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAREER_DIR = path.resolve(APP_DIR, '..');
export const MAX_CORRECTION_ROUNDS = 2;
const CLASSES = new Set(['fixable', 'needs-fact', 'ad-gap']);

export function parseReviewJson(text) {
  const s = String(text ?? '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a === -1 || b <= a) return null;
  try {
    const raw = JSON.parse(s.slice(a, b + 1));
    const issues = (Array.isArray(raw.issues) ? raw.issues : [])
      .filter((i) => i && typeof i.text === 'string')
      .map((i) => ({ ...i, class: CLASSES.has(i.class) ? i.class : 'fixable' }))
      // a needs-fact question must name the ad line it came from, else it is the reviewer guessing
      .filter((i) => i.class !== 'needs-fact' || (i.adLine && i.question && i.factKey));
    return { summary: String(raw.summary || ''), atsScoreConfirmed: raw.atsScoreConfirmed !== false, issues };
  } catch {
    return null;
  }
}

export function buildReviewerPrompt({ entry, jobText, cv, cl, facts }) {
  return [
    'You are an independent reviewer of a job application. You did not write these documents.',
    'Check the CV and cover letter against the JOB AD and the CANDIDATE FACTS. Reply with ONLY a JSON object, no prose:',
    '{"summary": "one sentence", "atsScoreConfirmed": true, "issues": [{"class": "fixable|needs-fact|ad-gap", "text": "one line", "rule": "optional general rule that would prevent this class of error", "adLine": "ad wording (needs-fact only)", "question": "yes/no question to the candidate (needs-fact only)", "factKey": "short-slug", "factYes": "fact statement if he says yes", "factNo": "fact statement if he says no"}]}',
    'Classes: fixable = a claim the facts do not support (invented or degree-derived skill, wrong employer detail); the letter can be rewritten without it.',
    'needs-fact = the facts are silent and he may genuinely have done it; ask. At most 3, and only when the ad clearly asks for it.',
    'ad-gap = the ad wants something the facts lack; the letter must omit or disclose it honestly. Never name ServiceNow. A degree is not practised experience.',
    'Also flag generic openings/closings and any AI writing tells ("seamless", "delve", "tapestry", "robust", "not just X but Y", em dashes) as fixable. Return {"issues": []} when the documents are clean.',
    '',
    `ROLE: ${entry.company} - ${entry.role}`,
    '--- JOB AD ---',
    String(jobText || entry.jobText || '').slice(0, 6000),
    '--- CANDIDATE FACTS ---',
    String(facts || '').slice(0, 14000),
    '--- CV ---',
    cv,
    '--- COVER LETTER ---',
    cl,
  ].join('\n');
}

export function feedbackFor(issues, gateOutput = '') {
  const lines = issues.filter((i) => i.class !== 'needs-fact').map((i) => `- ${i.text}`);
  if (gateOutput) lines.unshift(`- The mechanical checker failed: ${gateOutput}`);
  return lines.join('\n');
}

/**
 * deps: { runGate(entry)->{ok,output}, runReviewer(entry)->parsed|null, regenerate(entry,feedback), refresh(entry)->entry,
 *         addQuestions(entry,qs)->added[], addRule(rule) }
 * Returns { rounds, gateOk, review, fixed[], open[], questions[] }.
 */
export async function runReviewLoop(entry, deps, { maxRounds = MAX_CORRECTION_ROUNDS } = {}) {
  const fixed = [];
  let current = entry;
  let gate;
  let review = null;
  let rounds = 0;
  let learned = false;
  for (;;) {
    gate = await deps.runGate(current);
    review = gate.ok ? await deps.runReviewer(current) : null;
    if (gate.ok && !review) review = { summary: 'Reviewer returned no usable verdict; not reviewed.', atsScoreConfirmed: true, issues: [], unreviewed: true };
    const fixable = review ? review.issues.filter((i) => i.class === 'fixable') : [];
    const needsFix = !gate.ok || fixable.length > 0;
    if (!needsFix || rounds >= maxRounds) break;
    rounds += 1;
    if (!learned) {
      const rule = fixable.find((i) => typeof i.rule === 'string' && i.rule.trim())?.rule;
      if (rule) {
        await deps.addRule(rule.trim().slice(0, 300));
        learned = true;
      }
    }
    // Regeneration itself can fail (the generator's own quality gate can
    // reject the redraft it just produced) — this used to throw straight out
    // of the loop and past autoReview's try/catch, which discarded the
    // review already computed above with it: no audit line, no stored
    // reviewStatus, no Telegram report, nothing. A real run on the Commerce
    // Commission application did exactly this (8 Oct 2026) — the reviewer
    // correctly flagged a too-short cover letter and a banned AI word, the
    // regeneration attempt failed its own gate, and the whole finding
    // vanished silently while the broken cover letter stayed on disk.
    // Falling through to the normal report path instead means a failed
    // auto-fix still surfaces as an open issue Kironraj actually sees.
    try {
      await deps.regenerate(current, feedbackFor(fixable, gate.ok ? '' : gate.output));
      current = (await deps.refresh(current)) || current;
      fixed.push(...fixable.map((i) => i.text), ...(gate.ok ? [] : [`gate: ${String(gate.output).slice(0, 120)}`]));
    } catch (err) {
      review = {
        ...(review || { summary: '', atsScoreConfirmed: true, issues: [] }),
        issues: [
          ...(review?.issues || []),
          { class: 'fixable', text: `Automatic correction attempt failed: ${String(err.message || err).slice(0, 200)}` },
        ],
      };
      break;
    }
  }
  const open = review ? review.issues.filter((i) => i.class === 'fixable' || i.class === 'ad-gap').map((i) => ({ class: i.class, text: i.text })) : [];
  if (!gate.ok) open.unshift({ class: 'fixable', text: `gate still failing: ${String(gate.output).slice(0, 160)}` });
  const questions = review ? await deps.addQuestions(current, review.issues.filter((i) => i.class === 'needs-fact')) : [];
  // fixed = what the final drafts no longer contain
  const stillOpen = new Set(open.map((o) => o.text));
  return { rounds, gateOk: gate.ok, review, fixed: fixed.filter((f) => !stillOpen.has(f)), open, questions };
}

export function formatReport(entry, r) {
  const clean = r.gateOk && r.open.length === 0 && r.questions.length === 0 && !r.review?.unreviewed;
  const lines = [`${clean ? '✅' : '🔍'} Auto review: ${entry.company} — ${entry.role}`];
  lines.push(`Gate: ${r.gateOk ? 'pass' : 'FAIL'} · correction rounds: ${r.rounds}`);
  if (r.review?.summary) lines.push(r.review.summary);
  if (r.fixed.length) lines.push('', 'Fixed:', ...r.fixed.map((f) => `• ${f}`));
  if (r.open.length) lines.push('', 'Still open:', ...r.open.map((o) => `• [${o.class}] ${o.text}`));
  if (r.questions.length) lines.push('', `${r.questions.length} question${r.questions.length > 1 ? 's' : ''} follow below.`);
  return lines.join('\n');
}

export function toStoredReview(r) {
  const issues = r.open.map((o) => `[${o.class}] ${o.text}`);
  return {
    at: Date.now(),
    verdict: r.gateOk && issues.length === 0 && !r.review?.unreviewed ? 'clean' : 'issues-found',
    atsScoreConfirmed: r.review?.atsScoreConfirmed !== false,
    issues,
    summary: r.review?.summary || (r.gateOk ? '' : 'Mechanical gate failed.'),
    rounds: r.rounds,
    fixed: r.fixed,
  };
}

// ---- default (production) deps ----

const run = (bin, args, opts = {}) =>
  new Promise((resolve) => {
    execFile(bin, args, { maxBuffer: 16 * 1024 * 1024, ...opts }, (err, stdout, stderr) => resolve({ err, stdout: String(stdout), stderr: String(stderr) }));
  });

export function gateViaPython(pythonBin) {
  return async (entry) => {
    const { stdout, err } = await run(pythonBin, [path.join(APP_DIR, 'scripts', 'verify-docs.py'), '--folder', entry.folderPath, '--role', entry.role, '--json'], { cwd: CAREER_DIR, timeout: 120000 });
    try {
      const j = JSON.parse(stdout);
      const bad = (j.checks || []).filter((c) => c.level === 'FAIL').map((c) => `${c.check}${c.detail ? ` (${c.detail})` : ''}`);
      return { ok: j.pass === true, output: bad.join('; ') };
    } catch {
      return { ok: false, output: `verify-docs did not return JSON${err ? `: ${err.message}` : ''}` };
    }
  };
}

async function docxText(file) {
  const { stdout, err } = await run('unzip', ['-p', file, 'word/document.xml']);
  if (err) return '';
  return stdout.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

export async function readDocs(entry) {
  const dir = path.join(CAREER_DIR, entry.folderPath);
  const files = await fsPromises.readdir(dir);
  // File names follow App/scripts/docnames.py: "CV - Jordan Smith - <Company>[ - <role tag>].docx".
  // Older files carry the full role. Prefer a role match, then a company match.
  const roleTag = String(entry.role || '').replace(/\([^)]*\)/g, ' ').split(/\s[-|:/]\s|[,;|:]/)[0].replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).slice(0, 4).join(' ').toLowerCase();
  const pick = (prefix) => {
    const docs = files.filter((f) => f.startsWith(prefix) && f.endsWith('.docx'));
    const low = (f) => f.toLowerCase();
    return docs.find((f) => f.includes(entry.role))
      || (roleTag && docs.find((f) => low(f).includes(roleTag)))
      || docs.find((f) => low(f).includes(String(entry.company || '').toLowerCase()))
      || docs[0];
  };
  const cv = pick('CV - ');
  const cl = pick('Cover Letter - ');
  return { cv: cv ? await docxText(path.join(dir, cv)) : '', cl: cl ? await docxText(path.join(dir, cl)) : '' };
}

export function reviewerViaClaude({ claudeBin, facts }) {
  return async (entry) => {
    const { cv, cl } = await readDocs(entry);
    if (!cl) return { summary: 'No cover letter found to review.', atsScoreConfirmed: true, issues: [] };
    const prompt = buildReviewerPrompt({ entry, jobText: entry.jobText, cv, cl, facts: await facts() });
    // Sonnet, not whatever the default happens to be — this is the one step
    // in the pipeline where judgment (does the fact actually support the
    // claim?) matters more than speed, unlike the cheap Haiku logging pass.
    const { stdout } = await run(claudeBin, ['-p', prompt, '--model', 'sonnet', '--output-format', 'json'], { cwd: CAREER_DIR, timeout: 300000 });
    let text = stdout;
    try {
      text = JSON.parse(stdout).result ?? stdout;
    } catch {
      // not an envelope; parse as-is
    }
    return parseReviewJson(text);
  };
}

export function questionMessage(q) {
  return {
    text: `❓ ${q.label}\n${q.question}\n\nReply to this message to answer in your own words.`,
    replyMarkup: {
      inline_keyboard: [[
        { text: 'Yes, I have', callback_data: `rq:${q.id}:y` },
        { text: 'No', callback_data: `rq:${q.id}:n` },
        { text: 'Partly: explain', callback_data: `rq:${q.id}:t` },
      ]],
    },
  };
}

/** Production wiring. `send(text, replyMarkup)` resolves the Telegram message_id (or null). */
export function createAutoReview({ lock, readData, writeData, appendAudit, send, pythonBin, claudeBin, loadFacts, addRule, processRequest, requestsDir, addQuestions, setMessageId }) {
  const inflight = new Set();
  const deps = {
    runGate: gateViaPython(pythonBin),
    runReviewer: reviewerViaClaude({ claudeBin, facts: loadFacts }),
    addRule,
    addQuestions,
    refresh: async (e) => (await readData()).find((a) => a.id === e.id),
    regenerate: async (e, feedback) => {
      const file = path.join(requestsDir, `cvreview__${e.id}__${Date.now()}.json`);
      await fsPromises.writeFile(file, JSON.stringify({ id: e.id, matchKey: e.matchKey, company: e.company, role: e.role, link: e.link, reviewFeedback: feedback }), 'utf8');
      try {
        await processRequest(file);
      } finally {
        await fsPromises.unlink(file).catch(() => {});
      }
    },
  };
  return async function autoReview(entry, { manual = false } = {}) {
    if ((!manual && process.env.REVIEW_AUTO === '0') || inflight.has(entry.id) || !entry.folderPath) return null;
    inflight.add(entry.id);
    try {
      const result = await runReviewLoop(entry, deps);
      await lock(async () => {
        const list = await readData();
        const i = list.findIndex((a) => a.id === entry.id);
        if (i === -1) return;
        list[i] = { ...list[i], reviewStatus: 'reviewed', analysis: { ...(list[i].analysis || {}), review: toStoredReview(result) } };
        await writeData(list);
      });
      await appendAudit({ action: 'auto-review', entryId: entry.id, matchKey: entry.matchKey, actor: 'auto-review', detail: `${entry.company} — ${entry.role}: ${result.gateOk && !result.open.length ? 'clean' : `${result.open.length} open`}, ${result.rounds} correction round(s), ${result.questions.length} question(s)` });
      await send(formatReport(entry, result));
      for (const q of result.questions) {
        const m = questionMessage(q);
        const id = await send(m.text, m.replyMarkup);
        if (id) await setMessageId(q.id, id);
      }
      return result;
    } catch (err) {
      console.error('auto-review failed:', err.message);
      return null;
    } finally {
      inflight.delete(entry.id);
    }
  };
}
