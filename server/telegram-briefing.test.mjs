import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBriefing, startMorningBriefing, sendMorningBriefingNow } from './telegram-briefing.js';

test('formatBriefing: formats morning briefing with active deadlines and follow-ups', () => {
  const now = new Date('2026-09-04T08:30:00+12:00');
  const apps = [
    {
      status: 'interview',
      company: 'Spark',
      role: 'Call Investigator',
    },
    {
      status: 'applied',
      company: 'Bastion Security',
      role: 'SOC Analyst',
      deadline: '2026-09-04',
      followUpDue: '2026-09-04',
      tasks: [{ label: 'Send references', dueAt: '2026-09-04T10:00:00+12:00' }],
    },
    {
      status: 'rejected',
      company: 'Old Corp',
      role: 'Inactive',
    },
  ];

  const msg = formatBriefing(apps, now);
  assert.ok(msg.includes('Good morning'));
  assert.ok(msg.includes('Bastion Security'));
  assert.ok(msg.includes('CLOSES TODAY'));
  assert.ok(msg.includes('Spark'));
  assert.ok(msg.includes('Send references'));
  assert.ok(!msg.includes('Old Corp'));
});

test('formatBriefing: clean pipeline produces calm message', () => {
  const now = new Date('2026-09-04T08:30:00+12:00');
  const apps = [
    {
      status: 'applied',
      company: 'Acme',
      role: 'Developer',
    },
  ];

  const msg = formatBriefing(apps, now);
  assert.ok(msg.includes('Good morning'));
  assert.ok(msg.includes('No urgent deadlines or follow-ups due today. Pipeline is calm.'));
  assert.ok(msg.includes('1 applied'));
});

test('startMorningBriefing: sends text and spoken voice note on weekday morning', async () => {
  const sentTexts = [];
  const sentVoices = [];

  // Friday at 8:35 AM
  const weekdayMorning = new Date('2026-09-04T08:35:00+12:00');
  const dummyApps = [{ status: 'interview', company: 'Spark', role: 'Support' }];

  const runner = startMorningBriefing({
    getApplications: async () => dummyApps,
    token: 'fake-token',
    chatId: '12345',
    nowFn: () => weekdayMorning,
    sendTelegramImpl: async (msg, opts) => {
      sentTexts.push({ msg, opts });
    },
    sendVoiceImpl: async (filePath, opts) => {
      sentVoices.push({ filePath, opts });
    },
    getVoiceSettingImpl: async () => ({ voiceKey: 'prabhat', label: 'Prabhat (Indian Male)' }),
    synthesizeToOggOpusImpl: async (text, voiceKey) => ({
      filePath: '/tmp/test-briefing.ogg',
    }),
    checkIntervalMs: 999999,
  });

  try {
    await runner.initialCheck;

    assert.equal(sentTexts.length, 1);
    assert.ok(sentTexts[0].msg.includes('Spark'));
    assert.equal(sentVoices.length, 1);
    assert.equal(sentVoices[0].filePath, '/tmp/test-briefing.ogg');
    assert.ok(sentVoices[0].opts.caption.includes('Prabhat'));
  } finally {
    runner.stop();
  }
});

test('startMorningBriefing: delivers text even if spoken voice synthesis fails', async () => {
  const sentTexts = [];
  const sentVoices = [];

  const weekdayMorning = new Date('2026-09-04T08:35:00+12:00');
  const dummyApps = [{ status: 'interview', company: 'Spark', role: 'Support' }];

  const runner = startMorningBriefing({
    getApplications: async () => dummyApps,
    token: 'fake-token',
    chatId: '12345',
    nowFn: () => weekdayMorning,
    sendTelegramImpl: async (msg, opts) => {
      sentTexts.push({ msg, opts });
    },
    sendVoiceImpl: async (filePath, opts) => {
      sentVoices.push({ filePath, opts });
    },
    getVoiceSettingImpl: async () => ({ voiceKey: 'prabhat', label: 'Prabhat (Indian Male)' }),
    synthesizeToOggOpusImpl: async () => {
      throw new Error('TTS network offline');
    },
    checkIntervalMs: 999999,
  });

  try {
    await runner.initialCheck;

    assert.equal(sentTexts.length, 1);
    assert.equal(sentVoices.length, 0);
  } finally {
    runner.stop();
  }
});

