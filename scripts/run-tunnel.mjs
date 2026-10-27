#!/usr/bin/env node
/**
 * Starts a Cloudflare tunnel pointing to JobSearchHQ (http://localhost:5178),
 * discovers the public HTTPS URL, writes it to App/data/tunnel-url.txt,
 * and sets Telegram's Chat Menu Button to open the Mini App directly.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import dns from 'node:dns';

net.setDefaultAutoSelectFamily(false);
dns.setDefaultResultOrder('ipv4first');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(APP_DIR, '.env');
const DATA_DIR = path.join(APP_DIR, 'data');
const TUNNEL_URL_FILE = path.join(DATA_DIR, 'tunnel-url.txt');

// Load environment variables from App/.env if present
if (fs.existsSync(ENV_FILE)) {
  const content = fs.readFileSync(ENV_FILE, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

// Find cloudflared executable
function findCloudflared() {
  const candidates = [
    process.env.CLOUDFLARED_PATH,
    path.join(APP_DIR, 'scripts', 'bin', os.platform() === 'win32' ? 'cloudflared.exe' : 'cloudflared'),
    path.join(os.homedir(), '.local', 'bin', os.platform() === 'win32' ? 'cloudflared.exe' : 'cloudflared'),
    os.platform() === 'win32' ? 'cloudflared.exe' : 'cloudflared',
  ].filter(Boolean);

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return os.platform() === 'win32' ? 'cloudflared.exe' : 'cloudflared';
}

const cloudflaredBin = findCloudflared();
console.log(`[tunnel] Using cloudflared binary: ${cloudflaredBin}`);

const targetPort = process.env.PORT || 5178;
const child = spawn(cloudflaredBin, ['tunnel', '--url', `http://localhost:${targetPort}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

let registeredUrl = null;

function handleOutput(data) {
  const text = data.toString();
  process.stdout.write(text);

  const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  if (match && match[0] !== registeredUrl) {
    registeredUrl = match[0];
    console.log(`\n======================================================`);
    console.log(`🚀 Telegram Mini App Tunnel Active:`);
    console.log(`   ${registeredUrl}/miniapp`);
    console.log(`======================================================\n`);

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(TUNNEL_URL_FILE, registeredUrl, 'utf8');

    // Register with Telegram
    if (botToken) {
      const menuPayload = {
        menu_button: {
          type: 'web_app',
          text: '📱 JobHQ',
          web_app: { url: `${registeredUrl}/miniapp` },
        },
      };

      fetch(`https://api.telegram.org/bot${botToken}/setChatMenuButton`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(menuPayload),
      })
        .then((res) => res.json())
        .then((body) => {
          if (body.ok) {
            console.log('[tunnel] Successfully registered Telegram Menu Button!');
            if (chatId) {
              const msg = `📱 *JobSearchHQ Mini App is Ready\\!*\\n\\nTap the *📱 JobHQ* button in your menu bar or open directly:\\n${registeredUrl}/miniapp`;
              fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: `📱 JobSearchHQ Mini App is ready!\nTap below or use the "📱 JobHQ" button:`, reply_markup: {
                  inline_keyboard: [[{ text: '📱 Open JobHQ Mini App', web_app: { url: `${registeredUrl}/miniapp` } }]]
                } }),
              }).catch(() => {});
            }
          } else {
            console.error('[tunnel] Telegram setChatMenuButton error:', body.description);
          }
        })
        .catch((err) => console.error('[tunnel] Failed to set Telegram menu button:', err.message));
    }
  }
}

child.stdout.on('data', handleOutput);
child.stderr.on('data', handleOutput);

child.on('close', (code) => {
  console.log(`[tunnel] cloudflared exited with code ${code}`);
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error(`[tunnel] Failed to spawn cloudflared:`, err.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  child.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
  process.exit(0);
});
