// Handles incoming Telegram commands and interactive callback queries via long-polling getUpdates.
// Features: /pending, /today, /role, /cv, /prep, /status, /note, /stats, interactive buttons, and URL ingest.

import { execFile } from 'node:child_process';
import fsPromises from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { generateContent } from './ai-models.js';
import { isFetchableUrl } from './safe-url.js';
import { telegramApi, telegramGetUpdates } from './telegram-api.js';
import {
  sendTelegram,
  sendTelegramDocument,
  sendTelegramQuiz,
  downloadTelegramFile,
} from './notify-telegram.js';

export function getDashboardUrl() {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.TAILSCALE_IP) return `http://${process.env.TAILSCALE_IP}:5178`;
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      const family = typeof net.family === 'string' ? net.family : (net.family === 4 ? 'IPv4' : 'IPv6');
      if (family === 'IPv4' && !net.internal && net.address.startsWith('100.')) {
        return `http://${net.address}:5178`;
      }
    }
  }
  return 'http://localhost:5178';
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..');
const CAREER_DIR = path.resolve(APP_DIR, '..');
const DEFAULT_DATA_FILE = path.join(APP_DIR, 'data', 'applications.json');
const DEFAULT_INTERVIEW_BANK_FILE = path.join(APP_DIR, 'data', 'interview-bank.json');
const DEFAULT_QUIZ_BANK_FILE = path.join(APP_DIR, 'data', 'quiz-bank.json');
const DEFAULT_LEARNING_LOOP_FILE = path.join(APP_DIR, 'data', 'learning-loop.json');
const DEFAULT_KEY_FACTS_FILE = path.join(CAREER_DIR, 'Project Notes', 'Candidate Key Facts.md');
const VOICE_NOTES_DIR = path.join(APP_DIR, 'data', 'voice-notes');

export const COMMAND_HELP = [
  '🤖 JOB SEARCH HQ',
  '',
  '📅 DAILY',
  '   ⏰ /today · what is due now',
  '   📋 /pending · active pipeline',
  '   🛰 /radar · Wgtn & remote',
  '   📊 /stats · numbers',
  '',
  '🔍 A ROLE',
  '   🔎 /role <name> · full card',
  '   📄 /cv <name> · send CV PDF',
  '   📝 /cl <name> · cover letter text',
  '   🎤 /prep <name> · talking points',
  '',
  '✏️ LOGGING',
  '   📥 /log <Co> — <Role> [url]',
  '   🔄 /status <name> <status>',
  '   📭 /reject <name> [reason]',
  '   🗒 /note <name> <text>',
  '',
  '🧠 PRACTICE',
  '   🎯 /practice · STAR flashcards',
  '   ❓ /quiz · technical quiz',
  '   💡 /ask <question> · career coach',
  '',
  '⚙️ SYSTEM',
  '   📨 /gmail [n] · sweep inbox',
  '   🔄 /sync · push to GitHub',
  '   📱 /app · open dashboard',
  '',
  '🎙 Send a voice memo after an interview for an instant debrief.',
  '🔗 Paste any job link to capture it.',
].join('\n');

