import { fetchApplications } from './fetch-applications.js';

export function filterApplications(apps, { query, status, limit = 10 } = {}) {
  let filtered = apps;
  if (status) {
    filtered = filtered.filter((a) => a.status === status.toLowerCase());
  }
  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter((a) => {
      const matchCompany = (a.company || '').toLowerCase().includes(q);
      const matchRole = (a.role || '').toLowerCase().includes(q);
      const matchLocation = (a.location || '').toLowerCase().includes(q);
      const matchNotes = (a.notes || '').toLowerCase().includes(q);
      const matchKeywords = Array.isArray(a.keywords)
        ? a.keywords.some((k) => String(k).toLowerCase().includes(q))
        : false;
      return matchCompany || matchRole || matchLocation || matchNotes || matchKeywords;
    });
  }

  if (filtered.length === 0) {
    return `No applications found matching query: "${query || ''}"${status ? ` with status: "${status}"` : ''}.`;
  }

  const results = filtered.slice(0, limit).map((a) => {
    const lines = [
      `🏢 **${a.company}** — ${a.role}`,
      `   • ID: \`${a.id}\``,
      `   • Status: ${a.status.toUpperCase()} | Fit: ${a.fit || 'unrated'} | Location: ${a.location || 'Wellington, NZ'}`,
    ];
    if (a.salary) lines.push(`   • Salary: ${a.salary}`);
    if (a.dateApplied) lines.push(`   • Date Applied: ${a.dateApplied}`);
    if (a.deadline) lines.push(`   • Deadline: ${a.deadline}`);
    if (a.followUpDue) lines.push(`   • Follow-up Due: ${a.followUpDue}`);
    if (a.link) lines.push(`   • Job Link: ${a.link}`);
    if (a.notes) {
      const cleanNotes = a.notes.length > 250 ? a.notes.slice(0, 250) + '…' : a.notes;
      lines.push(`   • Notes: ${cleanNotes}`);
    }
    return lines.join('\n');
  });

  return (
    `Found ${filtered.length} applications matching criteria (showing ${Math.min(filtered.length, limit)}):\n\n` +
    results.join('\n\n')
  );
}

export async function searchApplications({ query, status, limit, apiBase, token, fetchImpl } = {}) {
  try {
    const apps = await fetchApplications({ apiBase, token, fetchImpl });
    const text = filterApplications(apps, { query, status, limit });
    return { isError: false, text };
  } catch (err) {
    return { isError: true, text: `Failed to search applications: ${err.message}` };
  }
}
