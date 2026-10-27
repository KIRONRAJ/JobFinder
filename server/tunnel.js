import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { telegramApi } from './telegram-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(APP_DIR, 'data');
// Resolved per call so tests can point it at a temp file instead of live data.
const tunnelUrlFile = () => process.env.JOBHQ_TUNNEL_URL_FILE || path.join(DATA_DIR, 'tunnel-url.txt');

/** The tunnel URL this server last started, or null. Used by the origin check. */
export function readTunnelUrl() {
  try {
    return fs.readFileSync(tunnelUrlFile(), 'utf8').trim() || null;
  } catch {
    return null;
  }
}

export function findCloudflared() {
  const candidates = [
    process.env.CLOUDFLARED_PATH,
    path.join(APP_DIR, 'scripts', 'bin', os.platform() === 'win32' ? 'cloudflared.exe' : 'cloudflared'),
    path.join(os.homedir(), '.local', 'bin', os.platform() === 'win32' ? 'cloudflared.exe' : 'cloudflared'),
  ].filter(Boolean);

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export function startTunnel({
  port = 5178,
  botToken = process.env.TELEGRAM_BOT_TOKEN,
  chatId = process.env.TELEGRAM_CHAT_ID,
  cloudflaredBin = findCloudflared(),
  spawnImpl = spawn,
  telegramApiImpl = telegramApi,
} = {}) {
  if (!cloudflaredBin) {
    console.log('  telegram tunnel: off (cloudflared not found)');
    return null;
  }

  const launch = () =>
    spawnImpl(cloudflaredBin, ['tunnel', '--url', `http://localhost:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

  let child;
  try {
    child = launch();
  } catch (err) {
    console.error('  telegram tunnel: failed to spawn cloudflared:', err.message);
    return null;
  }

  let currentUrl = null;
  let stopped = false;
  let restartDelayMs = 5_000;

  function handleData(chunk) {
    const text = chunk.toString();
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && match[0] !== currentUrl) {
      currentUrl = match[0];
      try {
        const file = tunnelUrlFile();
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, currentUrl, 'utf8');
        restartDelayMs = 5_000; // a URL means it connected; reset the backoff
      } catch (err) {
        console.error('  telegram tunnel: failed to write tunnel-url.txt:', err.message);
      }
      console.log(`  telegram tunnel: on  →  ${currentUrl}/miniapp`);

      if (botToken) {
        telegramApiImpl(
          'setChatMenuButton',
          {
            menu_button: {
              type: 'web_app',
              text: '📱 JobHQ',
              web_app: { url: `${currentUrl}/miniapp` },
            },
          },
          { token: botToken, label: 'setChatMenuButton (tunnel)' }
        ).catch(() => {});
      }
    }
  }

  // cloudflared quick tunnels drop now and then (one died with code 11 on
  // 21 Oct and the Mini App stayed dead for days). Relaunch with a capped
  // backoff; a fresh URL re-registers the Telegram menu button via handleData.
  const attach = (proc) => {
    proc.stdout?.on('data', handleData);
    proc.stderr?.on('data', handleData);
    proc.on('close', (code) => {
      if (stopped) return;
      console.log(`  telegram tunnel: closed (code ${code}), restarting in ${restartDelayMs / 1000}s`);
      currentUrl = null;
      const t = setTimeout(() => {
        if (stopped) return;
        try {
          attach(launch());
        } catch (err) {
          console.error('  telegram tunnel: restart failed:', err.message);
        }
      }, restartDelayMs);
      t.unref?.();
      restartDelayMs = Math.min(restartDelayMs * 2, 5 * 60_000);
    });
  };
  attach(child);

  // The caller only holds the first process; make its kill() stop the whole loop.
  const firstKill = child.kill?.bind(child);
  child.kill = (sig) => {
    stopped = true;
    return firstKill?.(sig);
  };

  return child;
}