export const MAIN_MENU_KEYBOARD = {
  keyboard: [
    [{ text: '⏰ Today' }, { text: '📋 Pending' }],
    [{ text: '📨 Gmail Fetch' }, { text: '🛰️ Radar' }],
    [{ text: '🎯 Practice' }, { text: '🧠 Quiz' }],
    [{ text: '📊 Stats' }, { text: '🔄 Sync' }],
    [{ text: '❓ Help' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: 'Command, question (/ask), or paste job link…',
};

export const PENDING_STATUS_ORDER = ['interview', 'offer', 'researching', 'applied'];
export const PENDING_STATUS_LABELS = {
  interview: '🟢 Interview',
  offer: '🎉 Offer',
  researching: '🔍 Researching',
  applied: '📨 Applied',
};
export const PENDING_CAP_PER_STATUS = 10;

export const VALID_STATUSES = ['researching', 'applied', 'interview', 'offer', 'rejected', 'withdrawn'];
export const STATUS_SHORTCUTS = {
  res: 'researching',
  app: 'applied',
  int: 'interview',
  off: 'offer',
  rej: 'rejected',
  with: 'withdrawn',
};

export function formatPending(apps) {
  const pending = apps.filter((a) => a.status !== 'rejected' && a.status !== 'withdrawn');
  if (pending.length === 0) return "📋 PIPELINE\n\n✅ Nothing pending. Pipeline's clear.";

  const out = [`📋 PIPELINE · ${pending.length} active`];
  for (const status of PENDING_STATUS_ORDER) {
    const group = pending.filter((a) => a.status === status);
    if (group.length === 0) continue;
    out.push('', `${PENDING_STATUS_LABELS[status]} · ${group.length}`);
    out.push(...bullets(group.map((a) => `• ${pair(a)}`), PENDING_CAP_PER_STATUS));
  }
  return out.join('\n');
}

function todayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateOnly(dateStr) {
  return (dateStr || '').slice(0, 10);
}

function isDueTodayOrEarlier(dateStr) {
  if (!dateStr) return false;
  return dateOnly(dateStr) <= todayDateString();
}

// ---------- phone-readable formatting helpers ----------

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Whole days from today to `dateStr`. Negative = in the past. */
function daysAway(dateStr) {
  const d = dateOnly(dateStr);
  if (!d) return null;
  const then = new Date(`${d}T00:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((then.getTime() - now.getTime()) / 86_400_000);
}

/** "today", "tomorrow", "Fri", "in 12d", "3d ago" — whichever reads shortest. */
function whenLabel(dateStr) {
  const n = daysAway(dateStr);
  if (n === null) return '';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n < 0) return `${-n}d ago`;
  if (n <= 6) return DAYS[new Date(`${dateOnly(dateStr)}T00:00:00`).getDay()];
  return `in ${n}d`;
}

function shortDate(dateStr) {
  const d = dateOnly(dateStr);
  if (!d) return '';
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
}

/** Long employer names blow the line width on a phone. */
function clip(text, max = 34) {
  const s = String(text ?? '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

/** "Company — Role", both clipped, for a one-line list item. */
function pair(app, coMax = 30, roleMax = 34) {
  return `${clip(app.company, coMax)} · ${clip(app.role, roleMax)}`;
}

/**
 * Render a capped bullet list with an overflow tail. Keeping the cap low is
 * the whole point — these are read on a phone, and /today was 7,094 characters
 * before this, past Telegram's own 4,096 limit.
 */
function bullets(items, cap, moreHint = '') {
  const lines = items.slice(0, cap).map((t) => `   ${t}`);
  const extra = items.length - cap;
  if (extra > 0) lines.push(`   ⋯ +${extra} more${moreHint ? ` · ${moreHint}` : ''}`);
  return lines;
}

export function formatToday(apps) {
  const live = apps.filter((a) => a.status !== 'rejected' && a.status !== 'withdrawn');

  // Split deadlines by urgency instead of lumping every past date into one
  // list. The old version used "due today or earlier", so an ad that closed in
  // mid-August still showed as due — 18 of them, which is how this message
  // reached 7,094 characters and stopped sending at all.
  const closing = [];
  const expired = [];
  for (const a of live) {
    if (!a.deadline) continue;
    const n = daysAway(a.deadline);
    if (n === null) continue;
    if (n < 0) expired.push(a);
    else if (n <= 7) closing.push({ app: a, n });
  }
  closing.sort((x, y) => x.n - y.n);

  const followUps = live
    .filter((a) => a.followUpDue && isDueTodayOrEarlier(a.followUpDue))
    .map((a) => ({ app: a, n: daysAway(a.followUpDue) ?? 0 }))
    .sort((x, y) => x.n - y.n);

  const tasks = [];
  for (const app of live) {
    for (const task of app.tasks ?? []) {
      if (!task.completedAt && task.dueAt) tasks.push({ app, task, n: daysAway(task.dueAt) ?? 0 });
    }
  }
  tasks.sort((x, y) => x.n - y.n);

  const now = new Date();
  const head = `⏰ TODAY · ${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;

  if (closing.length === 0 && followUps.length === 0 && tasks.length === 0) {
    const tail = expired.length ? `\n\n🗄 ${expired.length} closed ads still open in the tracker` : '';
    return `${head}\n\n✅ Nothing due. You're clear.${tail}`;
  }

  const out = [head];

  if (tasks.length) {
    out.push('', `📌 TASKS · ${tasks.length}`);
    out.push(
      ...bullets(
        tasks.map(({ app, task, n }) => `${n < 0 ? '🔴' : '🟡'} ${clip(task.label, 42)}\n      ${clip(app.company, 24)} · ${whenLabel(task.dueAt)}`),
        4
      )
    );
  }

  if (closing.length) {
    const today = closing.filter((c) => c.n === 0);
    out.push('', `📅 CLOSING · ${closing.length}`);
    out.push(
      ...bullets(
        closing.map(({ app, n }) => `${n === 0 ? '🔴' : n <= 2 ? '🟠' : '🟡'} ${pair(app)} · ${whenLabel(app.deadline)}`),
        5
      )
    );
    if (today.length) out.push(`   ⚠️ ${today.length} close TODAY`);
  }

  if (followUps.length) {
    out.push('', `📮 FOLLOW UP · ${followUps.length}`);
    out.push(
      ...bullets(
        followUps.map(({ app, n }) => `${n <= -14 ? '🔴' : n <= -7 ? '🟠' : '🟡'} ${pair(app)} · ${whenLabel(app.followUpDue)}`),
        5,
        '/pending'
      )
    );
  }

  if (expired.length) out.push('', `🗄 ${expired.length} closed ads still open in the tracker`);

  return out.join('\n');
}

export function formatStats(apps) {
  const counts = { researching: 0, applied: 0, interview: 0, offer: 0, rejected: 0, withdrawn: 0 };
  for (const app of apps) if (counts[app.status] !== undefined) counts[app.status] += 1;

  const active = counts.researching + counts.applied + counts.interview + counts.offer;
  const closed = counts.rejected + counts.withdrawn;
  const responses = counts.interview + counts.offer + counts.rejected;
  const denom = counts.applied + responses;
  const responseRate = denom > 0 ? Math.round((responses / denom) * 100) : 0;
  const interviewRate = denom > 0 ? Math.round(((counts.interview + counts.offer) / denom) * 100) : 0;

  // Bar is proportional to the biggest bucket, so it stays readable whatever
  // the totals are. Telegram's default font isn't monospaced, so no attempt is
  // made to column-align the numbers — that would only look ragged.
  const max = Math.max(...Object.values(counts), 1);
  const bar = (n) => '▓'.repeat(Math.round((n / max) * 12));

  const rows = [
    ['🔍 Researching', counts.researching],
    ['📨 Applied', counts.applied],
    ['🟢 Interview', counts.interview],
    ['🎉 Offer', counts.offer],
    ['📭 Rejected', counts.rejected],
    ['📁 Withdrawn', counts.withdrawn],
  ];

  return [
    `📊 STATS · ${apps.length} roles`,
    '',
    ...rows.map(([label, n]) => `${label} · ${n}${n ? `  ${bar(n)}` : ''}`),
    '',
    `⚡ Active ${active} · Closed ${closed}`,
    `📈 Response rate ~${responseRate}%`,
    `🎯 Interview rate ~${interviewRate}%`,
  ].join('\n');
}

export function formatRole(app) {
  const status = PENDING_STATUS_LABELS[app.status] || app.status;
  const out = [`🏢 ${app.company}`, `💼 ${app.role}`, ''];

  out.push(`${status}${app.fit ? ` · 🎯 ${app.fit} fit` : ''}`);
  out.push(`📍 ${app.location || 'Wellington, NZ'} · ${app.employment === 'internship' ? 'Internship' : 'Job'}`);

  // Dates block — only the ones that exist, each with a relative hint so the
  // reader doesn't have to work out "is 2026-09-18 soon?" on a phone.
  const dates = [];
  if (app.date) dates.push(`📅 Applied ${shortDate(app.date)}`);
  if (app.deadline) dates.push(`⏳ Closes ${shortDate(app.deadline)} · ${whenLabel(app.deadline)}`);
  if (app.followUpDue) dates.push(`📮 Follow up ${whenLabel(app.followUpDue)}`);
  if (app.interview?.when) dates.push(`🎤 Interview ${shortDate(app.interview.when)}`);
  if (dates.length) out.push('', ...dates);

  const extras = [];
  if (app.salary) extras.push(`💰 ${app.salary}`);
  if (app.contactName) extras.push(`👤 ${app.contactName}`);
  if (app.contactEmail) extras.push(`✉️ ${app.contactEmail}`);
  if (app.cvStatus) extras.push(`📄 CV ${app.cvStatus}`);
  if (extras.length) out.push('', ...extras);

  const openTasks = (app.tasks ?? []).filter((t) => !t.completedAt);
  if (openTasks.length) {
    out.push('', `📌 Tasks · ${openTasks.length}`);
    out.push(...bullets(openTasks.map((t) => `• ${clip(t.label, 40)}${t.dueAt ? ` · ${whenLabel(t.dueAt)}` : ''}`), 3));
  }

  // Notes grow without bound (voice debriefs append up to 1000 chars each),
  // so only the most recent slice is worth putting in a chat card.
  if (app.notes) {
    const n = String(app.notes).trim();
    if (n.length <= 320) {
      out.push('', `📝 ${n}`);
    } else {
      // Take the tail (newest content) but start it at a word boundary —
      // slicing blind lands mid-word and reads like corruption.
      let tail = n.slice(-320);
      const cut = tail.search(/[\n.!?]\s|\s/);
      if (cut > -1 && cut < 60) tail = tail.slice(cut).replace(/^[\n.!?\s]+/, '');
      out.push('', `📝 …${tail}`);
    }
  }

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '📄 Get CV', callback_data: `get_cv:${app.id}` },
        { text: '🎤 Prep Notes', callback_data: `prep:${app.id}` },
      ],
      [
        { text: '📨 Mark Applied', callback_data: `status:${app.id}:applied` },
        { text: '🟢 Mark Interview', callback_data: `status:${app.id}:interview` },
      ],
    ],
  };

  return { text: out.join('\n'), replyMarkup };
}

export function formatPrep(app) {
  const out = [`🎤 PREP · ${app.company}`, `💼 ${app.role}`];

  const iv = app.interview;
  if (iv && typeof iv === 'object') {
    if (iv.when) out.push('', `📅 ${shortDate(iv.when)} · ${whenLabel(iv.when)}`);
    if (Array.isArray(iv.rounds) && iv.rounds.length) {
      out.push('', `🗓 ROUNDS · ${iv.rounds.length}`);
      out.push(
        ...bullets(
          iv.rounds.map((r) => `• ${clip(r.label || r.title || 'Round', 32)} · ${r.date || 'TBD'}`),
          4
        )
      );
    }
    if (Array.isArray(iv.talkingPoints) && iv.talkingPoints.length) {
      out.push('', `💡 TALKING POINTS · ${iv.talkingPoints.length}`);
      out.push(...bullets(iv.talkingPoints.map((t) => `• ${clip(t, 90)}`), 5));
    }
    if (Array.isArray(iv.questions) && iv.questions.length) {
      out.push('', `❓ LIKELY QUESTIONS · ${iv.questions.length}`);
      out.push(...bullets(iv.questions.map((q) => `• ${clip(q.question || q, 90)}`), 4));
    }
    return out.join('\n');
  }

  // No war-room prep written yet — fall back to whatever the fit analysis
  // found, which is at least grounded in the ad.
  const an = app.analysis;
  if (an && typeof an === 'object') {
    out.push('', '🎯 FIT ANALYSIS');
    if (an.verdict) out.push(`   ${clip(an.verdict, 140)}`);
    const matched = asArray(an.targetMatches ?? an.ats?.matched);
    const gaps = asArray(an.gaps ?? an.ats?.unsupported);
    if (matched.length) {
      out.push('', `✅ STRENGTHS · ${matched.length}`);
      out.push(...bullets(matched.map((m) => `• ${clip(m, 60)}`), 5));
    }
    if (gaps.length) {
      out.push('', `⚠️ GAPS · ${gaps.length}`);
      out.push(...bullets(gaps.map((g) => `• ${clip(g, 60)}`), 5));
    }
    return out.join('\n');
  }

  out.push('', 'ℹ️ No prep written for this role yet.', '💡 Generate the war room on the dashboard, or try /ask.');
  return out.join('\n');
}

/** `analysis` list fields must be arrays but have shipped as bare strings
 *  before, which blanked the role page twice — coerce rather than trust. */
function asArray(v) {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

export async function sendTelegramChunked(
  text,
  { token, chatId, replyMarkup, sendTelegramImpl = sendTelegram } = {}
) {
  await sendTelegramImpl(text, { token, chatId, replyMarkup });
}

export async function findCoverLetterText(
  app,
  { careerDir = CAREER_DIR, execFileImpl = execFile } = {}
) {
  if (!app || !app.folderPath) return null;
  const dir = path.join(careerDir, app.folderPath);
  let files;
  try {
    files = await fsPromises.readdir(dir);
  } catch {
    return null;
  }
  const clDocx = files.find(
    (f) =>
      f.toLowerCase().endsWith('.docx') &&
      (f.toLowerCase().includes('cover') || f.toLowerCase().includes('letter') || f.toLowerCase().includes('cl'))
  );
  if (clDocx) {
    const fullPath = path.join(dir, clDocx);
    return new Promise((resolve) => {
      const script =
        "import docx, sys; sys.stdout.reconfigure(encoding='utf-8'); doc = docx.Document(sys.argv[1]); print('\\n\\n'.join([p.text for p in doc.paragraphs if p.text.strip()]))";
      execFileImpl('python', ['-c', script, fullPath], { timeout: 15000 }, (err, stdout) => {
        if (!err && stdout && stdout.trim()) {
          resolve({ text: stdout.trim(), fileName: clDocx, path: fullPath });
        } else {
          resolve(null);
        }
      });
    });
  }
  const clText = files.find(
    (f) =>
      (f.toLowerCase().endsWith('.txt') || f.toLowerCase().endsWith('.md')) &&
      (f.toLowerCase().includes('cover') || f.toLowerCase().includes('letter'))
  );
  if (clText) {
    const fullPath = path.join(dir, clText);
    try {
      const content = await fsPromises.readFile(fullPath, 'utf8');
      return { text: content.trim(), fileName: clText, path: fullPath };
    } catch {
      return null;
    }
  }
  return null;
}

export async function updateLearningLoop(
  { company, role, appId, reason },
  { learningLoopFile = DEFAULT_LEARNING_LOOP_FILE } = {}
) {
  try {
    let data = { rejectionCount: 0, sourceIds: [], headline: '', signalStrength: { highSignal: [], noSignal: [] } };
    try {
      const raw = await fsPromises.readFile(learningLoopFile, 'utf8');
      data = JSON.parse(raw);
    } catch {
      // fresh file fallback
    }

    data.rejectionCount = (data.rejectionCount || 0) + 1;
    data.sourceIds = data.sourceIds || [];
    if (appId && !data.sourceIds.includes(appId)) {
      data.sourceIds.push(appId);
    }

    data.signalStrength = data.signalStrength || { highSignal: [], noSignal: [] };
    data.signalStrength.noSignal = data.signalStrength.noSignal || [];

    const note = `${company} — ${role}: Rejection recorded via Telegram. ${reason ? `Reason/Feedback: "${reason}"` : 'Generic/No feedback specified.'}`;
    data.signalStrength.noSignal.unshift(note);

    await fsPromises.writeFile(learningLoopFile, JSON.stringify(data, null, 2), 'utf8');
    return { success: true, rejectionCount: data.rejectionCount };
  } catch (err) {
    console.error('updateLearningLoop failed:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getPracticeCard(
  category = '',
  { bankPath = DEFAULT_INTERVIEW_BANK_FILE } = {}
) {
  let bank = { questions: [] };
  try {
    const raw = await fsPromises.readFile(bankPath, 'utf8');
    bank = JSON.parse(raw);
  } catch (err) {
    console.error('failed to read interview-bank.json:', err.message);
    return null;
  }

  let questions = bank.questions || [];
  if (category && category !== 'all') {
    const catLower = category.toLowerCase().trim();
    const filtered = questions.filter((q) => (q.category || '').toLowerCase().includes(catLower));
    if (filtered.length > 0) questions = filtered;
  }

  if (questions.length === 0) return null;
  const picked = questions[Math.floor(Math.random() * questions.length)];
  return picked;
}

export function formatPracticeMessage(questionObj) {
  const text = [
    '🎯 STAR Interview Flashcard:',
    `📁 Category: ${questionObj.category || 'general'}`,
    `❓ Question:`,
    `"${questionObj.question}"`,
  ].join('\n\n');

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '💡 Show Hint', callback_data: `practice_hint:${questionObj.id}` },
        { text: '📖 Reveal STAR Story', callback_data: `practice_ans:${questionObj.id}` },
      ],
      [{ text: '➡️ Next Question', callback_data: `practice_next:${questionObj.category || 'all'}` }],
    ],
  };

  return { text, replyMarkup };
}

