import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_DATA_FILE = path.resolve(__dirname, '..', '..', 'data', 'applications.json');

export async function fetchApplications({ apiBase, token, fetchImpl = fetch } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  if (apiBase) {
    try {
      const res = await fetchImpl(`${apiBase}/api/applications`, { headers });
      if (res.ok) {
        return await res.json();
      }
    } catch (_err) {
      // API call failed, fall back to local applications.json
    }
  }

  try {
    const raw = await fs.readFile(LOCAL_DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (fileErr) {
    throw new Error(
      `Could not retrieve applications from API (${apiBase}) or local data file (${LOCAL_DATA_FILE}): ${fileErr.message}`
    );
  }
}
