// Sends a Telegram message for every line appended to App/data/audit-log.jsonl.
// Tails the file rather than hooking Express routes so it also catches direct
// AI file edits (Claude/Gemini editing applications.json outside the API),
// which already append their own audit-log lines by convention. See
// docs/superpowers/specs/2026-09-03-telegram-notifications-design.md.

import { execFile } from 'node:child_process';
import fsPromises from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..');
const CAREER_DIR = path.resolve(APP_DIR, '..');
const DEFAULT_AUDIT_FILE = path.join(APP_DIR, 'data', 'audit-log.jsonl');
const DEFAULT_OFFSET_FILE = path.join(APP_DIR, 'data', 'notify-telegram-offset.txt');
const DEFAULT_DATA_FILE = path.join(APP_DIR, 'data', 'applications.json');
const POLL_INTERVAL_MS = 30_000;

export const ACTION_LABELS = {
  update: { emoji: '📝', label: 'Application updated' },
  create: { emoji: '➕', label: 'New job logged' },
  delete: { emoji: '🗑️', label: 'Application deleted' },
  'doc-generated': { emoji: '📎', label: 'Document generated' },
  'cv-request': { emoji: '📋', label: 'CV/cover letter queued' },
  'cv-generated': { emoji: '📄', label: 'CV/cover letter generated' },
  'cv-reviewed': { emoji: '🔍', label: 'CV/cover letter reviewed' },
  'cv-review': { emoji: '🔍', label: 'CV/cover letter review note' },
  'cv-request-skipped': { emoji: '⏭️', label: 'CV request skipped' },
  'cv-request-cancelled': { emoji: '❌', label: 'CV request cancelled' },
  'rejection-analysed': { emoji: '📭', label: 'Rejection processed' },
  status: { emoji: '🔄', label: 'Status changed' },
  'folder-move': { emoji: '📁', label: 'Folder moved' },
  'priority-set': { emoji: '⭐', label: 'Priority set' },
  analysis: { emoji: '🎯', label: 'Fit analysis' },
  'analysis-request': { emoji: '🎯', label: 'Fit analysis queued' },
  'evidence-refined': { emoji: '🧩', label: 'Evidence refined' },
  'facts-corrected': { emoji: '✏️', label: 'Candidate facts corrected' },
  correction: { emoji: '✏️', label: 'Correction made' },
  'follow-up': { emoji: '📌', label: 'Follow-up' },
  'task-add': { emoji: '✅', label: 'Task added' },
  'task-update': { emoji: '✅', label: 'Task updated' },
  'task-delete': { emoji: '✅', label: 'Task removed' },
  'interview-prepped': { emoji: '🎤', label: 'Interview prep drafted' },
  'interview-question-added': { emoji: '🎤', label: 'Interview question added' },
  'interview-answer-generate': { emoji: '🎤', label: 'Interview answer drafted' },
  'war-room-drafted': { emoji: '🎤', label: 'Interview war room drafted' },
  'study-progress': { emoji: '📚', label: 'Study progress' },
  'study-completed': { emoji: '📚', label: 'Study guide completed' },
  'assessment-update': { emoji: '🧪', label: 'Assessment update' },
  'outreach-create': { emoji: '🤝', label: 'Outreach contact added' },
  'outreach-update': { emoji: '🤝', label: 'Outreach contact updated' },
  'outreach-delete': { emoji: '🤝', label: 'Outreach contact deleted' },
  'outreach-email-request': { emoji: '✉️', label: 'Outreach email queued' },
  'outreach-email-drafted': { emoji: '✉️', label: 'Outreach email drafted' },
  'outreach-email-sent': { emoji: '✉️', label: 'Outreach email sent' },
  'outreach-follow-up': { emoji: '🤝', label: 'Outreach follow-up' },
  note: { emoji: '🗒️', label: 'Note added' },
  flag: { emoji: '🚩', label: 'Flagged for review' },
  release: { emoji: '🚀', label: 'Release' },
  'delete-local': { emoji: '🗑️', label: 'Removed locally' },
};

export function formatMessage(event) {
  const { action, detail, matchKey, entryId, actor } = event;
  const meta = ACTION_LABELS[action] || { emoji: '🔔', label: action.replace(/-/g, ' ') };
  const lines = [`${meta.emoji} ${meta.label}`];

  const body = detail || matchKey || entryId;
  if (body) lines.push(body);

  if (actor && actor !== 'user') {
    lines.push(`— via ${actor.charAt(0).toUpperCase()}${actor.slice(1)}`);
  }

  return lines.join('\n');
}

