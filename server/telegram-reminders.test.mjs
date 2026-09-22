import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatNZDateTime,
  formatEventReminderMessage,
  checkEventReminders,
} from './telegram-reminders.js';

test('formatNZDateTime formats correctly in Pacific/Auckland', () => {
  const dt = new Date('2026-09-17T17:00:00+12:00');
  const res = formatNZDateTime(dt);
  assert.equal(res.isoDate, '2026-09-17');
  assert.ok(res.dateStr.includes('17 September 2026'));
  assert.ok(res.timeStr.includes('5:00'));
});

test('formatEventReminderMessage creates appropriate text for day, 1h, and 10m', () => {
  const event = {
    id: 'evt_test',
    title: 'Summer of Tech ONLINE Meet & Greet',
    start: '2026-09-17T17:00:00+12:00',
    end: '2026-09-17T19:00:00+12:00',
    location: 'Online Livestream',
    url: 'https://example.com/sot',
    notes: 'Meet Acme Corp and Example Industries',
  };

  const dayMsg = formatEventReminderMessage(event, 'day');
  assert.ok(dayMsg.includes('EVENT TODAY'));
  assert.ok(dayMsg.includes('Summer of Tech ONLINE Meet & Greet'));
  assert.ok(dayMsg.includes('https://example.com/sot'));

  const oneHourMsg = formatEventReminderMessage(event, '1h');
  assert.ok(oneHourMsg.includes('1-HOUR REMINDER'));
  assert.ok(oneHourMsg.includes('60 minutes'));

  const tenMinMsg = formatEventReminderMessage(event, '10m');
  assert.ok(tenMinMsg.includes('10-MINUTE ALERT'));
  assert.ok(tenMinMsg.includes('10 minutes'));
});

test('checkEventReminders sends day-of reminder when date matches and not yet sent', async () => {
  const event = {
    id: 'evt_test_day',
    title: 'Summer of Tech ONLINE Meet & Greet',
    start: '2026-09-17T17:00:00+12:00',
    end: '2026-09-17T19:00:00+12:00',
  };

  const sentMessages = [];
  const sentMap = {};
  const mockSend = async (msg) => {
    sentMessages.push(msg);
  };

  // Set "now" to 2026-09-17 09:00 AM NZST (day of event, 8h before start)
  const simulatedNow = new Date('2026-09-17T09:00:00+12:00');

  const { sentCount } = await checkEventReminders({
    eventsStore: { items: [event] },
    sentReminders: sentMap,
    sendTelegramImpl: mockSend,
    token: 'fake-token',
    chatId: 'fake-chat',
    now: simulatedNow,
  });

  assert.equal(sentCount, 1);
  assert.equal(sentMessages.length, 1);
  assert.ok(sentMessages[0].includes('EVENT TODAY'));
  assert.ok(sentMap['evt_test_day:day'] > 0);

  // Calling again at 10:00 AM does NOT duplicate
  const { sentCount: secondRun } = await checkEventReminders({
    eventsStore: { items: [event] },
    sentReminders: sentMap,
    sendTelegramImpl: mockSend,
    token: 'fake-token',
    chatId: 'fake-chat',
    now: new Date('2026-09-17T10:00:00+12:00'),
  });

  assert.equal(secondRun, 0);
  assert.equal(sentMessages.length, 1);
});

test('checkEventReminders sends 1h reminder when 60m away', async () => {
  const event = {
    id: 'evt_test_1h',
    title: 'Summer of Tech ONLINE Meet & Greet',
    start: '2026-09-17T17:00:00+12:00',
  };

  const sentMessages = [];
  const sentMap = { 'evt_test_1h:day': 12345 }; // day already sent
  const mockSend = async (msg) => {
    sentMessages.push(msg);
  };

  // Set "now" to 16:15 NZST (45 minutes before start)
  const simulatedNow = new Date('2026-09-17T16:15:00+12:00');

  const { sentCount } = await checkEventReminders({
    eventsStore: { items: [event] },
    sentReminders: sentMap,
    sendTelegramImpl: mockSend,
    token: 'fake-token',
    chatId: 'fake-chat',
    now: simulatedNow,
  });

  assert.equal(sentCount, 1);
  assert.ok(sentMessages[0].includes('1-HOUR REMINDER'));
  assert.ok(sentMap['evt_test_1h:1h'] > 0);
});

