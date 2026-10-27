import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPending,
  formatToday,
  formatStats,
  formatRole,
  formatPrep,
  formatRadar,
  getPracticeCard,
  formatPracticeMessage,
  getQuizQuestion,
  updateLearningLoop,
  findCoverLetterText,
  sendTelegramChunked,
  isAuthorizedChat,
  handleUpdate,
  handleCallbackQuery,
  cleanJobUrl,
  parseSeekHtml,
  isInvalidParsedJob,
  parseJobFromUrl,
  analyzeJobWithAI,
  analyzeRoleFitWithoutListing,
  formatJobLoggedMessage,
  runGitSync,
  buildDisambiguationKeyboard,
  parseDateOffsetOrString,
  formatGmailFetchSummary,
  getTelegramWebAppUrl,
  buildMainMenuKeyboard,
  syncTelegramMenuButton,
  interpretVoiceMessage,
  formatFitAnalysis,
} from './telegram-commands.js';
import { verifyTelegramWebAppData } from './index.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function dateStr(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('formatPending: excludes rejected/withdrawn, groups by urgent-first status', () => {
  const apps = [
    { status: 'rejected', company: 'A', role: 'Rej Role' },
    { status: 'withdrawn', company: 'B', role: 'With Role' },
    { status: 'offer', company: 'C', role: 'Offer Role' },
    { status: 'researching', company: 'D', role: 'Research Role' },
    { status: 'applied', company: 'E', role: 'Applied Role' },
    { status: 'interview', company: 'F', role: 'Interview Role' },
  ];
  const msg = formatPending(apps);
  assert.ok(!msg.includes('Rej Role'));
  assert.ok(!msg.includes('With Role'));
  const interviewIdx = msg.indexOf('Interview Role');
  const offerIdx = msg.indexOf('Offer Role');
  const researchIdx = msg.indexOf('Research Role');
  const appliedIdx = msg.indexOf('Applied Role');
  assert.ok(interviewIdx < offerIdx);
  assert.ok(offerIdx < researchIdx);
  assert.ok(researchIdx < appliedIdx);
});

test('formatPending: empty pipeline replies with the clear message', () => {
  const apps = [{ status: 'rejected', company: 'A', role: 'R' }];
  assert.ok(formatPending(apps).includes("Pipeline's clear"));
  assert.ok(formatPending([]).includes("Pipeline's clear"));
});

test('formatPending: caps at 10 lines per status with an overflow tail', () => {
  const apps = Array.from({ length: 15 }, (_, i) => ({
    status: 'researching',
    company: `Company${i}`,
    role: 'Role',
  }));
  const msg = formatPending(apps);
  assert.ok(msg.includes('+5 more'));
  assert.ok(msg.includes('Company0'));
  assert.ok(!msg.includes('Company14'));
});

// Behaviour change (15 Sep 2026): an ad that closed weeks ago is no longer
// listed as "due" — 18 of them was how this message reached 7,094 chars and
// stopped sending. Only the next 7 days are listed; expired ones are counted.
test('formatToday: lists deadlines closing within a week, counts expired ones', () => {
  const apps = [
    { status: 'applied', company: 'A', role: 'ClosesToday', deadline: dateStr(0) },
    { status: 'applied', company: 'B', role: 'ClosesSoon', deadline: dateStr(3) },
    { status: 'applied', company: 'C', role: 'LongExpired', deadline: dateStr(-30) },
    { status: 'applied', company: 'D', role: 'FarFuture', deadline: dateStr(60) },
  ];
  const msg = formatToday(apps);
  assert.ok(msg.includes('ClosesToday'), 'today must be listed');
  assert.ok(msg.includes('ClosesSoon'), 'within a week must be listed');
  assert.ok(!msg.includes('LongExpired'), 'expired must not be listed');
  assert.ok(/1 closed ads? still open/.test(msg), 'expired must still be counted');
  assert.ok(!msg.includes('FarFuture'), 'beyond a week is not due today');
});

test('formatToday: a deadline on a rejected/withdrawn entry is excluded', () => {
  const apps = [{ status: 'rejected', company: 'A', role: 'Dead Role', deadline: dateStr(0) }];
  assert.ok(!formatToday(apps).includes('Dead Role'));
});

test('formatToday: followUpDue today or passed is included, future is not', () => {
  const apps = [
    { status: 'applied', company: 'A', role: 'FollowToday', followUpDue: dateStr(0) },
    { status: 'applied', company: 'B', role: 'FollowFuture', followUpDue: dateStr(2) },
  ];
  const msg = formatToday(apps);
  assert.ok(msg.includes('FollowToday'));
  assert.ok(!msg.includes('FollowFuture'));
});

test('formatToday: shows incomplete tasks, hides completed ones', () => {
  const apps = [
    {
      status: 'interview',
      company: 'A',
      role: 'R',
      tasks: [
        { id: '1', label: 'Record video', dueAt: `${dateStr(0)}T09:00:00+13:00` },
        { id: '2', label: 'Done already', dueAt: `${dateStr(0)}T09:00:00+13:00`, completedAt: `${dateStr(-1)}T09:00:00+13:00` },
      ],
    },
  ];
  const msg = formatToday(apps);
  assert.ok(msg.includes('Record video'));
  assert.ok(!msg.includes('Done already'));
});

test('formatToday: nothing due anywhere replies with the clear message', () => {
  const apps = [{ status: 'applied', company: 'A', role: 'R', deadline: dateStr(60) }];
  assert.ok(formatToday(apps).includes("Nothing due"));
  assert.ok(formatToday([]).includes("Nothing due"));
});

test('formatToday: combined digest has all three section headers when all three apply', () => {
  const apps = [
    { status: 'applied', company: 'A', role: 'R1', deadline: dateStr(2) },
    { status: 'applied', company: 'B', role: 'R2', followUpDue: dateStr(0) },
    {
      status: 'interview',
      company: 'C',
      role: 'R3',
      tasks: [{ id: '1', label: 'T', dueAt: `${dateStr(0)}T09:00:00+13:00` }],
    },
  ];
  const msg = formatToday(apps);
  assert.ok(msg.includes('CLOSING'));
  assert.ok(msg.includes('FOLLOW UP'));
  assert.ok(msg.includes('TASKS'));
  assert.ok(msg.length < 4096, 'must fit in a single Telegram message');
});

test('formatStats: calculates breakdown and response rate', () => {
  const apps = [
    { status: 'researching' },
    { status: 'applied' },
    { status: 'interview' },
    { status: 'rejected' },
  ];
  const stats = formatStats(apps);
  assert.ok(stats.includes('Researching · 1'));
  assert.ok(stats.includes('Applied · 1'));
  assert.ok(stats.includes('Interview · 1'));
  assert.ok(stats.includes('Rejected · 1'));
  assert.ok(stats.includes('Response rate ~67%'));
});

test('formatRole: formats role card with action buttons', () => {
  const app = {
    id: 'app_123',
    company: 'Bastion Security Group',
    role: 'Junior SOC Analyst',
    status: 'interview',
    fit: 'strong-apply',
  };
  const { text, replyMarkup } = formatRole(app);
  assert.ok(text.includes('Bastion Security Group'));
  assert.ok(text.includes('Junior SOC Analyst'));
  assert.ok(text.includes('🟢 Interview'));
  assert.ok(replyMarkup.inline_keyboard.length >= 2);
  assert.equal(replyMarkup.inline_keyboard[0][0].text, '📄 Get CV');
});

test('formatPrep: formats prep notes when available', () => {
  const app = {
    company: 'Datacom',
    role: 'Security Support',
    interview: {
      rounds: [{ label: 'Round 1', date: '2026-09-10' }],
      talkingPoints: ['Linux troubleshooting experience', 'CCNA coursework'],
    },
  };
  const prep = formatPrep(app);
  assert.ok(prep.includes('Datacom'));
  assert.ok(prep.includes('Linux troubleshooting experience'));
});

test('formatFitAnalysis: formats structured analysis breakdown', () => {
  const app = {
    company: 'Spark NZ',
    role: 'Cyber Security Analyst',
    fit: 'strong',
    analysis: {
      at: Date.now(),
      recommendation: {
        verdict: 'apply',
        reasoning: 'Direct alignment with L2 network troubleshooting and SIEM monitoring.',
      },
      score: {
        overall: 88,
        keywordMatch: 85,
        technicalMatch: 90,
        experienceMatch: 80,
        industryMatch: 85,
        parsingRisk: 'low',
      },
      ats: {
        matched: ['SIEM incident response', 'Linux network administration'],
        missing: ['AWS Security certification'],
      },
      gap: {
        positioning: 'Emphasize 24/7 ISP NOC triage and Master of Information Security with Merit.',
      },
    },
  };
  const msg = formatFitAnalysis(app);
  assert.ok(msg.includes('FIT ANALYSIS · Spark NZ'));
  assert.ok(msg.includes('Cyber Security Analyst'));
  assert.ok(msg.includes('🟢 *APPLY*'));
  assert.ok(msg.includes('88/100'));
  assert.ok(msg.includes('Direct alignment with L2 network troubleshooting'));
  assert.ok(msg.includes('Keywords: 85%'));
  assert.ok(msg.includes('Tech: 90%'));
  assert.ok(msg.includes('SIEM incident response'));
  assert.ok(msg.includes('AWS Security certification'));
  assert.ok(msg.includes('Emphasize 24/7 ISP NOC triage'));
});

