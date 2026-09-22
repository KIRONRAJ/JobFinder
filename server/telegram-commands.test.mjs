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
  runGitSync,
} from './telegram-commands.js';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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
  const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'interview-bank-test-'));
  const bankPath = path.join(tmpDir, 'interview-bank.json');
  await fsPromises.writeFile(
    bankPath,
    JSON.stringify({
      questions: [
        {
          category: 'behavioural',
          question: 'Tell me about a time you fixed a production issue under pressure.',
          hints: ['Anchor on a specific incident, not a general description.'],
          answer: 'Situation, task, action, result — a concrete four-part example.',
        },
      ],
    }),
    'utf8'
  );

  const card = await getPracticeCard('behavioural', { bankPath });
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
  const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'quiz-bank-test-'));
  const quizPath = path.join(tmpDir, 'quiz-bank.json');
  await fsPromises.writeFile(
    quizPath,
    JSON.stringify([
      {
        category: 'linux',
        question: 'Which command lists running processes?',
        options: ['ps', 'cat', 'grep', 'chmod'],
        correctOptionId: 0,
        explanation: '"ps" reports the current process status.',
      },
    ]),
    'utf8'
  );

  const quiz = await getQuizQuestion('linux', { quizPath });
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
  await handleUpdate(
    { update_id: 10, message: { chat: { id: 12345 }, text: '/app' } },
    { getApplications: async () => [], token: 'T', chatId: '12345', sendTelegramImpl: impl }
  );

  assert.equal(calls.length, 1);
  assert.ok(calls[0].text.includes('Job Search HQ Mobile Dashboard'));
  assert.equal(calls[0].opts.replyMarkup.inline_keyboard[0][0].text, '🚀 Open JobSearchHQ Dashboard');
  assert.ok(calls[0].opts.replyMarkup.inline_keyboard[0][0].url.includes('5178'));
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

test('parseSeekHtml: correctly extracts advertiser, job title, and location', () => {
  const seekHtml = `
    <html>
      <head><title>Data Administrator/ Customer Service Representative  Job in Wellington Central, Wellington - SEEK</title></head>
      <body>
        <h1 data-automation="job-detail-title">Data Administrator / Customer Service Representative</h1>
        <span data-automation="advertiser-name">Bluecurrent</span>
        <span data-automation="job-detail-location">Wellington Central, Wellington</span>
      </body>
    </html>
  `;
  const parsed = parseSeekHtml(seekHtml, 'https://nz.seek.com/job/94417890?tracking=123');
  assert.equal(parsed.company, 'Bluecurrent');
  assert.equal(parsed.role, 'Data Administrator / Customer Service Representative');
  assert.equal(parsed.location, 'Wellington Central, Wellington');
  assert.equal(parsed.url, 'https://nz.seek.com/job/94417890');
});

test('isInvalidParsedJob: flags domain as company, numeric role, or empty values', () => {
  assert.equal(isInvalidParsedJob({ company: 'nz.seek.com', role: '94417890' }), true);
  assert.equal(isInvalidParsedJob({ company: 'seek.co.nz', role: 'Engineer' }), true);
  assert.equal(isInvalidParsedJob({ company: 'Bluecurrent', role: '94417890' }), true);
  assert.equal(isInvalidParsedJob({ company: 'Disclosed in Ad', role: 'Engineer' }), true);
  assert.equal(isInvalidParsedJob({ company: 'Bluecurrent', role: 'Captured Role' }), true);
  assert.equal(isInvalidParsedJob({ company: '', role: 'Engineer' }), true);
  assert.equal(isInvalidParsedJob(null), true);

  // Valid
  assert.equal(isInvalidParsedJob({ company: 'Bluecurrent', role: 'Data Administrator' }), false);
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
        text: '/log Bluecurrent — Data Administrator https://nz.seek.com/job/94417890?tracking=xyz',
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
    }
  );

  assert.ok(createdEntry);
  assert.equal(createdEntry.company, 'Bluecurrent');
  assert.equal(createdEntry.role, 'Data Administrator');
  assert.equal(createdEntry.link, 'https://nz.seek.com/job/94417890');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].text.includes('Manually Logged Role'));
  assert.ok(calls[0].text.includes('Bluecurrent'));
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




