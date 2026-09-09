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

test('sendTelegram: calls curl with an argument array, never a shell string', async () => {
  let capturedArgs;
  const fakeExecFile = (cmd, args, cb) => {
    capturedArgs = { cmd, args };
    cb(null, JSON.stringify({ ok: true }));
  };

  await sendTelegram('hello "world" & rm -rf /', {
    token: 'TEST_TOKEN',
    chatId: '12345',
    execFileImpl: fakeExecFile,
  });

  assert.equal(capturedArgs.cmd, 'curl');
  assert.ok(Array.isArray(capturedArgs.args), 'args must be an array, not a shell string');
  assert.ok(capturedArgs.args.includes('https://api.telegram.org/botTEST_TOKEN/sendMessage'));
  assert.ok(capturedArgs.args.includes('chat_id=12345'));
  // Percent-encoded, not raw — see the non-ASCII test below for why.
  assert.ok(capturedArgs.args.includes(`text=${encodeURIComponent('hello "world" & rm -rf /')}`));
});

test('sendTelegram: non-ASCII text (emoji, em dash, macrons) is percent-encoded, not passed raw', async () => {
  // Regression test: on Windows, execFile mangles non-ASCII bytes in argv
  // elements into U+FFFD before curl ever sees them — every real message
  // here starts with an emoji, so this broke every single notification in
  // production despite all other tests passing (they all used fake execFile
  // or pure-ASCII text). Passing pre-encoded, pure-ASCII argv sidesteps it.
  let capturedArgs;
  const fakeExecFile = (cmd, args, cb) => {
    capturedArgs = { cmd, args };
    cb(null, JSON.stringify({ ok: true }));
  };

  const text = '📄 CV/cover letter generated\nNZ Post — Customer Service Representative';
  await sendTelegram(text, { token: 'T', chatId: '1', execFileImpl: fakeExecFile });

  const textArg = capturedArgs.args.find((a) => a.startsWith('text='));
  assert.equal(textArg, `text=${encodeURIComponent(text)}`);
  assert.ok(/^text=[\x00-\x7F]*$/.test(textArg), 'the text argv element must be pure ASCII');
});

test('sendTelegram: does nothing when token or chatId is missing', async () => {
  let called = false;
  const fakeExecFile = () => {
    called = true;
  };
  await sendTelegram('hello', { token: '', chatId: '12345', execFileImpl: fakeExecFile });
  await sendTelegram('hello', { token: 'TOKEN', chatId: '', execFileImpl: fakeExecFile });
  assert.equal(called, false);
});

test('sendTelegram: curl process error resolves (never rejects) and logs', async () => {
  const fakeExecFile = (cmd, args, cb) => {
    cb(new Error('curl not found'));
  };
  await assert.doesNotReject(
    sendTelegram('hello', { token: 'T', chatId: '1', execFileImpl: fakeExecFile })
  );
});

test('sendTelegram: Telegram API "ok: false" response resolves (never rejects) and logs', async () => {
  const fakeExecFile = (cmd, args, cb) => {
    cb(null, JSON.stringify({ ok: false, description: 'chat not found' }));
  };
  await assert.doesNotReject(
    sendTelegram('hello', { token: 'T', chatId: 'wrong', execFileImpl: fakeExecFile })
  );
});

test('sendTelegram: unparseable curl output resolves (never rejects) and logs', async () => {
  const fakeExecFile = (cmd, args, cb) => {
    cb(null, 'not json');
  };
  await assert.doesNotReject(
    sendTelegram('hello', { token: 'T', chatId: '1', execFileImpl: fakeExecFile })
  );
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
  const sentTexts = [];
  const fakeExecFile = (cmd, args, cb) => {
    sentTexts.push(args.find((a) => a.startsWith('text=')));
    cb(null, JSON.stringify({ ok: true }));
  };
  const events = [
    { detail: 'no action field — formatMessage throws on this' },
    { action: 'create', detail: 'valid event after the bad one' },
  ];

  await sendEvents(events, { token: 'T', chatId: '1', execFileImpl: fakeExecFile });

  assert.equal(sentTexts.length, 1, 'only the valid event should have been sent');
  assert.ok(decodeURIComponent(sentTexts[0].slice('text='.length)).includes('valid event after the bad one'));
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

test('sendTelegramQuiz: formats sendPoll args with quiz type and percent-encoded options', async () => {
  let capturedArgs = null;
  const fakeExecFile = (_cmd, args, _opts, cb) => {
    capturedArgs = args;
    const fn = typeof _opts === 'function' ? _opts : cb;
    if (fn) fn(null, JSON.stringify({ ok: true, result: { poll: { id: 'poll_1' } } }));
  };

  const res = await sendTelegramQuiz(
    '12345',
    'What is 2+2?',
    ['3', '4', '5'],
    1,
    'Math basics',
    { token: 'TEST_TOKEN', execFileImpl: fakeExecFile }
  );

  assert.equal(res.ok, true);
  assert.ok(capturedArgs.includes('https://api.telegram.org/botTEST_TOKEN/sendPoll'));
  assert.ok(capturedArgs.includes('type=quiz'));
  assert.ok(capturedArgs.includes('correct_option_id=1'));
  assert.ok(capturedArgs.includes(`chat_id=12345`));
  assert.ok(capturedArgs.some((a) => a.startsWith('options=')));
  assert.ok(capturedArgs.some((a) => a.startsWith('explanation=')));
});

test('downloadTelegramFile: gets file path and downloads via curl', async () => {
  const calls = [];
  const fakeExecFile = (_cmd, args, _opts, cb) => {
    calls.push(args);
    const fn = typeof _opts === 'function' ? _opts : cb;
    if (calls.length === 1) {
      fn(null, JSON.stringify({ ok: true, result: { file_path: 'voice/sample.oga' } }));
    } else {
      fn(null, '');
    }
  };

  const res = await downloadTelegramFile('file_abc', 'C:\\temp\\voice.ogg', {
    token: 'TEST_TOKEN',
    execFileImpl: fakeExecFile,
  });

  assert.equal(res.ok, true);
  assert.equal(calls.length, 2);
  assert.ok(calls[0][3].includes('getFile?file_id=file_abc'));
  assert.ok(calls[1][3].includes('file/botTEST_TOKEN/voice/sample.oga'));
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
  let docSent = false;
  const fakeExecFile = (_cmd, args, _opts, cb) => {
    const fn = typeof _opts === 'function' ? _opts : cb;
    if (args.some((a) => String(a).includes('sendDocument'))) {
      docSent = true;
    }
    fn(null, JSON.stringify({ ok: true }));
  };

  // Event from 1 hour ago
  const staleEvent = {
    action: 'cv-generated',
    at: Date.now() - 60 * 60 * 1000,
    entryId: 'app_123',
    matchKey: 'test-co-role',
  };

  await sendEvents([staleEvent], {
    token: 'T',
    chatId: '123',
    execFileImpl: fakeExecFile,
  });

  assert.equal(docSent, false, 'stale event should not trigger document upload');
});