export async function getQuizQuestion(
  category = '',
  { quizPath = DEFAULT_QUIZ_BANK_FILE } = {}
) {
  let questions = [];
  try {
    const raw = await fsPromises.readFile(quizPath, 'utf8');
    questions = JSON.parse(raw);
  } catch (err) {
    console.error('failed to read quiz-bank.json:', err.message);
    return null;
  }

  if (category && category !== 'all') {
    const catLower = category.toLowerCase().trim();
    const filtered = questions.filter((q) => (q.category || '').toLowerCase().includes(catLower));
    if (filtered.length > 0) questions = filtered;
  }

  if (questions.length === 0) return null;
  const picked = questions[Math.floor(Math.random() * questions.length)];
  return picked;
}

export async function askCareerCoach(
  question,
  {
    candidateFactsPath = DEFAULT_KEY_FACTS_FILE,
    apps = [],
    apiKey = process.env.GEMINI_API_KEY,
    execFileImpl = execFile,
  } = {}
) {
  let factsText = '';
  try {
    factsText = await fsPromises.readFile(candidateFactsPath, 'utf8');
  } catch {
    factsText = 'Candidate: Jordan Smith. Master of Information Technology (Cyber Security), Riverside Institute of Technology (graduated July 2026). Experience: L2 NOC Engineer at Northline Broadband (2 years, 24/7 rota, ISP leased line & customer support), Server Support Engineer at Cascade Info Vision / Bobcares (Linux/Windows servers, cPanel, Apache, live chat). Certs: RHCSA, Google Cybersecurity Certificate, ServiceNow learning path in progress. 3-year NZ Open Work Visa (valid to Aug 2029). Clean NZ driver licence.';
  }

  const activeRoles = (apps || [])
    .filter((a) => a.status === 'interview' || a.status === 'offer' || a.status === 'applied')
    .slice(0, 5)
    .map((a) => `${a.company} (${a.role}, status: ${a.status})`)
    .join(', ');

  const systemContext = [
    'You are the personal AI Career Coach and Executive Assistant for Jordan Smith.',
    'Ground all answers strictly in his real facts, NZ job market dynamics, and his authentic background:',
    '--- CANDIDATE FACTS ---',
    factsText.slice(0, 4000),
    '--- ACTIVE ROLES ---',
    activeRoles || 'None currently active',
    '--- INSTRUCTIONS ---',
    'Be concise, practical, direct, and formatted for reading on Telegram mobile chat.',
    'Do not hallucinate skills he does not have. Frame any experience gaps honestly with transferable strength.',
  ].join('\n\n');

  try {
    const { text } = await generateContent({
      parts: [{ text: `${systemContext}\n\nUser Question:\n${question}` }],
      generationConfig: { maxOutputTokens: 800, temperature: 0.7 },
      apiKey,
    });
    if (text.trim()) return text.trim();
  } catch (err) {
    console.error('telegram ask: gemini failed, falling back to claude CLI:', err.message);
  }

  // Fallback to claude CLI
  return new Promise((resolve) => {
    const prompt = `${systemContext}\n\nUser Question:\n${question}\n\nProvide a concise 1-2 paragraph mobile-friendly answer.`;
    execFileImpl(
      'claude',
      ['-p', prompt, '--dangerously-skip-permissions'],
      { timeout: 30000 },
      (err, stdout) => {
        if (!err && stdout && stdout.trim()) {
          resolve(stdout.trim());
        } else {
          resolve("I couldn't generate a coaching response right now. Please try again or check server logs.");
        }
      }
    );
  });
}

export async function debriefVoiceMemo(
  audioFilePath,
  {
    apiKey = process.env.GEMINI_API_KEY,
    apps = [],
  } = {}
) {
  if (!apiKey) {
    return {
      text: '🎙️ Voice note received and saved, but GEMINI_API_KEY is not configured for automatic audio transcription.',
      matchedApp: null,
    };
  }

  try {
    const audioBytes = await fsPromises.readFile(audioFilePath);
    const base64Audio = audioBytes.toString('base64');

    const promptText = [
      'You are an executive assistant for Jordan Smith.',
      'Transcribe this voice memo (which is a post-interview debrief or job search audio note) and synthesize it.',
      'Format your output clearly with markdown:',
      '🎙️ **Voice Debrief Summary**',
      '• **Company / Interviewer**: [Extract names or "Not mentioned"]',
      '• **Role**: [Role mentioned or "General"]',
      '• **Key Questions Asked**: [Bullet points of interview questions mentioned]',
      '• **Impressions & Vibe**: [Key takeaways, how it went, feedback heard]',
      '• **Action Items / Follow-ups**: [Next steps, tasks to do, thank you notes]',
      '',
      'Keep it structured, punchy, and mobile-friendly.',
    ].join('\n');

    const { text: resultText } = await generateContent({
      parts: [
        { text: promptText },
        { inline_data: { mime_type: 'audio/ogg', data: base64Audio } },
      ],
      generationConfig: { maxOutputTokens: 1000, temperature: 0.3 },
      apiKey,
    });

    if (!resultText) {
      return {
        text: '🎙️ Voice memo saved, but could not parse audio transcription from AI.',
        matchedApp: null,
      };
    }

    let matchedApp = null;
    const lower = resultText.toLowerCase();
    for (const app of apps) {
      if (app.company && app.company.length > 2 && lower.includes(app.company.toLowerCase())) {
        matchedApp = app;
        break;
      }
    }

    return {
      text: resultText.trim(),
      matchedApp,
    };
  } catch (err) {
    console.error('telegram voice debrief failed:', err.message);
    return {
      text: `🎙️ Voice note saved, but transcription encountered an error: ${err.message}`,
      matchedApp: null,
    };
  }
}

