// Captures a job ad while it is still live: the verbatim body as `Job Ad.txt`
// and a printed `Job Ad.pdf`, both in the role's folder. Ads vanish once they
// close, and the CV engine needs the ad's own wording, not a paraphrase.

import { execFile } from 'node:child_process';
import fsPromises from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { isFetchableUrl, SAFE_CURL_ARGS, guardCurlOutput } from './safe-url.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MIN_AD_CHARS = 200;
const RETRY_AFTER_MS = 24 * 3_600_000;
const MAX_AGE_MS = 7 * 24 * 3_600_000;
const LIVE_STATUSES = new Set(['researching', 'applied', 'interview']);

export const SUMMARY_BLOCK_MESSAGE =
  'The saved ad text is a summary, not the real ad. Paste the verbatim ad in the "Job ad" section of the role page before generating a CV.';

/** Per-role archive base name. A fixed "Job Ad" collided whenever one company folder held several roles. */
export function adFileBase(company, role) {
  const clean = String(role || '')
    .replace(/[\\/|]+/g, ' - ')
    .replace(/[^\w \-()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return clean ? `Job Ad - ${clean}` : 'Job Ad';
}

/** Non-null when CV generation must not run on this entry's ad text. */
export function adTextBlocker(entry) {
  return entry?.jobTextKind === 'summary' ? SUMMARY_BLOCK_MESSAGE : null;
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function htmlToText(html) {
  const text = decodeEntities(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/\s+/g, ' ')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|ul|ol|tr|section)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  );
  return text
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter((l, i, arr) => l !== '' || (i > 0 && arr[i - 1] !== ''))
    .join('\n')
    .replace(/^- *\n/gm, '')
    .trim();
}

/** The balanced <div> that carries `marker` in its opening tag, or ''. */
function divContaining(html, marker) {
  const at = html.indexOf(marker);
  if (at === -1) return '';
  const start = html.lastIndexOf('<div', at);
  if (start === -1) return '';
  const tag = /<\/?div\b[^>]*>/gi;
  tag.lastIndex = start;
  let depth = 0;
  for (let m; (m = tag.exec(html)); ) {
    depth += m[0][1] === '/' ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return '';
}

function jsonLdDescription(html) {
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const b of blocks) {
    try {
      const data = JSON.parse(b.replace(/^<script[^>]*>|<\/script>$/gi, ''));
      for (const node of [data, ...(data['@graph'] || [])].flat()) {
        if (node?.['@type'] === 'JobPosting' && typeof node.description === 'string') return node.description;
      }
    } catch {}
  }
  return '';
}

export function seekReduxContent(html) {
  if (!html) return '';
  const match = html.match(/window\.SEEK_REDUX_DATA\s*=\s*(\{[\s\S]*?\});/);
  if (match) {
    try {
      const data = JSON.parse(match[1]);
      const job = data.jobdetails?.result?.job;
      if (job?.content && typeof job.content === 'string') return job.content;
      if (job?.content2 && typeof job.content2 === 'string') return job.content2;
    } catch {}
  }
  return '';
}

function linkedInContent(html) {
  if (!html) return '';
  const m = html.match(/<div\b[^>]*class=["'][^"']*show-more-less-html__markup[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  return m ? m[1] : '';
}

/** Verbatim ad body from a job page, or '' when no known ad container is found. */
export function extractAdText(html) {
  if (!html) return '';
  const raw =
    seekReduxContent(html) ||
    divContaining(html, 'data-automation="jobAdDetails"') ||
    linkedInContent(html) ||
    divContaining(html, 'jobDescriptionText') ||
    divContaining(html, 'job-description') ||
    jsonLdDescription(html);
  const text = raw ? htmlToText(raw.includes('<') ? raw : decodeEntities(raw)) : '';
  return text.length >= MIN_AD_CHARS ? text : '';
}

export function needsAdSnapshot(entry, now = Date.now()) {
  if (!entry || entry.adSnapshotAt || !LIVE_STATUSES.has(entry.status)) return false;
  if (!entry.link || !isFetchableUrl(entry.link)) return false;
  if (now - (entry.created || 0) > MAX_AGE_MS) return false;
  return !entry.adSnapshotTriedAt || now - entry.adSnapshotTriedAt > RETRY_AFTER_MS;
}

function run(execFileImpl, bin, args, timeout) {
  return new Promise((resolve) => {
    execFileImpl(bin, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) =>
      resolve(err ? '' : String(stdout || ''))
    );
  });
}

function findChromium() {
  return ['/usr/bin/chromium-browser', '/snap/bin/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) =>
    fsSync.existsSync(p)
  );
}

/**
 * Fetch `entry.link`, and when a real ad body is found write `Job Ad.txt` and
 * `Job Ad.pdf` into `<careerDir>/<folderRel>`. Nothing is written for a page
 * with no recognisable ad (expired listing, login wall), so a closed ad never
 * overwrites the archive with a "no longer advertised" page.
 */
export async function snapshotAd(entry, { careerDir, folderRel, execFileImpl = execFile, chromium = findChromium() }) {
  if (!isFetchableUrl(entry.link)) return { adText: '' };
  const html = guardCurlOutput(await run(execFileImpl, 'curl', [...SAFE_CURL_ARGS, '--max-time', '15', '-A', UA, entry.link], 20_000));
  const adText = extractAdText(html);
  if (!adText) return { adText: '' };

  const dir = path.join(careerDir, folderRel);
  await fsPromises.mkdir(dir, { recursive: true });
  const header = `${entry.company} — ${entry.role}\n${entry.link}\nCaptured ${new Date().toISOString()}\n\n`;
  await fsPromises.writeFile(path.join(dir, `${adFileBase(entry.company, entry.role)}.txt`), header + adText + '\n', 'utf8');

  let pdf = false;
  if (chromium) {
    const pdfPath = path.join(dir, `${adFileBase(entry.company, entry.role)}.pdf`);
    await run(
      execFileImpl,
      chromium,
      ['--headless', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, entry.link],
      90_000
    );
    pdf = fsSync.existsSync(pdfPath);
  }
  return { adText, folderPath: folderRel, pdf };
}
