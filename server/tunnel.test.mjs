import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTunnel } from './tunnel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
import os from 'node:os';
// Never touch the live data/tunnel-url.txt from a test.
const TUNNEL_URL_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-test-')), 'tunnel-url.txt');
process.env.JOBHQ_TUNNEL_URL_FILE = TUNNEL_URL_FILE;

test('startTunnel: returns null when cloudflared binary is not found', () => {
  const result = startTunnel({ cloudflaredBin: null });
  assert.equal(result, null);
});

test('startTunnel: parses tunnel URL and writes file', async () => {
  class MockProcess extends EventEmitter {
    constructor() {
      super();
      this.stdout = new EventEmitter();
      this.stderr = new EventEmitter();
    }
    kill() {}
  }

  const mockChild = new MockProcess();
  let menuButtonSet = null;

  // Save current tunnel file if present
  let originalContent = null;
  if (fs.existsSync(TUNNEL_URL_FILE)) {
    originalContent = fs.readFileSync(TUNNEL_URL_FILE, 'utf8');
  }

  const result = startTunnel({
    port: 5178,
    botToken: 'TEST_TOKEN',
    cloudflaredBin: 'mock-cloudflared',
    spawnImpl: () => mockChild,
    telegramApiImpl: async (method, params) => {
      menuButtonSet = { method, params };
      return { ok: true };
    },
  });

  assert.equal(result, mockChild);

  // Emit sample cloudflared output
  const sampleOutput = '2026-09-22T23:06:41Z INF | https://test-sample-tunnel.trycloudflare.com |';
  mockChild.stdout.emit('data', Buffer.from(sampleOutput));

  // Check file was written
  assert.ok(fs.existsSync(TUNNEL_URL_FILE));
  const writtenUrl = fs.readFileSync(TUNNEL_URL_FILE, 'utf8');
  assert.equal(writtenUrl, 'https://test-sample-tunnel.trycloudflare.com');

  // Check Telegram menu button API was called
  assert.ok(menuButtonSet);
  assert.equal(menuButtonSet.method, 'setChatMenuButton');
  assert.equal(menuButtonSet.params.menu_button.type, 'web_app');
  assert.equal(menuButtonSet.params.menu_button.web_app.url, 'https://test-sample-tunnel.trycloudflare.com/miniapp');

  // Restore
  if (originalContent !== null) {
    fs.writeFileSync(TUNNEL_URL_FILE, originalContent, 'utf8');
  } else if (fs.existsSync(TUNNEL_URL_FILE)) {
    fs.unlinkSync(TUNNEL_URL_FILE);
  }
});
