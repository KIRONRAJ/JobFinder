/**
 * Fails if any arbitrary font size (`text-[13px]`, `text-[11.5px]`, …) is left
 * in src/. The app used to carry 14 of them, 168 usages crammed between 11.5px
 * and 13.5px — steps too small to read as hierarchy. The scale now lives in
 * tailwind.config.js as nine named tokens; this keeps it that way.
 *
 * Run manually (`npm run check:type`) before a commit. Deliberately not a
 * watcher — standing background processes are clutter in this project.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const PATTERN = /text-\[[0-9.]+px\]/g;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.(tsx?|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const findings = [];
for (const file of await walk(SRC)) {
  const lines = (await readFile(file, 'utf8')).split('\n');
  lines.forEach((line, i) => {
    for (const match of line.matchAll(PATTERN)) {
      findings.push(`${relative(SRC, file)}:${i + 1}  ${match[0]}`);
    }
  });
}

if (findings.length === 0) {
  console.log('Type scale clean — no arbitrary font sizes in src/.');
  process.exit(0);
}

console.error(`${findings.length} arbitrary font size(s) left; use a scale token instead:\n`);
for (const f of findings) console.error(`  ${f}`);
console.error('\nTokens: display stat title heading subhead body meta micro label');
process.exit(1);
