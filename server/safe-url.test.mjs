import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { assertFetchableUrl, isFetchableUrl } from './safe-url.js';

test('safe-url: allows ordinary public job-ad links', () => {
  for (const u of [
    'https://nz.seek.com/job/94417890',
    'https://www.linkedin.com/jobs/view/123',
    'http://careers.example.co.nz/roles/1',
  ]) {
    assert.equal(isFetchableUrl(u), true, `${u} should be allowed`);
  }
});

test('safe-url: blocks loopback and local names', () => {
  for (const u of [
    'http://127.0.0.1:5178/api/applications',
    'http://localhost:5178/',
    'http://[::1]:5178/',
    `http://${os.hostname()}:5178/`,
    'http://printer.local/',
  ]) {
    assert.equal(isFetchableUrl(u), false, `${u} should be blocked`);
  }
});

// The tailnet is the app's trust boundary — anything on it is reachable from
// this server and must not be proxyable through a job-ad URL.
test('safe-url: blocks the Tailscale CGNAT range and RFC1918', () => {
  for (const u of [
    'http://100.100.100.100:5178/',
    'http://100.64.0.1/',
    'http://100.127.255.254/',
    'http://10.0.0.5/',
    'http://192.168.1.1/',
    'http://172.16.0.1/',
    'http://172.31.255.255/',
  ]) {
    assert.equal(isFetchableUrl(u), false, `${u} should be blocked`);
  }
});

test('safe-url: 100.x outside the CGNAT range stays allowed', () => {
  // 100.0-63 and 100.128-255 are ordinary public space, not tailnet.
  assert.equal(isFetchableUrl('http://100.63.0.1/'), true);
  assert.equal(isFetchableUrl('http://100.128.0.1/'), true);
});

test('safe-url: blocks link-local / cloud metadata', () => {
  assert.equal(isFetchableUrl('http://169.254.169.254/latest/meta-data/'), false);
});

test('safe-url: blocks IPv4-mapped IPv6 loopback', () => {
  assert.equal(isFetchableUrl('http://[::ffff:127.0.0.1]/'), false);
});

test('safe-url: rejects non-http schemes and junk', () => {
  assert.equal(isFetchableUrl('file:///etc/passwd'), false);
  assert.equal(isFetchableUrl('ftp://example.com/'), false);
  assert.equal(isFetchableUrl('not a url'), false);
});

test('safe-url: assert form explains why', () => {
  assert.throws(() => assertFetchableUrl('http://10.0.0.1/'), /private address/);
  assert.throws(() => assertFetchableUrl('file:///etc/passwd'), /non-http/);
});
