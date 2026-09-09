/**
 * One-time setup: generates a random token for MCP clients (Claude Code,
 * Gemini/Antigravity) to authenticate as an alternative to the real login
 * password, and writes MCP_AUTH_TOKEN into App/.env. Run again any time to
 * rotate the token — it overwrites the existing line rather than duplicating it.
 *
 * Restart the server after running this, and update every MCP client config
 * that references the old token value.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(APP_DIR, '.env');

function upsertEnvLine(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) return content.replace(re, line);
  const sep = content.endsWith('\n') || content === '' ? '' : '\n';
  return `${content}${sep}${line}\n`;
}

const token = crypto.randomBytes(32).toString('hex');
const existing = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
const updated = upsertEnvLine(existing, 'MCP_AUTH_TOKEN', token);
fs.writeFileSync(ENV_FILE, updated, 'utf8');

console.log('MCP_AUTH_TOKEN generated and written to App/.env.');
console.log('Restart the server, then use this value in each MCP client config:');
console.log(token);
