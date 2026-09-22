// One definition of which Gemini models this app talks to, and one retry loop
// for reaching them.
//
// The list is ordered by preference, not by version number. It exists because
// generativelanguage.googleapis.com returns 503 "model overloaded" often enough
// to matter: in this deployment's own logs, 4 of 18 CV drafts had to fall
// through past the first choice to complete. Walking the list is what makes a
// draft succeed anyway.
//
// Before this module the list was duplicated in index.js and cv-worker.js,
// while three call sites in telegram-commands.js each hardcoded a single model
// with no fallback at all — so the exact 503 the other two paths survived made
// the career coach, voice debrief, and job-link parser fail outright.

export const GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
];

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Call Gemini, walking the model list until one answers.
 *
 * `parts` is the raw Gemini parts array, so a caller can pass text, or text
 * plus inline_data for audio, without this needing to know which.
 *
 * Resolves `{ text, model }` — `model` is which one actually answered, so the
 * caller can log the fallback rather than silently accepting a lesser result.
 * Throws the last error only when every candidate failed.
 */
export async function generateContent({
  parts,
  generationConfig = {},
  apiKey = process.env.GEMINI_API_KEY,
  models = GEMINI_MODELS,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured in environment or .env');
  if (!Array.isArray(parts) || parts.length === 0) throw new Error('parts is required');

  const body = JSON.stringify({ contents: [{ parts }], generationConfig });
  let lastErr = null;

  for (const model of models) {
    try {
      const response = await fetchImpl(`${ENDPOINT}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (!response.ok) {
        // 503/429 are the transient ones worth walking past. Anything else
        // (400 bad request, 403 bad key) will fail identically on every model,
        // but trying the rest costs one round trip and keeps this simple.
        lastErr = new Error(`Gemini ${model} HTTP ${response.status}: ${await response.text()}`);
        continue;
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return { text, model };
      lastErr = new Error(`Gemini ${model} returned no text`);
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr ?? new Error('All Gemini model candidates failed');
}
