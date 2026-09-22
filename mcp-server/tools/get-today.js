import { fetchApplications } from './fetch-applications.js';

function dateOnly(isoOrDateStr) {
  if (!isoOrDateStr) return '';
  return String(isoOrDateStr).slice(0, 10);
}

function todayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isDueTodayOrEarlier(dateStr, today = todayDateString()) {
  if (!dateStr) return false;
  return dateOnly(dateStr) <= today;
}

export function formatToday(apps, today = todayDateString()) {
  const deadlines = apps.filter(
    (a) =>
      a.deadline &&
      isDueTodayOrEarlier(a.deadline, today) &&
      a.status !== 'rejected' &&
      a.status !== 'withdrawn'
  );
  const followUps = apps.filter(
    (a) => a.followUpDue && isDueTodayOrEarlier(a.followUpDue, today)
  );
  const taskItems = [];
  for (const app of apps) {
    for (const task of app.tasks ?? []) {
      if (!task.completedAt && isDueTodayOrEarlier(task.dueAt, today)) {
        taskItems.push({ app, task });
      }
    }
  }

  if (deadlines.length === 0 && followUps.length === 0 && taskItems.length === 0) {
    return `✅ Nothing due today (${today}) — you're completely clear!`;
  }

  const sections = [`📅 Daily Actions & Deadlines (${today}):\n`];
  if (deadlines.length > 0) {
    sections.push(
      [
        '⏰ Deadlines (Closes Today or Past Due):',
        ...deadlines.map((a) => `  • ${a.company} — ${a.role} (closes: ${a.deadline}) [ID: ${a.id}]`),
      ].join('\n')
    );
  }
  if (followUps.length > 0) {
    sections.push(
      [
        '📞 Follow-ups Due:',
        ...followUps.map(
          (a) => `  • ${a.company} — ${a.role} (due: ${a.followUpDue}) [ID: ${a.id}]`
        ),
      ].join('\n')
    );
  }
  if (taskItems.length > 0) {
    sections.push(
      [
        '📋 Action Tasks Due:',
        ...taskItems.map(
          ({ app, task }) => `  • ${task.label || task.title} — ${app.company} (due: ${task.dueAt})`
        ),
      ].join('\n')
    );
  }
  return sections.join('\n\n');
}

export async function getToday({ apiBase, token, fetchImpl } = {}) {
  try {
    const apps = await fetchApplications({ apiBase, token, fetchImpl });
    const text = formatToday(apps);
    return { isError: false, text };
  } catch (err) {
    return { isError: true, text: `Failed to get today's goals: ${err.message}` };
  }
}
