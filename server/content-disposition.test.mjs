import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { contentDispositionHeader } from './content-disposition.js';

test('content-disposition: filename with an en dash does not throw when set as a real header (regression — this exact filename 500\'d the PDF preview)', () => {
  const filename =
    'CV - Nichecom (2026) Limited - Sales and Support Engineer – Telecommunication and Timing.pdf';
  const res = new http.ServerResponse({});
  assert.doesNotThrow(() => {
    res.setHeader('Content-Disposition', contentDispositionHeader('inline', filename));
  });
});

test('content-disposition: filename* carries the exact UTF-8 name, percent-encoded', () => {
  const filename = 'CV – Café.pdf';
  const header = contentDispositionHeader('inline', filename);
  const match = header.match(/filename\*=UTF-8''(.+)$/);
  assert.ok(match, 'header must include a filename* param');
  assert.equal(decodeURIComponent(match[1]), filename);
});

test('content-disposition: ascii fallback filename has no raw non-ASCII or quote/backslash characters', () => {
  const filename = 'CV – "Weird" \\Name\\.pdf';
  const header = contentDispositionHeader('attachment', filename);
  const match = header.match(/^attachment; filename="([^]*?)"; filename\*=/);
  assert.ok(match, 'header must include a quoted ascii fallback');
  assert.doesNotMatch(match[1], /[^\x20-\x7E]/, 'fallback must be pure ASCII');
  assert.doesNotMatch(match[1], /[\\"]/, 'fallback must not contain raw quote/backslash');
});

test('content-disposition: plain ASCII filename round-trips unchanged in the fallback', () => {
  const filename = 'CV - Example Company - Role.pdf';
  const header = contentDispositionHeader('inline', filename);
  assert.equal(header, `inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
});
