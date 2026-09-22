import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMessage,
  sendTelegram,
  sendTelegramQuiz,
  downloadTelegramFile,
  initOffset,
  readNewBatch,
  sendEvents,
  startTelegramNotifier,
  splitForTelegram,
} from './notify-telegram.js';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function makeTempDir() {
  return fsPromises.mkdtemp(path.join(os.tmpdir(), 'notify-telegram-test-'));
}

test('formatMessage: mapped action with detail, no actor line for user', () => {
  const msg = formatMessage({
    action: 'cv-generated',
    detail: 'CV + cover letter drafted into Pending to Apply/Spark',
    matchKey: 'spark-customer-experience-call-investigator',
    entryId: 'app_1785883580240_sprk1',
    actor: 'user',
  });
  assert.equal(
    msg,
    '📄 CV/cover letter generated\nCV + cover letter drafted into Pending to Apply/Spark'
  );
});

test('formatMessage: event-completed is ignored and returns null', () => {
  assert.equal(formatMessage({ action: 'event-completed', detail: 'Concluded' }), null);
});

test('formatMessage: actor claude adds a via-Claude line', () => {
  const msg = formatMessage({
    action: 'rejection-analysed',
    detail: 'for Spark — Customer Experience Call Investigator',
    actor: 'claude',
  });
  assert.equal(
    msg,
    '📭 Rejection processed\nfor Spark — Customer Experience Call Investigator\n— via Claude'
  );
});

test('formatMessage: actor gemini adds a via-Gemini line', () => {
  const msg = formatMessage({
    action: 'create',
    detail: 'Logged DuluxGroup - Service Desk Analyst',
    actor: 'gemini',
  });
  assert.equal(msg, '➕ New job logged\nLogged DuluxGroup - Service Desk Analyst\n— via Gemini');
});

test('formatMessage: no actor field at all behaves like actor "user" (no via line)', () => {
  const msg = formatMessage({ action: 'update', detail: 'fields: salary, source' });
  assert.equal(msg, '📝 Application updated\nfields: salary, source');
});

test('formatMessage: unmapped action falls back to hyphens-to-spaces label with a bell emoji', () => {
  const msg = formatMessage({ action: 'some-future-action', detail: 'a new kind of event' });
  assert.equal(msg, '🔔 some future action\na new kind of event');
});

test('formatMessage: missing detail falls back to matchKey', () => {
  const msg = formatMessage({
    action: 'assessment-update',
    matchKey: 'asmt_nzpol_sova',
  });
  assert.equal(msg, '🧪 Assessment update\nasmt_nzpol_sova');
});

test('formatMessage: missing detail and matchKey falls back to entryId', () => {
  const msg = formatMessage({
    action: 'priority-set',
    entryId: 'app_1785883580240_sprk1',
  });
  assert.equal(msg, '⭐ Priority set\napp_1785883580240_sprk1');
});

test('formatMessage: no detail, matchKey, or entryId omits the second line entirely', () => {
  const msg = formatMessage({ action: 'priority-set' });
  assert.equal(msg, '⭐ Priority set');
});

// Helper: a fetch stub that records the request and returns Telegram's envelope.
function fakeFetch(body = { ok: true }) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init, json: init?.body ? JSON.parse(init.body) : undefined });
    return { ok: true, json: async () => body };
  };
  return { impl, calls };
}