test('formatFitAnalysis: handles missing analysis gracefully with guidance', () => {
  const appWithoutAd = { company: 'Xero', role: 'Support Specialist' };
  const msg1 = formatFitAnalysis(appWithoutAd);
  assert.ok(msg1.includes('FIT ANALYSIS · Xero'));
  assert.ok(msg1.includes('No deep fit analysis generated yet'));
  assert.ok(msg1.includes('Paste the job link in chat'));

  const appWithAd = { company: 'Xero', role: 'Support Specialist', jobText: 'Sample ad text' };
  const msg2 = formatFitAnalysis(appWithAd);
  assert.ok(msg2.includes('Ad text is saved'));
});

test('isAuthorizedChat: matches when chat id equals configured id', () => {
  assert.equal(isAuthorizedChat('12345', '12345'), true);
  assert.equal(isAuthorizedChat(12345, '12345'), true);
  assert.equal(isAuthorizedChat('99999', '12345'), false);
  assert.equal(isAuthorizedChat('12345', ''), false);
});

// Telegram transport stub. Every handler under test answers a callback query
// or sends a message; without this they would reach api.telegram.org for real.
const noNetFetch = async () => ({ ok: true, json: async () => ({ ok: true, result: {} }) });

function fakeSender() {
  const calls = [];
  const impl = async (text, opts) => {
    calls.push({ text, opts });
  };
  return { impl, calls };
}

test('handleUpdate: unauthorized chat gets no reply', async () => {
  const { impl, calls } = fakeSender();
  await handleUpdate(
    { update_id: 1, message: { chat: { id: 999 }, text: '/pending' } },
    { getApplications: async () => [], token: 'T', chatId: '12345', sendTelegramImpl: impl }
  );
  assert.equal(calls.length, 0);
});

test('handleUpdate: authorized /pending sends formatPending output', async () => {
  const { impl, calls } = fakeSender();
  const apps = [{ status: 'researching', company: 'Acme', role: 'Engineer' }];
  await handleUpdate(
    { update_id: 1, message: { chat: { id: 12345 }, text: '/pending' } },
    { getApplications: async () => apps, token: 'T', chatId: '12345', sendTelegramImpl: impl }
  );
  assert.equal(calls.length, 1);
  assert.ok(calls[0].text.includes('Acme'));
  assert.equal(calls[0].opts.token, 'T');
  assert.equal(calls[0].opts.chatId, '12345');
});

test('handleUpdate: authorized /today sends formatToday output', async () => {
  const { impl, calls } = fakeSender();
  await handleUpdate(
    { update_id: 1, message: { chat: { id: 12345 }, text: '/today' } },
    { getApplications: async () => [], token: 'T', chatId: '12345', sendTelegramImpl: impl }
  );
  assert.equal(calls.length, 1);
  assert.ok(calls[0].text.includes('Nothing due'));
});

test('handleUpdate: authorized /stats sends pipeline statistics', async () => {
  const { impl, calls } = fakeSender();
  const apps = [{ status: 'applied', company: 'A', role: 'R' }];
  await handleUpdate(
    { update_id: 1, message: { chat: { id: 12345 }, text: '/stats' } },
    { getApplications: async () => apps, token: 'T', chatId: '12345', sendTelegramImpl: impl }
  );
  assert.equal(calls.length, 1);
  assert.ok(calls[0].text.includes('STATS'));
});

test('handleUpdate: /role looks up and returns role card', async () => {
  const { impl, calls } = fakeSender();
  const apps = [{ id: 'app_1', status: 'interview', company: 'Spark', role: 'Investigator' }];
  await handleUpdate(
    { update_id: 1, message: { chat: { id: 12345 }, text: '/role Spark' } },
    { getApplications: async () => apps, token: 'T', chatId: '12345', sendTelegramImpl: impl }
  );
  assert.equal(calls.length, 1);
  assert.ok(calls[0].text.includes('Spark'));
  assert.ok(calls[0].opts.replyMarkup !== undefined);
});

// /status must go through setApplicationStatus, not the generic mutator: only
// that path runs applyStatusChange, which is what moves the company folder to
// match the new status. Asserting on the handler used is the point of the test.
test('handleUpdate: /status routes through setApplicationStatus', async () => {
  const { impl, calls } = fakeSender();
  const apps = [{ id: 'app_1', status: 'applied', company: 'Datacom', role: 'Support' }];
  let called = null;
  const setStatus = async (id, status) => {
    called = { id, status };
    return { ok: true, entry: { ...apps[0], status }, prevStatus: 'applied' };
  };
  await handleUpdate(
    { update_id: 1, message: { chat: { id: 12345 }, text: '/status Datacom interview' } },
    {
      getApplications: async () => apps,
      setApplicationStatus: setStatus,
      // Present but must NOT be used for a status change.
      updateApplication: async () => {
        throw new Error('status changes must not use the generic mutator');
      },
      token: 'T',
      chatId: '12345',
      sendTelegramImpl: impl,
    }
  );
  assert.deepEqual(called, { id: 'app_1', status: 'interview' });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].text.includes('Updated'));
});

test('handleCallbackQuery: status button routes through setApplicationStatus', async () => {
  const { impl, calls } = fakeSender();
  let called = null;
  await handleCallbackQuery(
    { id: 'q1', from: { id: 12345 }, data: 'status:app_1:applied' },
    {
      token: 'T',
      chatId: '12345',
      setApplicationStatus: async (id, status) => {
        called = { id, status };
        return { ok: true, entry: { company: 'Datacom', role: 'Support', status } };
      },
      sendTelegramImpl: impl,
      execFileImpl: (_c, _a, _o, cb) => cb(null, '{"ok":true}'),
      fetchImpl: noNetFetch,
    }
  );
  assert.deepEqual(called, { id: 'app_1', status: 'applied' });
  assert.ok(calls.some((c) => c.text.includes('Updated status')));
});

test('handleCallbackQuery: status button rejects a status outside the enum', async () => {
  const { impl, calls } = fakeSender();
  let called = false;
  await handleCallbackQuery(
    { id: 'q1', from: { id: 12345 }, data: 'status:app_1:banana' },
    {
      token: 'T',
      chatId: '12345',
      setApplicationStatus: async () => {
        called = true;
        return { ok: false, invalidStatus: true };
      },
      sendTelegramImpl: impl,
      execFileImpl: (_c, _a, _o, cb) => cb(null, '{"ok":true}'),
      fetchImpl: noNetFetch,
    }
  );
  assert.equal(called, true, 'handler is still consulted; it owns the enum gate');
  assert.ok(calls.some((c) => c.text.includes('unknown status')));
});

test('handleCallbackQuery: processes queue_cv callback', async () => {
  const { impl, calls } = fakeSender();
  let queuedId = null;
  const queueCv = async (id) => {
    queuedId = id;
    return { company: 'Bastion', role: 'SOC' };
  };

  await handleCallbackQuery(
    {
      id: 'query_1',
      from: { id: 12345 },
      data: 'queue_cv:app_123',
    },
    {
      token: 'T',
      chatId: '12345',
      queueCvRequest: queueCv,
      sendTelegramImpl: impl,
      fetchImpl: noNetFetch,
      execFileImpl: (_cmd, _args, _opts, cb) => {
        const fn = typeof _opts === 'function' ? _opts : cb;
        if (fn) fn(null, '');
      },
    }
  );

  assert.equal(queuedId, 'app_123');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].text.includes('Queued CV & cover letter'));
});

test('handleCallbackQuery: processes task_done callback', async () => {
  const { impl, calls } = fakeSender();
  let updatedTask = false;
  const updateApp = async (id, mutator) => {
    const entry = mutator({ tasks: [{ id: 'task_1', completedAt: null }] });
    if (entry.tasks[0].completedAt) updatedTask = true;
    return { company: 'Spark' };
  };

  await handleCallbackQuery(
    {
      id: 'query_2',
      from: { id: 12345 },
      data: 'task_done:app_123:task_1',
    },
    {
      token: 'T',
      chatId: '12345',
      updateApplication: updateApp,
      sendTelegramImpl: impl,
      fetchImpl: noNetFetch,
      execFileImpl: (_cmd, _args, _opts, cb) => {
        const fn = typeof _opts === 'function' ? _opts : cb;
        if (fn) fn(null, '');
      },
    }
  );

  assert.equal(updatedTask, true);
  assert.ok(calls[0].text.includes('Task marked done'));
});

