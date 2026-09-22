// Sends a scheduled morning briefing to Telegram at 8:30 AM (NZST) on weekdays.
// Aggregates deadlines closing within 48h, follow-ups due, tasks due today,
// and upcoming interviews.

import { sendTelegram } from './notify-telegram.js';

export function formatBriefing(apps, now = new Date()) {
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  // Date string 48 hours from now
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const in48hStr = `${in48h.getFullYear()}-${String(in48h.getMonth() + 1).padStart(2, '0')}-${String(in48h.getDate()).padStart(2, '0')}`;

  const activeApps = apps.filter((a) => a.status !== 'rejected' && a.status !== 'withdrawn');

  // Deadlines closing today or within 48h
  const urgentDeadlines = activeApps.filter(
    (a) => a.deadline && a.deadline.slice(0, 10) <= in48hStr
  );

  // Follow-ups due today or earlier
  const dueFollowUps = activeApps.filter(
    (a) => a.followUpDue && a.followUpDue.slice(0, 10) <= todayStr
  );

  // Tasks due today or earlier
  const dueTasks = [];
  for (const app of activeApps) {
    for (const task of app.tasks ?? []) {
      if (!task.completedAt && task.dueAt && task.dueAt.slice(0, 10) <= todayStr) {
        dueTasks.push({ app, task });
      }
    }
  }

  // Active interviews
  const interviews = activeApps.filter((a) => a.status === 'interview');

  // Status counts
  const appliedCount = activeApps.filter((a) => a.status === 'applied').length;
  const researchingCount = activeApps.filter((a) => a.status === 'researching').length;

  const weekday = now.toLocaleDateString('en-NZ', { weekday: 'long', timeZone: 'Pacific/Auckland' });
  const dayMonth = now.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'Pacific/Auckland' });

  const lines = [`☀️ Good morning Jordan! — ${weekday}, ${dayMonth}`, ''];

  if (urgentDeadlines.length > 0) {
    lines.push('⏰ Deadlines Closing Soon:');
    for (const a of urgentDeadlines) {
      const isToday = a.deadline.slice(0, 10) <= todayStr;
      lines.push(`  • ${a.company} — ${a.role} (${isToday ? 'CLOSES TODAY' : `closes ${a.deadline}`})`);
    }
    lines.push('');
  }

  if (interviews.length > 0) {
    lines.push('🟢 Active Interview Pipeline:');
    for (const a of interviews) {
      lines.push(`  • ${a.company} — ${a.role}`);
    }
    lines.push('');
  }

  if (dueFollowUps.length > 0) {
    lines.push('📞 Follow-ups Owed:');
    for (const a of dueFollowUps) {
      lines.push(`  • ${a.company} — ${a.role}`);
    }
    lines.push('');
  }

  if (dueTasks.length > 0) {
    lines.push('📋 Tasks Due Today:');
    for (const { app, task } of dueTasks) {
      lines.push(`  • ${task.label} (${app.company})`);
    }
    lines.push('');
  }

  if (urgentDeadlines.length === 0 && dueFollowUps.length === 0 && dueTasks.length === 0 && interviews.length === 0) {
    lines.push('✨ No urgent deadlines or follow-ups due today. Pipeline is calm.');
    lines.push('');
  }

  lines.push(`📊 Pipeline: ${researchingCount} researching · ${appliedCount} applied · ${interviews.length} interview`);

  return lines.join('\n').trim();
}

export function startMorningBriefing({
  getApplications,
  token = process.env.TELEGRAM_BOT_TOKEN,
  chatId = process.env.TELEGRAM_CHAT_ID,
  sendTelegramImpl = sendTelegram,
  checkIntervalMs = 60_000,
} = {}) {
  if (!token || !chatId) {
    console.log('  telegram briefing: off (no TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID in App/.env)');
    return;
  }

  let lastSentDate = '';

  async function checkAndSend() {
    const now = new Date();
    // Weekdays only: Monday = 1, Friday = 5
    const dayOfWeek = now.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return;

    // Check time: 8:30 AM to 8:45 AM local time
    const hours = now.getHours();
    const minutes = now.getMinutes();
    if (hours !== 8 || minutes < 30 || minutes > 45) return;

    const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (lastSentDate === todayDate) return;

    try {
      const apps = await getApplications();
      const message = formatBriefing(apps, now);
      await sendTelegramImpl(message, { token, chatId });
      lastSentDate = todayDate;
      console.log(`  telegram briefing: morning brief sent for ${todayDate}`);
    } catch (err) {
      console.error('telegram briefing: failed to send morning brief:', err.message);
    }
  }

  // Initial check
  checkAndSend();
  setInterval(checkAndSend, checkIntervalMs);
  console.log('  telegram briefing: on (scheduled weekdays 8:30 AM)');
}
