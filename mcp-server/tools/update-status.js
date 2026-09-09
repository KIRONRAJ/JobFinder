/**
 * Wraps the existing `PATCH /api/applications/:id` Express route — the only
 * write path this tool ever uses. Never touches applications.json directly.
 */
export async function updateStatus({ id, status, notes, apiBase, token, fetchImpl = fetch }) {
  const body = notes !== undefined ? { status, notes } : { status };
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetchImpl(`${apiBase}/api/applications/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      isError: true,
      text: `Job Search HQ server isn't running on ${apiBase} — start it with \`npm run dev\` first. (${err.message})`,
    };
  }

  const responseBody = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      isError: true,
      text: responseBody.error || `Request failed with status ${res.status}`,
    };
  }

  return { isError: false, text: JSON.stringify(responseBody, null, 2) };
}