test('formatRadar: highlights Wellington and Remote active roles', () => {
  const apps = [
    { status: 'interview', company: 'WgtnCo', role: 'SOC', location: 'Wellington' },
    { status: 'researching', company: 'RemoteCo', role: 'Analyst', location: 'Remote', fit: 'strong' },
    { status: 'applied', company: 'AucklandCo', role: 'Desk', location: 'Auckland' },
  ];
  const msg = formatRadar(apps);
  assert.ok(msg.includes('RADAR'));
  assert.ok(msg.includes('WgtnCo'));
  assert.ok(msg.includes('RemoteCo'));
  assert.ok(!msg.includes('AucklandCo'), 'non-local roles are excluded');
});

test('getPracticeCard and formatPracticeMessage: picks a question and formats buttons', async () => {
  const card = await getPracticeCard('behavioural');
  assert.ok(card);
  assert.ok(card.question);
  const { text, replyMarkup } = formatPracticeMessage(card);
  assert.ok(text.includes('STAR Interview Flashcard'));
  assert.ok(text.includes(card.question));
  assert.equal(replyMarkup.inline_keyboard[0][0].text, '💡 Show Hint');
  assert.equal(replyMarkup.inline_keyboard[0][1].text, '📖 Reveal STAR Story');
  assert.equal(replyMarkup.inline_keyboard[1][0].text, '➡️ Next Question');
});

test('getQuizQuestion: returns question from quiz bank', async () => {
  const quiz = await getQuizQuestion('linux');
  assert.ok(quiz);
  assert.ok(quiz.question);
  assert.ok(Array.isArray(quiz.options));
  assert.ok(typeof quiz.correctOptionId === 'number');
  assert.ok(quiz.explanation);
});

test('updateLearningLoop: increments count and stores rejection note', async () => {
  const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'learning-loop-test-'));
  const tmpFile = path.join(tmpDir, 'learning-loop.json');
  await fsPromises.writeFile(
    tmpFile,
    JSON.stringify({ rejectionCount: 5, sourceIds: ['app_1'], signalStrength: { highSignal: [], noSignal: [] } }),
    'utf8'
  );

  const res = await updateLearningLoop(
    { company: 'Spark', role: 'NOC', appId: 'app_2', reason: 'Needs 5 yrs exp' },
    { learningLoopFile: tmpFile }
  );

  assert.equal(res.success, true);
  assert.equal(res.rejectionCount, 6);

  const updatedRaw = await fsPromises.readFile(tmpFile, 'utf8');
  const updatedData = JSON.parse(updatedRaw);
  assert.equal(updatedData.rejectionCount, 6);
  assert.ok(updatedData.sourceIds.includes('app_2'));
  assert.ok(updatedData.signalStrength.noSignal[0].includes('Spark — NOC'));
  assert.ok(updatedData.signalStrength.noSignal[0].includes('Needs 5 yrs exp'));
});

test('handleUpdate: /app sends dashboard web button', async () => {
  const { impl, calls } = fakeSender();
  const tunnelFile = path.resolve(__dirname, '../data/tunnel-url.txt');
  let savedTunnel = null;
  if (fs.existsSync(tunnelFile)) {
    savedTunnel = fs.readFileSync(tunnelFile, 'utf8');
    fs.unlinkSync(tunnelFile);
  }
  try {
    await handleUpdate(
      { update_id: 10, message: { chat: { id: 12345 }, text: '/app' } },
      { getApplications: async () => [], token: 'T', chatId: '12345', sendTelegramImpl: impl }
    );

    assert.equal(calls.length, 1);
    assert.ok(calls[0].text.includes('Job Search HQ Mobile Dashboard'));
    assert.equal(calls[0].opts.replyMarkup.inline_keyboard[0][0].text, '🚀 Open JobSearchHQ Dashboard');
    assert.ok(calls[0].opts.replyMarkup.inline_keyboard[0][0].url.includes('5178'));
  } finally {
    if (savedTunnel !== null) {
      fs.writeFileSync(tunnelFile, savedTunnel, 'utf8');
    }
  }
});

test('handleUpdate: /radar sends Wellington & Remote digest', async () => {
  const { impl, calls } = fakeSender();
  const apps = [
    { company: 'Datacom', role: 'Support', status: 'interview', location: 'Wellington, NZ' },
  ];
  await handleUpdate(
    { update_id: 11, message: { chat: { id: 12345 }, text: '/radar' } },
    { getApplications: async () => apps, token: 'T', chatId: '12345', sendTelegramImpl: impl }
  );

  assert.equal(calls.length, 1);
  assert.ok(calls[0].text.includes('RADAR'));
  assert.ok(calls[0].text.includes('Datacom'));
});

test('handleUpdate: /reject marks application as rejected', async () => {
  const { impl, calls } = fakeSender();
  const apps = [{ id: 'app_spark', company: 'Spark', role: 'L1 Support', status: 'applied' }];
  let statusSet = null;
  const updateApp = async (id, mutator) => {
    const res = mutator(apps[0]);
    statusSet = res.status;
    return res;
  };

  const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'learning-loop-test-reject-'));
  const tmpFile = path.join(tmpDir, 'learning-loop.json');
  await fsPromises.writeFile(tmpFile, JSON.stringify({ rejectionCount: 10, sourceIds: [] }), 'utf8');

  await handleUpdate(
    { update_id: 12, message: { chat: { id: 12345 }, text: '/reject spark salary below threshold' } },
    {
      getApplications: async () => apps,
      updateApplication: updateApp,
      learningLoopFile: tmpFile,
      token: 'T',
      chatId: '12345',
      sendTelegramImpl: impl,
    }
  );

  assert.equal(statusSet, 'rejected');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].text.includes('Marked Spark — L1 Support as Rejected'));
  assert.ok(calls[0].text.includes('salary below threshold'));
});

test('handleCallbackQuery: handles practice_hint and practice_ans', async () => {
  const { impl, calls } = fakeSender();

  await handleCallbackQuery(
    { id: 'q_hint_1', from: { id: 12345 }, data: 'practice_hint:q_tell_me_about_yourself' },
    {
      token: 'T',
      chatId: '12345',
      sendTelegramImpl: impl,
      fetchImpl: noNetFetch,
      execFileImpl: (_cmd, _args, _opts, cb) => {
        const fn = typeof _opts === 'function' ? _opts : cb;
        if (fn) fn(null, '');
      },
    }
  );

  assert.equal(calls.length, 1);
  assert.ok(calls[0].text.includes('Hints for "Tell me about yourself."'));

  await handleCallbackQuery(
    { id: 'q_ans_1', from: { id: 12345 }, data: 'practice_ans:q_tell_me_about_yourself' },
    {
      token: 'T',
      chatId: '12345',
      sendTelegramImpl: impl,
      fetchImpl: noNetFetch,
      execFileImpl: (_cmd, _args, _opts, cb) => {
        const fn = typeof _opts === 'function' ? _opts : cb;
        if (fn) fn(null, '');
      },
    }
  );

  assert.equal(calls.length, 2);
  assert.ok(calls[1].text.includes('Model STAR Answer'));
});

test('cleanJobUrl: strips query tracking parameters and hashes', () => {
  assert.equal(
    cleanJobUrl('https://nz.seek.com/job/94417890?tracking=SHR-IOS-SharedJob-anz-2#section'),
    'https://nz.seek.com/job/94417890'
  );
  assert.equal(
    cleanJobUrl('https://www.linkedin.com/jobs/view/123456?refId=xyz&trackingId=abc'),
    'https://www.linkedin.com/jobs/view/123456'
  );
  assert.equal(cleanJobUrl('not a url'), 'not a url');
});

test('cleanJobUrl: rewrites www.seek.co.nz and seek.co.nz to nz.seek.com', () => {
  assert.equal(
    cleanJobUrl('https://www.seek.co.nz/job/94417890?tracking=123'),
    'https://nz.seek.com/job/94417890'
  );
  assert.equal(
    cleanJobUrl('https://seek.co.nz/job/94417890#details'),
    'https://nz.seek.com/job/94417890'
  );
});