export function sendTelegram(text, { token, chatId, replyMarkup, execFileImpl = execFile } = {}) {
  return new Promise((resolve) => {
    if (!token || !chatId) {
      resolve();
      return;
    }

    const args = [
      '-s',
      '--max-time',
      '10',
      `https://api.telegram.org/bot${token}/sendMessage`,
      '-d',
      `chat_id=${encodeURIComponent(chatId)}`,
      // Pre-encoded ourselves (via -d, not --data-urlencode) so the argv
      // element is pure ASCII: on Windows, execFile mangles non-ASCII
      // bytes (emoji, em dashes, macrons — i.e. every real message here)
      // when building the process's command line, turning them into U+FFFD
      // before curl ever sees them. Percent-encoding sidesteps that entirely.
      '-d',
      `text=${encodeURIComponent(text)}`,
    ];

    if (replyMarkup) {
      args.push('-d', `reply_markup=${encodeURIComponent(JSON.stringify(replyMarkup))}`);
    }

    execFileImpl(
      'curl',
      args,
      (err, stdout) => {
        if (err) {
          console.error('telegram notify failed:', err.message);
          resolve();
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          if (!parsed.ok) {
            console.error('telegram notify failed:', parsed.description || 'unknown error');
          }
        } catch {
          console.error('telegram notify failed: could not parse Telegram API response');
        }
        resolve();
      }
    );
  });
}

export function sendTelegramDocument(filePath, { caption = '', token, chatId, execFileImpl = execFile } = {}) {
  return new Promise((resolve) => {
    if (!token || !chatId || !filePath) {
      resolve({ ok: false, error: 'missing parameters' });
      return;
    }

    const normalizedPath = filePath.split('\\').join('/');
    const args = [
      '-s',
      '--max-time',
      '30',
      `https://api.telegram.org/bot${token}/sendDocument`,
      '-F',
      `chat_id=${chatId}`,
      '-F',
      `document=@${normalizedPath}`,
    ];

    if (caption) {
      args.push('--form-string', `caption=${caption}`);
    }

    execFileImpl('curl', args, { timeout: 35000 }, (err, stdout) => {
      if (err) {
        console.error('telegram sendDocument failed:', err.message);
        resolve({ ok: false, error: err.message });
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        if (!parsed.ok) {
          console.error('telegram sendDocument error:', parsed.description || 'unknown error');
          resolve({ ok: false, error: parsed.description });
          return;
        }
        resolve({ ok: true, result: parsed.result });
      } catch {
        console.error('telegram sendDocument: failed to parse response');
        resolve({ ok: false, error: 'could not parse response' });
      }
    });
  });
}

export function sendTelegramQuiz(
  chatId,
  question,
  options,
  correctOptionId,
  explanation = '',
  { token, execFileImpl = execFile } = {}
) {
  return new Promise((resolve) => {
    if (!token || !chatId || !question || !Array.isArray(options)) {
      resolve({ ok: false, error: 'missing parameters' });
      return;
    }

    const args = [
      '-s',
      '--max-time',
      '15',
      `https://api.telegram.org/bot${token}/sendPoll`,
      '-d',
      `chat_id=${encodeURIComponent(chatId)}`,
      '-d',
      `question=${encodeURIComponent(question)}`,
      '-d',
      `options=${encodeURIComponent(JSON.stringify(options))}`,
      '-d',
      'type=quiz',
      '-d',
      `correct_option_id=${encodeURIComponent(String(correctOptionId))}`,
      '-d',
      'is_anonymous=false',
    ];

    if (explanation) {
      args.push('-d', `explanation=${encodeURIComponent(explanation.slice(0, 200))}`);
    }

    execFileImpl('curl', args, { timeout: 20000 }, (err, stdout) => {
      if (err) {
        console.error('telegram sendQuiz failed:', err.message);
        resolve({ ok: false, error: err.message });
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        if (!parsed.ok) {
          console.error('telegram sendQuiz error:', parsed.description || 'unknown error');
          resolve({ ok: false, error: parsed.description });
          return;
        }
        resolve({ ok: true, result: parsed.result });
      } catch {
        console.error('telegram sendQuiz: could not parse response');
        resolve({ ok: false, error: 'could not parse response' });
      }
    });
  });
}

