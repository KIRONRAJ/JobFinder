/**
 * One-time setup: prompts for a password, scrypt-hashes it, and writes
 * APP_PASSWORD_HASH into App/.env. Run again any time to change the
 * password — it overwrites the existing line rather than duplicating it.
 *
 * Doesn't touch SESSION_SECRET — the server generates and persists that
 * itself on first run. Restart the server after running this.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(APP_DIR, '.env');

const CTRL_C_CODE = 0x03;
const BACKSPACE_CODE = 0x7f;

function readPassword(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const chars = [];
    const isTty = process.stdin.isTTY;
    if (isTty) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onData = (char) => {
      const code = char.charCodeAt(0);

      if (char === '\r' || char === '\n') {
        if (isTty) process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(chars.join(''));
        return;
      }
      if (code === CTRL_C_CODE) {
        process.stdout.write('\n');
        process.exit(1);
      }
      if (code === BACKSPACE_CODE || char === '\b') {
        if (chars.length) {
          chars.pop();
          if (isTty) process.stdout.write('\b \b');
        }
        return;
      }
      chars.push(char);
      if (isTty) process.stdout.write('*');
    };

    process.stdin.on('data', onData);
  });
}

function scryptHash(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function upsertEnvLine(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) return content.replace(re, line);
  const sep = content.endsWith('\n') || content === '' ? '' : '\n';
  return `${content}${sep}${line}\n`;
}

const password = await readPassword('Set a password for Job Search HQ: ');
if (!password || password.length < 8) {
  console.error('\nPassword must be at least 8 characters. Nothing was changed.');
  process.exit(1);
}
const confirm = await readPassword('Confirm password: ');
if (confirm !== password) {
  console.error('\nPasswords did not match. Nothing was changed.');
  process.exit(1);
}

const existing = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
const updated = upsertEnvLine(existing, 'APP_PASSWORD_HASH', scryptHash(password));
fs.writeFileSync(ENV_FILE, updated, 'utf8');

console.log('\nPassword set. Restart the server (Start Job HQ.bat) for it to take effect.');