test('parseSeekHtml: correctly extracts advertiser, job title, and location', () => {
  const seekHtml = `
    <html>
      <head><title>Data Administrator/ Customer Service Representative  Job in Wellington Central, Wellington - SEEK</title></head>
      <body>
        <h1 data-automation="job-detail-title">Data Administrator / Customer Service Representative</h1>
        <span data-automation="advertiser-name">Acme Energy</span>
        <span data-automation="job-detail-location">Wellington Central, Wellington</span>
      </body>
    </html>
  `;
  const parsed = parseSeekHtml(seekHtml, 'https://nz.seek.com/job/94417890?tracking=123');
  assert.equal(parsed.company, 'Acme Energy');
  assert.equal(parsed.role, 'Data Administrator / Customer Service Representative');
  assert.equal(parsed.location, 'Wellington Central, Wellington');
  assert.equal(parsed.url, 'https://nz.seek.com/job/94417890');
});

test('parseSeekHtml: extracts company, role, and location from window.SEEK_REDUX_DATA', () => {
  const reduxPayload = {
    jobdetails: {
      result: {
        job: {
          title: 'Cyber Security Operations Analyst',
          advertiser: { name: 'Ministry of Justice' },
          location: { label: 'Wellington Central, Wellington' },
          content: '<div>Full ad details here...</div>',
        },
      },
    },
  };
  const html = `<html><head><script>window.SEEK_REDUX_DATA = ${JSON.stringify(reduxPayload)};</script></head><body>Fallbacks</body></html>`;
  const parsed = parseSeekHtml(html, 'https://www.seek.co.nz/job/123456');
  assert.equal(parsed.company, 'Ministry of Justice');
  assert.equal(parsed.role, 'Cyber Security Operations Analyst');
  assert.equal(parsed.location, 'Wellington Central, Wellington');
  assert.equal(parsed.url, 'https://nz.seek.com/job/123456');
});

test('isInvalidParsedJob: flags domain as company, numeric role, or empty values', () => {
  assert.equal(isInvalidParsedJob({ company: 'nz.seek.com', role: '94417890' }), true);
  assert.equal(isInvalidParsedJob({ company: 'seek.co.nz', role: 'Engineer' }), true);
  assert.equal(isInvalidParsedJob({ company: 'Acme Energy', role: '94417890' }), true);
  assert.equal(isInvalidParsedJob({ company: 'Disclosed in Ad', role: 'Engineer' }), true);
  assert.equal(isInvalidParsedJob({ company: 'Acme Energy', role: 'Captured Role' }), true);
  assert.equal(isInvalidParsedJob({ company: '', role: 'Engineer' }), true);
  assert.equal(isInvalidParsedJob(null), true);

  // Valid
  assert.equal(isInvalidParsedJob({ company: 'Acme Energy', role: 'Data Administrator' }), false);
});

test('handleUpdate: invalid parsed job rejects without calling createApplication', async () => {
  const { impl, calls } = fakeSender();
  let created = false;

  await handleUpdate(
    {
      update_id: 13,
      message: {
        chat: { id: 12345 },
        text: 'https://example.com/blocked-job',
      },
    },
    {
      getApplications: async () => [],
      createApplication: async () => {
        created = true;
        return { entry: {} };
      },
      token: 'T',
      chatId: '12345',
      sendTelegramImpl: impl,
      fetchImpl: noNetFetch,
      execFileImpl: (_cmd, _args, _opts, cb) => {
        const fn = typeof _opts === 'function' ? _opts : cb;
        // Mock curl returning 403 / empty html
        if (fn) fn(new Error('curl 403'), '');
      },
    }
  );

  assert.equal(created, false);
  assert.equal(calls.length, 2); // 1: Fetching..., 2: Warning with /log
  assert.ok(calls[1].text.includes('Could not automatically detect'));
  assert.ok(calls[1].text.includes('/log <Company> — <Role>'));
});

test('handleUpdate: /log manually creates entry cleanly', async () => {
  const { impl, calls } = fakeSender();
  let createdEntry = null;

  await handleUpdate(
    {
      update_id: 14,
      message: {
        chat: { id: 12345 },
        text: '/log Acme Energy — Data Administrator https://nz.seek.com/job/94417890?tracking=xyz',
      },
    },
    {
      getApplications: async () => [],
      createApplication: async (data) => {
        createdEntry = { ...data, id: 'app_new_123' };
        return { existing: false, entry: createdEntry };
      },
      token: 'T',
      chatId: '12345',
      sendTelegramImpl: impl,
      fetchImpl: noNetFetch,
      apiKey: '',
      execFileImpl: (_cmd, _args, _opts, cb) => {
        const fn = typeof _opts === 'function' ? _opts : cb;
        if (fn) fn(new Error('no curl'), '');
      },
    }
  );

  assert.ok(createdEntry);
  assert.equal(createdEntry.company, 'Acme Energy');
  assert.equal(createdEntry.role, 'Data Administrator');
  assert.equal(createdEntry.link, 'https://nz.seek.com/job/94417890');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].text.includes('Manually Logged Role'));
  assert.ok(calls[0].text.includes('Acme Energy'));
});

test('analyzeJobWithAI: extracts rich fields and fit check from job text', async () => {
  const mockGeminiData = {
    company: 'Datacom',
    role: 'Cyber Security Operations Analyst',
    location: 'Wellington, NZ',
    roleType: 'SOC Analyst',
    employment: 'job',
    workArrangement: 'hybrid',
    salary: '$75,000 - $85,000',
    deadline: '2026-10-25',
    source: 'Seek',
    fit: 'strong',
    fitReason: {
      strengths: 'Direct alignment with L2 NOC monitoring and Linux server troubleshooting.',
      gaps: 'Splunk experience preferred.',
      recommendation: 'Highlight 24/7 rota and incident triage experience.',
    },
    tags: ['SOC', 'Wellington', 'Datacom', 'Hybrid'],
    notes: '24/7 SOC role responsible for alert triage and incident escalation.',
  };

  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(mockGeminiData) }] } }],
    }),
  });

  const res = await analyzeJobWithAI('Sample job text with more than twenty characters for testing', 'https://nz.seek.com/job/123', {
    apiKey: 'test-api-key',
    fetchImpl: mockFetch,
  });

  assert.ok(res);
  assert.equal(res.company, 'Datacom');
  assert.equal(res.role, 'Cyber Security Operations Analyst');
  assert.equal(res.roleType, 'SOC Analyst');
  assert.equal(res.fit, 'strong');
  assert.equal(res.salary, '$75,000 - $85,000');
  assert.equal(res.deadline, '2026-10-25');
  assert.equal(res.workArrangement, 'hybrid');
  assert.deepEqual(res.tags, ['SOC', 'Wellington', 'Datacom', 'Hybrid']);
  assert.ok(res.fitReason.strengths.includes('L2 NOC'));
});

test('analyzeRoleFitWithoutListing: evaluates role title fit against candidate background', async () => {
  const mockGeminiData = {
    roleType: 'SOC Analyst',
    fit: 'strong',
    fitReason: {
      strengths: 'L2 NOC experience is directly transferable.',
      gaps: 'None noted.',
      recommendation: 'Emphasize network monitoring and incident escalation.',
    },
    tags: ['SOC', 'Analyst'],
    notes: 'Strong match based on NOC and Linux background.',
  };

  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(mockGeminiData) }] } }],
    }),
  });

  const res = await analyzeRoleFitWithoutListing('Datacom', 'SOC Analyst', {
    apiKey: 'test-api-key',
    fetchImpl: mockFetch,
  });

  assert.equal(res.roleType, 'SOC Analyst');
  assert.equal(res.fit, 'strong');
  assert.ok(res.fitReason);
  assert.deepEqual(res.tags, ['SOC', 'Analyst']);
});

