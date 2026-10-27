// Handles incoming Telegram commands and interactive callback queries via long-polling getUpdates.
// Features: /pending, /today, /role, /cv, /prep, /status, /note, /stats, interactive buttons, and URL ingest.

import { execFile } from 'node:child_process';
import fsPromises from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { generateContent } from './ai-models.js';
import { isFetchableUrl, SAFE_CURL_ARGS, guardCurlOutput } from './safe-url.js';
import { telegramApi, telegramGetUpdates } from './telegram-api.js';
import { answerQuestion, undoAnswer, findByMessageId } from './review-questions.js';
import { buildDigest, formatDigest, markRadarDecision, seekJobUrl } from './job-radar.js';
import {
  sendTelegram,
  sendTelegramDocument,
  sendTelegramVoice,
  sendTelegramQuiz,
  downloadTelegramFile,
} from './notify-telegram.js';
import { formatBriefing } from './telegram-briefing.js';
import { extractAdText, htmlToText, adFileBase } from './ad-snapshot.js';
import {
  getVoiceSetting,
  setVoiceSetting,
  AVAILABLE_VOICES,
  synthesizeToOggOpus,
  createSpokenBriefingText,
} from './tts.js';

const pendingExplain = new Map();

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

export function getTelegramWebAppUrl() {
  if (process.env.JOBHQ_HTTPS_URL) return process.env.JOBHQ_HTTPS_URL.replace(/\/$/, '');
  const tunnelFile = path.join(APP_DIR, 'data', 'tunnel-url.txt');
  try {
    if (fsSync.existsSync(tunnelFile)) {
      const url = fsSync.readFileSync(tunnelFile, 'utf8').trim();
      if (url && url.startsWith('https://')) return url.replace(/\/$/, '');
    }
  } catch {}
  return null;
}

export function buildMainMenuKeyboard(webAppUrl = getTelegramWebAppUrl()) {
  const rows = [
    [{ text: '⏰ Today' }, { text: '📋 Pending' }],
    [{ text: '📌 Tasks' }, { text: '📨 Gmail Fetch' }],
    [{ text: '📻 Briefing' }, { text: '🎙️ Voice' }],
    [{ text: '🎯 Practice' }, { text: '🧠 Quiz' }],
    [{ text: '🛰️ Radar' }, { text: '📊 Stats' }],
    [{ text: '🔄 Sync' }, { text: '❓ Help' }],
  ];
  if (webAppUrl) {
    rows.unshift([{ text: '📱 Open JobHQ', web_app: { url: `${webAppUrl}/miniapp` } }]);
  }
  return {
    keyboard: rows,
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: '🎙️ Hold mic to speak, or type command…',
  };
}

export const MAIN_MENU_KEYBOARD = buildMainMenuKeyboard();

export async function syncTelegramMenuButton({ token, fetchImpl, webAppUrl = getTelegramWebAppUrl() } = {}) {
  if (!token) return;
  try {
    if (webAppUrl) {
      await telegramApi(
        'setChatMenuButton',
        {
          menu_button: {
            type: 'web_app',
            text: '📱 JobHQ',
            web_app: { url: `${webAppUrl}/miniapp` },
          },
        },
        { token, fetchImpl, label: 'setChatMenuButton' }
      );
    }
  } catch (err) {
    console.error('telegram: failed to sync menu button:', err.message);
  }
}

export const COMMAND_HELP = [
  '🤖  JOB SEARCH HQ  ✨',
  '(っ•ᴗ•)っ Your personal executive career assistant',
  '',
  '📅  DAILY FOCUS',
  '   ⏰  /today    · Tasks & deadlines due right now',
  '   📋  /pending  · Active applications by stage',
  '   🛰️  /radar    · Wellington & Remote roles',
  '   🔭  /jobs     · Scan your 3 SEEK saved searches (/seek)',
  '   📊  /stats    · Pipeline analytics & response rates',
  '',
  '🔍  ROLE MANAGEMENT',
  '   🔎  /role <name>   · Full card & interactive buttons',
  '   📄  /cv <name>     · Send tailored CV PDF',
  '   📝  /cl <name>     · Cover letter text',
  '   📝  /clfile <name> · Send tailored Cover Letter file',
  '   ⚡  /cvgen <name>  · Queue CV & cover letter generation',
  '   🔍  /review <name> · Review a drafted CV & cover letter',
  '   🎤  /prep <name>   · Interview prep & talking points',
  '   🎯  /fit <name>    · Detailed ATS & Fit Analysis breakdown',
  '',
  '✏️  TASKS & CORRESPONDENCE',
  '   📌  /task <name> <text> [due]  · Add action item',
  '   📮  /followup <name> [date|Nd] · Schedule follow-up',
  '   ✉️  /email <name> | <from> | <subj> | <body> · Log email thread',
  '   📥  /add <url|role> · Capture new role with AI fit check & details',
  '   📥  /log <Co> — <Role> [url]   · Capture role with fit check',
  '   🔄  /status <name> <status>    · Move stage (app, int, off, rej)',
  '   📭  /reject <name> [reason]    · Log rejection & learning loop',
  '   🗒️  /note <name> <text>        · Append quick note',
  '',
  '🧠  COACH & INTERVIEW PRACTICE',
  '   🎯  /practice · STAR interview flashcards',
  '   🧠  /quiz     · Technical quiz question',
  '   💡  /ask <q>  · AI career coach guidance',
  '',
  '⚙️  SYSTEM & TOOLS',
  '   📨  /gmail [n] · Sweep mailbox for job updates',
  '   🔄  /sync      · Git sync tracker on server',
  '   📱  /app       · Open mobile web dashboard & Mini App',
  '',
  '🎙️  VOICE MODE & ASSISTANT',
  '   🗣️  /voice [name] · View or switch AI voice (Jarvis, Prabhat, etc.)',
  '   📻  /briefing     · Morning executive briefing with voice note',
  '   🎙️  Voice Notes   · Send any voice memo! Ask questions, run commands, or debrief.',
  '',
  '──────────────────────',
  '🎙️  Tip: Send a voice note to talk directly with your AI career assistant!',
  '🔗  Tip: Paste any job link to auto-capture!',
  '',
  '(•̀ᴗ•́)و Ready to make today count!',
].join('\n');

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
  if (pending.length === 0) {
    return [
      '📋  ACTIVE PIPELINE',
      '',
      "✅  Nothing pending right now — Pipeline's clear!",
      '',
      '( ◡‿◡ ) Enjoy the breather, or paste a new job link to start fresh.',
    ].join('\n');
  }

  const out = [
    `📋 PIPELINE · ${pending.length} active`,
    '(っ•ᴗ•)っ Here is your current pipeline breakdown:',
  ];
  for (const status of PENDING_STATUS_ORDER) {
    const group = pending.filter((a) => a.status === status);
    if (group.length === 0) continue;
    out.push('', '───────────────', `${PENDING_STATUS_LABELS[status]} · ${group.length}`, '');
    out.push(...bullets(group.map((a) => `• ${pair(a)}`), PENDING_CAP_PER_STATUS));
  }
  out.push('', '──────────────────────', '💡 Tip: Use /role <name> for full card & actions.', '(•̀ᴗ•́)و Keep the momentum going!');
  return out.join('\n');
}

export function dateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayDateString() {
  return dateStr(0);
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
  const head = [
    `⏰ TODAY · ${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`,
    '(っ•ᴗ•)っ Here is what needs your attention today:',
  ].join('\n');

  if (closing.length === 0 && followUps.length === 0 && tasks.length === 0) {
    const tail = expired.length ? `\n\n🗄 ${expired.length} closed ads still open in the tracker` : '';
    return `${head}\n\n✅ Nothing due. You're clear! ✨${tail}\n\n( ◡‿◡ ) Enjoy the breather, or use /practice to prep!`;
  }

  const out = [head];

  if (tasks.length) {
    out.push('', '───────────────', `📌 TASKS · ${tasks.length}`, '');
    out.push(
      ...bullets(
        tasks.map(({ app, task, n }) => `${n < 0 ? '🔴' : '🟡'} ${clip(task.label, 42)}\n      🏢 ${clip(app.company, 24)} · ⏰ ${whenLabel(task.dueAt)}`),
        4
      )
    );
  }

  if (closing.length) {
    const today = closing.filter((c) => c.n === 0);
    out.push('', '───────────────', `📅 CLOSING · ${closing.length}`, '');
    out.push(
      ...bullets(
        closing.map(({ app, n }) => `${n === 0 ? '🔴' : n <= 2 ? '🟠' : '🟡'} ${pair(app)}\n      ⏳ ${whenLabel(app.deadline)}`),
        5
      )
    );
    if (today.length) out.push('', `   ⚠️ ${today.length} close TODAY`);
  }

  if (followUps.length) {
    out.push('', '───────────────', `📮 FOLLOW UP · ${followUps.length}`, '');
    out.push(
      ...bullets(
        followUps.map(({ app, n }) => `${n <= -14 ? '🔴' : n <= -7 ? '🟠' : '🟡'} ${pair(app)}\n      ⏰ Follow up ${whenLabel(app.followUpDue)}`),
        5,
        '/pending'
      )
    );
  }

  if (expired.length) {
    out.push('', '───────────────', `🗄 ${expired.length} closed ads still open in the tracker`);
  }

  out.push('', '──────────────────────', '(•̀ᴗ•́)و Take it one step at a time!');
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
    '( ◡‿◡ ) Your job search breakdown:',
    '',
    '───────────────',
    ...rows.map(([label, n]) => `${label} · ${n}${n ? `   ${bar(n)}` : ''}`),
    '',
    '───────────────',
    `⚡ Active ${active} · Closed ${closed}`,
    `📈 Response rate ~${responseRate}%`,
    `🎯 Interview rate ~${interviewRate}%`,
    '',
    '──────────────────────',
    '(•̀ᴗ•́)و Consistent efforts bring results!',
  ].join('\n');
}

export function formatRole(app) {
  const status = PENDING_STATUS_LABELS[app.status] || app.status;
  const out = [
    `🏢 ${app.company}`,
    `💼 ${app.role}`,
    '',
    `🏷️ ${status}${app.fit ? ` · 🎯 ${app.fit} fit` : ''}`,
    `📍 ${app.location || 'Wellington, NZ'} · ${app.employment === 'internship' ? 'Internship' : 'Job'}`,
  ];

  const dates = [];
  if (app.date) dates.push(`📅 Applied ${shortDate(app.date)}`);
  if (app.deadline) dates.push(`⏳ Closes ${shortDate(app.deadline)} · ${whenLabel(app.deadline)}`);
  if (app.followUpDue) dates.push(`📮 Follow up ${whenLabel(app.followUpDue)}`);
  if (app.interview?.when) dates.push(`🎤 Interview ${shortDate(app.interview.when)} · ${whenLabel(app.interview.when)}`);
  if (dates.length) {
    out.push('', '───────────────', ...dates);
  }

  const extras = [];
  if (app.salary) extras.push(`💰 ${app.salary}`);
  if (app.contactName) extras.push(`👤 ${app.contactName}`);
  if (app.contactEmail) extras.push(`✉️ ${app.contactEmail}`);
  if (app.cvStatus) extras.push(`📄 CV ${app.cvStatus}`);
  if (extras.length) {
    out.push('', '───────────────', ...extras);
  }

  const openTasks = (app.tasks ?? []).filter((t) => !t.completedAt);
  if (openTasks.length) {
    out.push('', '───────────────', `📌 Tasks · ${openTasks.length}`);
    out.push(...bullets(openTasks.map((t) => `• ${clip(t.label, 40)}${t.dueAt ? ` · ${whenLabel(t.dueAt)}` : ''}`), 3));
  }

  if (app.notes) {
    const n = String(app.notes).trim();
    out.push('', '───────────────', '📝 Recent Note:');
    if (n.length <= 320) {
      out.push(`   ${n}`);
    } else {
      let tail = n.slice(-320);
      const cut = tail.search(/[\n.!?]\s|\s/);
      if (cut > -1 && cut < 60) tail = tail.slice(cut).replace(/^[\n.!?\s]+/, '');
      out.push(`   …${tail}`);
    }
  }

  out.push('', '──────────────────────', '(•̀ᴗ•́)و Ready for action!');

  const inline_keyboard = [
    [
      { text: '📄 Get CV', callback_data: `get_cv:${app.id}` },
      { text: '📝 Cover Letter', callback_data: `get_cl:${app.id}` },
    ],
    [
      { text: '🎯 Fit Analysis', callback_data: `fit:${app.id}` },
      { text: '🎤 Prep Notes', callback_data: `prep:${app.id}` },
    ],
    [
      { text: '⚡ Tailor CV', callback_data: `queue_cv:${app.id}` },
      { text: '🔍 Review', callback_data: `review:${app.id}` },
    ],
  ];

  if (app.status === 'researching') {
    inline_keyboard.push([
      { text: '📨 Mark Applied', callback_data: `status:${app.id}:applied` },
      { text: '🗑️ Discard', callback_data: `delete_app:${app.id}` },
    ]);
  } else if (app.status === 'applied') {
    inline_keyboard.push([
      { text: '🟢 Mark Interview', callback_data: `status:${app.id}:interview` },
      { text: '📭 Mark Rejected', callback_data: `status:${app.id}:rejected` },
    ]);
  } else if (app.status === 'interview') {
    inline_keyboard.push([
      { text: '🎉 Mark Offer', callback_data: `status:${app.id}:offer` },
      { text: '📭 Mark Rejected', callback_data: `status:${app.id}:rejected` },
    ]);
  }

  return { text: out.join('\n'), replyMarkup: { inline_keyboard } };
}