test('startMorningBriefing: ignores weekends and outside 8:30-8:45 AM', async () => {
  const sentTexts = [];

  // Saturday morning (day 6)
  const saturday = new Date('2026-09-05T08:35:00+12:00');
  const runnerSat = startMorningBriefing({
    getApplications: async () => [],
    token: 'fake-token',
    chatId: '12345',
    nowFn: () => saturday,
    sendTelegramImpl: async (msg) => { sentTexts.push(msg); },
    checkIntervalMs: 999999,
  });
  await runnerSat.initialCheck;
  assert.equal(sentTexts.length, 0);
  runnerSat.stop();

  // Friday at 11:00 AM (wrong time)
  const fridayNoon = new Date('2026-09-04T11:00:00+12:00');
  const runnerNoon = startMorningBriefing({
    getApplications: async () => [],
    token: 'fake-token',
    chatId: '12345',
    nowFn: () => fridayNoon,
    sendTelegramImpl: async (msg) => { sentTexts.push(msg); },
    checkIntervalMs: 999999,
  });
  await runnerNoon.initialCheck;
  assert.equal(sentTexts.length, 0);
  runnerNoon.stop();
});

test('startMorningBriefing: does not set lastSentDate when sendTelegram fails so it can retry', async () => {
  let attemptCount = 0;
  const sentVoices = [];

  const weekdayMorning = new Date('2026-09-04T08:35:00+12:00');
  const dummyApps = [{ status: 'interview', company: 'Spark', role: 'Support' }];

  const runner = startMorningBriefing({
    getApplications: async () => dummyApps,
    token: 'fake-token',
    chatId: '12345',
    nowFn: () => weekdayMorning,
    sendTelegramImpl: async () => {
      attemptCount++;
      return { ok: false, error: 'fetch failed' };
    },
    sendVoiceImpl: async (filePath, opts) => {
      sentVoices.push({ filePath, opts });
    },
    getVoiceSettingImpl: async () => ({ voiceKey: 'prabhat', label: 'Prabhat (Indian Male)' }),
    synthesizeToOggOpusImpl: async () => ({ filePath: '/tmp/test.ogg' }),
    checkIntervalMs: 999999,
  });

  try {
    await runner.initialCheck;
    assert.equal(attemptCount, 1);
    assert.equal(sentVoices.length, 0);

    // Call checkAndSend again — it SHOULD attempt again because lastSentDate was not set!
    await runner.checkAndSend();
    assert.equal(attemptCount, 2);
  } finally {
    runner.stop();
  }
});

test('sendMorningBriefingNow: sends text and voice on demand', async () => {
  const sentTexts = [];
  const sentVoices = [];
  const dummyApps = [{ status: 'interview', company: 'Spark', role: 'Support' }];

  const res = await sendMorningBriefingNow({
    getApplications: async () => dummyApps,
    token: 'fake-token',
    chatId: '12345',
    sendTelegramImpl: async (msg, opts) => {
      sentTexts.push({ msg, opts });
      return { ok: true };
    },
    sendVoiceImpl: async (filePath, opts) => {
      sentVoices.push({ filePath, opts });
      return { ok: true };
    },
    getVoiceSettingImpl: async () => ({ voiceKey: 'prabhat', label: 'Prabhat (Indian Male)' }),
    synthesizeToOggOpusImpl: async () => ({ filePath: '/tmp/test.ogg' }),
  });

  assert.equal(res.ok, true);
  assert.equal(res.voiceSent, true);
  assert.equal(sentTexts.length, 1);
  assert.equal(sentVoices.length, 1);
});