test('handleUpdate: /add <url> auto-fetches ad, runs AI fit check, and persists rich fields', async () => {
  const { impl, calls } = fakeSender();
  let createdEntry = null;

  const mockGeminiData = {
    company: 'Spark NZ',
    role: 'Security Analyst',
    location: 'Wellington, NZ',
    roleType: 'SOC Analyst',
    employment: 'job',
    workArrangement: 'hybrid',
    salary: '$80,000',
    deadline: '2026-11-01',
    source: 'Seek',
    fit: 'strong',
    fitReason: {
      strengths: 'Master of IT in Cyber Security with Merit matches role requirements.',
      gaps: 'Requires familiarity with QRadar.',
      recommendation: 'Position L2 ISP network troubleshooting background.',
    },
    tags: ['Security', 'Wellington', 'Spark'],
    notes: 'Handles tier 1 and tier 2 security event triage.',
  };

  const mockFetch = async (url) => {
    if (String(url).includes('generateContent')) {
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(mockGeminiData) }] } }],
        }),
      };
    }
    return { ok: true, json: async () => ({ ok: true, result: {} }) };
  };

  const mockHtml = '<html><head><title>Security Analyst at Spark NZ</title></head><body>We are hiring a Security Analyst in Wellington for Spark NZ. Responsibilities include SIEM monitoring and incident response.</body></html>';

  const tmpCareerDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'career-test-'));
  try {
    await handleUpdate(
      {
        update_id: 15,
        message: {
          chat: { id: 12345 },
          text: '/add https://nz.seek.com/job/99999999',
        },
      },
      {
        getApplications: async () => [],
        createApplication: async (data) => {
          createdEntry = { ...data, id: 'app_spark_123' };
          return { existing: false, entry: createdEntry };
        },
        token: 'T',
        chatId: '12345',
        careerDir: tmpCareerDir,
        sendTelegramImpl: impl,
        fetchImpl: mockFetch,
        apiKey: 'test-api-key',
        execFileImpl: (_cmd, _args, _opts, cb) => {
          const fn = typeof _opts === 'function' ? _opts : cb;
          if (fn) fn(null, mockHtml);
        },
      }
    );

    assert.ok(createdEntry, 'Application should be created');
    assert.equal(createdEntry.company, 'Spark NZ');

    const savedAd = await fsPromises.readFile(
      path.join(tmpCareerDir, 'Pending to Apply', 'Spark NZ', 'Job Ad - Security Analyst.txt'),
      'utf8'
    );
    assert.ok(savedAd.includes('Spark NZ — Security Analyst'));
  } finally {
    await fsPromises.rm(tmpCareerDir, { recursive: true, force: true });
  }
  assert.equal(createdEntry.role, 'Security Analyst');
  assert.equal(createdEntry.fit, 'strong');
  assert.equal(createdEntry.roleType, 'SOC Analyst');
  assert.equal(createdEntry.salary, '$80,000');
  assert.equal(createdEntry.deadline, '2026-11-01');
  assert.deepEqual(createdEntry.tags, ['Security', 'Wellington', 'Spark']);

  // Check calls: call 0 is "Fetching...", call 1 is the formatted card
  assert.equal(calls.length, 2);
  assert.ok(calls[0].text.includes('Fetching and analyzing job ad'));
  const confirmationText = calls[1].text;
  assert.ok(confirmationText.includes('Spark NZ'));
  assert.ok(confirmationText.includes('Security Analyst'));
  assert.ok(confirmationText.includes('🟢 *Strong*'));
  assert.ok(confirmationText.includes('Salary: $80,000'));
  assert.ok(confirmationText.includes('Closes: 2026-11-01'));
  assert.ok(confirmationText.includes('AI Fit Check:'));
  assert.ok(confirmationText.includes('Strengths:'));
  assert.ok(confirmationText.includes('Watch-outs:'));
  assert.ok(confirmationText.includes('Strategy:'));
  assert.ok(confirmationText.includes('#Security'));
});

test('handleUpdate: raw job url paste triggers AI analysis and rich confirmation', async () => {
  const { impl, calls } = fakeSender();
  let createdEntry = null;

  const mockGeminiData = {
    company: 'Xero',
    role: 'IT Security Specialist',
    location: 'Wellington, NZ',
    roleType: 'IT Security Support',
    employment: 'job',
    workArrangement: 'onsite',
    salary: '$85,000',
    deadline: '2026-10-31',
    source: 'Seek',
    fit: 'good',
    fitReason: {
      strengths: 'Strong Linux systems and network administration skills.',
      gaps: 'Prefers 3 years corporate IT security experience.',
      recommendation: 'Highlight Cascade server support and RHCSA credential.',
    },
    tags: ['Xero', 'ITSecurity', 'Wellington'],
    notes: 'Internal IT security operations and access management.',
  };

  const mockFetch = async (url) => {
    if (String(url).includes('generateContent')) {
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(mockGeminiData) }] } }],
        }),
      };
    }
    return { ok: true, json: async () => ({ ok: true, result: {} }) };
  };

  const mockHtml = '<html><head><title>IT Security Specialist - Xero</title></head><body>Join Xero as an IT Security Specialist in Wellington. We are looking for someone to maintain internal security operations, monitor identity access, and support incident response.</body></html>';

  const tmpCareerDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'career-test-'));
  try {
    await handleUpdate(
      {
        update_id: 16,
        message: {
          chat: { id: 12345 },
          text: 'https://nz.seek.com/job/88888888',
        },
      },
      {
        getApplications: async () => [],
        createApplication: async (data) => {
          createdEntry = { ...data, id: 'app_xero_456' };
          return { existing: false, entry: createdEntry };
        },
        token: 'T',
        chatId: '12345',
        careerDir: tmpCareerDir,
        sendTelegramImpl: impl,
        fetchImpl: mockFetch,
        apiKey: 'test-api-key',
        execFileImpl: (_cmd, _args, _opts, cb) => {
          const fn = typeof _opts === 'function' ? _opts : cb;
          if (fn) fn(null, mockHtml);
        },
      }
    );
  } finally {
    await fsPromises.rm(tmpCareerDir, { recursive: true, force: true });
  }

  assert.ok(createdEntry);
  assert.equal(createdEntry.company, 'Xero');
  assert.equal(createdEntry.fit, 'good');
  assert.equal(createdEntry.roleType, 'IT Security Support');
  assert.equal(createdEntry.salary, '$85,000');
  assert.equal(calls.length, 2);
  assert.ok(calls[1].text.includes('Xero'));
  assert.ok(calls[1].text.includes('🟡 *Good*'));
});

test('handleUpdate: /add Company — Role performs title-only fit check', async () => {
  const { impl, calls } = fakeSender();
  let createdEntry = null;

  const mockGeminiData = {
    roleType: 'GRC',
    fit: 'good',
    fitReason: {
      strengths: 'Cybersecurity Master degree covers compliance and privacy law.',
      gaps: 'Less direct audit experience than dedicated GRC consultants.',
      recommendation: 'Highlight academic knowledge of NIST and NZISM frameworks.',
    },
    tags: ['GRC', 'Compliance'],
    notes: 'GRC role title matches security governance knowledge.',
  };

  const mockFetch = async (url) => {
    if (String(url).includes('generateContent')) {
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(mockGeminiData) }] } }],
        }),
      };
    }
    return { ok: true, json: async () => ({ ok: true, result: {} }) };
  };

  await handleUpdate(
    {
      update_id: 17,
      message: {
        chat: { id: 12345 },
        text: '/add Deloitte — Cyber Risk Analyst',
      },
    },
    {
      getApplications: async () => [],
      createApplication: async (data) => {
        createdEntry = { ...data, id: 'app_deloitte_789' };
        return { existing: false, entry: createdEntry };
      },
      token: 'T',
      chatId: '12345',
      sendTelegramImpl: impl,
      fetchImpl: mockFetch,
      apiKey: 'test-api-key',
      execFileImpl: (_cmd, _args, _opts, cb) => {
        const fn = typeof _opts === 'function' ? _opts : cb;
        if (fn) fn(new Error('no curl'), '');
      },
    }
  );

  assert.ok(createdEntry);
  assert.equal(createdEntry.company, 'Deloitte');
  assert.equal(createdEntry.role, 'Cyber Risk Analyst');
  assert.equal(createdEntry.fit, 'good');
  assert.equal(createdEntry.roleType, 'GRC');
  assert.deepEqual(createdEntry.tags, ['GRC', 'Compliance']);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].text.includes('Deloitte'));
  assert.ok(calls[0].text.includes('AI Fit Check:'));
  assert.ok(calls[0].text.includes('Cyber Risk Analyst'));
});

test('runGitSync: stages, commits if changed, pulls with rebase, and pushes', async () => {
  const gitCommands = [];
  const mockExecFile = (cmd, args, opts, cb) => {
    gitCommands.push({ cmd, args });
    if (args[0] === 'diff') {
      return cb(null, 'App/data/applications.json\nPending to Apply/Test/CV.pdf\n', '');
    }
    return cb(null, 'ok', '');
  };

  const res = await runGitSync({ careerDir: '/mock/dir', execFileImpl: mockExecFile });
  assert.equal(res.ok, true);
  assert.equal(res.committed, true);
  assert.equal(res.filesCount, 2);
  assert.deepEqual(gitCommands.map((c) => c.args[0]), ['add', 'diff', 'commit', 'pull', 'push']);
});

test('handleUpdate: /sync calls runGitSync and replies with success', async () => {
  const calls = [];
  const impl = async (text, opts) => calls.push({ text, opts });

  const mockExecFile = (cmd, args, opts, cb) => {
    if (args[0] === 'diff') {
      return cb(null, '', ''); // nothing changed
    }
    return cb(null, 'ok', '');
  };

  await handleUpdate(
    {
      update_id: 15,
      message: {
        chat: { id: 12345 },
        text: '/sync',
      },
    },
    {
      getApplications: async () => [],
      token: 'T',
      chatId: '12345',
      sendTelegramImpl: impl,
      execFileImpl: mockExecFile,
    }
  );

  assert.equal(calls.length, 2);
  assert.ok(calls[0].text.includes('Running Git sync'));
  assert.ok(calls[1].text.includes('Git sync complete'));
  assert.ok(calls[1].text.includes('already fully up to date'));
});