export function downloadTelegramFile(fileId, destPath, { token, execFileImpl = execFile } = {}) {
  return new Promise((resolve) => {
    if (!token || !fileId || !destPath) {
      resolve({ ok: false, error: 'missing parameters' });
      return;
    }

    const getUrl = `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`;
    execFileImpl('curl', ['-s', '--max-time', '15', getUrl], { timeout: 20000 }, (err, stdout) => {
      if (err) {
        console.error('telegram getFile failed:', err.message);
        resolve({ ok: false, error: err.message });
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        if (!parsed.ok || !parsed.result?.file_path) {
          resolve({ ok: false, error: parsed.description || 'file_path missing' });
          return;
        }
        const filePath = parsed.result.file_path;
        const downloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
        const normalizedDest = destPath.split('\\').join('/');
        execFileImpl(
          'curl',
          ['-s', '--max-time', '60', downloadUrl, '-o', normalizedDest],
          { timeout: 70000 },
          (dlErr) => {
            if (dlErr) {
              console.error('telegram file download failed:', dlErr.message);
              resolve({ ok: false, error: dlErr.message });
              return;
            }
            resolve({ ok: true, localPath: destPath });
          }
        );
      } catch {
        resolve({ ok: false, error: 'failed to parse getFile response' });
      }
    });
  });
}

export async function findCvDocument(matchKey, entryId, { careerDir = CAREER_DIR, dataFile = DEFAULT_DATA_FILE } = {}) {
  try {
    const raw = await fsPromises.readFile(dataFile, 'utf8');
    const apps = JSON.parse(raw);
    const entry = apps.find((a) => (matchKey && a.matchKey === matchKey) || (entryId && a.id === entryId));
    if (!entry || !entry.folderPath) return null;

    const dir = path.join(careerDir, entry.folderPath);
    const files = await fsPromises.readdir(dir);
    // Prefer PDF CV first
    const pdf = files.find((f) => f.toLowerCase().endsWith('.pdf') && f.toLowerCase().includes('cv'));
    if (pdf) return { path: path.join(dir, pdf), entry, fileName: pdf };
    const anyPdf = files.find((f) => f.toLowerCase().endsWith('.pdf'));
    if (anyPdf) return { path: path.join(dir, anyPdf), entry, fileName: anyPdf };
    const docx = files.find((f) => f.toLowerCase().endsWith('.docx') && f.toLowerCase().includes('cv'));
    if (docx) return { path: path.join(dir, docx), entry, fileName: docx };
  } catch {
    return null;
  }
  return null;
}

export async function initOffset(offsetFilePath, auditFilePath) {
  try {
    const raw = (await fsPromises.readFile(offsetFilePath, 'utf8')).trim();
    const parsed = Number(raw);
    if (raw && Number.isFinite(parsed) && parsed >= 0) return parsed;
  } catch {
    // no offset file yet — fall through and initialize from the audit file's
    // current size, so a fresh install never replays the existing backlog.
  }

  let size = 0;
  try {
    const stat = await fsPromises.stat(auditFilePath);
    size = stat.size;
  } catch {
    size = 0; // audit log doesn't exist yet either
  }

  await fsPromises.writeFile(offsetFilePath, String(size), 'utf8');
  return size;
}

export async function readNewBatch(auditFilePath, offset, { maxBacklogBytes = 32768 } = {}) {
  let stat;
  try {
    stat = await fsPromises.stat(auditFilePath);
  } catch {
    return { events: [], newOffset: offset, malformedCount: 0 };
  }

  if (stat.size < offset) {
    console.error('telegram notify: audit log shrank — resetting offset to current size');
    return { events: [], newOffset: stat.size, malformedCount: 0 };
  }
  if (stat.size === offset) {
    return { events: [], newOffset: offset, malformedCount: 0 };
  }

  // Safety guard: if offset is vastly behind (e.g. fresh install, missed weeks of edits),
  // fast-forward to the end to prevent spamming the chat with hundreds of old events.
  const backlogBytes = stat.size - offset;
  if (backlogBytes > maxBacklogBytes) {
    console.warn(
      `telegram notify: backlog too large (${backlogBytes} bytes > ${maxBacklogBytes} bytes limit) — fast-forwarding offset to avoid spam`
    );
    return { events: [], newOffset: stat.size, malformedCount: 0 };
  }

  const fileHandle = await fsPromises.open(auditFilePath, 'r');
  let text;
  try {
    const length = stat.size - offset;
    const buffer = Buffer.alloc(length);
    await fileHandle.read(buffer, 0, length, offset);
    text = buffer.toString('utf8');
  } finally {
    await fileHandle.close();
  }

  const lastNewline = text.lastIndexOf('\n');
  if (lastNewline === -1) {
    // No complete line since the offset yet (a write still in progress).
    return { events: [], newOffset: offset, malformedCount: 0 };
  }

  const completeText = text.slice(0, lastNewline);
  const consumedBytes = Buffer.byteLength(`${completeText}\n`, 'utf8');
  const lines = completeText.split('\n').filter(Boolean);

  const events = [];
  let malformedCount = 0;
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      malformedCount += 1;
    }
  }

  return { events, newOffset: offset + consumedBytes, malformedCount };
}