export function formatPrep(app) {
  const out = [
    `🎤 PREP · ${app.company}`,
    `💼 ${app.role}`,
    '(•̀ᴗ•́)و Talking points & role preparation:',
  ];

  const iv = app.interview;
  if (iv && typeof iv === 'object') {
    if (iv.when) out.push('', '───────────────', `📅 ${shortDate(iv.when)} · ${whenLabel(iv.when)}`);
    if (Array.isArray(iv.rounds) && iv.rounds.length) {
      out.push('', '───────────────', `🗓 ROUNDS · ${iv.rounds.length}`);
      out.push(
        ...bullets(
          iv.rounds.map((r) => `• ${clip(r.label || r.title || 'Round', 32)} · ${r.date || 'TBD'}`),
          4
        )
      );
    }
    if (Array.isArray(iv.talkingPoints) && iv.talkingPoints.length) {
      out.push('', '───────────────', `💡 TALKING POINTS · ${iv.talkingPoints.length}`);
      out.push(...bullets(iv.talkingPoints.map((t) => `• ${clip(t, 90)}`), 5));
    }
    if (Array.isArray(iv.questions) && iv.questions.length) {
      out.push('', '───────────────', `❓ LIKELY QUESTIONS · ${iv.questions.length}`);
      out.push(...bullets(iv.questions.map((q) => `• ${clip(q.question || q, 90)}`), 4));
    }
    out.push('', '──────────────────────', '(•̀ᴗ•́)و You are going to do great!');
    return out.join('\n');
  }

  const an = app.analysis;
  if (an && typeof an === 'object') {
    out.push('', '───────────────', '🎯 FIT ANALYSIS');
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
    out.push('', '──────────────────────', '(•̀ᴗ•́)و Focus on your strengths!');
    return out.join('\n');
  }

  out.push(
    '',
    '───────────────',
    'ℹ️ No prep written for this role yet.',
    '💡 Generate the war room on the dashboard, or try /ask.',
    '',
    '( ◡‿◡ ) Prep helps you stand out!'
  );
  return out.join('\n');
}

export function formatFitAnalysis(app) {
  const analysis = app.analysis;
  if (!analysis) {
    return [
      `🎯 FIT ANALYSIS · ${app.company}`,
      `💼 ${app.role}`,
      '',
      `ℹ️ No deep fit analysis generated yet.`,
      app.jobText
        ? `📄 Ad text is saved (${app.jobText.length.toLocaleString()} chars). Tap below to run or open in app.`
        : `⚠️ No job ad text stored. Paste the job link in chat to fetch and analyze.`,
      '',
      '──────────────────────',
    ].join('\n');
  }

  const rec = analysis.recommendation || {};
  const verdictEmoji = rec.verdict === 'apply' ? '🟢' : '⚠️';
  const verdictLabel = rec.verdict === 'apply' ? 'APPLY' : 'SKIP / STRETCH';
  const score = analysis.score || {};
  const overallScore = typeof score.overall === 'number' ? score.overall : (app.fit === 'strong' ? 85 : 75);

  const out = [
    `🎯 FIT ANALYSIS · ${app.company}`,
    `💼 ${app.role}`,
    '',
    `Verdict: ${verdictEmoji} *${verdictLabel}* · Overall Match: *${overallScore}/100*`,
  ];

  if (rec.reasoning) {
    out.push(`💡 *Assessment:* ${rec.reasoning}`);
  }

  if (score && typeof score === 'object') {
    const scores = [];
    if (typeof score.keywordMatch === 'number') scores.push(`Keywords: ${score.keywordMatch}%`);
    if (typeof score.technicalMatch === 'number') scores.push(`Tech: ${score.technicalMatch}%`);
    if (typeof score.experienceMatch === 'number') scores.push(`Experience: ${score.experienceMatch}%`);
    if (typeof score.industryMatch === 'number') scores.push(`Industry: ${score.industryMatch}%`);
    if (scores.length) {
      out.push('', '───────────────', `📊 *ATS Breakdown:*`, scores.join(' · '));
    }
    if (score.parsingRisk) {
      out.push(`ATS Parsing Risk: *${score.parsingRisk}*`);
    }
  }

  const ats = analysis.ats || {};
  const matched = asArray(ats.matched);
  if (matched.length > 0) {
    out.push('', '───────────────', `🟢 *Matched Strengths:*`);
    for (const m of matched.slice(0, 5)) {
      out.push(`• ${m}`);
    }
  }

  const missing = asArray(ats.missing);
  if (missing.length > 0) {
    out.push('', '───────────────', `⚠️ *Gaps & Watch-outs:*`);
    for (const g of missing.slice(0, 4)) {
      out.push(`• ${g}`);
    }
  }

  const gap = analysis.gap || {};
  if (gap.positioning) {
    out.push('', '───────────────', `💡 *Pitch Strategy & Positioning:*`, gap.positioning);
  }

  out.push('', '──────────────────────');
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
    factsText = 'Candidate: Jordan Smith. Master of Information Technology (Cyber Security), Riverside Institute of Technology (graduated July 2026). Experience: L2 NOC Engineer at Northline Broadband (2 years, 24/7 rota, ISP leased line & customer support), Server Support Engineer at Cascade Infovision / Cascade (Linux/Windows servers, cPanel, Apache, live chat). Certs: RHCSA, Google Cybersecurity Certificate, ServiceNow learning path in progress. 3-year NZ Open Work Visa (valid to Aug 2029). Clean NZ driver licence.';
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
      ['-p', prompt],
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

export async function interpretVoiceMessage(
  audioFilePath,
  {
    apiKey = process.env.GEMINI_API_KEY,
    apps = [],
    candidateFactsPath = DEFAULT_KEY_FACTS_FILE,
  } = {}
) {
  if (!apiKey) {
    return {
      transcript: '',
      intent: 'general',
      replyText: '🎙️ Voice note received, but GEMINI_API_KEY is not configured for automatic transcription.',
      spokenReply: 'API key is not configured on the server, sir.',
    };
  }

  let factsText = '';
  try {
    factsText = await fsPromises.readFile(candidateFactsPath, 'utf8');
  } catch {
    factsText = 'Candidate: Jordan Smith. Master of IT (Cyber Security), Riverside Institute of Technology. NZ Open Work Visa.';
  }

  const audioBytes = await fsPromises.readFile(audioFilePath);
  const base64Audio = audioBytes.toString('base64');

  const activeRolesSummary = (apps || [])
    .filter((a) => a.status !== 'rejected' && a.status !== 'withdrawn' && a.status !== 'skipped')
    .slice(0, 15)
    .map((a) => `${a.company} (${a.role}, stage: ${a.status})`)
    .join('; ');

  const promptText = [
    'You are the personal AI executive assistant and career assistant for Jordan Smith on Telegram.',
    'You are listening to an audio voice memo sent by Jordan.',
    '',
    'ACTIVE ROLES IN TRACKER:',
    activeRolesSummary || 'None active',
    '',
    'CANDIDATE FACTS:',
    factsText.slice(0, 2500),
    '',
    'TASK:',
    '1. Transcribe his speech accurately into "transcript".',
    '2. Determine his intent ("intent"):',
    '   - "briefing": asks for morning briefing, daily overview, or "brief me"',
    '   - "today": asks what is due today, deadlines, open tasks',
    '   - "pending": asks for active/pending applications, stage breakdown',
    '   - "stats": asks for statistics, response rate, overview',
    '   - "gmail": asks to check/sweep emails, fetch Gmail',
    '   - "sync": asks to sync repository or git',
    '   - "radar": asks for job radar, Wellington or Remote roles',
    '   - "role": asks about a specific application (e.g. "how is KiwiRail doing?", "show Strictly Savvy")',
    '   - "prep": asks for interview talking points / prep for a company',
    '   - "cv": asks for the CV or cover letter document for a company',
    '   - "cvgen": asks to tailor or generate a CV for a company',
    '   - "voice": asks to change voice personality or settings (e.g. "change voice to Jarvis / Prabhat / Mitchell")',
    '   - "practice": asks for interview practice question or STAR story flashcard',
    '   - "quiz": asks for a technical quiz or test',
    '   - "task": asks to add a task/reminder to a company',
    '   - "debrief": recording an interview debrief / post-interview impressions and feedback',
    '   - "coach": asking career advice, interview question strategy, NZ job market question',
    '   - "general": general greeting or query',
    '3. Extract any specific company name ("company"), voiceKey ("voiceKey": jarvis|prabhat|mitchell|molly|ryan|guy), task text ("taskText").',
    '4. "replyText": A concise, mobile-friendly Telegram markdown message. If debrief, summarize Interviewer, Role, Questions, Impressions, Next Steps.',
    '5. "spokenReply": A short 1-2 sentence spoken reply for voice synthesis, addressing him politely as "sir" or "Jordan".',
    '',
    'Return ONLY valid JSON matching this schema:',
    '{',
    '  "transcript": string,',
    '  "intent": string,',
    '  "company": string | null,',
    '  "voiceKey": string | null,',
    '  "taskText": string | null,',
    '  "replyText": string,',
    '  "spokenReply": string',
    '}',
  ].join('\n');

  try {
    const { text: resultJson } = await generateContent({
      parts: [
        { text: promptText },
        { inline_data: { mime_type: 'audio/ogg', data: base64Audio } },
      ],
      generationConfig: {
        maxOutputTokens: 1200,
        temperature: 0.2,
        response_mime_type: 'application/json',
      },
      apiKey,
    });

    if (resultJson) {
      let cleaned = resultJson.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
      else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(cleaned);
      return {
        transcript: parsed.transcript || '',
        intent: parsed.intent || 'general',
        company: parsed.company || null,
        voiceKey: parsed.voiceKey ? parsed.voiceKey.toLowerCase() : null,
        taskText: parsed.taskText || null,
        replyText: parsed.replyText || '',
        spokenReply: parsed.spokenReply || '',
      };
    }
  } catch (err) {
    console.error('interpretVoiceMessage error:', err.message);
  }

  return {
    transcript: '',
    intent: 'general',
    company: null,
    voiceKey: null,
    taskText: null,
    replyText: "I couldn't clearly transcribe your voice message, sir. Please try speaking again.",
    spokenReply: "I couldn't catch that clearly, sir. Could you please try again?",
  };
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

  const out = [
    `🛰 RADAR · ${local.length} of ${active.length} active are Wgtn/Remote`,
    '(っ•ᴗ•)っ High-priority target roles in your area:',
  ];

  const interviews = local.filter((a) => a.status === 'interview');
  if (interviews.length) {
    out.push('', '───────────────', `🟢 IN PROGRESS · ${interviews.length}`, '');
    out.push(...bullets(interviews.map((a) => `• ${pair(a)}`), 5));
  }

  const researching = local.filter((a) => a.status === 'researching');
  if (researching.length) {
    out.push('', '───────────────', `🔍 READY TO QUEUE · ${researching.length}`, '');
    out.push(...bullets(researching.map((a) => `• ${pair(a)} · 🎯 ${a.fit || 'good'}`), 5));
  }

  if (interviews.length === 0 && researching.length === 0) {
    out.push('', '───────────────', '💤 Nothing in progress or researching locally.');
  }

  out.push('', '──────────────────────', '💡 Quick actions: /today · /cv · /prep · /task', '(•̀ᴗ•́)و Local opportunities look promising!');
  return out.join('\n');
}

export function formatGmailFetchSummary(rawSummary, count = 10) {
  const c = count || 10;
  const header = `📨 Gmail Fetch Complete (last ${c} emails):\n───────────────`;
  const footer = '(•̀ᴗ•́)و Inbox swept and tracker up to date!';

  if (!rawSummary || !rawSummary.trim() || rawSummary.trim().toLowerCase().includes('no job updates found')) {
    return [
      header,
      '',
      '✅ No job updates found in the checked emails.',
      '',
      `( ◡‿◡ ) All clear! ${c} of ${c} emails were unrelated (newsletters, notifications, marketing).`,
      'No writes made to applications.json or audit-log.jsonl.',
      '',
      '(•̀ᴗ•́)و Mailbox is clean and tracker is up to date!',
    ].join('\n');
  }

  // Strip duplicate header if already present
  let text = rawSummary.trim();
  text = text.replace(/^📨\s*Gmail Fetch Complete[^\n]*\n+/i, '');
  text = text.replace(/^[─—=-]{3,}\n+/m, '');

  // Look for the Summary section
  const summaryMatch = text.match(/(?:^|\n)\s*(?:[-*•]\s*)?(?:Nothing needed logging or updating\.\s*)?Summary:\s*([\s\S]*)$/i);
  let findingsText = '';
  let summaryText = '';

  if (summaryMatch) {
    const summaryIdx = text.search(/(?:^|\n)\s*(?:[-*•]\s*)?(?:Nothing needed logging or updating\.\s*)?Summary:\s*/i);
    findingsText = text.slice(0, summaryIdx).trim();

    // Check if there was "Nothing needed logging or updating." right before Summary:
    const preSentenceMatch = text.slice(summaryIdx).match(/(Nothing needed logging or updating\.)\s*Summary:/i);
    if (preSentenceMatch && preSentenceMatch[1]) {
      findingsText = (findingsText ? findingsText + '\n' : '') + preSentenceMatch[1];
    }
    summaryText = summaryMatch[1].trim();
  } else {
    findingsText = text;
  }

  const out = [header, ''];

  if (findingsText) {
    const lines = findingsText.split('\n').map((l) => l.trim()).filter(Boolean);
    let inList = false;
    let itemNumber = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect header like "Found one job-related email: an RBNZ rejection..."
      const foundMatch = line.match(/^(Found (?:one|\d+) job-related email[s]?:?)\s*(.*)$/i);
      if (foundMatch) {
        out.push(foundMatch[1].endsWith(':') ? foundMatch[1] : `${foundMatch[1]}:`, '');
        if (foundMatch[2]) {
          let itemTitle = foundMatch[2].trim();
          itemTitle = itemTitle.charAt(0).toUpperCase() + itemTitle.slice(1);
          out.push(`${itemNumber}. ${itemTitle}`);
          itemNumber++;
          inList = true;
        }
        continue;
      }

      // Detect already numbered list item e.g. "1. ..."
      const numMatch = line.match(/^(\d+)\.\s*(.*)$/);
      if (numMatch) {
        if (inList) out.push('');
        out.push(`${numMatch[1]}. ${numMatch[2]}`);
        itemNumber = Number(numMatch[1]) + 1;
        inList = true;
        continue;
      }

      // Quote block styling for explanations / status remarks
      if (line.startsWith('>') || line.startsWith('💬') || line.startsWith('❝')) {
        const cleanQuote = line.replace(/^[>💬❝]\s*/, '').replace(/[❞"]$/, '');
        if (out.length > 0 && /^\d+\.\s/.test(out[out.length - 1])) {
          out.push('');
        }
        out.push(`   > ${cleanQuote}`);
      } else if (
        line.toLowerCase().startsWith('already logged') ||
        line.toLowerCase().startsWith('nothing needed') ||
        line.toLowerCase().startsWith('status:') ||
        line.toLowerCase().startsWith('no changes')
      ) {
        if (out.length > 0 && /^\d+\.\s/.test(out[out.length - 1])) {
          out.push('');
        }
        out.push(`   > ${line}`);
      } else {
        if (!inList) {
          out.push(line);
        } else {
          if (out.length > 0 && /^\d+\.\s/.test(out[out.length - 1])) {
            out.push('');
          }
          out.push(`   > ${line}`);
        }
      }
    }
  }

  if (summaryText) {
    out.push('', '', 'Summary:');
    const sumLines = summaryText.split('\n').map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < sumLines.length; i++) {
      const sLine = sumLines[i];
      if (/^[-*•]\s*/.test(sLine)) {
        if (i > 0) out.push('');
        out.push(`• ${sLine.replace(/^[-*•]\s*/, '')}`);
      } else {
        out.push(`  ${sLine}`);
      }
    }
  }

  out.push('', footer);
  return out.join('\n');
}

export function buildDisambiguationKeyboard(actionPrefix, matches) {
  const inline_keyboard = matches.slice(0, 6).map((m) => [
    {
      text: `🏢 ${clip(m.company, 16)} — ${clip(m.role, 18)} (${m.status})`,
      callback_data: `${actionPrefix}:${m.id}`,
    },
  ]);
  return { inline_keyboard };
}

export function parseDateOffsetOrString(input) {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  if (trimmed === 'today') return dateStr(0);
  if (trimmed === 'tomorrow') return dateStr(1);
  const dayMatch = trimmed.match(/^(\d+)\s*d(ays?)?$/);
  if (dayMatch) return dateStr(Number(dayMatch[1]));
  const weekMatch = trimmed.match(/^(\d+)\s*w(eeks?)?$/);
  if (weekMatch) return dateStr(Number(weekMatch[1]) * 7);
  const isoMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}$/);
  if (isoMatch) return trimmed;
  return null;
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
    const host = u.hostname.toLowerCase();
    if (host === 'www.seek.co.nz' || host === 'seek.co.nz') {
      u.hostname = 'nz.seek.com';
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}