test('handleUpdate: /gmail without runGmailFetch warns not configured', async () => {
  const calls = [];
  const impl = async (text, opts) => calls.push({ text, opts });

  await handleUpdate(
    { update_id: 16, message: { chat: { id: 12345 }, text: '/gmail' } },
    { getApplications: async () => [], token: 'T', chatId: '12345', sendTelegramImpl: impl }
  );

  assert.equal(calls.length, 1);
  assert.ok(calls[0].text.includes('not configured'));
});

test('handleUpdate: /gmail when isGmailFetchBusy is true warns busy', async () => {
  const calls = [];
  const impl = async (text, opts) => calls.push({ text, opts });

  await handleUpdate(
    { update_id: 17, message: { chat: { id: 12345 }, text: '/gmail' } },
    {
      getApplications: async () => [],
      token: 'T',
      chatId: '12345',
      sendTelegramImpl: impl,
      isGmailFetchBusy: () => true,
      runGmailFetch: async () => ({ ok: true }),
    }
  );

  assert.equal(calls.length, 1);
  assert.ok(calls[0].text.includes('already in progress'));
});

test('handleUpdate: /gmail triggers runGmailFetch with default count 10 and sends completion', async () => {
  const calls = [];
  const impl = async (text, opts) => calls.push({ text, opts });
  let fetchArg = null;

  const fakeRunGmailFetch = async (opts) => {
    fetchArg = opts;
    return {
      ok: true,
      count: 10,
      summary: '1 email matched: Datacom rejection logged.',
    };
  };

  await handleUpdate(
    { update_id: 18, message: { chat: { id: 12345 }, text: '/gmail' } },
    {
      getApplications: async () => [],
      token: 'T',
      chatId: '12345',
      sendTelegramImpl: impl,
      runGmailFetch: fakeRunGmailFetch,
    }
  );

  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(fetchArg.count, 10);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].text.includes('Checking your last 10 emails'));
  assert.ok(calls[1].text.includes('Gmail Fetch Complete'));
  assert.ok(calls[1].text.includes('Datacom rejection logged'));
});

test('handleUpdate: /gmail 5 passes count 5 to runGmailFetch', async () => {
  const calls = [];
  const impl = async (text, opts) => calls.push({ text, opts });
  let fetchArg = null;

  const fakeRunGmailFetch = async (opts) => {
    fetchArg = opts;
    return { ok: true, count: opts.count, summary: 'Nothing new.' };
  };

  await handleUpdate(
    { update_id: 19, message: { chat: { id: 12345 }, text: '/gmail 5' } },
    {
      getApplications: async () => [],
      token: 'T',
      chatId: '12345',
      sendTelegramImpl: impl,
      runGmailFetch: fakeRunGmailFetch,
    }
  );

  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(fetchArg.count, 5);
  assert.ok(calls[0].text.includes('Checking your last 5 emails'));
});

test('handleUpdate: keyboard button "📨 Gmail Fetch" triggers /gmail', async () => {
  const calls = [];
  const impl = async (text, opts) => calls.push({ text, opts });
  let fetchCalled = false;

  const fakeRunGmailFetch = async () => {
    fetchCalled = true;
    return { ok: true, count: 10, summary: 'Clean sweep.' };
  };

  await handleUpdate(
    { update_id: 20, message: { chat: { id: 12345 }, text: '📨 Gmail Fetch' } },
    {
      getApplications: async () => [],
      token: 'T',
      chatId: '12345',
      sendTelegramImpl: impl,
      runGmailFetch: fakeRunGmailFetch,
    }
  );

  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(fetchCalled, true);
  assert.ok(calls[0].text.includes('Checking your last 10 emails'));
});

test('parseDateOffsetOrString: correctly parses relative and absolute dates', () => {
  assert.equal(parseDateOffsetOrString('today'), dateStr(0));
  assert.equal(parseDateOffsetOrString('tomorrow'), dateStr(1));
  assert.equal(parseDateOffsetOrString('3d'), dateStr(3));
  assert.equal(parseDateOffsetOrString('1w'), dateStr(7));
  assert.equal(parseDateOffsetOrString('2026-10-15'), '2026-10-15');
  assert.equal(parseDateOffsetOrString('invalid'), null);
});

test('buildDisambiguationKeyboard: formats inline buttons for multiple matches', () => {
  const matches = [
    { id: '1', company: 'Spark NZ', role: 'Cloud Engineer', status: 'applied' },
    { id: '2', company: 'Spark Services', role: 'Support Analyst', status: 'interview' },
  ];
  const markup = buildDisambiguationKeyboard('view_role', matches);
  assert.equal(markup.inline_keyboard.length, 2);
  assert.equal(markup.inline_keyboard[0][0].callback_data, 'view_role:1');
  assert.equal(markup.inline_keyboard[1][0].callback_data, 'view_role:2');
});

test('handleUpdate: /cvgen queues CV tailoring request', async () => {
  const calls = [];
  const impl = async (text, opts) => calls.push({ text, opts });
  let queuedId = null;

  const apps = [{ id: 'app_spark', company: 'Spark', role: 'Engineer', status: 'researching' }];

  await handleUpdate(
    { update_id: 21, message: { chat: { id: 12345 }, text: '/cvgen Spark' } },
    {
      getApplications: async () => apps,
      token: 'T',
      chatId: '12345',
      sendTelegramImpl: impl,
      queueCvRequest: async (id) => {
        queuedId = id;
        return apps[0];
      },
    }
  );

  assert.equal(queuedId, 'app_spark');
  assert.ok(calls[0].text.includes('CV Tailoring Queued'));
});

test('handleUpdate: /task adds task to application', async () => {
  const calls = [];
  const impl = async (text, opts) => calls.push({ text, opts });
  let addedTask = null;

  const apps = [{ id: 'app_spark', company: 'Spark', role: 'Engineer', status: 'applied', tasks: [] }];

  await handleUpdate(
    { update_id: 22, message: { chat: { id: 12345 }, text: '/task Spark Call recruiter Sarah tomorrow' } },
    {
      getApplications: async () => apps,
      token: 'T',
      chatId: '12345',
      sendTelegramImpl: impl,
      addTask: async (id, label, dueAt) => {
        addedTask = { id, label, dueAt };
        return { entry: apps[0], task: { id: 'task_1', label, dueAt } };
      },
    }
  );

  assert.ok(addedTask);
  assert.equal(addedTask.id, 'app_spark');
  assert.equal(addedTask.label, 'Call recruiter Sarah');
  assert.equal(addedTask.dueAt, dateStr(1));
  assert.ok(calls[0].text.includes('Task Added to Tracker'));
});

test('handleUpdate: /followup schedules next follow-up date', async () => {
  const calls = [];
  const impl = async (text, opts) => calls.push({ text, opts });
  let updatedEntry = null;

  const apps = [{ id: 'app_datacom', company: 'Datacom', role: 'Systems Engineer', status: 'applied' }];

  await handleUpdate(
    { update_id: 23, message: { chat: { id: 12345 }, text: '/followup Datacom 5d' } },
    {
      getApplications: async () => apps,
      token: 'T',
      chatId: '12345',
      sendTelegramImpl: impl,
      updateApplication: async (id, mutator) => {
        updatedEntry = mutator({ ...apps[0] });
        return updatedEntry;
      },
    }
  );

  assert.ok(updatedEntry);
  assert.equal(updatedEntry.followUpDue, dateStr(5));
  assert.ok(calls[0].text.includes('Follow-up Scheduled'));
});

test('handleUpdate: /email logs correspondence into trackingNotes per Rule 6', async () => {
  const calls = [];
  const impl = async (text, opts) => calls.push({ text, opts });
  let savedNotes = null;

  const apps = [{ id: 'app_layer9', company: 'Acme Recruit', role: 'Security Consultant', status: 'applied' }];

  await handleUpdate(
    {
      update_id: 24,
      message: {
        chat: { id: 12345 },
        text: '/email Acme Recruit | Sam Taylor <sam@acme-recruit.example.com> | Interview Schedule | Hi Jordan, please join us on Thursday.',
      },
    },
    {
      getApplications: async () => apps,
      token: 'T',
      chatId: '12345',
      sendTelegramImpl: impl,
      updateTrackingNotes: async (id, text) => {
        savedNotes = { id, text };
        return apps[0];
      },
    }
  );

  assert.ok(savedNotes);
  assert.equal(savedNotes.id, 'app_layer9');
  assert.ok(savedNotes.text.includes('Sam Taylor <sam@acme-recruit.example.com>'));
  assert.ok(savedNotes.text.includes('Interview Schedule'));
  assert.ok(calls[0].text.includes('Email Correspondence Logged'));
});

