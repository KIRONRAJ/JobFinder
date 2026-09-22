// Dynamic Event Reminders & Auto-Closer for JobSearchHQ
//
// Monitors events in App/data/events.json and upcoming interview tasks in applications.json:
// 1. Day of event: pushes morning/day-of briefing reminder to Telegram.
// 2. 1 hour before: pushes 1-hour warning with links & tips.
// 3. 10 minutes before: pushes 10-minute alert with direct join link.
// 4. Concluded events: auto-marks completed and closes them once ended.
//
// Reminders are deduplicated across restarts using App/data/event-reminders-sent.json.

import fsPromises from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendTelegram } from './notify-telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..');
const EVENTS_FILE = path.join(APP_DIR, 'data', 'events.json');
const REMINDERS_SENT_FILE = path.join(APP_DIR, 'data', 'event-reminders-sent.json');

/** Format date/time in Auckland/NZST timezone */
export function formatNZDateTime(dateInput) {
  const d = typeof dateInput === 'number' || typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return {
    dateStr: d.toLocaleDateString('en-NZ', {
      timeZone: 'Pacific/Auckland',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    timeStr: d.toLocaleTimeString('en-NZ', {
      timeZone: 'Pacific/Auckland',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
    isoDate: d.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' }), // YYYY-MM-DD
  };
}

/** Load sent reminders map */
export async function loadSentReminders(filePath = REMINDERS_SENT_FILE) {
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Save sent reminders map */
export async function saveSentReminders(sentMap, filePath = REMINDERS_SENT_FILE) {
  try {
    const tmp = `${filePath}.tmp`;
    await fsPromises.writeFile(tmp, JSON.stringify(sentMap, null, 2), 'utf8');
    await fsPromises.rename(tmp, filePath);
  } catch (err) {
    console.error('telegram-reminders: failed to save reminders-sent log:', err.message);
  }
}

/** Format Telegram reminder messages */
export function formatEventReminderMessage(event, type, now = new Date()) {
  const startD = new Date(event.start);
  const endD = event.end ? new Date(event.end) : new Date(startD.getTime() + 2 * 3600_000);
  const { dateStr, timeStr } = formatNZDateTime(startD);
  const endTimeStr = formatNZDateTime(endD).timeStr;

  if (type === 'day') {
    const lines = [
      `🔔 EVENT TODAY: ${event.title}`,
      '',
      `📅 ${dateStr}`,
      `⏰ ${timeStr} – ${endTimeStr} NZST`,
    ];
    if (event.location) lines.push(`📍 ${event.location}`);
    if (event.badge) lines.push(`🏷️ [${event.badge}]`);
    if (event.url) {
      lines.push('');
      lines.push(`🔗 Access Link:`);
      lines.push(event.url);
    }
    if (event.notes) {
      lines.push('');
      lines.push(`📋 Focus & Notes:`);
      lines.push(event.notes.replace(/\*\*/g, '').replace(/\*/g, ''));
    }
    return lines.join('\n').trim();
  }

  if (type === '1h') {
    const lines = [
      `⏰ 1-HOUR REMINDER: ${event.title}`,
      '',
      `Starts in ~60 minutes @ ${timeStr} NZST!`,
    ];
    if (event.location) lines.push(`📍 ${event.location}`);
    if (event.url) {
      lines.push('');
      lines.push(`🔗 Join Link:`);
      lines.push(event.url);
    }
    lines.push('');
    lines.push('💡 Checklist:');
    lines.push('• Join/test audio up to 15 mins prior');
    lines.push('• Have elevator pitch & company questions open');
    return lines.join('\n').trim();
  }

  if (type === '10m') {
    const lines = [
      `🚨 10-MINUTE ALERT: ${event.title}`,
      '',
      `Starting in 10 minutes @ ${timeStr} NZST!`,
    ];
    if (event.location) lines.push(`📍 ${event.location}`);
    if (event.url) {
      lines.push('');
      lines.push(`🔗 Direct Livestream / Meeting Link:`);
      lines.push(event.url);
    }
    lines.push('');
    lines.push('Good luck Jordan! Make a memorable impression! 🚀');
    return lines.join('\n').trim();
  }

  return '';
}

/**
 * Check events and upcoming tasks, evaluate triggers, send reminders, and auto-close.
 */
export async function checkEventReminders({
  eventsStore,
  applications = [],
  writeEventsStore,
  sentReminders,
  saveSentRemindersImpl,
  sendTelegramImpl = sendTelegram,
  appendAuditImpl,
  token = process.env.TELEGRAM_BOT_TOKEN,
  chatId = process.env.TELEGRAM_CHAT_ID,
  now = new Date(),
}) {
  if (!token || !chatId) return { sentCount: 0, closedCount: 0 };

  const nowMs = now.getTime();
  const todayNZ = formatNZDateTime(now).isoDate;
  let sentCount = 0;
  let closedCount = 0;
  let eventsModified = false;

  const items = [...(eventsStore?.items || [])];

  // Synthesize upcoming application interview/assessment tasks into reminder queue
  for (const app of applications) {
    if (app.status === 'rejected' || app.status === 'withdrawn') continue;
    for (const task of app.tasks ?? []) {
      if (task.completedAt || !task.dueAt) continue;
      const isInterviewOrAssessment =
        task.label.toLowerCase().includes('interview') ||
        task.label.toLowerCase().includes('assessment') ||
        task.label.toLowerCase().includes('test');
      if (!isInterviewOrAssessment) continue;

      items.push({
        id: `task_${app.id}_${task.id}`,
        title: `${task.label} (${app.company})`,
        start: task.dueAt,
        end: new Date(Date.parse(task.dueAt) + 90 * 60_000).toISOString(),
        location: task.note?.includes('Teams')
          ? 'Microsoft Teams'
          : task.note?.includes('Zoom')
            ? 'Zoom'
            : app.location || 'Online',
        url: task.note?.match(/https?:\/\/[^\s<)]+/)?.[0] || app.link || '',
        notes: task.note,
        badge: 'INTERVIEW / ASSESSMENT',
      });
    }
  }

  for (const event of items) {
    if (!event.start) continue;
    const startMs = Date.parse(event.start);
    if (Number.isNaN(startMs)) continue;

    const endMs = event.end ? Date.parse(event.end) : startMs + 2 * 3600_000;
    const eventDayNZ = formatNZDateTime(startMs).isoDate;
    const isCompleted = event.status?.toLowerCase().includes('completed') || event.status?.toLowerCase().includes('debriefed');
    const isAppTask = event.id?.startsWith('task_');

    // 1. Auto-close concluded events from eventsStore ONLY (never synthesize/auto-complete application tasks)
    if (!isAppTask && !isCompleted && nowMs > endMs + 5 * 60_000) {
      if (!sentReminders[`${event.id}:closed`]) {
        event.status = 'Completed & Closed';
        eventsModified = true;
        closedCount++;
        sentReminders[`${event.id}:closed`] = nowMs;
        console.log(`  telegram-reminders: concluded & auto-closed event "${event.title}"`);
      }
      continue;
    }

    if (isCompleted || (isAppTask && nowMs > endMs)) continue;

    const diffMs = startMs - nowMs;

    // Trigger A: Day of event reminder (fires if today in NZST is event day, event is in future)
    const dayKey = `${event.id}:day`;
    if (todayNZ === eventDayNZ && diffMs > 0 && !sentReminders[dayKey]) {
      const msg = formatEventReminderMessage(event, 'day', now);
      if (msg) {
        await sendTelegramImpl(msg, { token, chatId });
        sentReminders[dayKey] = nowMs;
        sentCount++;
        console.log(`  telegram-reminders: sent day-of reminder for "${event.title}"`);
      }
    }

    // Trigger B: 1 hour before event (window: 65 mins to 15 mins before start)
    const oneHourKey = `${event.id}:1h`;
    if (diffMs > 15 * 60_000 && diffMs <= 65 * 60_000 && !sentReminders[oneHourKey]) {
      const msg = formatEventReminderMessage(event, '1h', now);
      if (msg) {
        await sendTelegramImpl(msg, { token, chatId });
        sentReminders[oneHourKey] = nowMs;
        sentCount++;
        console.log(`  telegram-reminders: sent 1-hour reminder for "${event.title}"`);
      }
    }

    // Trigger C: 10 minutes before event (window: 15 mins before start to 5 mins after start)
    const tenMinKey = `${event.id}:10m`;
    if (diffMs > -5 * 60_000 && diffMs <= 15 * 60_000 && !sentReminders[tenMinKey]) {
      const msg = formatEventReminderMessage(event, '10m', now);
      if (msg) {
        await sendTelegramImpl(msg, { token, chatId });
        sentReminders[tenMinKey] = nowMs;
        sentCount++;
        console.log(`  telegram-reminders: sent 10-minute alert for "${event.title}"`);
      }
    }
  }

  if (eventsModified && writeEventsStore) {
    await writeEventsStore(eventsStore);
  }

  if ((sentCount > 0 || closedCount > 0) && saveSentRemindersImpl) {
    await saveSentRemindersImpl(sentReminders);
  }

  return { sentCount, closedCount };
}

/**
 * Start 24/7 background reminder watcher
 */
export function startEventReminderScheduler({
  getEventsStore,
  getApplications,
  writeEventsStore,
  token = process.env.TELEGRAM_BOT_TOKEN,
  chatId = process.env.TELEGRAM_CHAT_ID,
  checkIntervalMs = 45_000,
  sendTelegramImpl = sendTelegram,
} = {}) {
  if (!token || !chatId) {
    console.log('  telegram-reminders: off (no TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID in App/.env)');
    return;
  }

  let sentMap = {};

  async function init() {
    sentMap = await loadSentReminders();
    console.log('  telegram-reminders: on (monitoring events & interview tasks for day-of, 1h, 10m alerts & auto-close)');
  }

  async function tick() {
    try {
      const store = getEventsStore ? await getEventsStore() : JSON.parse(await fsPromises.readFile(EVENTS_FILE, 'utf8'));
      const apps = getApplications ? await getApplications() : [];
      await checkEventReminders({
        eventsStore: store,
        applications: apps,
        writeEventsStore: writeEventsStore || (async (s) => {
          await fsPromises.writeFile(EVENTS_FILE, JSON.stringify(s, null, 2), 'utf8');
        }),
        sentReminders: sentMap,
        saveSentRemindersImpl: saveSentReminders,
        sendTelegramImpl,
        token,
        chatId,
        now: new Date(),
      });
    } catch (err) {
      console.error('telegram-reminders check failed:', err.message);
    }
  }

  init().then(() => {
    tick();
    setInterval(tick, checkIntervalMs);
  });
}