test('sendTelegram: posts a JSON body to sendMessage, no shell anywhere', async () => {
  const { impl, calls } = fakeFetch();
  await sendTelegram('hello "world" & rm -rf /', {
    token: 'TEST_TOKEN',
    chatId: '12345',
    fetchImpl: impl,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.telegram.org/botTEST_TOKEN/sendMessage');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].json.chat_id, '12345');
  // Shell metacharacters are just data in a JSON body — there is no argv and
  // no interpreter for them to reach.
  assert.equal(calls[0].json.text, 'hello "world" & rm -rf /');
});

test('sendTelegram: non-ASCII text (emoji, em dash, macrons) survives intact', async () => {
  // This replaces a percent-encoding test. The old transport spawned curl, and
  // on Windows execFile mangled non-ASCII argv bytes into U+FFFD before curl
  // saw them — every real message here starts with an emoji, so that broke
  // every notification in production. Hand-encoding each value worked around
  // it. A JSON request body has no argv, so UTF-8 now travels as-is and the
  // workaround is gone; this asserts the text arrives unmodified.
  const { impl, calls } = fakeFetch();
  const text = '📄 CV/cover letter generated\nNZ Post — Customer Service Representative';
  await sendTelegram(text, { token: 'T', chatId: '1', fetchImpl: impl });

  assert.equal(calls[0].json.text, text, 'text must reach Telegram byte-for-byte');
  assert.equal(JSON.parse(calls[0].init.body).text, text);
});

test('sendTelegram: does nothing when token or chatId is missing', async () => {
  let called = false;
  const impl = async () => {
    called = true;
    return { ok: true, json: async () => ({ ok: true }) };
  };
  await sendTelegram('hello', { token: '', chatId: '12345', fetchImpl: impl });
  await sendTelegram('hello', { token: 'TOKEN', chatId: '', fetchImpl: impl });
  assert.equal(called, false, 'must not reach the network without both credentials');
});

// Every caller of sendTelegram is a notification path. A transport failure
// there must never take down the poll loop or the request that triggered it,
// so all three failure shapes resolve rather than reject.
test('sendTelegram: a network error resolves, never rejects', async () => {
  const impl = async () => {
    throw new Error('ECONNREFUSED');
  };
  await assert.doesNotReject(sendTelegram('hello', { token: 'T', chatId: '1', fetchImpl: impl }));
});

test('sendTelegram: Telegram API "ok: false" resolves, never rejects', async () => {
  const { impl } = fakeFetch({ ok: false, description: 'chat not found' });
  await assert.doesNotReject(
    sendTelegram('hello', { token: 'T', chatId: 'wrong', fetchImpl: impl })
  );
});

test('sendTelegram: an unparseable response resolves, never rejects', async () => {
  const impl = async () => ({
    ok: true,
    json: async () => {
      throw new SyntaxError('Unexpected token');
    },
  });
  await assert.doesNotReject(sendTelegram('hello', { token: 'T', chatId: '1', fetchImpl: impl }));
});

test('initOffset: no offset file yet initializes to the CURRENT audit file size (no backlog replay)', async () => {
  const dir = await makeTempDir();
  const auditFile = path.join(dir, 'audit-log.jsonl');
  const offsetFile = path.join(dir, 'offset.txt');
  const existingLines = '{"action":"create"}\n{"action":"update"}\n';
  await fsPromises.writeFile(auditFile, existingLines, 'utf8');

  const offset = await initOffset(offsetFile, auditFile);

  assert.equal(offset, Buffer.byteLength(existingLines, 'utf8'));
  const persisted = await fsPromises.readFile(offsetFile, 'utf8');
  assert.equal(Number(persisted), offset);
});

test('initOffset: existing offset file is read back as-is', async () => {
  const dir = await makeTempDir();
  const auditFile = path.join(dir, 'audit-log.jsonl');
  const offsetFile = path.join(dir, 'offset.txt');
  await fsPromises.writeFile(auditFile, '{"action":"create"}\n', 'utf8');
  await fsPromises.writeFile(offsetFile, '42', 'utf8');

  const offset = await initOffset(offsetFile, auditFile);

  assert.equal(offset, 42);
});

test('initOffset: audit file does not exist yet initializes to 0', async () => {
  const dir = await makeTempDir();
  const auditFile = path.join(dir, 'audit-log.jsonl');
  const offsetFile = path.join(dir, 'offset.txt');

  const offset = await initOffset(offsetFile, auditFile);

  assert.equal(offset, 0);
});

test('readNewBatch: returns only lines appended after the offset', async () => {
  const dir = await makeTempDir();
  const auditFile = path.join(dir, 'audit-log.jsonl');
  const firstLine = '{"action":"create","detail":"first"}\n';
  await fsPromises.writeFile(auditFile, firstLine, 'utf8');
  const startOffset = Buffer.byteLength(firstLine, 'utf8');
  await fsPromises.appendFile(auditFile, '{"action":"update","detail":"second"}\n', 'utf8');

  const { events, newOffset, malformedCount } = await readNewBatch(auditFile, startOffset);

  assert.equal(events.length, 1);
  assert.equal(events[0].detail, 'second');
  assert.equal(malformedCount, 0);
  const stat = await fsPromises.stat(auditFile);
  assert.equal(newOffset, stat.size);
});

test('readNewBatch: a malformed line is skipped but does not block later valid lines', async () => {
  const dir = await makeTempDir();
  const auditFile = path.join(dir, 'audit-log.jsonl');
  await fsPromises.writeFile(
    auditFile,
    'not valid json\n{"action":"update","detail":"still works"}\n',
    'utf8'
  );

  const { events, newOffset, malformedCount } = await readNewBatch(auditFile, 0);

  assert.equal(malformedCount, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].detail, 'still works');
  const stat = await fsPromises.stat(auditFile);
  assert.equal(newOffset, stat.size);
});

test('readNewBatch: a partial final line (write still in progress) is left unconsumed', async () => {
  const dir = await makeTempDir();
  const auditFile = path.join(dir, 'audit-log.jsonl');
  const completeLine = '{"action":"create","detail":"whole"}\n';
  await fsPromises.writeFile(auditFile, `${completeLine}{"action":"update","detail":"partial`, 'utf8');

  const { events, newOffset } = await readNewBatch(auditFile, 0);

  assert.equal(events.length, 1);
  assert.equal(events[0].detail, 'whole');
  assert.equal(newOffset, Buffer.byteLength(completeLine, 'utf8'));
});

test('readNewBatch: nothing new since the offset returns an empty batch and the same offset', async () => {
  const dir = await makeTempDir();
  const auditFile = path.join(dir, 'audit-log.jsonl');
  const line = '{"action":"create"}\n';
  await fsPromises.writeFile(auditFile, line, 'utf8');
  const offset = Buffer.byteLength(line, 'utf8');

  const result = await readNewBatch(auditFile, offset);

  assert.deepEqual(result, { events: [], newOffset: offset, malformedCount: 0 });
});

test('readNewBatch: byte offsets stay correct with multi-byte UTF-8 text', async () => {
  const dir = await makeTempDir();
  const auditFile = path.join(dir, 'audit-log.jsonl');
  const line = '{"action":"note","detail":"Kia ora — ā ē ī ō ū"}\n';
  await fsPromises.writeFile(auditFile, line, 'utf8');

  const { events, newOffset } = await readNewBatch(auditFile, 0);

  assert.equal(events.length, 1);
  assert.equal(events[0].detail, 'Kia ora — ā ē ī ō ū');
  assert.equal(newOffset, Buffer.byteLength(line, 'utf8'));
});

// Finding 1: a per-event throw (e.g. an event missing its `action` field —
// formatMessage throws on that) must not abort the whole batch. sendEvents is
// the extracted per-event dispatch loop that poll() itself uses, so this
// exercises the real fix without needing to drive poll()'s fs.watch/timer wiring.
test('sendEvents: an unformattable event is skipped but does not block later events in the batch', async () => {
  const { impl, calls } = fakeFetch();
  const events = [
    { detail: 'no action field — formatMessage throws on this' },
    { action: 'create', detail: 'valid event after the bad one' },
  ];

  await sendEvents(events, { token: 'T', chatId: '1', fetchImpl: impl });

  assert.equal(calls.length, 1, 'only the valid event should have been sent');
  assert.ok(calls[0].json.text.includes('valid event after the bad one'));
});

// Finding 2: an empty/whitespace-only offset file (e.g. a crash mid-write)
// must not be accepted as offset 0 — Number('') is 0 and would silently
// replay the entire audit-log backlog. It must fall back to the audit
// file's current size, exactly like the no-offset-file case.
test('initOffset: empty offset file falls back to the audit file size instead of being read as 0', async () => {
  const dir = await makeTempDir();
  const auditFile = path.join(dir, 'audit-log.jsonl');
  const offsetFile = path.join(dir, 'offset.txt');
  const existingLines = '{"action":"create"}\n{"action":"update"}\n';
  await fsPromises.writeFile(auditFile, existingLines, 'utf8');
  await fsPromises.writeFile(offsetFile, '  \n', 'utf8'); // whitespace-only, e.g. crash mid-write

  const offset = await initOffset(offsetFile, auditFile);

  assert.equal(offset, Buffer.byteLength(existingLines, 'utf8'));
});

// Finding 3: a shrunk audit log (git checkout of an older version, backup
// restore, manual edit) must be distinguished from the equal-size "nothing
// new" case — it must resync to the file's current size, not stay silently
// stuck forever at the too-large offset.
test('readNewBatch: an offset larger than the file (shrunk audit log) resyncs to the current file size', async () => {
  const dir = await makeTempDir();
  const auditFile = path.join(dir, 'audit-log.jsonl');
  const line = '{"action":"create"}\n';
  await fsPromises.writeFile(auditFile, line, 'utf8');
  const currentSize = Buffer.byteLength(line, 'utf8');
  const staleOffset = currentSize + 500; // simulates offset from before the file shrank

  const { events, newOffset, malformedCount } = await readNewBatch(auditFile, staleOffset);

  assert.equal(newOffset, currentSize);
  assert.equal(events.length, 0);
  assert.equal(malformedCount, 0);
});

test('sendTelegramQuiz: sends a sendPoll body with quiz type and native array options', async () => {
  const { impl, calls } = fakeFetch({ ok: true, result: { poll: { id: 'poll_1' } } });

  const res = await sendTelegramQuiz('12345', 'What is 2+2?', ['3', '4', '5'], 1, 'Math basics', {
    token: 'TEST_TOKEN',
    fetchImpl: impl,
  });

  assert.equal(res.ok, true);
  assert.equal(calls[0].url, 'https://api.telegram.org/botTEST_TOKEN/sendPoll');
  const body = calls[0].json;
  assert.equal(body.type, 'quiz');
  assert.equal(body.correct_option_id, 1);
  assert.equal(body.chat_id, '12345');
  assert.equal(body.is_anonymous, false);
  // Options travel as a real JSON array now, not a percent-encoded string.
  assert.deepEqual(body.options, ['3', '4', '5']);
  assert.equal(body.explanation, 'Math basics');
});

test('downloadTelegramFile: resolves the file path then writes the bytes to disk', async () => {
  const dir = await makeTempDir();
  const dest = path.join(dir, 'voice.ogg');
  const seen = [];
  const impl = async (url) => {
    seen.push(url);
    if (url.includes('/getFile')) {
      return { ok: true, json: async () => ({ ok: true, result: { file_path: 'voice/file_1.oga' } }) };
    }
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode('OGGDATA').buffer };
  };

  const res = await downloadTelegramFile('file_abc', dest, { token: 'T', fetchImpl: impl });

  assert.equal(res.ok, true);
  assert.equal(res.localPath, dest);
  assert.ok(seen[0].endsWith('/botT/getFile'), 'first call resolves the file path');
  assert.equal(seen[1], 'https://api.telegram.org/file/botT/voice/file_1.oga');
  assert.equal(await fsPromises.readFile(dest, 'utf8'), 'OGGDATA');
  await fsPromises.rm(dir, { recursive: true, force: true });
});