test('checkEventReminders sends 10m reminder when 10m away', async () => {
  const event = {
    id: 'evt_test_10m',
    title: 'Summer of Tech ONLINE Meet & Greet',
    start: '2026-09-17T17:00:00+12:00',
  };

  const sentMessages = [];
  const sentMap = { 'evt_test_10m:day': 123, 'evt_test_10m:1h': 456 };
  const mockSend = async (msg) => {
    sentMessages.push(msg);
  };

  // Set "now" to 16:52 NZST (8 minutes before start)
  const simulatedNow = new Date('2026-09-17T16:52:00+12:00');

  const { sentCount } = await checkEventReminders({
    eventsStore: { items: [event] },
    sentReminders: sentMap,
    sendTelegramImpl: mockSend,
    token: 'fake-token',
    chatId: 'fake-chat',
    now: simulatedNow,
  });

  assert.equal(sentCount, 1);
  assert.ok(sentMessages[0].includes('10-MINUTE ALERT'));
  assert.ok(sentMap['evt_test_10m:10m'] > 0);
});

test('checkEventReminders auto-closes event after end time without audit spam', async () => {
  const event = {
    id: 'evt_test_close',
    title: 'Summer of Tech ONLINE Meet & Greet',
    start: '2026-09-17T17:00:00+12:00',
    end: '2026-09-17T19:00:00+12:00',
    status: 'Confirmed',
  };

  let savedStore = null;
  const mockWrite = async (store) => {
    savedStore = store;
  };

  const sentMap = {};

  // Set "now" to 19:10 NZST (10 mins after event ended)
  const simulatedNow = new Date('2026-09-17T19:10:00+12:00');

  const { closedCount } = await checkEventReminders({
    eventsStore: { items: [event] },
    writeEventsStore: mockWrite,
    sentReminders: sentMap,
    token: 'fake-token',
    chatId: 'fake-chat',
    now: simulatedNow,
  });

  assert.equal(closedCount, 1);
  assert.equal(event.status, 'Completed & Closed');
  assert.ok(savedStore !== null);
  assert.ok(sentMap['evt_test_close:closed'] > 0);
});

test('checkEventReminders never auto-closes or spams for past application tasks', async () => {
  const app = {
    id: 'app_cyclone',
    company: 'Cyclone',
    status: 'interview',
    tasks: [
      {
        id: 'task_past_hireflix',
        label: 'Complete Hireflix video interview (5 questions)',
        dueAt: '2026-09-15T10:00:00+12:00',
        completedAt: null,
      },
    ],
  };

  const sentMap = {};
  const { closedCount, sentCount } = await checkEventReminders({
    eventsStore: { items: [] },
    applications: [app],
    sentReminders: sentMap,
    token: 'fake-token',
    chatId: 'fake-chat',
    now: new Date('2026-09-16T22:00:00+12:00'),
  });

  assert.equal(closedCount, 0);
  assert.equal(sentCount, 0);
  assert.equal(app.tasks[0].completedAt, null);
  assert.equal(Object.keys(sentMap).length, 0);
});

test('checkEventReminders evaluates application interview tasks cleanly', async () => {
  const app = {
    id: 'app_corrections',
    company: 'Department of Corrections',
    role: 'Operations Adviser',
    status: 'interview',
    tasks: [
      {
        id: 'task_interview_assessment',
        label: 'Online Interview & Assessment Centre via MS Teams',
        dueAt: '2026-09-18T09:25:00+12:00',
        completedAt: null,
        note: 'MS Teams meeting ID: 12345 Passcode: abcde',
      },
    ],
  };

  const sentMessages = [];
  const sentMap = {};
  const mockSend = async (msg) => {
    sentMessages.push(msg);
  };

  // Simulate Friday 18 Sep 8:30 AM NZST (55 mins before interview)
  const simulatedNow = new Date('2026-09-18T08:30:00+12:00');

  const { sentCount } = await checkEventReminders({
    eventsStore: { items: [] },
    applications: [app],
    sentReminders: sentMap,
    sendTelegramImpl: mockSend,
    token: 'fake-token',
    chatId: 'fake-chat',
    now: simulatedNow,
  });

  // Both Day-of and 1-hour trigger fire for the interview task
  assert.ok(sentCount >= 1);
  assert.ok(sentMessages.some((m) => m.includes('Department of Corrections')));
  assert.ok(sentMessages.some((m) => m.includes('Online Interview & Assessment Centre')));
});

