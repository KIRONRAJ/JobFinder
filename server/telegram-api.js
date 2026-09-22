// One way to talk to the Telegram Bot API.
//
// Replaces seven near-identical hand-rolled curl wrappers (build argv, spawn,
// JSON.parse stdout, log parsed.description, resolve) that were spread across
// notify-telegram.js and telegram-commands.js.
//
// Using JSON bodies over native fetch also retires the percent-encoding dance
// those wrappers needed. The old comment explained it: on Windows, execFile
// mangled non-ASCII argv (emoji, em dashes, macrons — i.e. every real message
// here) into U+FFFD, so every value had to be encodeURIComponent'd by hand
// before curl saw it. A JSON request body has no argv and no shell, so UTF-8
// travels intact on every platform. It also stops the bot token appearing in
// `ps` output, which it did as part of the curl command line.

import fsPromises from 'node:fs/promises';
import path from 'node:path';

const API_ROOT = 'https://api.telegram.org';
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Call a Bot API method with a JSON body.
 *
 * Resolves `{ ok, result, description }` — mirroring Telegram's own envelope —
 * and never throws for an API-level failure, because every caller here is a
 * notification path where giving up quietly beats taking down the poll loop.
 * `label` only shapes the log line.
 */
export async function telegramApi(
  method,
  params = {},
  { token, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch, label = method } = {}
) {
  if (!token) return { ok: false, description: 'no bot token configured' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${API_ROOT}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    });
    const body = await res.json();
    if (!body.ok) console.error(`telegram ${label} failed:`, body.description || 'unknown error');
    return body;
  } catch (err) {
    console.error(`telegram ${label} failed:`, err.message);
    return { ok: false, description: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Multipart upload (sendDocument). Reads the file into memory rather than
 * streaming it — these are CVs and cover letters, tens of KB, and Telegram
 * caps bot uploads at 50MB anyway.
 */
export async function telegramUpload(
  method,
  { filePath, field = 'document', fields = {} },
  { token, timeoutMs = 35_000, fetchImpl = fetch, label = method } = {}
) {
  if (!token) return { ok: false, description: 'no bot token configured' };
  if (!filePath) return { ok: false, description: 'no file path given' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const bytes = await fsPromises.readFile(filePath);
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== null && v !== '') form.append(k, String(v));
    }
    form.append(field, new Blob([bytes]), path.basename(filePath));

    const res = await fetchImpl(`${API_ROOT}/bot${token}/${method}`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    const body = await res.json();
    if (!body.ok) console.error(`telegram ${label} failed:`, body.description || 'unknown error');
    return body;
  } catch (err) {
    console.error(`telegram ${label} failed:`, err.message);
    return { ok: false, description: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a file Telegram is hosting and write it to disk. */
export async function telegramDownloadToFile(
  filePathOnTelegram,
  destPath,
  { token, timeoutMs = 70_000, fetchImpl = fetch } = {}
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${API_ROOT}/file/bot${token}/${filePathOnTelegram}`, {
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    await fsPromises.writeFile(destPath, Buffer.from(await res.arrayBuffer()));
    return { ok: true, localPath: destPath };
  } catch (err) {
    console.error('telegram file download failed:', err.message);
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * getUpdates long-poll. Separate from telegramApi because its timeout has to
 * outlive Telegram's own `timeout` parameter rather than the default.
 */
export async function telegramGetUpdates(
  { offset, timeoutSec = 30 },
  { token, fetchImpl = fetch } = {}
) {
  const params = { timeout: timeoutSec };
  if (typeof offset === 'number') params.offset = offset;
  const body = await telegramApi('getUpdates', params, {
    token,
    fetchImpl,
    timeoutMs: (timeoutSec + 10) * 1000,
    label: 'getUpdates',
  });
  return { ok: Boolean(body.ok), result: Array.isArray(body.result) ? body.result : [] };
}