export function parseSeekHtml(html, url) {
  let role = '';
  let company = '';
  let location = 'Wellington, NZ';

  // 0. Structured state in window.SEEK_REDUX_DATA
  const reduxMatch = html.match(/window\.SEEK_REDUX_DATA\s*=\s*(\{[\s\S]*?\});/);
  if (reduxMatch) {
    try {
      const data = JSON.parse(reduxMatch[1]);
      const job = data.jobdetails?.result?.job;
      if (job) {
        if (job.title) role = String(job.title).trim();
        if (job.advertiser?.name) company = String(job.advertiser.name).trim();
        if (job.location?.label) location = String(job.location.label).trim();
      }
    } catch {}
  }

  // 1. SEEK Advertiser Name
  if (!company) {
    const advMatch =
      html.match(/data-automation="advertiser-name"[^>]*>([^<]+)</i) ||
      html.match(/data-automation="job-header-company-name"[^>]*>([^<]+)</i);
    if (advMatch) company = advMatch[1].trim();
  }

  // 2. SEEK Job Title
  if (!role) {
    const titleMatch =
      html.match(/data-automation="job-detail-title"[^>]*>([^<]+)</i) ||
      html.match(/data-automation="job-header-title"[^>]*>([^<]+)</i);
    if (titleMatch) role = titleMatch[1].trim();
  }

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

export async function loadCandidateSummary(candidateFactsPath = DEFAULT_KEY_FACTS_FILE) {
  try {
    const raw = await fsPromises.readFile(candidateFactsPath, 'utf8');
    return raw.slice(0, 3500);
  } catch {
    return 'Candidate: Jordan Smith. Master of Information Technology (Cyber Security specialisation, completed with Merit), Riverside Institute of Technology, Wellington (graduated July 2026). Experience: L2 NOC Engineer at Northline Broadband (2 years, 24/7 rota, ISP leased line, network monitoring & customer incident support), Server Support Engineer at Cascade Infovision / Cascade (Linux/Windows servers, cPanel, Apache, live chat & troubleshooting). Certifications: RHCSA (Red Hat Certified System Administrator), Google Cybersecurity Certificate coursework (5 of 8 completed). Work rights: 3-year NZ Post-Study Open Work Visa (valid to Aug 2029). Clean NZ Class 1 Driver Licence. Location: Upper Hutt, Wellington.';
  }
}

export async function analyzeJobWithAI(
  jobContent,
  url = '',
  {
    apiKey = process.env.GEMINI_API_KEY,
    candidateFactsPath = DEFAULT_KEY_FACTS_FILE,
    fetchImpl = fetch,
    fallback = {},
  } = {}
) {
  if (!apiKey || !jobContent || jobContent.trim().length < 20) {
    return null;
  }

  const candidateContext = await loadCandidateSummary(candidateFactsPath);

  const prompt = `You are the expert personal recruitment AI and job-tracker parser for Jordan Smith.
Ground all analysis strictly in his authentic background and facts:
${candidateContext}

Analyze this job listing text and output strictly valid JSON with these fields:
- company: string (the actual hiring employer, NOT the job board domain like Seek, TradeMe, or LinkedIn)
- role: string (exact role title)
- location: string (city or region, e.g. "Wellington", "Auckland", "Remote", "Porirua")
- roleType: strictly one of "SOC Analyst", "GRC", "Network Security", "IT Security Support", "Other"
- employment: strictly "job" or "internship"
- workArrangement: strictly "onsite", "hybrid", or "remote"
- salary: string (e.g. "$75,000 - $85,000" or hourly rate, or empty string if not stated)
- deadline: string (closing date in YYYY-MM-DD format if explicitly stated, else empty string)
- source: strictly one of "Seek", "LinkedIn", "Summer of Tech", "Trade Me Jobs", "Company site", "Other"
- fit: strictly one of "strong", "good", "stretch"
- fitReason: {
    "strengths": string (1-2 sentences on direct alignment with Jordan's L2 NOC, Linux/RHCSA, Master's with Merit, or technical support background),
    "gaps": string (1 sentence on missing niche tools, years of exp, or citizenship/clearance constraints if any),
    "recommendation": string (1 sentence on the strongest angle to pitch in CV and cover letter)
  }
- tags: array of 3-5 short strings (e.g. ["SOC", "Wellington", "Junior", "Hybrid"])
- notes: string (2-3 concise sentences summarizing key requirements, essential tech stack, and why this role is a strong/good/stretch match)
- analysis: {
    "recommendation": {
      "verdict": strictly "apply" or "skip",
      "reasoning": string (1-2 sentences explaining why to apply or skip, considering Jordan's L2 NOC, Linux/RHCSA, Master's, customer support, and NZ work visa)
    },
    "ats": {
      "matched": array of 3-6 strings (specific candidate strengths & skills that directly match the job requirements),
      "missing": array of 1-4 strings (requirements from the ad that candidate lacks, or empty array),
      "toEvidence": array of strings (skills candidate has that should be highlighted on the CV),
      "unsupported": []
    },
    "gap": {
      "theyWant": array of 3-5 strings (key responsibilities or requirements from the ad),
      "youHave": array of 3-5 strings (matching evidence from Jordan's background),
      "positioning": string (actionable advice on how to position Jordan in the CV and cover letter),
      "learningTasks": []
    },
    "score": {
      "keywordMatch": integer 0-100,
      "semanticMatch": integer 0-100,
      "technicalMatch": integer 0-100,
      "experienceMatch": integer 0-100,
      "industryMatch": integer 0-100,
      "recruiterReadability": integer 0-100,
      "parsingRisk": "low" or "medium" or "high",
      "overall": integer 0-100 (composite fit score),
      "explanation": string (1-2 sentences explaining the score breakdown and interview likelihood)
    }
  }

JOB LISTING:
${jobContent.slice(0, 7000)}`;

  try {
    const { text: rawJson } = await generateContent({
      parts: [{ text: prompt }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
      apiKey,
      fetchImpl,
    });
    if (!rawJson) return null;
    const parsed = JSON.parse(rawJson);

    const validFit = ['strong', 'good', 'stretch'].includes(parsed.fit) ? parsed.fit : 'good';
    const validRoleType = ['SOC Analyst', 'GRC', 'Network Security', 'IT Security Support', 'Other'].includes(parsed.roleType)
      ? parsed.roleType
      : 'Other';
    const validArrangement = ['onsite', 'hybrid', 'remote'].includes(parsed.workArrangement)
      ? parsed.workArrangement
      : 'hybrid';
    const validEmployment = ['job', 'internship'].includes(parsed.employment) ? parsed.employment : 'job';
    const validSource = ['Seek', 'LinkedIn', 'Summer of Tech', 'Trade Me Jobs', 'Company site', 'Other'].includes(
      parsed.source
    )
      ? parsed.source
      : url.includes('seek')
      ? 'Seek'
      : url.includes('trademe')
      ? 'Trade Me Jobs'
      : url.includes('linkedin')
      ? 'LinkedIn'
      : 'Company site';

    let analysis = null;
    if (parsed.analysis && typeof parsed.analysis === 'object') {
      const rec = parsed.analysis.recommendation || {};
      const ats = parsed.analysis.ats || {};
      const gap = parsed.analysis.gap || {};
      const sc = parsed.analysis.score || {};

      const verdict = rec.verdict === 'skip' ? 'skip' : 'apply';
      const overallScore =
        typeof sc.overall === 'number'
          ? Math.max(0, Math.min(100, Math.round(sc.overall)))
          : validFit === 'strong'
          ? 85
          : validFit === 'good'
          ? 75
          : 60;

      analysis = {
        at: Date.now(),
        recommendation: {
          verdict,
          reasoning:
            typeof rec.reasoning === 'string' && rec.reasoning.trim()
              ? rec.reasoning.trim()
              : parsed.fitReason?.recommendation || parsed.notes || '',
        },
        ats: {
          matched:
            Array.isArray(ats.matched) && ats.matched.length > 0
              ? ats.matched
              : parsed.fitReason?.strengths
              ? [parsed.fitReason.strengths]
              : [],
          missing:
            Array.isArray(ats.missing)
              ? ats.missing
              : parsed.fitReason?.gaps
              ? [parsed.fitReason.gaps]
              : [],
          toEvidence: Array.isArray(ats.toEvidence) ? ats.toEvidence : [],
          unsupported: [],
        },
        gap: {
          theyWant: Array.isArray(gap.theyWant) ? gap.theyWant : [],
          youHave:
            Array.isArray(gap.youHave) && gap.youHave.length > 0
              ? gap.youHave
              : parsed.fitReason?.strengths
              ? [parsed.fitReason.strengths]
              : [],
          positioning:
            typeof gap.positioning === 'string' && gap.positioning.trim()
              ? gap.positioning.trim()
              : parsed.fitReason?.recommendation || '',
          learningTasks: [],
        },
        score: {
          keywordMatch: typeof sc.keywordMatch === 'number' ? sc.keywordMatch : overallScore,
          semanticMatch: typeof sc.semanticMatch === 'number' ? sc.semanticMatch : overallScore,
          technicalMatch: typeof sc.technicalMatch === 'number' ? sc.technicalMatch : overallScore,
          experienceMatch: typeof sc.experienceMatch === 'number' ? sc.experienceMatch : overallScore,
          industryMatch: typeof sc.industryMatch === 'number' ? sc.industryMatch : 70,
          recruiterReadability: typeof sc.recruiterReadability === 'number' ? sc.recruiterReadability : 90,
          parsingRisk: ['low', 'medium', 'high'].includes(sc.parsingRisk) ? sc.parsingRisk : 'low',
          overall: overallScore,
          explanation: typeof sc.explanation === 'string' ? sc.explanation.trim() : parsed.notes || '',
        },
      };
    } else {
      const overallScore = validFit === 'strong' ? 85 : validFit === 'good' ? 75 : 60;
      analysis = {
        at: Date.now(),
        recommendation: {
          verdict: validFit === 'stretch' ? 'skip' : 'apply',
          reasoning: parsed.fitReason?.recommendation || parsed.notes || '',
        },
        ats: {
          matched: parsed.fitReason?.strengths ? [parsed.fitReason.strengths] : [],
          missing: parsed.fitReason?.gaps ? [parsed.fitReason.gaps] : [],
          toEvidence: [],
          unsupported: [],
        },
        gap: {
          theyWant: [],
          youHave: parsed.fitReason?.strengths ? [parsed.fitReason.strengths] : [],
          positioning: parsed.fitReason?.recommendation || '',
          learningTasks: [],
        },
        score: {
          keywordMatch: overallScore,
          semanticMatch: overallScore,
          technicalMatch: overallScore,
          experienceMatch: overallScore,
          industryMatch: 70,
          recruiterReadability: 90,
          parsingRisk: 'low',
          overall: overallScore,
          explanation: parsed.notes || '',
        },
      };
    }

    return {
      company: (parsed.company || fallback.company || '').trim(),
      role: (parsed.role || fallback.role || '').trim(),
      location: (parsed.location || fallback.location || 'Wellington, NZ').trim(),
      url: cleanJobUrl(url || fallback.url || ''),
      roleType: validRoleType,
      employment: validEmployment,
      workArrangement: validArrangement,
      salary: typeof parsed.salary === 'string' ? parsed.salary.trim() : '',
      deadline: typeof parsed.deadline === 'string' ? parsed.deadline.trim() : '',
      source: validSource,
      fit: validFit,
      fitReason: parsed.fitReason && typeof parsed.fitReason === 'object' ? parsed.fitReason : null,
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      notes: typeof parsed.notes === 'string' ? parsed.notes.trim() : '',
      analysis,
      analysisStatus: 'ready',
    };
  } catch (err) {
    console.error('analyzeJobWithAI failed:', err.message);
    return null;
  }
}

export async function analyzeRoleFitWithoutListing(
  company,
  role,
  {
    apiKey = process.env.GEMINI_API_KEY,
    candidateFactsPath = DEFAULT_KEY_FACTS_FILE,
    fetchImpl = fetch,
  } = {}
) {
  if (!apiKey || !role) {
    return {
      fit: 'good',
      roleType: 'Other',
      notes: `Manually added role at ${company}.`,
      tags: [],
    };
  }

  const candidateContext = await loadCandidateSummary(candidateFactsPath);
  const prompt = `You are the personal recruitment assistant for Jordan Smith.
Candidate facts:
${candidateContext}

A role has been logged by title:
Company: ${company}
Role Title: ${role}

Assess the fit of this role title against Jordan's background and return JSON:
- roleType: strictly one of "SOC Analyst", "GRC", "Network Security", "IT Security Support", "Other"
- fit: strictly one of "strong", "good", "stretch"
- fitReason: {
    "strengths": string,
    "gaps": string,
    "recommendation": string
  }
- tags: array of strings
- notes: string (2 concise sentences on why this role title matches or stretches Jordan)`;

  try {
    const { text: rawJson } = await generateContent({
      parts: [{ text: prompt }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
      apiKey,
      fetchImpl,
    });
    if (!rawJson) throw new Error('No JSON');
    const parsed = JSON.parse(rawJson);
    const validFit = ['strong', 'good', 'stretch'].includes(parsed.fit) ? parsed.fit : 'good';
    const validRoleType = ['SOC Analyst', 'GRC', 'Network Security', 'IT Security Support', 'Other'].includes(
      parsed.roleType
    )
      ? parsed.roleType
      : 'Other';
    return {
      fit: validFit,
      roleType: validRoleType,
      fitReason: parsed.fitReason || null,
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      notes: parsed.notes || `Manually logged role: ${role} at ${company}.`,
    };
  } catch {
    return {
      fit: 'good',
      roleType: 'Other',
      notes: `Manually added role at ${company}.`,
      tags: [],
    };
  }
}

export function formatJobLoggedMessage(entry, { isManual = false, parsed = {}, jobUrl = '' } = {}) {
  const header = isManual ? '📥 Manually Logged Role:' : '📥 Logged New Role from iPhone:';
  const fitEmoji = entry.fit === 'strong' ? '🟢' : entry.fit === 'good' ? '🟡' : '🟠';
  const fitLabel = entry.fit ? entry.fit.charAt(0).toUpperCase() + entry.fit.slice(1) : 'Good';
  const arrangementStr = entry.workArrangement
    ? ` (${entry.workArrangement.charAt(0).toUpperCase() + entry.workArrangement.slice(1)})`
    : '';
  const salaryLine = entry.salary ? `💰 Salary: ${entry.salary}` : '';
  const deadlineLine = entry.deadline ? `⏰ Closes: ${entry.deadline}` : '';
  const typeStr = entry.roleType ? ` · ${entry.roleType}` : '';

  let fitSection = '';
  const analysis = entry.analysis || parsed.analysis;
  const fitReason =
    parsed.fitReason || (entry.fitReason && typeof entry.fitReason === 'object' ? entry.fitReason : null);

  if (analysis) {
    const rec = analysis.recommendation || {};
    const verdictEmoji = rec.verdict === 'apply' ? '🟢' : '⚠️';
    const verdictLabel = rec.verdict === 'apply' ? 'APPLY' : 'SKIP / STRETCH';
    const overallScore = analysis.score?.overall ?? (entry.fit === 'strong' ? 85 : 75);

    const lines = [];
    lines.push(`🎯 *Verdict:* ${verdictEmoji} *${verdictLabel}* · ATS Match: *${overallScore}/100*`);
    if (rec.reasoning) {
      lines.push(`> 💡 *Assessment:* ${rec.reasoning}`);
    }

    const ats = analysis.ats || {};
    const matched = asArray(ats.matched);
    if (matched.length > 0) {
      lines.push(`> 🟢 *Strengths:* ${matched[0]}`);
      for (const m of matched.slice(1, 4)) {
        lines.push(`>  • ${m}`);
      }
    }

    const missing = asArray(ats.missing);
    if (missing.length > 0) {
      lines.push(`> ⚠️ *Watch-outs:* ${missing[0]}`);
      for (const g of missing.slice(1, 3)) {
        lines.push(`>  • ${g}`);
      }
    }

    const gap = analysis.gap || {};
    if (gap.positioning) {
      lines.push(`> 💡 *Strategy:* ${gap.positioning}`);
    }

    fitSection = `───────────────────────\n\n💡 *AI Fit Check:*\n${lines.join('\n')}`;
  } else if (fitReason) {
    const lines = [];
    if (fitReason.strengths) lines.push(`> 🟢 *Strengths:* ${fitReason.strengths}`);
    if (fitReason.gaps) lines.push(`> ⚠️ *Watch-outs:* ${fitReason.gaps}`);
    if (fitReason.recommendation) lines.push(`> 💡 *Strategy:* ${fitReason.recommendation}`);
    if (lines.length > 0) {
      fitSection = `───────────────────────\n\n💡 *AI Fit Check:*\n${lines.join('\n')}`;
    }
  } else if (entry.notes) {
    fitSection = `───────────────────────\n\n💡 *Key Details & Requirements:*\n> ${entry.notes.replace(/\n+/g, '\n> ')}`;
  }

  const jobText = entry.jobText || parsed.jobText || '';
  const adKind = entry.jobTextKind || parsed.jobTextKind || (jobText ? 'verbatim' : '');
  const adLine = jobText
    ? `📄 *Job Ad:* ${adKind === 'verbatim' ? 'Verbatim ad captured' : 'Ad summary captured'} (${jobText.length.toLocaleString()} chars)`
    : '';

  const tagsLine =
    Array.isArray(entry.tags) && entry.tags.length > 0
      ? `🏷️ ${entry.tags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' ')}`
      : '';

  const linkLine = entry.link || parsed.url || jobUrl ? `🔗 ${entry.link || parsed.url || jobUrl}` : '';

  const metaLines = [
    `🏢 *${entry.company}*`,
    `💼 *${entry.role}*`,
    `📍 ${entry.location || 'Wellington, NZ'}${arrangementStr}`,
    salaryLine,
    deadlineLine,
    `🎯 Fit: ${fitEmoji} *${fitLabel}*${typeStr}`,
    adLine,
  ]
    .filter(Boolean)
    .join('\n');

  return [header, metaLines, fitSection, tagsLine, linkLine].filter(Boolean).join('\n\n');
}

export async function parseJobWithGemini(html, url, apiKey = process.env.GEMINI_API_KEY, fetchImpl = fetch) {
  if (!apiKey) return null;
  const cleanText = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const aiResult = await analyzeJobWithAI(cleanText, url, { apiKey, fetchImpl });
  if (aiResult) return aiResult;

  try {
    const { text: rawJson } = await generateContent({
      parts: [
        {
          text: `Extract the hiring company name, job role title, and job location from this job ad text. Return ONLY valid JSON with keys "company", "role", and "location". Do not wrap in markdown or backticks.\n\nText:\n${cleanText.slice(0, 4000)}`,
        },
      ],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
      apiKey,
      fetchImpl,
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
  const candidateFactsPath = opts.candidateFactsPath || DEFAULT_KEY_FACTS_FILE;
  const fetchImpl = opts.fetchImpl;

  const cleanedUrl = cleanJobUrl(url);

  // Same public-internet-only rule as the CV worker's scrape — a pasted link
  // must not be able to make the server fetch its own API or a tailnet host.
  if (!isFetchableUrl(cleanedUrl)) {
    return { role: '', company: '', location: 'Wellington, NZ', url: cleanedUrl, fit: 'good' };
  }

  return new Promise((resolve) => {
    execFileImpl(
      'curl',
      [
        ...SAFE_CURL_ARGS,
        '--max-time',
        '10',
        '-A',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        cleanedUrl,
      ],
      { timeout: 12000 },
      async (err, stdout) => {
        let result = { role: '', company: '', location: 'Wellington, NZ', url: cleanedUrl };
        const html = !err && stdout ? guardCurlOutput(stdout) : '';

        if (html) {
          const lowerUrl = cleanedUrl.toLowerCase();
          if (lowerUrl.includes('seek.co') || lowerUrl.includes('seek.com')) {
            result = parseSeekHtml(html, cleanedUrl);
          } else if (lowerUrl.includes('trademe.co.nz')) {
            result = parseTradeMeHtml(html, cleanedUrl);
          } else if (lowerUrl.includes('linkedin.com')) {
            result = parseLinkedInHtml(html, cleanedUrl);
          } else {
            result = parseGenericHtml(html, cleanedUrl);
          }
        }

        const verbatimAd = extractAdText(html);
        const fallbackText = html ? htmlToText(html) : '';
        const jobText = verbatimAd || fallbackText;
        const jobTextKind = verbatimAd ? 'verbatim' : (jobText ? 'summary' : undefined);

        // If we have content and an API key, run AI analysis and fit check!
        if (jobText.length > 50 && apiKey) {
          const aiResult = await analyzeJobWithAI(jobText, cleanedUrl, {
            apiKey,
            candidateFactsPath,
            fetchImpl,
            fallback: result,
          });

          if (aiResult && (!isInvalidParsedJob(aiResult) || !isInvalidParsedJob(result))) {
            result = {
              ...result,
              ...aiResult,
              company:
                !isInvalidParsedJob(aiResult) && aiResult.company
                  ? aiResult.company
                  : result.company || aiResult.company,
              role:
                !isInvalidParsedJob(aiResult) && aiResult.role ? aiResult.role : result.role || aiResult.role,
              location: aiResult.location || result.location || 'Wellington, NZ',
              url: cleanedUrl,
              jobText,
              jobTextKind,
              analysis: aiResult.analysis || null,
              analysisStatus: aiResult.analysis ? 'ready' : undefined,
            };
            return resolve(result);
          }
        }

        // If regex parsing failed or gave invalid result, try legacy Gemini fallback
        if (isInvalidParsedJob(result) && html && apiKey) {
          const geminiResult = await parseJobWithGemini(html, cleanedUrl, apiKey, fetchImpl);
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

        result.fit = result.fit || fit;
        result.jobText = jobText;
        result.jobTextKind = jobTextKind;
        result.url = cleanedUrl;
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

async function sendSavedFact(res, { token, chatId, sendTelegramImpl }) {
  const row = [{ text: 'Undo', callback_data: `rqu:${res.id}` }];
  if (res.tag === 'CONFIRMED') row.push({ text: 'Regenerate application', callback_data: `rqr:${res.entryId}` });
  const next = res.tag === 'CONFIRMED'
    ? 'Future CVs and cover letters for every role may now use this as real experience. Tap Regenerate to apply it to this application.'
    : 'Future documents will NOT claim this.';
  const msg = [
    `${res.tag === 'CONFIRMED' ? '✅' : '🚫'} ${res.tag}`,
    `Role: ${res.label}`,
    `Question: ${res.question}`,
    `Recorded as: ${res.fact.split(' Answer in his words: ').pop()}`,
    `Saved to: Project Notes/candidate-facts/review-answers.md`,
    next,
    'Wrong? Tap Undo and the question reopens.',
  ].join('\n');
  await sendTelegramImpl(msg, { token, chatId, replyMarkup: { inline_keyboard: [row] } });
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
    findClFile,
    reviewApplication,
    createApplication,
    careerDir = CAREER_DIR,
    sendTelegramImpl = sendTelegram,
    sendDocImpl = sendTelegramDocument,
    execFileImpl = execFile,
    fetchImpl,
    apiKey = process.env.GEMINI_API_KEY,
    candidateFactsPath = DEFAULT_KEY_FACTS_FILE,
  } = {}
) {
  const fromId = query.from?.id;
  if (!isAuthorizedChat(fromId, chatId)) return;

  const data = query.data || '';
  await answerCallbackQuery(token, query.id, 'Processing…', fetchImpl);

  const [action, ...args] = data.split(':');
  const targetId = args[0];

  if (action === 'rq') {
    if (args[1] === 't') {
      pendingExplain.set(String(chatId), { id: targetId, at: Date.now() });
      await sendTelegramImpl('✍️ Send your explanation as your next message and I will save your words as the fact.', { token, chatId });
      return;
    }
    const res = args[1] === 'y' || args[1] === 'n' ? await answerQuestion(targetId, args[1]) : null;
    if (res) await sendSavedFact(res, { token, chatId, sendTelegramImpl });
    return;
  }
  if (action === 'review') {
    const r = reviewApplication ? await reviewApplication(targetId) : null;
    await sendTelegramImpl(r ? `🔍 Reviewing ${r.company} — ${r.role}. The report follows in a few minutes.` : '❌ Could not start a review (role not found or no documents yet).', { token, chatId });
    return;
  }
  if (action === 'rqu') {
    const q = await undoAnswer(targetId);
    if (q) await sendTelegramImpl(`↩️ Undone. The question is open again: ${q.question}`, { token, chatId });
    return;
  }
  if (action === 'rqr') {
    const r = queueCvRequest ? await queueCvRequest(targetId) : null;
    await sendTelegramImpl(r ? `📋 Regenerating ${r.company} — ${r.role}.` : '❌ Could not queue it (role not found).', { token, chatId });
    return;
  }

  if (action === 'radar') {
    const [op, seekId] = args;
    if (!/^\d+$/.test(seekId || '')) return;
    if (op === 'skip') {
      await markRadarDecision(seekId, 'skipped');
      await sendTelegramImpl('⏭ Skipped. The digest will show fewer roles like that one.', { token, chatId });
    } else if (op === 'log') {
      await markRadarDecision(seekId, 'logged');
      await logJobFromUrl(seekJobUrl(seekId), { createApplication, sendTelegramImpl, token, chatId, execFileImpl, apiKey, candidateFactsPath, fetchImpl });
    }
    return;
  }

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
  } else if (action === 'get_cl_file' && findClFile) {
    const doc = await findClFile(targetId);
    if (doc && doc.path) {
      await sendDocImpl(doc.path, {
        caption: `📝 Cover Letter for ${doc.entry.company} — ${doc.entry.role}`,
        token,
        chatId,
        fetchImpl,
      });
    } else {
      await sendTelegramImpl('❌ No Cover Letter document found on disk yet for this role.', { token, chatId });
    }
  } else if (action === 'prep' && getApplications) {
    const apps = await getApplications();
    const app = apps.find((a) => a.id === targetId || a.matchKey === targetId);
    if (app) {
      await sendTelegramImpl(formatPrep(app), { token, chatId });
    }
  } else if (action === 'fit') {
    const apps = getApplications ? await getApplications() : [];
    const app = apps.find((a) => a.id === targetId || a.matchKey === targetId);
    if (app) {
      await sendTelegramImpl(formatFitAnalysis(app), {
        token,
        chatId,
        replyMarkup: {
          inline_keyboard: [
            [
              { text: '📋 Queue CV', callback_data: `queue_cv:${app.id}` },
              { text: '🔍 View Role', callback_data: `view_role:${app.id}` },
            ],
          ],
        },
      });
    }
  } else if (action === 'view_role' && getApplications) {
    const apps = await getApplications();
    const app = apps.find((a) => a.id === targetId || a.matchKey === targetId);
    if (app) {
      const { text: roleText, replyMarkup: roleMarkup } = formatRole(app);
      await sendTelegramImpl(roleText, { token, chatId, replyMarkup: roleMarkup });
    }
  } else if (action === 'get_cl' && getApplications) {
    const apps = await getApplications();
    const app = apps.find((a) => a.id === targetId || a.matchKey === targetId);
    if (!app) {
      await sendTelegramImpl('❌ Role not found.', { token, chatId });
      return;
    }
    const cl = await findCoverLetterText(app, { careerDir, execFileImpl });
    if (!cl || !cl.text) {
      await sendTelegramImpl(`❌ No Cover Letter document found on disk for ${app.company}.`, { token, chatId });
      return;
    }
    const header = [
      `📝 COVER LETTER · ${app.company}`,
      `💼 ${app.role}`,
      '',
      '───────────────',
      '',
    ].join('\n');
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '📝 Send Cover Letter File', callback_data: `get_cl_file:${app.id}` },
          { text: '📄 Send CV File', callback_data: `get_cv:${app.id}` },
        ],
      ],
    };
    await sendTelegramChunked(`${header}${cl.text}`, { token, chatId, replyMarkup, sendTelegramImpl });
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

/** Fetch, fit-check and log one job link; replies in chat either way. Resolves the new entry, if one was made. */
export async function logJobFromUrl(
  jobUrl,
  {
    createApplication,
    updateApplication,
    sendTelegramImpl = sendTelegram,
    token,
    chatId,
    execFileImpl = execFile,
    apiKey,
    candidateFactsPath,
    fetchImpl,
    careerDir = CAREER_DIR,
  }
) {
  const webAppUrl = getTelegramWebAppUrl();
  await sendTelegramImpl('🔍 Fetching and analyzing job ad…', { token, chatId });
  const parsed = await parseJobFromUrl(jobUrl, execFileImpl, { apiKey, candidateFactsPath, fetchImpl });

  if (isInvalidParsedJob(parsed)) {
    await sendTelegramImpl(
      `⚠️ Could not automatically detect company & role from this job link.\n\n` +
        `To log it cleanly, please reply:\n` +
        `/log <Company> — <Role> ${cleanJobUrl(jobUrl)}`,
      { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
    );
    return;
  }

  const folderRel = `Pending to Apply/${parsed.company}`;

  if (createApplication) {
    const result = await createApplication({
      company: parsed.company,
      role: parsed.role,
      location: parsed.location || 'Wellington, NZ',
      link: parsed.url || cleanJobUrl(jobUrl),
      fit: parsed.fit || 'good',
      status: 'researching',
      roleType: parsed.roleType || 'Other',
      employment: parsed.employment || 'job',
      workArrangement: parsed.workArrangement,
      salary: parsed.salary || '',
      deadline: parsed.deadline || '',
      source: parsed.source || 'Seek',
      tags: parsed.tags || [],
      notes: parsed.notes || '',
      jobText: parsed.jobText || '',
      jobTextKind: parsed.jobTextKind || (parsed.jobText ? 'summary' : undefined),
      adSnapshotAt: parsed.jobText ? Date.now() : undefined,
      folderPath: folderRel,
      analysis: parsed.analysis || null,
      analysisStatus: parsed.analysis ? 'ready' : undefined,
    });

    let entry = result.entry;
    if (result.existing) {
      if (updateApplication && (!entry.jobText || !entry.analysis) && (parsed.jobText || parsed.analysis)) {
        entry =
          (await updateApplication(
            entry.id,
            (prev) => ({
              ...prev,
              jobText: prev.jobText || parsed.jobText,
              jobTextKind: prev.jobTextKind || parsed.jobTextKind,
              adSnapshotAt: prev.adSnapshotAt || (parsed.jobText ? Date.now() : undefined),
              folderPath: prev.folderPath || folderRel,
              analysis: prev.analysis || parsed.analysis,
              analysisStatus: prev.analysis
                ? prev.analysisStatus
                : parsed.analysis
                ? 'ready'
                : prev.analysisStatus,
              salary: prev.salary || parsed.salary,
              deadline: prev.deadline || parsed.deadline,
              workArrangement: prev.workArrangement || parsed.workArrangement,
            }),
            'update',
            'Backfilled job text and fit analysis from shared link'
          )) || entry;
      }

      const overall = entry.analysis?.score?.overall;
      await sendTelegramImpl(
        `ℹ️ Role already in tracker:\n🏢 ${entry.company} — ${entry.role}\n🔄 Status: ${entry.status}\n🎯 Fit: ${entry.fit}` +
          (overall ? ` (ATS Match: ${overall}/100)` : ''),
        {
          token,
          chatId,
          replyMarkup: {
            inline_keyboard: [
              [
                { text: '🎯 Fit Analysis', callback_data: `fit:${entry.id}` },
                { text: '📋 Queue CV', callback_data: `queue_cv:${entry.id}` },
              ],
              [
                { text: '🔍 View Role', callback_data: `view_role:${entry.id}` },
                ...(webAppUrl ? [{ text: '📱 Open in App', web_app: { url: `${webAppUrl}/miniapp` } }] : []),
              ],
            ],
          },
        }
      );
      return entry;
    }

    // Save Job Ad.txt into folder
    if (parsed.jobText) {
      try {
        const adDir = path.join(careerDir, folderRel);
        await fsPromises.mkdir(adDir, { recursive: true });
        const adFile = path.join(adDir, `${adFileBase(entry.company, entry.role)}.txt`);
        const header = `${entry.company} — ${entry.role}\n${entry.link || cleanJobUrl(jobUrl)}\nCaptured ${new Date().toISOString()}\n\n`;
        await fsPromises.writeFile(adFile, header + parsed.jobText + '\n', 'utf8');
      } catch (err) {
        console.error('Failed to write Job Ad.txt:', err.message);
      }
    }

    const replyText = formatJobLoggedMessage(entry, { isManual: false, parsed, jobUrl });

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '📋 Queue CV', callback_data: `queue_cv:${entry.id}` },
          { text: '🎯 Fit Analysis', callback_data: `fit:${entry.id}` },
        ],
        [
          { text: '📨 Mark Applied', callback_data: `status:${entry.id}:applied` },
          ...(webAppUrl ? [{ text: '📱 Open in App', web_app: { url: `${webAppUrl}/miniapp` } }] : []),
        ],
        [
          { text: '🗑️ Discard', callback_data: `delete_app:${entry.id}` },
        ],
      ],
    };

    await sendTelegramImpl(replyText, { token, chatId, replyMarkup });
    return entry;
  }
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
    findClFile,
    reviewApplication,
    isGmailFetchBusy,
    runGmailFetch,
    addTask,
    updateTrackingNotes,
    token,
    chatId,
    careerDir = CAREER_DIR,
    sendTelegramImpl = sendTelegram,
    sendDocImpl = sendTelegramDocument,
    sendVoiceImpl = sendTelegramVoice,
    execFileImpl = execFile,
    fetchImpl,
    learningLoopFile = DEFAULT_LEARNING_LOOP_FILE,
    candidateFactsPath = DEFAULT_KEY_FACTS_FILE,
    apiKey = process.env.GEMINI_API_KEY,
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
      findClFile,
      reviewApplication,
      careerDir,
      sendTelegramImpl,
      sendDocImpl,
      execFileImpl,
      fetchImpl,
      apiKey,
      candidateFactsPath,
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

  // A reply to one of the review's question messages is the answer to that question.
  if (text && !text.startsWith('/')) {
    // "Partly: explain" arms the chat, so a plain next message counts even without Telegram's Reply gesture.
    const armed = pendingExplain.get(String(incomingChatId));
    const armedFresh = armed && Date.now() - armed.at < 30 * 60 * 1000;
    const q = message.reply_to_message
      ? await findByMessageId(message.reply_to_message.message_id)
      : armedFresh ? { id: armed.id } : null;
    if (armed && (!message.reply_to_message || q)) pendingExplain.delete(String(incomingChatId));
    if (q) {
      const res = await answerQuestion(q.id, text);
      if (res) await sendSavedFact(res, { token, chatId, sendTelegramImpl });
      return;
    }
  }
  const apps = await getApplications();
  const webAppUrl = getTelegramWebAppUrl();

  // Check URL ingest (if message contains a link and is not a command)
  const urlMatch = text.match(/https?:\/\/[^\s]+/i);
  if (urlMatch && !text.startsWith('/')) {
    await logJobFromUrl(urlMatch[0], {
      createApplication,
      updateApplication,
      sendTelegramImpl,
      token,
      chatId,
      execFileImpl,
      apiKey,
      candidateFactsPath,
      fetchImpl,
      careerDir,
    });
    return;
  }

  // Voice note processing (Interactive Voice Assistant)
  if (message.voice) {
    const vSetting = await getVoiceSetting();
    await sendTelegramImpl(`🎙️ Listening… (${vSetting.label})`, { token, chatId });
    await fsPromises.mkdir(VOICE_NOTES_DIR, { recursive: true }).catch(() => {});
    const voicePath = path.join(VOICE_NOTES_DIR, `voice_${Date.now()}.ogg`);
    const dl = await downloadTelegramFile(message.voice.file_id, voicePath, { token, fetchImpl });
    if (!dl.ok) {
      await sendTelegramImpl(`❌ Failed to download voice file: ${dl.error}`, { token, chatId });
      return;
    }

    const voiceData = await interpretVoiceMessage(voicePath, {
      apiKey,
      apps,
      candidateFactsPath,
    });

    if (voiceData.transcript) {
      await sendTelegramImpl(`🗣️ *You:* "${voiceData.transcript}"`, { token, chatId });
    }

    const replySpokenVoice = async (textToSpeak) => {
      if (!textToSpeak) return;
      try {
        const { filePath: replyVoicePath } = await synthesizeToOggOpus(textToSpeak, vSetting.voiceKey, { execFileImpl });
        await sendVoiceImpl(replyVoicePath, {
          caption: `🎙️ ${vSetting.label}`,
          token,
          chatId,
        });
      } catch (err) {
        console.error('telegram: failed to send spoken voice reply:', err.message);
      }
    };

    switch (voiceData.intent) {
      case 'briefing': {
        const briefingText = formatBriefing(apps);
        await sendTelegramImpl(briefingText, { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD });
        const spoken = createSpokenBriefingText(apps);
        await replySpokenVoice(spoken);
        return;
      }

      case 'today': {
        await replySpokenVoice(voiceData.spokenReply || 'Here are your deadlines and tasks due today, sir.');
        await sendTelegramImpl(formatToday(apps), { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD });
        return;
      }

      case 'pending': {
        await replySpokenVoice(voiceData.spokenReply || 'Here is your active application pipeline, sir.');
        await sendTelegramImpl(formatPending(apps), { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD });
        return;
      }

      case 'stats': {
        await replySpokenVoice(voiceData.spokenReply || 'Here are your pipeline statistics, sir.');
        await sendTelegramImpl(formatStats(apps), { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD });
        return;
      }

      case 'gmail': {
        await replySpokenVoice(voiceData.spokenReply || 'Checking your mailbox with Claude now, sir.');
        if (!runGmailFetch) {
          await sendTelegramImpl('❌ Gmail Fetch is not configured on this server.', { token, chatId });
          return;
        }
        if (isGmailFetchBusy && isGmailFetchBusy()) {
          await sendTelegramImpl('⏳ A Gmail sweep is already in progress. Please wait for it to finish.', { token, chatId });
          return;
        }
        await sendTelegramImpl('📨 Sweeping mailbox with Claude…', { token, chatId });
        runGmailFetch({ count: 10 }).then(async (res) => {
          if (res?.ok) {
            const formatted = formatGmailFetchSummary(res.summary, res.count || 10);
            await sendTelegramChunked(formatted, { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD, sendTelegramImpl });
            await replySpokenVoice('Mailbox check complete, sir. Results posted above.');
          }
        });
        return;
      }

      case 'sync': {
        await replySpokenVoice(voiceData.spokenReply || 'Running Git sync on the server now, sir.');
        await sendTelegramImpl('🔄 Running Git sync…', { token, chatId });
        const syncResult = await runGitSync({ careerDir, execFileImpl });
        if (syncResult.ok) {
          await sendTelegramImpl('✅ Git sync successful!', { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD });
        } else {
          await sendTelegramImpl(`⚠️ Git sync issue: ${syncResult.error}`, { token, chatId });
        }
        return;
      }

      case 'radar': {
        await replySpokenVoice(voiceData.spokenReply || 'Here is your Wellington and Remote radar, sir.');
        await sendTelegramImpl(formatRadar(apps), { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD });
        return;
      }

      case 'voice': {
        if (voiceData.voiceKey && AVAILABLE_VOICES[voiceData.voiceKey]) {
          const updated = await setVoiceSetting(voiceData.voiceKey);
          const greeting = AVAILABLE_VOICES[voiceData.voiceKey].greeting || 'Voice preference updated.';
          await sendTelegramImpl(`✅ Voice updated to ${updated.label}!\n"${greeting}"`, { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD });
          const { filePath: sampleOgg } = await synthesizeToOggOpus(greeting, updated.voiceKey, { execFileImpl });
          await sendVoiceImpl(sampleOgg, { caption: `🎙️ ${updated.label}`, token, chatId });
        } else {
          await replySpokenVoice('Here are the available voice personalities, sir.');
          const voiceList = Object.entries(AVAILABLE_VOICES).map(([k, v]) => `• /voice ${k} — ${v.label}\n  ${v.description}`).join('\n\n');
          await sendTelegramImpl(`🎙️ VOICE SETTINGS\n\nActive: ${vSetting.label}\n\n${voiceList}`, { token, chatId });
        }
        return;
      }

      case 'role': {
        const q = (voiceData.company || '').toLowerCase();
        const matches = apps.filter(
          (a) =>
            (a.company && a.company.toLowerCase().includes(q)) ||
            (a.role && a.role.toLowerCase().includes(q))
        );
        if (matches.length === 1) {
          await replySpokenVoice(voiceData.spokenReply || `Here are the details for ${matches[0].company}, sir.`);
          const { text: roleText, replyMarkup } = formatRole(matches[0]);
          await sendTelegramImpl(roleText, { token, chatId, replyMarkup });
        } else if (matches.length > 1) {
          await replySpokenVoice(`I found ${matches.length} matching roles, sir. Tap below to select.`);
          const replyMarkup = buildDisambiguationKeyboard('view_role', matches);
          await sendTelegramImpl(`Found ${matches.length} matches:`, { token, chatId, replyMarkup });
        } else {
          await replySpokenVoice(`No role found matching "${voiceData.company}", sir.`);
          await sendTelegramImpl(`❌ No application found matching "${voiceData.company}".`, { token, chatId });
        }
        return;
      }

      case 'fit': {
        const q = (voiceData.company || '').toLowerCase();
        const found = apps.find(
          (a) =>
            (a.company && a.company.toLowerCase().includes(q)) ||
            (a.role && a.role.toLowerCase().includes(q))
        );
        if (found) {
          await replySpokenVoice(voiceData.spokenReply || `Opening fit analysis for ${found.company}, sir.`);
          await sendTelegramImpl(formatFitAnalysis(found), { token, chatId });
        } else {
          await replySpokenVoice(`No role found matching "${voiceData.company}", sir.`);
          await sendTelegramImpl(`❌ No role found matching "${voiceData.company}".`, { token, chatId });
        }
        return;
      }

      case 'prep': {
        const q = (voiceData.company || '').toLowerCase();
        const found = apps.find(
          (a) =>
            (a.company && a.company.toLowerCase().includes(q)) ||
            (a.role && a.role.toLowerCase().includes(q))
        );
        if (found) {
          await replySpokenVoice(voiceData.spokenReply || `Opening interview prep notes for ${found.company}, sir.`);
          await sendTelegramImpl(formatPrep(found), { token, chatId });
        } else {
          await replySpokenVoice(`No role found matching "${voiceData.company}", sir.`);
          await sendTelegramImpl(`❌ No role found matching "${voiceData.company}".`, { token, chatId });
        }
        return;
      }

      case 'cv': {
        const q = (voiceData.company || '').toLowerCase();
        const found = apps.find(
          (a) =>
            (a.company && a.company.toLowerCase().includes(q)) ||
            (a.role && a.role.toLowerCase().includes(q))
        );
        if (found && findCvFile) {
          const doc = await findCvFile(found.id);
          if (doc?.path) {
            await replySpokenVoice(`Sending CV for ${found.company}, sir.`);
            await sendDocImpl(doc.path, {
              caption: `📄 CV for ${found.company} — ${found.role}`,
              token,
              chatId,
              fetchImpl,
            });
          } else {
            await replySpokenVoice(`No CV document on disk yet for ${found.company}, sir.`);
            await sendTelegramImpl(`❌ No CV document found on disk yet for ${found.company}.`, { token, chatId });
          }
        } else {
          await replySpokenVoice(`No role found matching "${voiceData.company}", sir.`);
          await sendTelegramImpl(`❌ No role found matching "${voiceData.company}".`, { token, chatId });
        }
        return;
      }

      case 'cl':
      case 'cover_letter': {
        const q = (voiceData.company || '').toLowerCase();
        const found = apps.find(
          (a) =>
            (a.company && a.company.toLowerCase().includes(q)) ||
            (a.role && a.role.toLowerCase().includes(q))
        );
        if (found && findClFile) {
          const doc = await findClFile(found.id);
          if (doc?.path) {
            await replySpokenVoice(`Sending cover letter for ${found.company}, sir.`);
            await sendDocImpl(doc.path, {
              caption: `📝 Cover Letter for ${found.company} — ${found.role}`,
              token,
              chatId,
              fetchImpl,
            });
          } else {
            await replySpokenVoice(`No cover letter document on disk yet for ${found.company}, sir.`);
            await sendTelegramImpl(`❌ No cover letter document found on disk yet for ${found.company}.`, { token, chatId });
          }
        } else {
          await replySpokenVoice(`No role found matching "${voiceData.company}", sir.`);
          await sendTelegramImpl(`❌ No role found matching "${voiceData.company}".`, { token, chatId });
        }
        return;
      }

      case 'cvgen': {
        const q = (voiceData.company || '').toLowerCase();
        const found = apps.find(
          (a) =>
            (a.company && a.company.toLowerCase().includes(q)) ||
            (a.role && a.role.toLowerCase().includes(q))
        );
        if (found && queueCvRequest) {
          const res = await queueCvRequest(found.id);
          if (res) {
            await replySpokenVoice(`Queued CV tailoring for ${found.company}, sir.`);
            await sendTelegramImpl(`📋 Tailoring queued for ${found.company}!`, { token, chatId });
          }
        }
        return;
      }

      case 'practice': {
        await replySpokenVoice(voiceData.spokenReply || 'Here is an interview practice question for you, sir.');
        const { text: practiceText, replyMarkup } = getPracticeCard();
        await sendTelegramImpl(practiceText, { token, chatId, replyMarkup });
        return;
      }

      case 'quiz': {
        await replySpokenVoice(voiceData.spokenReply || 'Here is a technical quiz poll for you, sir.');
        const quizItem = getQuizQuestion();
        await sendTelegramQuiz(quizItem, { token, chatId, fetchImpl });
        return;
      }

      case 'debrief': {
        await sendTelegramChunked(voiceData.replyText || '🎙️ Interview debrief recorded.', { token, chatId, sendTelegramImpl });
        let matchedApp = null;
        if (voiceData.company) {
          matchedApp = apps.find(
            (a) => a.company && a.company.toLowerCase().includes(voiceData.company.toLowerCase())
          );
        }
        if (matchedApp && updateApplication) {
          const ts = new Date().toLocaleDateString('en-NZ');
          await updateApplication(
            matchedApp.id,
            (entry) => {
              const existing = entry.notes ? `${entry.notes}\n\n` : '';
              return {
                ...entry,
                notes: `${existing}[${ts} Voice Debrief]\n${voiceData.replyText.slice(0, 1000)}`,
                updated: Date.now(),
              };
            },
            'note',
            `Voice debrief attached to ${matchedApp.company}`
          );
          await sendTelegramImpl(`📝 Automatically attached debrief notes to ${matchedApp.company}!`, { token, chatId });
        }
        await replySpokenVoice(voiceData.spokenReply || 'Debrief recorded and logged to your records, sir.');
        return;
      }

      case 'coach':
      case 'general':
      default: {
        if (voiceData.replyText) {
          await sendTelegramChunked(voiceData.replyText, { token, chatId, sendTelegramImpl });
        }
        if (voiceData.spokenReply) {
          await replySpokenVoice(voiceData.spokenReply);
        }
        return;
      }
    }
  }

  // Command handling
  let cleanText = text.trim();
  if (cleanText === '⏰ Today') cleanText = '/today';
  else if (cleanText === '📋 Pending') cleanText = '/pending';
  else if (cleanText === '📌 Tasks' || cleanText === 'Tasks') cleanText = '/today';
  else if (cleanText === '📻 Briefing' || cleanText === 'Briefing' || cleanText === 'Morning Briefing') cleanText = '/briefing';
  else if (cleanText === '🎙️ Voice' || cleanText === 'Voice') cleanText = '/voice';
  else if (cleanText === '📊 Stats') cleanText = '/stats';
  else if (cleanText === '🎯 Practice') cleanText = '/practice';
  else if (cleanText === '🧠 Quiz') cleanText = '/quiz';
  else if (cleanText === '🛰️ Radar' || cleanText === '🛰 Radar') cleanText = '/radar';
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
  } else if (cmd === '/voice') {
    const setting = await getVoiceSetting();
    if (!param) {
      const voiceList = Object.entries(AVAILABLE_VOICES).map(([k, v]) => {
        const isCurrent = k === setting.voiceKey ? ' (ACTIVE)' : '';
        return `• /voice ${k} — ${v.label}${isCurrent}\n  ${v.description}`;
      }).join('\n\n');

      const msg = [
        '🎙️  VOICE ASSISTANT SETTINGS',
        '',
        `Current Voice: 🔊 ${setting.label}`,
        '',
        'Available Personalities:',
        voiceList,
        '',
        '💡 Tap any command above to switch instantly and hear a sample!',
      ].join('\n');
      await sendTelegramImpl(msg, { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD });
      return;
    }

    const requestedKey = param.toLowerCase().trim();
    if (!AVAILABLE_VOICES[requestedKey]) {
      await sendTelegramImpl(
        `⚠️ Unknown voice "${param}". Available options:\n` +
        Object.keys(AVAILABLE_VOICES).map((k) => `• /voice ${k} (${AVAILABLE_VOICES[k].label})`).join('\n'),
        { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
      );
      return;
    }

    const updated = await setVoiceSetting(requestedKey);
    const greeting = AVAILABLE_VOICES[requestedKey].greeting || 'Voice preference updated.';
    await sendTelegramImpl(
      `✅ Voice updated to ${updated.label}!\n"${greeting}"`,
      { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
    );

    try {
      const { filePath: sampleOgg } = await synthesizeToOggOpus(greeting, updated.voiceKey, { execFileImpl });
      await sendVoiceImpl(sampleOgg, {
        caption: `🎙️ ${updated.label}`,
        token,
        chatId,
      });
    } catch (vErr) {
      console.error('telegram: failed to send voice sample:', vErr.message);
    }
    return;
  } else if (cmd === '/briefing' || cmd === '/brief' || cmd === '/morning') {
    const briefingText = formatBriefing(apps);
    await sendTelegramImpl(briefingText, { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD });

    try {
      const vSetting = await getVoiceSetting();
      const spoken = createSpokenBriefingText(apps);
      const { filePath: briefOgg } = await synthesizeToOggOpus(spoken, vSetting.voiceKey, { execFileImpl });
      await sendVoiceImpl(briefOgg, {
        caption: `🎙️ Spoken Morning Briefing (${vSetting.label})`,
        token,
        chatId,
      });
    } catch (vErr) {
      console.error('telegram: failed to send voice briefing:', vErr.message);
    }
    return;
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
          const formatted = formatGmailFetchSummary(res.summary, res.count || count);
          await sendTelegramChunked(
            formatted,
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
    const webAppUrl = getTelegramWebAppUrl();
    const dashboardUrl = getDashboardUrl();
    const buttons = [];
    if (webAppUrl) {
      buttons.push([{ text: '📱 Launch Telegram Mini App', web_app: { url: `${webAppUrl}/miniapp` } }]);
    }
    buttons.push([{ text: '🚀 Open JobSearchHQ Dashboard', url: dashboardUrl }]);
    const appMarkup = { inline_keyboard: buttons };
    await sendTelegramImpl(
      webAppUrl
        ? `📱 JobSearchHQ Mini App & Dashboard:\n\nTap below to launch the Mini App inside Telegram, or open the browser dashboard on Tailscale:`
        : `📱 Job Search HQ Mobile Dashboard:\nTap below to open your live dashboard on Tailscale:\n${dashboardUrl}`,
      { token, chatId, replyMarkup: appMarkup }
    );
  } else if (cmd === '/jobs' || cmd === '/seek') {
    await sendTelegramImpl('🔭 Scanning your 3 SEEK saved searches (Upper Hutt, Lower Hutt, ICT Wellington)…', { token, chatId });
    const { text: digest, replyMarkup } = formatDigest(await buildDigest({ apps, fetchImpl }));
    await sendTelegramImpl(digest, { token, chatId, replyMarkup });
  } else if (cmd === '/radar') {
    await sendTelegramImpl(formatRadar(apps), { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD });
  } else if (cmd === '/log' || cmd === '/add' || cmd === '/job') {
    if (!param) {
      await sendTelegramImpl(
        'ℹ️ Usage:\n• /add <Link> — Auto-fetch & analyze job ad\n• /log <Company> — <Role> [Link] — Manual capture with AI fit check\n\nExample:\n/add https://nz.seek.com/job/95013987\n/log Acme Energy — Data Administrator https://nz.seek.com/job/94417890',
        { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
      );
      return;
    }

    const isJustUrl = /^https?:\/\/[^\s]+$/i.test(param);
    if (isJustUrl) {
      await logJobFromUrl(param, {
        createApplication,
        updateApplication,
        sendTelegramImpl,
        token,
        chatId,
        execFileImpl,
        apiKey,
        candidateFactsPath,
        fetchImpl,
        careerDir,
      });
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

    let parsed = null;
    if (link) {
      try {
        parsed = await parseJobFromUrl(link, execFileImpl, { apiKey, candidateFactsPath, fetchImpl });
      } catch {}
    }

    let fitDetails = null;
    if (!parsed || !parsed.fitReason) {
      fitDetails = await analyzeRoleFitWithoutListing(company, role, { apiKey, candidateFactsPath, fetchImpl });
    }

    if (createApplication) {
      const folderRel = `Pending to Apply/${company}`;
      const result = await createApplication({
        company: company,
        role: role,
        location: (parsed && parsed.location) || 'Wellington, NZ',
        link,
        fit: (parsed && parsed.fit) || (fitDetails && fitDetails.fit) || 'good',
        status: 'researching',
        roleType: (parsed && parsed.roleType) || (fitDetails && fitDetails.roleType) || 'Other',
        employment: (parsed && parsed.employment) || 'job',
        workArrangement: parsed && parsed.workArrangement,
        salary: (parsed && parsed.salary) || '',
        deadline: (parsed && parsed.deadline) || '',
        source: (parsed && parsed.source) || (link ? 'Seek' : 'Other'),
        tags: parsed && parsed.tags && parsed.tags.length > 0 ? parsed.tags : (fitDetails && fitDetails.tags) || [],
        notes: (parsed && parsed.notes) || (fitDetails && fitDetails.notes) || '',
        jobText: (parsed && parsed.jobText) || '',
        jobTextKind: (parsed && parsed.jobTextKind) || ((parsed && parsed.jobText) ? 'summary' : undefined),
        adSnapshotAt: parsed && parsed.jobText ? Date.now() : undefined,
        folderPath: folderRel,
        analysis: (parsed && parsed.analysis) || null,
        analysisStatus: (parsed && parsed.analysis) ? 'ready' : undefined,
      });

      const entry = result.entry;
      if (result.existing) {
        await sendTelegramImpl(
          `ℹ️ Role already in tracker:\n🏢 ${entry.company} — ${entry.role}\n🔄 Status: ${entry.status}\n🎯 Fit: ${entry.fit}` +
            (entry.analysis?.score?.overall ? ` (ATS Match: ${entry.analysis.score.overall}/100)` : ''),
          {
            token,
            chatId,
            replyMarkup: {
              inline_keyboard: [
                [
                  { text: '🎯 Fit Analysis', callback_data: `fit:${entry.id}` },
                  { text: '📋 Queue CV', callback_data: `queue_cv:${entry.id}` },
                ],
              ],
            },
          }
        );
        return;
      }

      if (parsed && parsed.jobText) {
        try {
          const adDir = path.join(careerDir, folderRel);
          await fsPromises.mkdir(adDir, { recursive: true });
          const adFile = path.join(adDir, `${adFileBase(company, role)}.txt`);
          const header = `${company} — ${role}\n${link}\nCaptured ${new Date().toISOString()}\n\n`;
          await fsPromises.writeFile(adFile, header + parsed.jobText + '\n', 'utf8');
        } catch (err) {
          console.error('Failed to write Job Ad.txt:', err.message);
        }
      }

      const replyText = formatJobLoggedMessage(entry, {
        isManual: true,
        parsed: parsed || fitDetails || {},
        jobUrl: link,
      });

      const replyMarkup = {
        inline_keyboard: [
          [
            { text: '📋 Queue CV', callback_data: `queue_cv:${entry.id}` },
            { text: '🎯 Fit Analysis', callback_data: `fit:${entry.id}` },
          ],
          [
            { text: '📨 Mark Applied', callback_data: `status:${entry.id}:applied` },
            ...(webAppUrl ? [{ text: '📱 Open in App', web_app: { url: `${webAppUrl}/miniapp` } }] : []),
          ],
          [
            { text: '🗑️ Discard', callback_data: `delete_app:${entry.id}` },
          ],
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
      await sendTelegramImpl(
        [
          '📝  Copy-paste Cover Letter Text',
          '',
          'Usage: /cl <company>',
          'Example: /cl Spark',
          '',
          '(っ•ᴗ•)っ Retrieves the full cover letter text for easy copying.',
        ].join('\n'),
        { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
      );
      return;
    }
    const q = param.toLowerCase();
    const matches = apps.filter(
      (a) =>
        (a.company && a.company.toLowerCase().includes(q)) ||
        (a.role && a.role.toLowerCase().includes(q))
    );
    if (matches.length === 0) {
      await sendTelegramImpl(`❌ No application found matching "${param}".\n\n( ◡‿◡ ) Use /pending to see your active roles.`, { token, chatId });
      return;
    }
    if (matches.length > 1) {
      const replyMarkup = buildDisambiguationKeyboard('get_cl', matches);
      await sendTelegramImpl(
        [
          `🔍  Multiple Roles Found (${matches.length})`,
          '(っ•ᴗ•)っ Please tap which cover letter you want to view:',
        ].join('\n'),
        { token, chatId, replyMarkup }
      );
      return;
    }
    const app = matches[0];
    const cl = await findCoverLetterText(app, { careerDir, execFileImpl });
    if (!cl || !cl.text) {
      await sendTelegramImpl(`❌ No Cover Letter document found on disk for ${app.company}.`, { token, chatId });
      return;
    }
    const header = [
      `📝 COVER LETTER · ${app.company}`,
      `💼 ${app.role}`,
      '',
      '───────────────',
      '',
    ].join('\n');
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '📝 Send Cover Letter File', callback_data: `get_cl_file:${app.id}` },
          { text: '📄 Send CV File', callback_data: `get_cv:${app.id}` },
        ],
      ],
    };
    await sendTelegramChunked(`${header}${cl.text}`, { token, chatId, replyMarkup, sendTelegramImpl });
  } else if (cmd === '/clfile') {
    if (!param) {
      await sendTelegramImpl(
        [
          '📝  Send Tailored Cover Letter File',
          '',
          'Usage: /clfile <company>',
          'Example: /clfile Spark',
          '',
          '(っ•ᴗ•)っ Sends the tailored cover letter document file (PDF or Word) directly to chat.',
        ].join('\n'),
        { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
      );
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
      return;
    }
    if (matches.length > 1) {
      const replyMarkup = buildDisambiguationKeyboard('get_cl_file', matches);
      await sendTelegramImpl(
        [
          `🔍 Multiple Roles Found (${matches.length})`,
          '(っ•ᴗ•)っ Please tap which role cover letter you want to receive:',
        ].join('\n'),
        { token, chatId, replyMarkup }
      );
      return;
    }
    const app = matches[0];
    if (findClFile) {
      const doc = await findClFile(app.id);
      if (doc && doc.path) {
        await sendDocImpl(doc.path, {
          caption: `📝 Cover Letter for ${app.company} — ${app.role}`,
          token,
          chatId,
          fetchImpl,
        });
      } else {
        await sendTelegramImpl(`❌ No Cover Letter document found on disk yet for ${app.company}.`, { token, chatId });
      }
    }
  } else if (cmd === '/review') {
    const q = (param || '').toLowerCase();
    const matches = apps.filter(
      (a) => a.folderPath && a.cvStatus === 'drafted' && (!q || `${a.company} ${a.role}`.toLowerCase().includes(q))
    );
    if (matches.length === 0) {
      await sendTelegramImpl(`❌ No drafted CV found${param ? ` matching "${param}"` : ''}.`, { token, chatId });
    } else if (matches.length > 1) {
      await sendTelegramImpl(`🔍  Multiple Roles Found (${matches.length})\nTap which one to review:`, { token, chatId, replyMarkup: buildDisambiguationKeyboard('review', matches) });
    } else if (reviewApplication) {
      const r = await reviewApplication(matches[0].id);
      await sendTelegramImpl(r ? `🔍 Reviewing ${r.company} — ${r.role}. The report follows in a few minutes.` : '❌ Could not start a review.', { token, chatId });
    }
  } else if (cmd === '/cvgen') {
    if (!param) {
      await sendTelegramImpl(
        [
          '⚡  Queue CV & Cover Letter Generation',
          '',
          'Usage: /cvgen <company>',
          'Example: /cvgen Spark',
          '',
          '(っ•ᴗ•)っ Queues the automated CV generator on the server for this role.',
        ].join('\n'),
        { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
      );
      return;
    }
    const q = param.toLowerCase();
    const matches = apps.filter(
      (a) =>
        (a.company && a.company.toLowerCase().includes(q)) ||
        (a.role && a.role.toLowerCase().includes(q))
    );
    if (matches.length === 0) {
      await sendTelegramImpl(
        `❌ No application found matching "${param}".\n\n( ◡‿◡ ) Use /pending to see your active roles.`,
        { token, chatId }
      );
      return;
    }
    if (matches.length > 1) {
      const replyMarkup = buildDisambiguationKeyboard('queue_cv', matches);
      await sendTelegramImpl(
        [
          `🔍  Multiple Roles Found (${matches.length})`,
          '(っ•ᴗ•)っ Please tap which role to tailor a CV for:',
        ].join('\n'),
        { token, chatId, replyMarkup }
      );
      return;
    }
    const app = matches[0];
    if (queueCvRequest) {
      const res = await queueCvRequest(app.id);
      if (res) {
        await sendTelegramImpl(
          [
            '📋  CV Tailoring Queued!  ✨',
            '',
            `🏢  Company: ${res.company}`,
            `💼  Role: ${res.role}`,
            '',
            '───────────────',
            '(っ•ᴗ•)っ The CV generator worker is now crafting your tailored CV and cover letter on the server!',
            'You will receive an alert here as soon as it is ready.',
            '',
            '(•̀ᴗ•́)و Quality tailored application incoming!',
          ].join('\n'),
          { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
        );
      } else {
        await sendTelegramImpl(`❌ Could not queue CV for ${app.company}.`, { token, chatId });
      }
    }
  } else if (cmd === '/task') {
    if (!param) {
      await sendTelegramImpl(
        [
          '📌  Add Action Item to Application',
          '',
          'Usage:',
          '/task <Company> <task description> [due]',
          '/task <Company> | <task description> | [due]',
          '',
          'Examples:',
          '/task Spark Follow up with HR tomorrow',
          '/task Datacom Prepare cloud demo 2d',
          '/task Acme Recruit Submit references 2026-09-30',
          '',
          '(•̀ᴗ•́)و Synced directly to tracker and Notion!',
        ].join('\n'),
        { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
      );
      return;
    }

    let companyQuery = '';
    let taskText = '';
    let dueInput = '';

    if (param.includes('|')) {
      const parts = param.split('|').map((s) => s.trim());
      companyQuery = parts[0] || '';
      taskText = parts[1] || '';
      dueInput = parts[2] || '';
    } else {
      for (let i = paramParts.length; i >= 1; i--) {
        const coCandidate = paramParts.slice(0, i).join(' ').toLowerCase();
        const found = apps.find(
          (a) =>
            (a.company && a.company.toLowerCase().includes(coCandidate)) ||
            (a.role && a.role.toLowerCase().includes(coCandidate))
        );
        if (found) {
          companyQuery = coCandidate;
          const remaining = paramParts.slice(i);
          if (remaining.length > 1) {
            const lastToken = remaining[remaining.length - 1];
            const parsed = parseDateOffsetOrString(lastToken);
            if (parsed) {
              dueInput = lastToken;
              taskText = remaining.slice(0, -1).join(' ').trim();
            } else {
              taskText = remaining.join(' ').trim();
            }
          } else {
            taskText = remaining.join(' ').trim();
          }
          break;
        }
      }
    }

    if (!companyQuery || !taskText) {
      await sendTelegramImpl(
        '❌ Please specify both company and task text.\nExample: /task Spark Send thank-you email tomorrow',
        { token, chatId }
      );
      return;
    }

    const matchedApp = apps.find(
      (a) =>
        (a.company && a.company.toLowerCase().includes(companyQuery.toLowerCase())) ||
        (a.role && a.role.toLowerCase().includes(companyQuery.toLowerCase()))
    );

    if (!matchedApp) {
      await sendTelegramImpl(`❌ No application found matching "${companyQuery}".`, { token, chatId });
      return;
    }

    const dueAtDate = parseDateOffsetOrString(dueInput) || dateStr(0);
    const taskId = `task_${Date.now()}`;

    let success = false;
    if (addTask) {
      const res = await addTask(matchedApp.id, taskText, dueAtDate);
      success = Boolean(res);
    } else if (updateApplication) {
      const res = await updateApplication(
        matchedApp.id,
        (entry) => {
          const newTask = {
            id: taskId,
            label: taskText,
            createdAt: new Date().toISOString(),
            dueAt: dueAtDate,
            completedAt: null,
          };
          return {
            ...entry,
            tasks: [...(entry.tasks || []), newTask],
            updated: Date.now(),
          };
        },
        'task-add',
        `${taskText} (${matchedApp.company})`
      );
      success = Boolean(res);
    }

    if (success) {
      const replyMarkup = {
        inline_keyboard: [
          [{ text: '✅ Mark Done', callback_data: `task_done:${matchedApp.id}:${taskId}` }],
        ],
      };
      await sendTelegramImpl(
        [
          '✅  Task Added to Tracker!  📌',
          '',
          `🏢  Company: ${matchedApp.company}`,
          `📝  Task: ${taskText}`,
          `⏰  Due: ${shortDate(dueAtDate)} (${whenLabel(dueAtDate)})`,
          '',
          '───────────────',
          '(•̀ᴗ•́)و Logged in your tracker and synced to Notion!',
        ].join('\n'),
        { token, chatId, replyMarkup }
      );
    } else {
      await sendTelegramImpl(`❌ Failed to add task to ${matchedApp.company}.`, { token, chatId });
    }
  } else if (cmd === '/followup') {
    if (!param) {
      await sendTelegramImpl(
        [
          '📮  Schedule Application Follow-up',
          '',
          'Usage: /followup <company> [days|date]',
          'Examples:',
          '/followup Spark 3d',
          '/followup Datacom 1w',
          '/followup Acme Recruit 2026-09-30',
          '',
          '(っ•ᴗ•)っ Updates follow-up clock and includes in your morning briefing.',
        ].join('\n'),
        { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
      );
      return;
    }

    let matchedApp = null;
    let targetDate = '';

    for (let i = paramParts.length; i >= 1; i--) {
      const coCandidate = paramParts.slice(0, i).join(' ').toLowerCase();
      const found = apps.find(
        (a) =>
          (a.company && a.company.toLowerCase().includes(coCandidate)) ||
          (a.role && a.role.toLowerCase().includes(coCandidate))
      );
      if (found) {
        matchedApp = found;
        const rawDate = paramParts.slice(i).join(' ').trim();
        targetDate = parseDateOffsetOrString(rawDate) || dateStr(7);
        break;
      }
    }

    if (!matchedApp) {
      await sendTelegramImpl(`❌ No application found matching "${paramParts[0]}".`, { token, chatId });
      return;
    }

    if (updateApplication) {
      const updated = await updateApplication(
        matchedApp.id,
        (entry) => ({
          ...entry,
          followUpDue: targetDate,
          updated: Date.now(),
        }),
        'follow-up',
        `Follow-up scheduled for ${targetDate}`
      );

      if (updated) {
        await sendTelegramImpl(
          [
            '📮  Follow-up Scheduled!  ⏰',
            '',
            `🏢  Company: ${matchedApp.company}`,
            `📅  Follow-up Due: ${shortDate(targetDate)} (${whenLabel(targetDate)})`,
            '',
            '───────────────',
            '(っ•ᴗ•)っ I will remind you in your morning briefing when this is due!',
          ].join('\n'),
          { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
        );
      } else {
        await sendTelegramImpl(`❌ Could not update follow-up for ${matchedApp.company}.`, { token, chatId });
      }
    }
  } else if (cmd === '/email') {
    if (!param || !param.includes('|')) {
      await sendTelegramImpl(
        [
          '✉️  Log Email Correspondence (Rule 6)',
          '',
          'Usage:',
          '/email <Company> | <Sender> | <Subject> | <Body>',
          '',
          'Example:',
          '/email Acme Recruit | Sam Taylor <sam@acme-recruit.example.com> | Interview Invite | Hi Jordan, can you interview Thursday at 2 PM?',
          '',
          '( ◡‿◡ ) Records complete sender, timestamp, subject, and body into trackingNotes.',
        ].join('\n'),
        { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
      );
      return;
    }

    const parts = param.split('|').map((s) => s.trim());
    const companyQuery = parts[0];
    const sender = parts[1] || 'Employer';
    const subject = parts[2] || 'Correspondence';
    const body = parts.slice(3).join(' | ') || '';

    const matchedApp = apps.find(
      (a) =>
        (a.company && a.company.toLowerCase().includes(companyQuery.toLowerCase())) ||
        (a.role && a.role.toLowerCase().includes(companyQuery.toLowerCase()))
    );

    if (!matchedApp) {
      await sendTelegramImpl(`❌ No application found matching "${companyQuery}".`, { token, chatId });
      return;
    }

    const nowStr = new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' });
    const formattedEntry = [
      `--- [${nowStr} NZST] Email from: ${sender} ---`,
      `Subject: ${subject}`,
      'Body:',
      body,
    ].join('\n');

    let success = false;
    if (updateTrackingNotes) {
      const res = await updateTrackingNotes(
        matchedApp.id,
        formattedEntry,
        `Email from ${sender} (${matchedApp.company}): ${subject}`
      );
      success = Boolean(res);
    } else if (updateApplication) {
      const res = await updateApplication(
        matchedApp.id,
        (entry) => {
          const prevTracking = entry.trackingNotes ? `${entry.trackingNotes}\n\n` : '';
          const prevNotes = entry.notes ? `${entry.notes}\n\n` : '';
          return {
            ...entry,
            trackingNotes: `${prevTracking}${formattedEntry}`.trim(),
            notes: `${prevNotes}[${new Date().toLocaleDateString('en-NZ')} Email] ${subject}`.trim(),
            updated: Date.now(),
          };
        },
        'note',
        `Email logged for ${matchedApp.company}`
      );
      success = Boolean(res);
    }

    if (success) {
      await sendTelegramImpl(
        [
          '✉️  Email Correspondence Logged!  📝',
          '',
          `🏢  Company: ${matchedApp.company}`,
          `👤  From: ${sender}`,
          `📋  Subject: ${subject}`,
          '',
          '───────────────',
          '( ◡‿◡ ) Full email thread recorded into trackingNotes per Rule 6!',
          '(•̀ᴗ•́)و Complete communication history preserved.',
        ].join('\n'),
        { token, chatId, replyMarkup: MAIN_MENU_KEYBOARD }
      );
    } else {
      await sendTelegramImpl(`❌ Could not log email for ${matchedApp.company}.`, { token, chatId });
    }
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
      const replyMarkup = buildDisambiguationKeyboard('view_role', matches);
      const list = matches.slice(0, 8).map((m) => `  • ${m.company} — ${m.role} (${m.status})`);
      await sendTelegramImpl(
        [
          `Found ${matches.length} matches:`,
          list.join('\n'),
          '',
          '(っ•ᴗ•)っ Tap below to open full details:',
        ].join('\n'),
        { token, chatId, replyMarkup }
      );
    }
  } else if (cmd === '/prep') {
    if (!param) {
      await sendTelegramImpl('Please specify a company: /prep <company>', { token, chatId });
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
      await sendTelegramImpl(formatPrep(matches[0]), { token, chatId });
    } else {
      const replyMarkup = buildDisambiguationKeyboard('prep', matches);
      await sendTelegramImpl(
        [
          `🔍 Multiple Roles Found (${matches.length})`,
          '(っ•ᴗ•)っ Please tap which role prep notes you want:',
        ].join('\n'),
        { token, chatId, replyMarkup }
      );
    }
  } else if (cmd === '/fit' || cmd === '/fitcheck') {
    if (!param) {
      await sendTelegramImpl('Please specify a company: /fit <company>', { token, chatId });
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
      await sendTelegramImpl(formatFitAnalysis(matches[0]), { token, chatId });
    } else {
      const replyMarkup = buildDisambiguationKeyboard('fit', matches);
      await sendTelegramImpl(
        [
          `🔍 Multiple Roles Found (${matches.length})`,
          '(っ•ᴗ•)っ Please tap which role fit analysis you want:',
        ].join('\n'),
        { token, chatId, replyMarkup }
      );
    }
  } else if (cmd === '/cv' || cmd === '/doc') {
    if (!param) {
      await sendTelegramImpl('Please specify a company: /cv <company>', { token, chatId });
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
      return;
    }
    if (matches.length > 1) {
      const replyMarkup = buildDisambiguationKeyboard('get_cv', matches);
      await sendTelegramImpl(
        [
          `🔍 Multiple Roles Found (${matches.length})`,
          '(っ•ᴗ•)っ Please tap which role CV you want to receive:',
        ].join('\n'),
        { token, chatId, replyMarkup }
      );
      return;
    }
    const app = matches[0];
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
        const replyMarkup = {
          inline_keyboard: [
            [{ text: '⚡ Tailor CV Now', callback_data: `queue_cv:${app.id}` }],
          ],
        };
        await sendTelegramImpl(
          [
            `❌ No CV document found on disk yet for ${app.company}.`,
            '',
            '(っ•ᴗ•)っ Would you like to queue automated CV tailoring now?',
          ].join('\n'),
          { token, chatId, replyMarkup }
        );
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
          [
            `✅ Updated ${res.entry.company} — ${res.entry.role} to ${normalizedStatus}!`,
            '',
            '(•̀ᴗ•́)و Application stage updated and synced!',
          ].join('\n'),
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
        await sendTelegramImpl(
          [
            `📝 Note added to ${updated.company}:`,
            `"${noteText}"`,
            '',
            '( ◡‿◡ ) Saved to tracker history.',
          ].join('\n'),
          { token, chatId }
        );
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
        { command: 'today', description: '⏰ Due today & open tasks' },
        { command: 'briefing', description: '📻 Morning briefing + voice note' },
        { command: 'voice', description: '🎙️ Voice assistant & accents' },
        { command: 'pending', description: '📋 Active pipeline by stage' },
        { command: 'role', description: '🔎 Look up full role card & actions' },
        { command: 'cv', description: '📄 Send tailored CV PDF to chat' },
        { command: 'cl', description: '📝 Copy-paste Cover Letter text' },
        { command: 'clfile', description: '📝 Send tailored Cover Letter file to chat' },
        { command: 'cvgen', description: '⚡ Queue CV & cover letter generation' },
        { command: 'review', description: '🔍 Review a drafted CV & cover letter' },
        { command: 'task', description: '📌 Add action item (/task <co> <text> [due])' },
        { command: 'followup', description: '📮 Set follow-up date (/followup <co> [date])' },
        { command: 'email', description: '✉️ Log correspondence (/email <co> | ...)' },
        { command: 'status', description: '🔄 Move stage (app, int, off, rej)' },
        { command: 'prep', description: '🎤 Interview prep & talking points' },
        { command: 'reject', description: '📭 Log rejection & learning loop' },
        { command: 'note', description: '🗒️ Add a quick note to a role' },
        { command: 'add', description: '📥 Add job link or role with AI fit check' },
        { command: 'log', description: '📥 Log new role (/log <Co> — <Role>)' },
        { command: 'radar', description: '🛰️ Wellington & Remote active radar' },
        { command: 'jobs', description: '🔭 New SEEK roles worth a look' },
        { command: 'stats', description: '📊 Pipeline summary statistics' },
        { command: 'gmail', description: '📨 Sweep last 10 emails for updates' },
        { command: 'practice', description: '🎯 STAR story interview flashcards' },
        { command: 'quiz', description: '🧠 Technical multiple-choice quiz poll' },
        { command: 'ask', description: '💡 Ask AI Career Coach a question' },
        { command: 'sync', description: '🔄 Git sync tracker data on server' },
        { command: 'app', description: '📱 Open mobile web dashboard' },
        { command: 'help', description: '❓ Show all available commands' },
      ],
    },
    { token, fetchImpl, label: 'setMyCommands' }
  );
}

export function setChatMenuButton(token, fetchImpl, webAppUrl = getTelegramWebAppUrl()) {
  if (webAppUrl) {
    return telegramApi(
      'setChatMenuButton',
      {
        menu_button: {
          type: 'web_app',
          text: '📱 JobHQ',
          web_app: { url: `${webAppUrl}/miniapp` },
        },
      },
      { token, fetchImpl, label: 'setChatMenuButton' }
    );
  }
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
  findClFile,
  reviewApplication,
  isGmailFetchBusy,
  runGmailFetch,
  addTask,
  updateTrackingNotes,
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
            findClFile,
            reviewApplication,
            isGmailFetchBusy,
            runGmailFetch,
            addTask,
            updateTrackingNotes,
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