test('readNewBatch: fast-forwards offset when backlog exceeds maxBacklogBytes to avoid spam', async () => {
  const dir = await makeTempDir();
  const auditFile = path.join(dir, 'audit-log.jsonl');
  // Write 1000 bytes
  const largeContent = '{"action":"update"}\n'.repeat(50);
  await fsPromises.writeFile(auditFile, largeContent, 'utf8');

  // Request with a small 200 byte limit
  const { events, newOffset } = await readNewBatch(auditFile, 0, { maxBacklogBytes: 200 });
  assert.equal(events.length, 0);
  const stat = await fsPromises.stat(auditFile);
  assert.equal(newOffset, stat.size);
});

test('sendEvents: does not send documents for stale events older than 10 minutes', async () => {
  const seen = [];
  const impl = async (url) => {
    seen.push(String(url));
    return { ok: true, json: async () => ({ ok: true }) };
  };

  // Event from an hour ago — a replayed backlog line, not fresh work.
  const staleEvent = {
    action: 'cv-generated',
    at: Date.now() - 60 * 60 * 1000,
    entryId: 'app_123',
    matchKey: 'test-co-role',
  };

  await sendEvents([staleEvent], { token: 'T', chatId: '123', fetchImpl: impl });

  assert.ok(
    !seen.some((u) => u.includes('sendDocument')),
    'stale event should not trigger a document upload'
  );
});