export function formatRadar(apps) {
  const active = apps.filter(
    (a) => a.status === 'interview' || a.status === 'researching' || a.status === 'applied'
  );
  const local = active.filter((a) => {
    const loc = (a.location || '').toLowerCase();
    return ['wellington', 'remote', 'hybrid', 'upper hutt', 'lower hutt', 'porirua'].some((k) =>
      loc.includes(k)
    );
  });

  const out = [`🛰 RADAR · ${local.length} of ${active.length} active are Wgtn/Remote`];

  const interviews = local.filter((a) => a.status === 'interview');
  if (interviews.length) {
    out.push('', `🟢 IN PROGRESS · ${interviews.length}`);
    out.push(...bullets(interviews.map((a) => `• ${pair(a)}`), 5));
  }

  const researching = local.filter((a) => a.status === 'researching');
  if (researching.length) {
    out.push('', `🔍 READY TO QUEUE · ${researching.length}`);
    out.push(...bullets(researching.map((a) => `• ${pair(a)} · 🎯 ${a.fit || 'good'}`), 5));
  }

  if (interviews.length === 0 && researching.length === 0) {
    out.push('', '💤 Nothing in progress or researching locally.');
  }

  out.push('', '💡 /cv · /prep · /practice · /quiz');
  return out.join('\n');
}

export function isAuthorizedChat(chatId, configuredChatId) {
  if (!configuredChatId) return false;
  return String(chatId) === String(configuredChatId);
}

export function cleanJobUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return rawUrl;
  }
}

export function parseSeekHtml(html, url) {
  let role = '';
  let company = '';
  let location = 'Wellington, NZ';

  // 1. SEEK Advertiser Name
  const advMatch =
    html.match(/data-automation="advertiser-name"[^>]*>([^<]+)</i) ||
    html.match(/data-automation="job-header-company-name"[^>]*>([^<]+)</i);
  if (advMatch) company = advMatch[1].trim();

  // 2. SEEK Job Title
  const titleMatch =
    html.match(/data-automation="job-detail-title"[^>]*>([^<]+)</i) ||
    html.match(/data-automation="job-header-title"[^>]*>([^<]+)</i);
  if (titleMatch) role = titleMatch[1].trim();

  // 3. Apply aria-label fallback (Apply for [role] at [company])
  if (!role || !company) {
    const applyMatch = html.match(/aria-label="Apply for (.*?) at (.*?)"/i);
    if (applyMatch) {
      if (!role) role = applyMatch[1].trim();
      if (!company) company = applyMatch[2].trim();
    }
  }

  // 4. JSON-like state in scripts (__INITIAL_STATE__ or SEEK_REDUX_DATA)
  if (!company) {
    const reduxAdv =
      html.match(/"advertiserName"\s*:\s*"([^"]+)"/i) ||
      html.match(/"advertiser"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i);
    if (reduxAdv) company = reduxAdv[1].trim();
  }
  if (!role) {
    const reduxRole = html.match(/"jobTitle"\s*:\s*"([^"]+)"/i);
    if (reduxRole) role = reduxRole[1].trim();
  }

  // 5. HTML <title> fallback
  const pageTitleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (pageTitleMatch) {
    const t = pageTitleMatch[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
    const clean = t.replace(/\s*-\s*SEEK$/i, '');
    const seekTitleMatch = clean.match(/^(.*?)(?:\s+Job\s+in\s+(.*?))?$/i);
    if (seekTitleMatch) {
      if (!role) role = seekTitleMatch[1].trim();
      if (seekTitleMatch[2]) location = seekTitleMatch[2].trim();
    }
  }

  // 6. Location refinement
  const locMatch = html.match(/data-automation="job-detail-location"[^>]*>([^<]+)</i);
  if (locMatch) location = locMatch[1].trim();

  return { role, company, location, url: cleanJobUrl(url) };
}

