import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampLines, parseJournal, MAX_LINES } from './server-log.js';

test('clampLines: falls back to the default for junk and clamps the ceiling', () => {
  assert.equal(clampLines(undefined), 200);
  assert.equal(clampLines(''), 200);
  assert.equal(clampLines('abc'), 200);
  assert.equal(clampLines(0), 200);
  assert.equal(clampLines(-5), 200);
  assert.equal(clampLines(50), 50);
  assert.equal(clampLines('300'), 300);
  assert.equal(clampLines(99999), MAX_LINES);
  // A float would become an invalid `-n` argument to journalctl.
  assert.equal(clampLines(12.7), 12);
});

test('parseJournal: newest first, microseconds down to millis', () => {
  const stdout = [
    JSON.stringify({ __REALTIME_TIMESTAMP: '1789081484880858', PRIORITY: '6', MESSAGE: 'older' }),
    JSON.stringify({ __REALTIME_TIMESTAMP: '1789081486087245', PRIORITY: '3', MESSAGE: 'newer' }),
    '',
  ].join('\n');

  const rows = parseJournal(stdout);
  assert.deepEqual(rows, [
    { at: 1789081486087, priority: 3, message: 'newer' },
    { at: 1789081484881, priority: 6, message: 'older' },
  ]);
});

test('parseJournal: one bad record costs one row, not the whole read', () => {
  const stdout = [
    '{"__REALTIME_TIMESTAMP":"1000000","PRIORITY":"6","MESSAGE":"kept"}',
    '{"__REALTIME_TIMESTAMP":"2000000","PRIORITY":"6","MESSAGE":"trunca', // half-written
    '{"PRIORITY":"6","MESSAGE":"no timestamp"}',
    '{"__REALTIME_TIMESTAMP":"3000000","PRIORITY":"6"}', // no message
  ].join('\n');

  assert.deepEqual(parseJournal(stdout), [{ at: 1000, priority: 6, message: 'kept' }]);
});

test('parseJournal: decodes a byte-array MESSAGE instead of dropping it', () => {
  // journalctl emits MESSAGE as an array of bytes when the line is not valid
  // UTF-8 — which is exactly when something has gone wrong and the line matters.
  const stdout = JSON.stringify({
    __REALTIME_TIMESTAMP: '1000000',
    MESSAGE: [0x6f, 0x6f, 0x70, 0x73, 0xff],
  });

  const rows = parseJournal(stdout);
  assert.equal(rows.length, 1);
  assert.match(rows[0].message, /^oops/);
  assert.equal(rows[0].priority, 6, 'missing PRIORITY defaults to info');
});