// Regression: a fresh install has no audit-log.jsonl yet, so fs.watch throws
// ENOENT. That throw used to escape and take the setInterval fallback with it,
// leaving the notifier permanently off until the next restart.
test('startTelegramNotifier: survives a missing audit log and still schedules the poll', async () => {
  const dir = await makeTempDir();
  const missingAudit = path.join(dir, 'does-not-exist.jsonl');
  const offsetFile = path.join(dir, 'offset.txt');

  const realSetInterval = globalThis.setInterval;
  let scheduled = null;
  // Record the interval and hand back a no-op handle. Returning a real timer
  // here would keep the event loop alive and hang the runner.
  globalThis.setInterval = (_fn, ms) => {
    scheduled = ms;
    return { unref() {}, ref() {} };
  };

  try {
    startTelegramNotifier({
      auditFilePath: missingAudit,
      offsetFilePath: offsetFile,
      token: 'T',
      chatId: '123',
    });
    // startTelegramNotifier kicks off an async chain; let it settle.
    await new Promise((r) => realSetInterval && setTimeout(r, 50));
  } finally {
    globalThis.setInterval = realSetInterval;
  }

  assert.equal(scheduled, 30_000, 'poll interval must still be scheduled without a watchable file');
  assert.equal(
    await fsPromises.readFile(offsetFile, 'utf8'),
    '0',
    'offset should initialise to 0 for a not-yet-created audit log'
  );
  await fsPromises.rm(dir, { recursive: true, force: true });
});

