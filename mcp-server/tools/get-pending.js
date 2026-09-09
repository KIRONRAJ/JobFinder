import { fetchApplications } from './fetch-applications.js';

export const PENDING_STATUS_ORDER = ['interview', 'offer', 'researching', 'applied'];
export const PENDING_STATUS_LABELS = {
  interview: '🟢 Interview',
  offer: '🎉 Offer',
  researching: '🔍 Researching',
  applied: '📨 Applied',
};

export function formatPending(apps) {
  const pending = apps.filter((a) => a.status !== 'rejected' && a.status !== 'withdrawn');
  if (pending.length === 0) return "✅ Nothing pending — pipeline's clear.";

  const lines = [
    `📊 Active Job Pipeline Overview (Total Active: ${pending.length})`,
    '',
  ];

  for (const status of PENDING_STATUS_ORDER) {
    const group = pending.filter((a) => a.status === status);
    if (group.length === 0) continue;
    lines.push(`${PENDING_STATUS_LABELS[status] || status} (${group.length}):`);
    const shown = group.slice(0, 15);
    for (const app of shown) {
      const extra = [];
      if (app.fit) extra.push(`fit: ${app.fit}`);
      if (app.deadline) extra.push(`deadline: ${app.deadline}`);
      if (app.followUpDue) extra.push(`follow-up: ${app.followUpDue}`);
      const extraStr = extra.length > 0 ? ` [${extra.join(', ')}]` : '';
      lines.push(`  • ${app.company} — ${app.role}${extraStr} (ID: \`${app.id}\`)`);
    }
    if (group.length > shown.length) {
      lines.push(`  …and ${group.length - shown.length} more`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

export async function getPending({ apiBase, token, fetchImpl } = {}) {
  try {
    const apps = await fetchApplications({ apiBase, token, fetchImpl });
    const text = formatPending(apps);
    return { isError: false, text };
  } catch (err) {
    return { isError: true, text: `Failed to get pending applications: ${err.message}` };
  }
}