// Sends one Telegram message per event, in order. A bad event (malformed
// shape — e.g. missing `action`) is logged and skipped rather than aborting
// the whole batch, so one unformattable line can never stall the offset.
export async function sendEvents(events, { token, chatId, execFileImpl, careerDir = CAREER_DIR, dataFile = DEFAULT_DATA_FILE } = {}) {
  for (const event of events) {
    try {
      let replyMarkup = undefined;
      // Prefer short entryId over long matchKey to avoid Telegram's 64-byte BUTTON_DATA_INVALID limit
      const ref = event.entryId || (event.matchKey && event.matchKey.length < 45 ? event.matchKey : null);
      if (ref) {
        if (event.action === 'create') {
          replyMarkup = {
            inline_keyboard: [
              [
                { text: '📋 Queue CV', callback_data: `queue_cv:${ref}` },
                { text: '📨 Mark Applied', callback_data: `status:${ref}:applied` },
              ],
            ],
          };
        } else if (event.action === 'follow-up') {
          replyMarkup = {
            inline_keyboard: [
              [
                { text: '📞 Followed Up', callback_data: `followup_done:${ref}` },
                { text: '⏳ Snooze 2d', callback_data: `snooze_followup:${ref}:2` },
              ],
            ],
          };
        } else if (event.action === 'task-add' && event.taskId) {
          replyMarkup = {
            inline_keyboard: [
              [{ text: '✅ Mark Done', callback_data: `task_done:${ref}:${event.taskId}` }],
            ],
          };
        }
      }

      // eslint-disable-next-line no-await-in-loop -- messages must arrive in log order
      await sendTelegram(formatMessage(event), { token, chatId, replyMarkup, execFileImpl });

      // Deliver PDF documents ONLY if the event was generated recently (within 10 minutes)
      // so historical log replays or batch imports NEVER spam chat with dozens of old PDFs.
      const eventAgeMs = event.at ? Date.now() - event.at : Infinity;
      const isFreshEvent = eventAgeMs < 10 * 60 * 1000;

      if ((event.action === 'cv-generated' || event.action === 'doc-generated') && ref && isFreshEvent) {
        try {
          const doc = await findCvDocument(event.matchKey, event.entryId, { careerDir, dataFile });
          if (doc && doc.path) {
            const caption = `📄 Tailored Document: ${doc.entry.company} — ${doc.entry.role}`;
            // eslint-disable-next-line no-await-in-loop
            await sendTelegramDocument(doc.path, { caption, token, chatId, execFileImpl });
          }
        } catch (err) {
          console.error('telegram notify: failed to send generated document:', err.message);
        }
      }
    } catch (err) {
      console.error('telegram notify: skipped unformattable event:', err.message);
    }
  }
}

export function startTelegramNotifier({
  auditFilePath = DEFAULT_AUDIT_FILE,
  offsetFilePath = DEFAULT_OFFSET_FILE,
  token = process.env.TELEGRAM_BOT_TOKEN,
  chatId = process.env.TELEGRAM_CHAT_ID,
} = {}) {
  if (!token || !chatId) {
    console.log('  telegram notify: off (no TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID in App/.env)');
    return;
  }

  let offset = 0;
  let processing = false;

  async function poll() {
    if (processing) return;
    processing = true;
    try {
      const { events, newOffset, malformedCount } = await readNewBatch(auditFilePath, offset);
      if (malformedCount > 0) {
        console.error(`telegram notify: skipped ${malformedCount} malformed audit-log line(s)`);
      }
      await sendEvents(events, { token, chatId });
      if (newOffset !== offset) {
        offset = newOffset;
        await fsPromises.writeFile(offsetFilePath, String(offset), 'utf8');
      }
    } catch (err) {
      console.error('telegram notify: poll failed:', err.message);
    } finally {
      processing = false;
    }
  }

  initOffset(offsetFilePath, auditFilePath)
    .then((initialOffset) => {
      offset = initialOffset;
      fsSync.watch(auditFilePath, () => poll());
      setInterval(poll, POLL_INTERVAL_MS);
      console.log('  telegram notify: on');
    })
    .catch((err) => {
      console.error('telegram notify: failed to start:', err.message);
    });
}