// Regression: /today produced 7,094 chars against Telegram's 4,096 limit and
// was rejected outright with "Bad Request: message is too long" — silently, so
// the command just never replied. The 8:30am briefing had been failing the
// same way since at least 8 Sep 2026.
test('splitForTelegram: short text is left as a single chunk', () => {
  assert.deepEqual(splitForTelegram('hello'), ['hello']);
});

test('splitForTelegram: splits on paragraph boundaries, every chunk under the limit', () => {
  const para = 'x'.repeat(1000);
  const chunks = splitForTelegram(Array(10).fill(para).join('\n\n'));
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.length <= 3800, `chunk was ${c.length}`);
});

test('splitForTelegram: hard-splits a single paragraph that is itself too long', () => {
  // The old chunker pushed this through unsplit — one 9,000-char paragraph
  // (a pasted stack trace or CLI error) still got rejected by Telegram.
  const chunks = splitForTelegram('y'.repeat(9000));
  assert.ok(chunks.length >= 3);
  for (const c of chunks) assert.ok(c.length <= 3800, `chunk was ${c.length}`);
  assert.equal(chunks.join('').length, 9000, 'no content may be dropped');
});

test('sendTelegram: an over-limit message is sent as multiple requests', async () => {
  const { impl, calls } = fakeFetch();
  await sendTelegram('z'.repeat(9000), { token: 'T', chatId: '1', fetchImpl: impl });
  assert.ok(calls.length >= 3, `expected several sends, got ${calls.length}`);
  for (const c of calls) assert.ok(c.json.text.length <= 3800);
});

test('sendTelegram: the keyboard is attached to the last chunk only', async () => {
  const { impl, calls } = fakeFetch();
  const markup = { keyboard: [[{ text: 'Today' }]] };
  await sendTelegram('w'.repeat(9000), {
    token: 'T',
    chatId: '1',
    replyMarkup: markup,
    fetchImpl: impl,
  });
  const withMarkup = calls.filter((c) => c.json.reply_markup !== undefined);
  assert.equal(withMarkup.length, 1, 'keyboard must not repeat between fragments');
  assert.equal(calls[calls.length - 1].json.reply_markup.keyboard[0][0].text, 'Today');
});