test('handleUpdate: multi-match /role returns disambiguation keyboard', async () => {
  const calls = [];
  const impl = async (text, opts) => calls.push({ text, opts });

  const apps = [
    { id: '1', company: 'Spark NZ', role: 'Cloud Engineer', status: 'applied' },
    { id: '2', company: 'Spark Digital', role: 'Support Analyst', status: 'interview' },
  ];

  await handleUpdate(
    { update_id: 25, message: { chat: { id: 12345 }, text: '/role Spark' } },
    {
      getApplications: async () => apps,
      token: 'T',
      chatId: '12345',
      sendTelegramImpl: impl,
    }
  );

  assert.ok(calls[0].text.includes('Found 2 matches'));
  assert.ok(calls[0].opts.replyMarkup.inline_keyboard.length === 2);
  assert.equal(calls[0].opts.replyMarkup.inline_keyboard[0][0].callback_data, 'view_role:1');
});

test('handleCallbackQuery: view_role renders role card', async () => {
  const calls = [];
  const impl = async (text, opts) => calls.push({ text, opts });

  const apps = [{ id: 'app_1', company: 'Spark', role: 'Engineer', status: 'applied' }];

  await handleCallbackQuery(
    {
      id: 'q_1',
      from: { id: 12345 },
      data: 'view_role:app_1',
    },
    {
      getApplications: async () => apps,
      token: 'T',
      chatId: '12345',
      sendTelegramImpl: impl,
    }
  );

  assert.ok(calls.length > 0);
  assert.ok(calls[0].text.includes('Spark'));
  assert.ok(calls[0].text.includes('Engineer'));
});

test('handleUpdate: keyboard button "📌 Tasks" triggers /today', async () => {
  const calls = [];
  const impl = async (text, opts) => calls.push({ text, opts });

  await handleUpdate(
    { update_id: 26, message: { chat: { id: 12345 }, text: '📌 Tasks' } },
    {
      getApplications: async () => [],
      token: 'T',
      chatId: '12345',
      sendTelegramImpl: impl,
    }
  );

  assert.ok(calls[0].text.includes("TODAY"));
});

test('formatGmailFetchSummary: formats user rejection case with divider, quotes, vertical spacing, and summary bullets', () => {
  const raw = `Found one job-related email: an RBNZ rejection. Let me check the tracker for that entry.
Already logged as \`status: "rejected"\` — nothing new to update. No need to touch this entry.
Nothing needed logging or updating. Summary:
- Matched, nothing new: Reserve Bank of New Zealand — Intern Analyst rejection email received, but the application is already logged as \`rejected\` in the tracker.
- 9 of 10 emails weren't job-related (bank notices, Amazon delivery updates, marketing).
No writes made to applications.json or audit-log.jsonl.`;

  const formatted = formatGmailFetchSummary(raw, 10);

  assert.ok(formatted.includes('📨 Gmail Fetch Complete (last 10 emails):'));
  assert.ok(formatted.includes('───────────────'));
  assert.ok(formatted.includes('Found one job-related email:'));
  assert.ok(formatted.includes('1. An RBNZ rejection. Let me check the tracker for that entry.'));
  assert.ok(formatted.includes('> Already logged as `status: "rejected"` — nothing new to update. No need to touch this entry.'));
  assert.ok(formatted.includes('> Nothing needed logging or updating.'));
  assert.ok(formatted.includes('Summary:'));
  assert.ok(formatted.includes('• Matched, nothing new: Reserve Bank of New Zealand'));
  assert.ok(formatted.includes('• 9 of 10 emails weren\'t job-related'));
  assert.ok(formatted.includes('No writes made to applications.json or audit-log.jsonl.'));
  assert.ok(formatted.includes('(•̀ᴗ•́)و Inbox swept and tracker up to date!'));
});

test('formatGmailFetchSummary: formats multiple matched emails with numbering and quotes', () => {
  const raw = `Found 2 job-related emails:
1. Xero — Graduate Engineer
Received interview invitation for 28 Sep. Updated status to interview.
2. Datacom — Junior Developer
Application acknowledgement. Already logged.
Summary:
- Matched & updated: Xero — status set to interview.
- Matched, nothing new: Datacom — acknowledgement received.
- 8 of 10 emails weren't job-related.
Updated applications.json and audit-log.jsonl.`;

  const formatted = formatGmailFetchSummary(raw, 10);

  assert.ok(formatted.includes('1. Xero — Graduate Engineer'));
  assert.ok(formatted.includes('> Received interview invitation for 28 Sep. Updated status to interview.'));
  assert.ok(formatted.includes('2. Datacom — Junior Developer'));
  assert.ok(formatted.includes('> Application acknowledgement. Already logged.'));
  assert.ok(formatted.includes('Summary:'));
  assert.ok(formatted.includes('• Matched & updated: Xero'));
  assert.ok(formatted.includes('• Matched, nothing new: Datacom'));
});

test('formatGmailFetchSummary: handles clean slate when no job updates found', () => {
  const formatted = formatGmailFetchSummary('No job updates found in the checked emails.', 10);

  assert.ok(formatted.includes('📨 Gmail Fetch Complete (last 10 emails):'));
  assert.ok(formatted.includes('───────────────'));
  assert.ok(formatted.includes('✅ No job updates found in the checked emails.'));
  assert.ok(formatted.includes('( ◡‿◡ ) All clear! 10 of 10 emails were unrelated'));
  assert.ok(formatted.includes('No writes made to applications.json or audit-log.jsonl.'));
  assert.ok(formatted.includes('(•̀ᴗ•́)و Mailbox is clean and tracker is up to date!'));
});

test('verifyTelegramWebAppData: validates genuine Telegram HMAC signature and user ID', () => {
  const botToken = '123456:TEST_BOT_TOKEN_XYZ';
  const chatId = '100000001';
  const authDate = Math.floor(Date.now() / 1000);
  const userJson = JSON.stringify({ id: 100000001, first_name: 'Jordan' });

  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  params.set('query_id', 'TEST_QUERY_123');
  params.set('user', userJson);

  const items = [];
  for (const [k, v] of params.entries()) items.push(`${k}=${v}`);
  items.sort();
  const dataCheckString = items.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);

  const initDataString = params.toString();
  const result = verifyTelegramWebAppData(initDataString, botToken, chatId);

  assert.equal(result.ok, true);
  assert.equal(result.user?.id, 100000001);
  assert.equal(result.user?.first_name, 'Jordan');
});

test('verifyTelegramWebAppData: rejects tampered data or mismatched hash', () => {
  const botToken = '123456:TEST_BOT_TOKEN_XYZ';
  const chatId = '100000001';

  const badData = 'auth_date=1626425533&query_id=ABC&user=%7B%22id%22%3A100000001%7D&hash=invalid_hash_value';
  const result = verifyTelegramWebAppData(badData, botToken, chatId);

  assert.equal(result.ok, false);
  assert.ok(result.error?.includes('Invalid HMAC'));
});

test('verifyTelegramWebAppData: rejects unauthorized Telegram user ID', () => {
  const botToken = '123456:TEST_BOT_TOKEN_XYZ';
  const authorizedChatId = '100000001';
  const authDate = Math.floor(Date.now() / 1000);
  const attackerUser = JSON.stringify({ id: 999999999, first_name: 'Attacker' });

  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  params.set('user', attackerUser);

  const items = [];
  for (const [k, v] of params.entries()) items.push(`${k}=${v}`);
  items.sort();
  const dataCheckString = items.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);

  const result = verifyTelegramWebAppData(params.toString(), botToken, authorizedChatId);

  assert.equal(result.ok, false);
  assert.ok(result.error?.includes('Unauthorized Telegram user ID'));
});

test('buildMainMenuKeyboard: includes WebApp button when webAppUrl is present', () => {
  const keyboardWithApp = buildMainMenuKeyboard('https://test.trycloudflare.com');
  assert.ok(keyboardWithApp.keyboard[0][0].web_app);
  assert.equal(keyboardWithApp.keyboard[0][0].web_app.url, 'https://test.trycloudflare.com/miniapp');

  const keyboardWithoutApp = buildMainMenuKeyboard(null);
  assert.equal(keyboardWithoutApp.keyboard[0][0].web_app, undefined);
});

