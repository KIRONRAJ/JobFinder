import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, 'index.js');
const APPLICATIONS_FILE = path.join(__dirname, '..', 'data', 'applications.json');
const API_PORT = process.env.API_PORT || 5178;
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_PATH],
    // The SDK's default spawn env is a filtered allowlist (PATH, HOME, etc.),
    // not a full inherit — MCP_AUTH_TOKEN must be added explicitly or the
    // spawned server subprocess never sees it, even though it's set here.
    env: { ...getDefaultEnvironment(), ...(MCP_AUTH_TOKEN ? { MCP_AUTH_TOKEN } : {}) },
  });
  const client = new Client({ name: 'jobhq-mcp-test', version: '1.0.0' });
  await client.connect(transport);

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  if (!names.includes('update_status')) {
    console.error(`FAIL: expected 'update_status' in tools list, got: ${names.join(', ')}`);
    process.exit(1);
  }
  console.log("PASS: 'update_status' tool is registered and discoverable.");

  // Find a real entry to round-trip against, if the dev server is up.
  // NOTE: MCP_AUTH_TOKEN now only authenticates PATCH /api/applications/:id
  // (see Finding 1 fix) — it no longer works on GET /api/applications, so
  // this reads the data file directly instead of hitting that endpoint.
  let apps;
  try {
    const ping = await fetch(`http://localhost:${API_PORT}/api/applications`);
    if (ping.status !== 401 && !ping.ok) {
      console.error(`FAIL: server responded with unexpected status ${ping.status}`);
      process.exit(1);
    }
    apps = JSON.parse(fs.readFileSync(APPLICATIONS_FILE, 'utf8'));
  } catch {
    console.log('Dev server not reachable — skipping the live tool-call check.');
    await client.close();
    return;
  }

  if (apps.length === 0) {
    console.log('Dev server reachable but has no applications — skipping the live tool-call check.');
    await client.close();
    return;
  }

  const target = apps[0];
  const callResult = await client.callTool({
    name: 'update_status',
    arguments: { id: target.id, status: target.status }, // no-op: same status back
  });

  const text = callResult.content?.[0]?.text ?? '';
  if (callResult.isError) {
    console.error(`FAIL: update_status call returned an error: ${text}`);
    process.exit(1);
  }
  const parsed = JSON.parse(text);
  if (parsed.status !== target.status) {
    console.error(`FAIL: expected status ${target.status}, got ${parsed.status}`);
    process.exit(1);
  }
  console.log(
    `PASS: update_status round-trip against ${target.company} — ${target.role} (id ${target.id}) succeeded, no data changed.`
  );
  await client.close();
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