export function parseTradeMeHtml(html, url) {
  let role = '';
  let company = '';
  let location = 'Wellington, NZ';

  const pageTitleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (pageTitleMatch) {
    const t = pageTitleMatch[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
    const clean = t.replace(/\s*\|\s*Trade Me.*$/i, '');
    if (clean.includes(' - ')) {
      const parts = clean.split(' - ');
      role = parts[0].trim();
      company = parts[1].trim();
    } else {
      role = clean.trim();
    }
  }

  const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
  if (ogTitle && !role) role = ogTitle[1].trim();

  return { role, company, location, url: cleanJobUrl(url) };
}

export function parseLinkedInHtml(html, url) {
  let role = '';
  let company = '';
  let location = 'Wellington, NZ';

  const pageTitleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (pageTitleMatch) {
    const t = pageTitleMatch[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
    const clean = t.replace(/\s*\|\s*LinkedIn$/i, '');
    const hiringMatch = clean.match(/^(.*?)\s+hiring\s+(.*?)\s+in\s+(.*?)$/i);
    if (hiringMatch) {
      company = hiringMatch[1].trim();
      role = hiringMatch[2].trim();
      location = hiringMatch[3].trim();
    } else {
      const parts = clean.split(' - ');
      if (parts.length >= 2) {
        role = parts[0].trim();
        company = parts[1].trim();
      } else {
        role = clean.trim();
      }
    }
  }

  return { role, company, location, url: cleanJobUrl(url) };
}

export function parseGenericHtml(html, url) {
  let role = '';
  let company = '';
  let location = 'Wellington, NZ';

  const ogTitle = html.match(/<meta\s+(?:property|name)=["']og:title["']\s+content=["']([^"']+)["']/i);
  if (ogTitle) role = ogTitle[1].trim();

  const ogSite = html.match(/<meta\s+(?:property|name)=["']og:site_name["']\s+content=["']([^"']+)["']/i);
  if (ogSite && !/seek|linkedin|trademe/i.test(ogSite[1])) {
    company = ogSite[1].trim();
  }

  const pageTitleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (pageTitleMatch && !role) {
    const t = pageTitleMatch[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
    const parts = t.split(/\s*[-–|]\s*/);
    if (parts.length >= 2) {
      role = parts[0].trim();
      company = parts[parts.length - 1].trim();
    } else {
      role = t;
    }
  }

  return { role, company, location, url: cleanJobUrl(url) };
}

export async function parseJobWithGemini(html, url, apiKey = process.env.GEMINI_API_KEY) {
  if (!apiKey) return null;
  try {
    const cleanText = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);

    const { text: rawJson } = await generateContent({
      parts: [
        {
          text: `Extract the hiring company name, job role title, and job location from this job ad text. Return ONLY valid JSON with keys "company", "role", and "location". Do not wrap in markdown or backticks.\n\nText:\n${cleanText}`,
        },
      ],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
      apiKey,
    });
    if (!rawJson) return null;
    const parsed = JSON.parse(rawJson);
    return {
      company: parsed.company || '',
      role: parsed.role || '',
      location: parsed.location || 'Wellington, NZ',
      url: cleanJobUrl(url),
    };
  } catch (err) {
    console.error('Gemini job extraction failed:', err.message);
    return null;
  }
}

export function isInvalidParsedJob(parsed) {
  if (!parsed || typeof parsed !== 'object') return true;
  const company = (parsed.company || '').trim();
  const role = (parsed.role || '').trim();

  if (!company || !role) return true;

  // Reject URL/domain mistakenly parsed as company name (e.g. nz.seek.com, seek.co.nz)
  if (
    /^(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)*(?:seek\.(?:com|co\.nz)|linkedin\.com|trademe\.(?:co\.nz|jobs)|indeed\.com|google\.com)/i.test(
      company
    ) ||
    /\.(?:com|co\.nz|org|net|io|ai|app)$/i.test(company)
  ) {
    return true;
  }

  // Reject purely numeric role (e.g. "94417890")
  if (/^\d+$/.test(role)) return true;

  // Reject generic placeholders
  const badRoles = /^(captured role|role from ad|captured job ad|job ad|unknown role)$/i;
  const badCompanies = /^(disclosed in ad|unknown company|company from ad)$/i;
  if (badRoles.test(role) || badCompanies.test(company)) return true;

  return false;
}

export async function parseJobFromUrl(url, execFileImplOrOpts = execFile, maybeOpts = {}) {
  const execFileImpl = typeof execFileImplOrOpts === 'function' ? execFileImplOrOpts : execFile;
  const opts = typeof execFileImplOrOpts === 'object' ? execFileImplOrOpts : maybeOpts;
  const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;

  const cleanedUrl = cleanJobUrl(url);

  // Same public-internet-only rule as the CV worker's scrape — a pasted link
  // must not be able to make the server fetch its own API or a tailnet host.
  if (!isFetchableUrl(url)) {
    return { role: '', company: '', location: 'Wellington, NZ', url: cleanedUrl, fit: 'good' };
  }

  return new Promise((resolve) => {
    execFileImpl(
      'curl',
      [
        '-s',
        '-L',
        '--max-time',
        '10',
        '-A',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        url,
      ],
      { timeout: 12000 },
      async (err, stdout) => {
        let result = { role: '', company: '', location: 'Wellington, NZ', url: cleanedUrl };
        const html = !err && stdout ? stdout : '';

        if (html) {
          const lowerUrl = url.toLowerCase();
          if (lowerUrl.includes('seek.co') || lowerUrl.includes('seek.com')) {
            result = parseSeekHtml(html, url);
          } else if (lowerUrl.includes('trademe.co.nz')) {
            result = parseTradeMeHtml(html, url);
          } else if (lowerUrl.includes('linkedin.com')) {
            result = parseLinkedInHtml(html, url);
          } else {
            result = parseGenericHtml(html, url);
          }
        }

        // If regex parsing failed or gave invalid result, try Gemini fallback
        if (isInvalidParsedJob(result) && html && apiKey) {
          const geminiResult = await parseJobWithGemini(html, url, apiKey);
          if (geminiResult && !isInvalidParsedJob(geminiResult)) {
            result = geminiResult;
          }
        }

        // Quick heuristic fit read
        const combined = `${result.role} ${result.company}`.toLowerCase();
        let fit = 'good';
        if (
          combined.includes('soc') ||
          combined.includes('security') ||
          combined.includes('linux') ||
          combined.includes('noc') ||
          combined.includes('network')
        ) {
          fit = 'strong';
        } else if (
          combined.includes('grc') ||
          combined.includes('compliance') ||
          combined.includes('analyst') ||
          combined.includes('support') ||
          combined.includes('helpdesk') ||
          combined.includes('service desk') ||
          combined.includes('data administrator')
        ) {
          fit = 'good';
        }

        result.fit = fit;
        resolve(result);
      }
    );
  });
}

export async function answerCallbackQuery(token, queryId, text = '', fetchImpl) {
  const params = { callback_query_id: queryId };
  if (text) params.text = text;
  await telegramApi('answerCallbackQuery', params, { token, fetchImpl, label: 'answerCallbackQuery' });
}

export async function handleCallbackQuery(
  query,
  {
    token,
    chatId,
    getApplications,
    updateApplication,
    setApplicationStatus,
    queueCvRequest,
    deleteApplication,
    findCvFile,
    sendTelegramImpl = sendTelegram,
    sendDocImpl = sendTelegramDocument,
    execFileImpl = execFile,
    fetchImpl,
  } = {}
) {
  const fromId = query.from?.id;
  if (!isAuthorizedChat(fromId, chatId)) return;

  const data = query.data || '';
  await answerCallbackQuery(token, query.id, 'Processing…', fetchImpl);

  const [action, ...args] = data.split(':');
  const targetId = args[0];

  if (action === 'queue_cv' && queueCvRequest) {
    const res = await queueCvRequest(targetId);
    if (res) {
      await sendTelegramImpl(`📋 Queued CV & cover letter for ${res.company} — ${res.role}!`, { token, chatId });
    } else {
      await sendTelegramImpl('❌ Could not queue CV (role not found).', { token, chatId });
    }
  } else if (action === 'status' && setApplicationStatus) {
    // Routed through the server's own status handler so the folder relocation,
    // statusHistory entry and enum check all happen — the generic mutator this
    // used to call did none of them.
    const res = await setApplicationStatus(targetId, args[1]);
    if (res?.ok) {
      await sendTelegramImpl(`🔄 Updated status for ${res.entry.company} to ${args[1]}.`, { token, chatId });
    } else if (res?.invalidStatus) {
      await sendTelegramImpl(`❌ Ignored unknown status "${args[1]}".`, { token, chatId });
    } else {
      await sendTelegramImpl('❌ Could not update status (role not found).', { token, chatId });
    }
  } else if (action === 'followup_done' && updateApplication) {
    const updated = await updateApplication(
      targetId,
      (entry) => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        const nextDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return { ...entry, followUpDue: nextDate, updated: Date.now() };
      },
      'follow-up',
      'Follow-up recorded'
    );
    if (updated) {
      await sendTelegramImpl(`📞 Follow-up noted for ${updated.company}. Next follow-up set for 7 days.`, {
        token,
        chatId,
      });
    }
  } else if (action === 'snooze_followup' && updateApplication) {
    const days = Number(args[1]) || 2;
    const updated = await updateApplication(
      targetId,
      (entry) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        const nextDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return { ...entry, followUpDue: nextDate, updated: Date.now() };
      },
      'follow-up',
      `Follow-up snoozed ${days}d`
    );
    if (updated) {
      await sendTelegramImpl(`⏳ Snoozed follow-up for ${updated.company} by ${days} days.`, { token, chatId });
    }
  } else if (action === 'task_done' && updateApplication) {
    const taskId = args[1];
    const updated = await updateApplication(
      targetId,
      (entry) => {
        const tasks = (entry.tasks || []).map((t) =>
          t.id === taskId || !taskId ? { ...t, completedAt: new Date().toISOString() } : t
        );
        return { ...entry, tasks, updated: Date.now() };
      },
      'task-update',
      'Task marked completed'
    );
    if (updated) {
      await sendTelegramImpl(`✅ Task marked done for ${updated.company}!`, { token, chatId });
    }
  } else if (action === 'get_cv' && findCvFile) {
    const doc = await findCvFile(targetId);
    if (doc && doc.path) {
      await sendDocImpl(doc.path, {
        caption: `📄 CV for ${doc.entry.company} — ${doc.entry.role}`,
        token,
        chatId,
        fetchImpl,
      });
    } else {
      await sendTelegramImpl('❌ No CV PDF document found on disk yet for this role.', { token, chatId });
    }
  } else if (action === 'prep' && getApplications) {
    const apps = await getApplications();
    const app = apps.find((a) => a.id === targetId || a.matchKey === targetId);
    if (app) {
      await sendTelegramImpl(formatPrep(app), { token, chatId });
    }
  } else if (action === 'delete_app' && deleteApplication) {
    const ok = await deleteApplication(targetId);
    if (ok) {
      await sendTelegramImpl('🗑️ Removed application from tracker.', { token, chatId });
    }
  } else if (action === 'practice_hint') {
    const qid = args[0];
    let bank = { questions: [] };
    try {
      const raw = await fsPromises.readFile(DEFAULT_INTERVIEW_BANK_FILE, 'utf8');
      bank = JSON.parse(raw);
    } catch {
      // bank missing
    }
    const q = (bank.questions || []).find((x) => x.id === qid);
    if (q && q.hints) {
      const hintMsg = [
        `💡 Hints for "${q.question}":`,
        ...q.hints.map((h) => `• ${h}`),
      ].join('\n');
      const markup = {
        inline_keyboard: [
          [{ text: '📖 Reveal STAR Story', callback_data: `practice_ans:${q.id}` }],
          [{ text: '➡️ Next Question', callback_data: `practice_next:${q.category || 'all'}` }],
        ],
      };
      await sendTelegramImpl(hintMsg, { token, chatId, replyMarkup: markup });
    }
  } else if (action === 'practice_ans') {
    const qid = args[0];
    let bank = { questions: [] };
    try {
      const raw = await fsPromises.readFile(DEFAULT_INTERVIEW_BANK_FILE, 'utf8');
      bank = JSON.parse(raw);
    } catch {
      // bank missing
    }
    const q = (bank.questions || []).find((x) => x.id === qid);
    if (q && q.answer) {
      const ansMsg = `📖 Model STAR Answer:\n\n${q.answer}`;
      const markup = {
        inline_keyboard: [
          [{ text: '➡️ Next Question', callback_data: `practice_next:${q.category || 'all'}` }],
        ],
      };
      await sendTelegramChunked(ansMsg, { token, chatId, replyMarkup: markup, sendTelegramImpl });
    }
  } else if (action === 'practice_next') {
    const cat = args[0] || 'all';
    const card = await getPracticeCard(cat);
    if (card) {
      const { text: msgText, replyMarkup } = formatPracticeMessage(card);
      await sendTelegramImpl(msgText, { token, chatId, replyMarkup });
    }
  } else if (action === 'quiz_next') {
    const cat = args[0] || 'all';
    const quiz = await getQuizQuestion(cat);
    if (quiz) {
      await sendTelegramQuiz(
        chatId,
        `🧠 ${quiz.question}`,
        quiz.options,
        quiz.correctOptionId,
        quiz.explanation,
        { token, fetchImpl }
      );
    }
  }
}

export async function runGitSync({ careerDir = CAREER_DIR, execFileImpl = execFile } = {}) {
  const runGit = (args) => {
    return new Promise((resolve) => {
      execFileImpl('git', args, { cwd: careerDir, timeout: 45000 }, (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: (stdout || '').trim(),
          stderr: (stderr || '').trim(),
          error: err ? err.message : null,
        });
      });
    });
  };

  // 1. Stage applications, audit logs, wallpaper cache, and Pending to Apply documents
  const addRes = await runGit([
    'add',
    'App/data/applications.json',
    'App/data/audit-log.jsonl',
    'App/data/wallpaper-cache.json',
    'Pending to Apply',
  ]);
  if (!addRes.ok) {
    return { ok: false, error: `Failed to stage changes: ${addRes.stderr || addRes.error}` };
  }

  // 2. Check if anything is staged
  const diffRes = await runGit(['diff', '--cached', '--name-only']);
  const stagedFiles = diffRes.stdout ? diffRes.stdout.split('\n').map((f) => f.trim()).filter(Boolean) : [];

  let committed = false;
  if (stagedFiles.length > 0) {
    const commitRes = await runGit(['commit', '-m', 'sync: automated sync from Telegram (/sync)']);
    if (!commitRes.ok) {
      return { ok: false, error: `Failed to commit changes: ${commitRes.stderr || commitRes.error}` };
    }
    committed = true;
  }

  // 3. Pull with rebase from origin main.
  //
  // A failed rebase leaves the working tree mid-rebase — detached, with
  // conflict markers in files — and the CV worker and API keep writing into it.
  // Abort before returning so the repo is left exactly as it was found; a
  // conflict needs a human at a keyboard, not a retry from a chat message.
  const pullRes = await runGit(['pull', '--rebase', 'origin', 'main']);
  if (!pullRes.ok) {
    const abortRes = await runGit(['rebase', '--abort']);
    const state = abortRes.ok
      ? 'The rebase was aborted, so the repo is back how it was.'
      : 'WARNING: could not abort the rebase — the repo may be mid-rebase, fix it on the server.';
    return {
      ok: false,
      error: `Failed to pull from origin/main: ${pullRes.stderr || pullRes.error}\n\n${state}`,
    };
  }

  // 4. Push to origin main
  const pushRes = await runGit(['push', 'origin', 'main']);
  if (!pushRes.ok) {
    return { ok: false, error: `Failed to push to origin/main: ${pushRes.stderr || pushRes.error}` };
  }

  return {
    ok: true,
    committed,
    filesCount: stagedFiles.length,
    files: stagedFiles,
  };
}

export async function handleUpdate(
  update,
  {
    getApplications,
    updateApplication,
    setApplicationStatus,
    createApplication,
    deleteApplication,
    queueCvRequest,
    findCvFile,
    isGmailFetchBusy,
    runGmailFetch,
    token,
    chatId,
    careerDir = CAREER_DIR,
    sendTelegramImpl = sendTelegram,
    sendDocImpl = sendTelegramDocument,
    execFileImpl = execFile,
    fetchImpl,
    learningLoopFile = DEFAULT_LEARNING_LOOP_FILE,
  } = {}
) {
  if (update.callback_query) {
    return handleCallbackQuery(update.callback_query, {
      token,
      chatId,
      getApplications,
      updateApplication,
      setApplicationStatus,
      createApplication,
      deleteApplication,
      queueCvRequest,
      findCvFile,
      sendTelegramImpl,
      sendDocImpl,
      execFileImpl,
      fetchImpl,
    });
  }

  const message = update.message;
  if (!message || !message.chat || typeof message.chat.id === 'undefined') return;

  const incomingChatId = message.chat.id;
  if (!isAuthorizedChat(incomingChatId, chatId)) {
    console.error(`telegram commands: ignored message from unauthorized chat ${incomingChatId}`);
    return;
  }

  const text = (message.text || '').trim();
  const apps = await getApplications();

  // Check URL ingest (if message contains a link and is not a command)
  const urlMatch = text.match(/https?:\/\/[^\s]+/i);
  if (urlMatch && !text.startsWith('/')) {
    const jobUrl = urlMatch[0];
    await sendTelegramImpl('🔍 Fetching and analyzing job ad…', { token, chatId });
    const parsed = await parseJobFromUrl(jobUrl, execFileImpl);

    if (isInvalidParsedJob(parsed)) {
      await sendTelegramImpl(
        `⚠️ Could not automatically detect company & role from this job link.\n\n` +
          `To log it cleanly, please reply:\n` +
          `/log <Company> — <Role> ${cleanJobUrl(jobUrl)}`,
        { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
      );
      return;
    }

    if (createApplication) {
      const result = await createApplication({
        company: parsed.company,
        role: parsed.role,
        location: parsed.location,
        link: parsed.url,
        fit: parsed.fit,
        status: 'researching',
      });

      const entry = result.entry;
      if (result.existing) {
        await sendTelegramImpl(
          `ℹ️ Role already in tracker:\n🏢 ${entry.company} — ${entry.role}\n🔄 Status: ${entry.status}`,
          { token, chatId }
        );
        return;
      }

      const replyText = [
        '📥 Logged New Role from iPhone:',
        `🏢 ${entry.company}`,
        `💼 ${entry.role}`,
        `📍 ${entry.location}`,
        `🎯 Fit: ${entry.fit}`,
        `🔗 ${parsed.url || jobUrl}`,
      ].join('\n');

      const replyMarkup = {
        inline_keyboard: [
          [
            { text: '📋 Queue CV', callback_data: `queue_cv:${entry.id}` },
            { text: '📨 Mark Applied', callback_data: `status:${entry.id}:applied` },
          ],
          [{ text: '🗑️ Discard', callback_data: `delete_app:${entry.id}` }],
        ],
      };

      await sendTelegramImpl(replyText, { token, chatId, replyMarkup });
      return;
    }
  }

  // Voice note debriefing
  if (message.voice) {
    await sendTelegramImpl('🎙️ Received voice memo! Downloading audio…', { token, chatId });
    await fsPromises.mkdir(VOICE_NOTES_DIR, { recursive: true }).catch(() => {});
    const voicePath = path.join(VOICE_NOTES_DIR, `voice_${Date.now()}.ogg`);
    const dl = await downloadTelegramFile(message.voice.file_id, voicePath, { token, fetchImpl });
    if (!dl.ok) {
      await sendTelegramImpl(`❌ Failed to download voice file: ${dl.error}`, { token, chatId });
      return;
    }
    await sendTelegramImpl('🧠 Transcribing and analyzing interview debrief with Gemini…', { token, chatId });
    const debrief = await debriefVoiceMemo(voicePath, { apps });
    await sendTelegramChunked(debrief.text, { token, chatId, sendTelegramImpl });

    if (debrief.matchedApp && updateApplication) {
      const appToUpdate = debrief.matchedApp;
      const ts = new Date().toLocaleDateString('en-NZ');
      const updated = await updateApplication(
        appToUpdate.id,
        (entry) => {
          const existing = entry.notes ? `${entry.notes}\n\n` : '';
          return {
            ...entry,
            notes: `${existing}[${ts} Audio Debrief]\n${debrief.text.slice(0, 1000)}`,
            updated: Date.now(),
          };
        },
        'note',
        `Voice debrief attached to ${appToUpdate.company}`
      );
      if (updated) {
        await sendTelegramImpl(`📝 Automatically attached debrief notes to ${appToUpdate.company}!`, {
          token,
          chatId,
        });
      }
    }
    return;
  }

  // Command handling
  let cleanText = text.trim();
  if (cleanText === '⏰ Today') cleanText = '/today';
  else if (cleanText === '📋 Pending') cleanText = '/pending';
  else if (cleanText === '📊 Stats') cleanText = '/stats';
  else if (cleanText === '🎯 Practice') cleanText = '/practice';
  else if (cleanText === '🧠 Quiz') cleanText = '/quiz';
  else if (cleanText === '🛰️ Radar') cleanText = '/radar';
  else if (cleanText === '🔄 Sync') cleanText = '/sync';
  else if (
    cleanText === '📨 Gmail Fetch' ||
    cleanText === '📨 Gmail' ||
    cleanText === 'Gmail Fetch' ||
    cleanText.toLowerCase() === 'gmail' ||
    cleanText.toLowerCase() === 'gmailfetch' ||
    cleanText.toLowerCase() === 'fetch'
  ) {
    cleanText = '/gmail';
  } else if (
    cleanText === '❓ Help' ||
    cleanText === '/menu' ||
    cleanText.toLowerCase() === 'menu' ||
    cleanText.toLowerCase() === 'help' ||
    cleanText.toLowerCase() === 'hi' ||
    cleanText.toLowerCase() === 'hello'
  ) {
    cleanText = '/help';
  }

  const [cmd, ...paramParts] = cleanText.split(' ');
  const param = paramParts.join(' ').trim();

  if (cmd === '/pending') {
    await sendTelegramImpl(formatPending(apps), { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD });
  } else if (cmd === '/today') {
    await sendTelegramImpl(formatToday(apps), { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD });
  } else if (cmd === '/stats') {
    await sendTelegramImpl(formatStats(apps), { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD });
  } else if (cmd === '/help') {
    await sendTelegramImpl(COMMAND_HELP, { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD });
  } else if (cmd === '/gmail' || cmd === '/gmailfetch') {
    if (!runGmailFetch) {
      await sendTelegramImpl('❌ Gmail Fetch is not configured on this server.', {
        token,
        chatId,
        replyMarkup: MAIN_MENU_KEYBOARD,
      });
      return;
    }
    if (isGmailFetchBusy && isGmailFetchBusy()) {
      await sendTelegramImpl(
        '⏳ A Gmail sweep or Claude run is already in progress. Please wait for it to finish.',
        { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
      );
      return;
    }

    const requested = Number(param);
    const count = Number.isFinite(requested) && requested > 0 ? Math.min(Math.round(requested), 50) : 10;

    await sendTelegramImpl(
      `📨 Checking your last ${count} emails for job-tracker updates…\n⏳ Sweeping mailbox with Claude. I'll post the results here when done.`,
      { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
    );

    runGmailFetch({ count })
      .then(async (res) => {
        if (!res) return;
        if (res.busy) {
          await sendTelegramImpl(
            '⏳ A Gmail sweep is already in progress. Please wait for it to finish.',
            { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
          );
          return;
        }
        if (res.ok) {
          await sendTelegramChunked(
            `📨 Gmail Fetch Complete (last ${res.count || count} emails):\n\n${res.summary || 'No job updates found in the checked emails.'}`,
            { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD, sendTelegramImpl }
          );
        } else {
          await sendTelegramImpl(
            `⚠️ Gmail Fetch encountered an issue:\n${res.error || 'Unknown error'}`,
            { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
          );
        }
      })
      .catch(async (err) => {
        await sendTelegramImpl(
          `❌ Gmail Fetch failed: ${err.message}`,
          { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
        );
      });
  } else if (cmd === '/sync') {
    await sendTelegramImpl('🔄 Running Git sync on server…', { token, chatId });
    try {
      const syncResult = await runGitSync({ careerDir, execFileImpl });
      if (syncResult.ok) {
        if (syncResult.committed) {
          const fileSummary = syncResult.files.map((f) => `  • ${f}`).slice(0, 8).join('\n');
          const overflow = syncResult.files.length > 8 ? `\n  …and ${syncResult.files.length - 8} more` : '';
          await sendTelegramImpl(
            `✅ Git sync successful!\n\n` +
              `📦 Committed & pushed ${syncResult.filesCount} file(s) to GitHub:\n` +
              `${fileSummary}${overflow}\n\n` +
              `💻 On your Windows PC, just run:\n` +
              `git pull`,
            { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
          );
        } else {
          await sendTelegramImpl(
            `✅ Git sync complete!\n\n` +
              `Repository is already fully up to date with origin/main.\n` +
              `No uncommitted changes found on server.`,
            { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
          );
        }
      } else {
        await sendTelegramImpl(
          `⚠️ Git sync encountered an issue:\n${syncResult.error}`,
          { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
        );
      }
    } catch (err) {
      await sendTelegramImpl(
        `❌ Git sync failed: ${err.message}`,
        { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
      );
    }
  } else if (cmd === '/app') {
    const dashboardUrl = getDashboardUrl();
    const appMarkup = {
      inline_keyboard: [
        [{ text: '🚀 Open JobSearchHQ Dashboard', url: dashboardUrl }],
      ],
    };
    await sendTelegramImpl(
      `📱 Job Search HQ Mobile Dashboard:\nTap below to open your live dashboard on Tailscale:\n${dashboardUrl}`,
      { token, chatId, replyMarkup: appMarkup }
    );
  } else if (cmd === '/radar') {
    await sendTelegramImpl(formatRadar(apps), { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD });
  } else if (cmd === '/log') {
    if (!param) {
      await sendTelegramImpl(
        'ℹ️ Usage:\n/log <Company> — <Role> [Link]\n\nExample:\n/log Bluecurrent — Data Administrator https://nz.seek.com/job/94417890',
        { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
      );
      return;
    }

    const linkMatch = param.match(/https?:\/\/[^\s]+/i);
    const link = linkMatch ? cleanJobUrl(linkMatch[0]) : '';
    const withoutLink = param.replace(/https?:\/\/[^\s]+/i, '').trim();

    const parts = withoutLink.split(/\s*—\s*|\s+-\s+|\s*\|\s*/);
    const company = (parts[0] || '').trim();
    const role = (parts.slice(1).join(' - ') || '').trim() || 'Role';

    if (!company) {
      await sendTelegramImpl('❌ Please specify a company name: /log <Company> — <Role> [Link]', {
        token,
        chatId,
      });
      return;
    }

    if (createApplication) {
      const result = await createApplication({
        company,
        role,
        location: 'Wellington, NZ',
        link,
        fit: 'good',
        status: 'researching',
      });

      const entry = result.entry;
      if (result.existing) {
        await sendTelegramImpl(
          `ℹ️ Role already in tracker:\n🏢 ${entry.company} — ${entry.role}\n🔄 Status: ${entry.status}`,
          { token, chatId }
        );
        return;
      }

      const replyText = [
        '📥 Manually Logged Role:',
        `🏢 ${entry.company}`,
        `💼 ${entry.role}`,
        `📍 ${entry.location}`,
        `🎯 Fit: ${entry.fit}`,
        link ? `🔗 ${link}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const replyMarkup = {
        inline_keyboard: [
          [
            { text: '📋 Queue CV', callback_data: `queue_cv:${entry.id}` },
            { text: '📨 Mark Applied', callback_data: `status:${entry.id}:applied` },
          ],
          [{ text: '🗑️ Discard', callback_data: `delete_app:${entry.id}` }],
        ],
      };

      await sendTelegramImpl(replyText, { token, chatId, replyMarkup });
      return;
    }
  } else if (cmd === '/practice') {
    const card = await getPracticeCard(param);
    if (!card) {
      await sendTelegramImpl('❌ Could not load questions from interview bank.', { token, chatId });
      return;
    }
    const { text: practiceText, replyMarkup } = formatPracticeMessage(card);
    await sendTelegramImpl(practiceText, { token, chatId, replyMarkup });
  } else if (cmd === '/quiz') {
    const quiz = await getQuizQuestion(param);
    if (!quiz) {
      await sendTelegramImpl('❌ Could not load questions from quiz bank.', { token, chatId });
      return;
    }
    await sendTelegramQuiz(
      chatId,
      `🧠 ${quiz.question}`,
      quiz.options,
      quiz.correctOptionId,
      quiz.explanation,
      { token, fetchImpl }
    );
  } else if (cmd === '/ask') {
    if (!param) {
      await sendTelegramImpl(
        'Usage: /ask <career or interview question>\nExample: /ask How should I explain why I left Northline?',
        { token, chatId }
      );
      return;
    }
    await sendTelegramImpl('🤔 Consulting Career Coach for Jordan…', { token, chatId });
    const answer = await askCareerCoach(param, { apps, execFileImpl });
    await sendTelegramChunked(answer, { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD, sendTelegramImpl });
  } else if (cmd === '/cl' || cmd === '/coverletter') {
    if (!param) {
      await sendTelegramImpl('Usage: /cl <company>\nExample: /cl Spark', { token, chatId });
      return;
    }
    const q = param.toLowerCase();
    const app = apps.find(
      (a) =>
        (a.company && a.company.toLowerCase().includes(q)) ||
        (a.role && a.role.toLowerCase().includes(q))
    );
    if (!app) {
      await sendTelegramImpl(`❌ No application found matching "${param}".`, { token, chatId });
      return;
    }
    const cl = await findCoverLetterText(app, { careerDir, execFileImpl });
    if (!cl || !cl.text) {
      await sendTelegramImpl(`❌ No Cover Letter document found on disk for ${app.company}.`, { token, chatId });
      return;
    }
    const header = `📝 Cover Letter: ${app.company} — ${app.role}\n\n`;
    const replyMarkup = {
      inline_keyboard: [
        [{ text: '📄 Send Word/PDF File', callback_data: `get_cv:${app.id}` }],
      ],
    };
    await sendTelegramChunked(`${header}${cl.text}`, { token, chatId, replyMarkup, sendTelegramImpl });
  } else if (cmd === '/reject') {
    if (!paramParts || paramParts.length < 1) {
      await sendTelegramImpl('Usage: /reject <company> [reason]\nExample: /reject spark position cancelled', { token, chatId });
      return;
    }
    let matchedApp = null;
    let reason = '';
    for (let i = paramParts.length; i >= 1; i--) {
      const companyCandidate = paramParts.slice(0, i).join(' ').toLowerCase();
      const found = apps.find(
        (a) =>
          (a.company && a.company.toLowerCase().includes(companyCandidate)) ||
          (a.role && a.role.toLowerCase().includes(companyCandidate))
      );
      if (found) {
        matchedApp = found;
        reason = paramParts.slice(i).join(' ').trim();
        break;
      }
    }
    if (!matchedApp) {
      matchedApp = apps.find((a) => a.company && a.company.toLowerCase().includes(paramParts[0].toLowerCase()));
      reason = paramParts.slice(1).join(' ').trim();
    }

    if (!matchedApp) {
      await sendTelegramImpl(`❌ No application found matching "${paramParts[0]}".`, { token, chatId });
      return;
    }

    if (updateApplication) {
      const ts = new Date().toLocaleDateString('en-NZ');
      const updated = await updateApplication(
        matchedApp.id,
        (entry) => {
          const existing = entry.notes ? `${entry.notes}\n` : '';
          const reasonNote = reason ? ` Rejection reason: ${reason}` : '';
          return {
            ...entry,
            status: 'rejected',
            notes: `${existing}[${ts} TG] Marked rejected.${reasonNote}`,
            updated: Date.now(),
          };
        },
        'rejection-analysed',
        `Rejection logged for ${matchedApp.company} via Telegram: ${reason || 'no reason specified'}`
      );
      const loopRes = await updateLearningLoop(
        {
          company: matchedApp.company,
          role: matchedApp.role,
          appId: matchedApp.id,
          reason,
        },
        { learningLoopFile }
      );

      const countText = loopRes.success ? ` (Total Rejections Tracked: ${loopRes.rejectionCount})` : '';
      const replyMsg = [
        `📭 Marked ${matchedApp.company} — ${matchedApp.role} as Rejected.`,
        reason ? `💡 Reason noted: "${reason}"` : 'ℹ️ No reason specified.',
        `🔄 Synced to Notion & updated learning-loop.json${countText}.`,
      ].join('\n');

      await sendTelegramImpl(replyMsg, { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD });
    }
  } else if (cmd === '/role') {
    if (!param) {
      await sendTelegramImpl('Please specify a company or role: /role <company>', { token, chatId });
      return;
    }
    const q = param.toLowerCase();
    const matches = apps.filter(
      (a) =>
        (a.company && a.company.toLowerCase().includes(q)) ||
        (a.role && a.role.toLowerCase().includes(q))
    );
    if (matches.length === 0) {
      await sendTelegramImpl(`❌ No application found matching "${param}".`, { token, chatId });
    } else if (matches.length === 1) {
      const { text: roleText, replyMarkup } = formatRole(matches[0]);
      await sendTelegramImpl(roleText, { token, chatId, replyMarkup });
    } else {
      const list = matches.slice(0, 8).map((m) => `  • ${m.company} — ${m.role} (${m.status})`);
      await sendTelegramImpl(
        `Found ${matches.length} matches:\n${list.join('\n')}\n\nUse /role <exact company> to view details.`,
        { token, chatId }
      );
    }
  } else if (cmd === '/prep') {
    if (!param) {
      await sendTelegramImpl('Please specify a company: /prep <company>', { token, chatId });
      return;
    }
    const q = param.toLowerCase();
    const app = apps.find(
      (a) =>
        (a.company && a.company.toLowerCase().includes(q)) ||
        (a.role && a.role.toLowerCase().includes(q))
    );
    if (!app) {
      await sendTelegramImpl(`❌ No application found matching "${param}".`, { token, chatId });
    } else {
      await sendTelegramImpl(formatPrep(app), { token, chatId });
    }
  } else if (cmd === '/cv' || cmd === '/doc') {
    if (!param) {
      await sendTelegramImpl('Please specify a company: /cv <company>', { token, chatId });
      return;
    }
    const q = param.toLowerCase();
    const app = apps.find(
      (a) =>
        (a.company && a.company.toLowerCase().includes(q)) ||
        (a.role && a.role.toLowerCase().includes(q))
    );
    if (!app) {
      await sendTelegramImpl(`❌ No application found matching "${param}".`, { token, chatId });
      return;
    }
    if (findCvFile) {
      const doc = await findCvFile(app.id);
      if (doc && doc.path) {
        await sendDocImpl(doc.path, {
          caption: `📄 CV for ${app.company} — ${app.role}`,
          token,
          chatId,
          fetchImpl,
        });
      } else {
        await sendTelegramImpl(`❌ No CV document found on disk yet for ${app.company}.`, { token, chatId });
      }
    }
  } else if (cmd === '/status') {
    if (!paramParts || paramParts.length < 2) {
      await sendTelegramImpl('Usage: /status <company> <new_status>\nAllowed: researching, applied, interview, offer, rejected, withdrawn', { token, chatId });
      return;
    }
    const rawStatus = paramParts[paramParts.length - 1].toLowerCase();
    const companyQuery = paramParts.slice(0, -1).join(' ').toLowerCase();
    const normalizedStatus = STATUS_SHORTCUTS[rawStatus] || rawStatus;

    if (!VALID_STATUSES.includes(normalizedStatus)) {
      await sendTelegramImpl(`❌ Invalid status "${rawStatus}". Allowed: ${VALID_STATUSES.join(', ')}`, { token, chatId });
      return;
    }

    const app = apps.find(
      (a) =>
        (a.company && a.company.toLowerCase().includes(companyQuery)) ||
        (a.role && a.role.toLowerCase().includes(companyQuery))
    );
    if (!app) {
      await sendTelegramImpl(`❌ No role found matching "${companyQuery}".`, { token, chatId });
      return;
    }

    if (setApplicationStatus) {
      const res = await setApplicationStatus(app.id, normalizedStatus);
      if (res?.ok) {
        await sendTelegramImpl(
          `✅ Updated ${res.entry.company} — ${res.entry.role} to ${normalizedStatus}!`,
          { token, chatId }
        );
      } else {
        await sendTelegramImpl(`❌ Could not update ${app.company}.`, { token, chatId });
      }
    }
  } else if (cmd === '/note') {
    if (!paramParts || paramParts.length < 2) {
      await sendTelegramImpl('Usage: /note <company> <note text>', { token, chatId });
      return;
    }
    const companyQuery = paramParts[0].toLowerCase();
    const noteText = paramParts.slice(1).join(' ');

    const app = apps.find((a) => a.company && a.company.toLowerCase().includes(companyQuery));
    if (!app) {
      await sendTelegramImpl(`❌ No company found matching "${companyQuery}".`, { token, chatId });
      return;
    }

    if (updateApplication) {
      const updated = await updateApplication(
        app.id,
        (entry) => {
          const timestamp = new Date().toLocaleDateString('en-NZ');
          const existing = entry.notes ? `${entry.notes}\n` : '';
          return { ...entry, notes: `${existing}[${timestamp} TG] ${noteText}`, updated: Date.now() };
        },
        'note',
        `Note added via Telegram`
      );
      if (updated) {
        await sendTelegramImpl(`📝 Note added to ${updated.company}: "${noteText}"`, { token, chatId });
      }
    }
  } else {
    await sendTelegramImpl(COMMAND_HELP, { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD });
  }
}

function fetchUpdates(token, offset, fetchImpl, timeoutSec = 30) {
  return telegramGetUpdates({ offset, timeoutSec }, { token, fetchImpl });
}

function setMyCommands(token, fetchImpl) {
  return telegramApi(
    'setMyCommands',
    {
      commands: [
        { command: 'today', description: 'What is due today' },
        { command: 'pending', description: 'Active applications in pipeline' },
        { command: 'gmail', description: 'Sweep last 10 emails for tracker updates' },
        { command: 'role', description: 'Look up details for a company/role' },
        { command: 'cv', description: 'Send tailored CV PDF to chat' },
        { command: 'cl', description: 'Copy-paste Cover Letter text' },
        { command: 'practice', description: 'STAR story interview flashcards' },
        { command: 'quiz', description: 'Technical multiple-choice quiz poll' },
        { command: 'ask', description: 'Ask AI Career Coach a question' },
        { command: 'reject', description: 'Log rejection & update learning loop' },
        { command: 'status', description: 'Update status of a role' },
        { command: 'prep', description: 'Interview prep & talking points' },
        { command: 'radar', description: 'Wellington & Remote active radar' },
        { command: 'stats', description: 'Pipeline summary statistics' },
        { command: 'sync', description: 'Git sync tracker data & CVs' },
        { command: 'app', description: 'Open mobile web dashboard' },
        { command: 'help', description: 'Show all available commands' },
      ],
    },
    { token, fetchImpl, label: 'setMyCommands' }
  );
}

export function setChatMenuButton(token, fetchImpl) {
  return telegramApi(
    'setChatMenuButton',
    { menu_button: { type: 'commands' } },
    { token, fetchImpl, label: 'setChatMenuButton' }
  );
}

export function startTelegramCommands({
  getApplications,
  updateApplication,
  setApplicationStatus,
  createApplication,
  deleteApplication,
  queueCvRequest,
  findCvFile,
  isGmailFetchBusy,
  runGmailFetch,
  token = process.env.TELEGRAM_BOT_TOKEN,
  chatId = process.env.TELEGRAM_CHAT_ID,
  execFileImpl = execFile,
  fetchImpl,
} = {}) {
  if (!token || !chatId) {
    console.log('  telegram commands: off (no TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID in App/.env)');
    return;
  }

  setMyCommands(token, fetchImpl);
  setChatMenuButton(token, fetchImpl);

  (async () => {
    let offset;

    const initial = await fetchUpdates(token, undefined, fetchImpl, 0);
    if (initial.result.length > 0) {
      offset = initial.result[initial.result.length - 1].update_id + 1;
    }
    console.log('  telegram commands: on');

    for (;;) {
      const { ok, result } = await fetchUpdates(token, offset, fetchImpl);
      if (!ok) {
        // eslint-disable-next-line no-await-in-loop -- deliberate backoff
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }
      for (const update of result) {
        offset = update.update_id + 1;
        try {
          // eslint-disable-next-line no-await-in-loop -- replies must arrive in order
          await handleUpdate(update, {
            getApplications,
            updateApplication,
            setApplicationStatus,
            createApplication,
            deleteApplication,
            queueCvRequest,
            findCvFile,
            isGmailFetchBusy,
            runGmailFetch,
            token,
            chatId,
            execFileImpl,
            fetchImpl,
          });
        } catch (err) {
          console.error('telegram commands: failed to handle update:', err.message);
        }
      }
      // eslint-disable-next-line no-await-in-loop -- deliberate pacing
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  })();
}