test('handleUpdate: /app offers Mini App button when webAppUrl is present', async () => {
  const calls = [];
  const impl = async (text, opts) => calls.push({ text, opts });

  process.env.JOBHQ_HTTPS_URL = 'https://mini.test.domain';

  await handleUpdate(
    { update_id: 30, message: { chat: { id: 12345 }, text: '/app' } },
    {
      getApplications: async () => [],
      token: 'T',
      chatId: '12345',
      sendTelegramImpl: impl,
    }
  );

  delete process.env.JOBHQ_HTTPS_URL;

  assert.equal(calls.length, 1);
  assert.ok(calls[0].text.includes('Mini App'));
  const btn = calls[0].opts.replyMarkup.inline_keyboard[0][0];
  assert.equal(btn.text, '📱 Launch Telegram Mini App');
  assert.equal(btn.web_app.url, 'https://mini.test.domain/miniapp');
});


test('handleCallbackQuery: review-question buttons from an unknown id or unauthorised user do nothing', async () => {
  const { impl, calls } = fakeSender();
  const base = { token: 'T', chatId: '12345', sendTelegramImpl: impl, execFileImpl: (_c, _a, _o, cb) => cb(null, '{"ok":true}'), fetchImpl: noNetFetch };
  await handleCallbackQuery({ id: 'q', from: { id: 12345 }, data: 'rq:zzzzzz:y' }, base);
  await handleCallbackQuery({ id: 'q', from: { id: 999 }, data: 'rq:zzzzzz:y' }, base);
  await handleCallbackQuery({ id: 'q', from: { id: 12345 }, data: 'rqu:zzzzzz' }, base);
  assert.equal(calls.length, 0);
});

test('handleCallbackQuery: review button starts a review via reviewApplication', async () => {
  const { impl, calls } = fakeSender();
  let ref = null;
  await handleCallbackQuery(
    { id: 'q', from: { id: 12345 }, data: 'review:app_9' },
    { token: 'T', chatId: '12345', reviewApplication: async (r) => { ref = r; return { company: 'Fujitsu', role: 'Tech' }; }, sendTelegramImpl: impl, fetchImpl: noNetFetch }
  );
  assert.equal(ref, 'app_9');
  assert.ok(calls.some((c) => c.text.includes('Reviewing Fujitsu')));
});

test('/review: several drafted matches give a choice keyboard; one match starts directly; none says so', async () => {
  const apps = [
    { id: 'a1', company: 'Fujitsu', role: 'Tech', status: 'researching', folderPath: 'P/F', cvStatus: 'drafted' },
    { id: 'a2', company: 'Fujitsu', role: 'Analyst', status: 'researching', folderPath: 'P/F', cvStatus: 'drafted' },
    { id: 'a3', company: 'Spark', role: 'NOC', status: 'researching', folderPath: 'P/S', cvStatus: 'drafted' },
  ];
  const run = async (text) => {
    const { impl, calls } = fakeSender();
    const started = [];
    await handleUpdate({ update_id: 1, message: { chat: { id: 12345 }, text } }, {
      token: 'T', chatId: '12345', getApplications: async () => apps, sendTelegramImpl: impl, fetchImpl: noNetFetch,
      reviewApplication: async (id) => { started.push(id); return apps.find((a) => a.id === id); },
    });
    return { calls, started };
  };
  const multi = await run('/review fujitsu');
  assert.equal(multi.started.length, 0);
  assert.deepEqual(multi.calls[0].opts.replyMarkup.inline_keyboard.map((r) => r[0].callback_data), ['review:a1', 'review:a2']);
  const one = await run('/review spark');
  assert.deepEqual(one.started, ['a3']);
  const none = await run('/review nobody');
  assert.match(none.calls[0].text, /No drafted CV/);
});

test('interpretVoiceMessage: graceful fallback when apiKey is missing', async () => {
  const res = await interpretVoiceMessage('fake-path.ogg', { apiKey: '' });
  assert.equal(res.intent, 'general');
  assert.match(res.replyText, /GEMINI_API_KEY is not configured/);
});

test('handleCallbackQuery: get_cl_file sends the cover letter document', async () => {
  const { impl: sendTelegramImpl } = fakeSender();
  const docCalls = [];
  const sendDocImpl = async (filePath, opts) => {
    docCalls.push({ filePath, opts });
    return { ok: true };
  };

  await handleCallbackQuery(
    { id: 'cb1', from: { id: 12345 }, data: 'get_cl_file:app_spark' },
    {
      token: 'T',
      chatId: '12345',
      findClFile: async (id) => ({
        path: '/mock/career/Pending to Apply/Spark/Cover Letter - Spark - Network Engineer.pdf',
        entry: { company: 'Spark', role: 'Network Engineer' },
      }),
      sendTelegramImpl,
      sendDocImpl,
      fetchImpl: noNetFetch,
    }
  );

  assert.equal(docCalls.length, 1);
  assert.ok(docCalls[0].filePath.includes('Cover Letter - Spark'));
  assert.ok(docCalls[0].opts.caption.includes('Cover Letter for Spark — Network Engineer'));
});

test('/clfile: sends cover letter document when role found', async () => {
  const apps = [
    { id: 'app_spark', company: 'Spark', role: 'Network Engineer', status: 'researching' },
  ];
  const { impl: sendTelegramImpl } = fakeSender();
  const docCalls = [];
  const sendDocImpl = async (filePath, opts) => {
    docCalls.push({ filePath, opts });
    return { ok: true };
  };

  await handleUpdate(
    { update_id: 1, message: { chat: { id: 12345 }, text: '/clfile spark' } },
    {
      token: 'T',
      chatId: '12345',
      getApplications: async () => apps,
      findClFile: async (id) => ({
        path: '/mock/career/Pending to Apply/Spark/Cover Letter - Spark - Network Engineer.pdf',
        entry: apps[0],
      }),
      sendTelegramImpl,
      sendDocImpl,
      fetchImpl: noNetFetch,
    }
  );

  assert.equal(docCalls.length, 1);
  assert.ok(docCalls[0].opts.caption.includes('Spark — Network Engineer'));
});

test('handleCallbackQuery: fit:<id> sends formatted fit analysis', async () => {
  const apps = [
    {
      id: 'app_test_1',
      company: 'Datacom',
      role: 'Cloud Security Analyst',
      fit: 'strong',
      analysis: {
        recommendation: { verdict: 'apply', reasoning: 'AWS and Linux security match.' },
        score: { overall: 85 },
      },
    },
  ];
  const { impl: sendTelegramImpl, calls } = fakeSender();

  await handleCallbackQuery(
    { id: 'cb_fit', from: { id: 12345 }, data: 'fit:app_test_1' },
    {
      token: 'T',
      chatId: '12345',
      getApplications: async () => apps,
      sendTelegramImpl,
      fetchImpl: noNetFetch,
    }
  );

  assert.equal(calls.length, 1);
  assert.ok(calls[0].text.includes('FIT ANALYSIS · Datacom'));
  assert.ok(calls[0].text.includes('85/100'));
});

test('handleUpdate: /fit <company> sends fit analysis card', async () => {
  const apps = [
    {
      id: 'app_spark_9',
      company: 'Spark NZ',
      role: 'SOC Analyst',
      fit: 'strong',
      analysis: {
        recommendation: { verdict: 'apply', reasoning: 'SIEM and networking background.' },
        score: { overall: 90 },
      },
    },
  ];
  const { impl: sendTelegramImpl, calls } = fakeSender();

  await handleUpdate(
    { update_id: 1, message: { chat: { id: 12345 }, text: '/fit spark' } },
    {
      token: 'T',
      chatId: '12345',
      getApplications: async () => apps,
      sendTelegramImpl,
      fetchImpl: noNetFetch,
    }
  );

  assert.equal(calls.length, 1);
  assert.ok(calls[0].text.includes('FIT ANALYSIS · Spark NZ'));
  assert.ok(calls[0].text.includes('SOC Analyst'));
  assert.ok(calls[0].text.includes('90/100'));
});

test('verifyTelegramWebAppData: fails closed without an owner chat id or a user', () => {
  const botToken = '123456:TEST_BOT_TOKEN_XYZ';
  const sign = (fields) => {
    const params = new URLSearchParams(fields);
    const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    params.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
    return params.toString();
  };
  const authDate = String(Math.floor(Date.now() / 1000));
  const withUser = sign({ auth_date: authDate, user: JSON.stringify({ id: 7 }) });
  assert.equal(verifyTelegramWebAppData(withUser, botToken, undefined).ok, false, 'no TELEGRAM_CHAT_ID');
  assert.equal(verifyTelegramWebAppData(sign({ auth_date: authDate }), botToken, '7').ok, false, 'no user field');
  assert.equal(verifyTelegramWebAppData(withUser, botToken, '7').ok, true);
});
