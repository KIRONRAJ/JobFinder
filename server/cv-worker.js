// cv-worker.js — Autonomous 24/7 background worker for CV & Cover Letter generation.
// Monitors App/requests/ for cv_request__*.json, calls Gemini 3.6 Flash grounded
// in Candidate Key Facts, generates DOCX & PDF via generate-tailored-docs.py,
// verifies via verify-docs.py, updates applications.json & Notion, and emits audit event.

import { execFile } from 'node:child_process';
import fsPromises from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncPage } from './notion.js';
import { generateContent } from './ai-models.js';
import { isFetchableUrl } from './safe-url.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..');
const CAREER_DIR = path.resolve(APP_DIR, '..');
const DEFAULT_REQUESTS_DIR = path.join(APP_DIR, 'requests');
const DEFAULT_DATA_FILE = path.join(APP_DIR, 'data', 'applications.json');
const DEFAULT_AUDIT_FILE = path.join(APP_DIR, 'data', 'audit-log.jsonl');
const SCRIPTS_DIR = path.join(APP_DIR, 'scripts');
const DEFAULT_GENERATOR_SCRIPT = path.join(SCRIPTS_DIR, 'generate-tailored-docs.py');
const KEY_FACTS_DIR = path.join(CAREER_DIR, 'Project Notes');
const POLL_INTERVAL_MS = 10_000;

/**
 * Ceiling on the grounding facts pasted into the drafting prompt.
 *
 * This was 6,000, against a facts corpus of ~33,000 characters — so only ~18%
 * reached the model, and the cut landed partway through the FIRST of the four
 * files loadCandidateFacts() reads. research-project.md, skills-and-experience.md
 * and certifications.md were being read off disk and then discarded whole,
 * which is why the prompt still carries a hardcoded copy of the work history
 * and certifications to compensate.
 *
 * 60,000 clears the current corpus with room to grow and is still a small
 * fraction of the model's context window. Kept as a bound rather than removed
 * so an accidentally huge facts file can't blow up every request.
 */
const MAX_FACTS_CHARS = 60_000;

export function resolvePython() {
  const venvPython = path.join(APP_DIR, '.venv', 'bin', 'python');
  if (fsSync.existsSync(venvPython)) return venvPython;
  const venvWin = path.join(APP_DIR, '.venv', 'Scripts', 'python.exe');
  if (fsSync.existsSync(venvWin)) return venvWin;
  return process.platform === 'win32' ? 'python' : 'python3';
}

export async function loadCandidateFacts() {
  const parts = [];
  const files = [
    path.join(KEY_FACTS_DIR, 'Candidate Key Facts.md'),
    path.join(KEY_FACTS_DIR, 'candidate-facts', 'research-project.md'),
    path.join(KEY_FACTS_DIR, 'candidate-facts', 'skills-and-experience.md'),
    path.join(KEY_FACTS_DIR, 'candidate-facts', 'certifications.md'),
  ];
  for (const f of files) {
    try {
      const content = await fsPromises.readFile(f, 'utf8');
      parts.push(content);
    } catch {
      // optional file fallback
    }
  }
  return parts.join('\n\n');
}

export async function fetchJobText(url, execFileImpl = execFile) {
  if (!url) return '';
  // A job ad lives on the public internet. Refusing private targets stops this
  // scrape being usable as a proxy into loopback or the tailnet; an empty
  // string is what a failed fetch already looks like to every caller.
  if (!isFetchableUrl(url)) {
    console.warn(`cv-worker: refusing to fetch non-public URL: ${url}`);
    return '';
  }
  return new Promise((resolve) => {
    execFileImpl(
      'curl',
      [
        '-s',
        '-L',
        '--max-time',
        '10',
        '-A',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        url,
      ],
      { timeout: 12000 },
      (err, stdout) => {
        if (err || !stdout) return resolve('');
        const clean = stdout
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 8000);
        resolve(clean);
      }
    );
  });
}

export async function generateTailoredDocSpec({
  entry,
  candidateFacts,
  jobText = '',
  apiKey = process.env.GEMINI_API_KEY,
}) {
  const systemContext = [
    'You are the expert career assistant and CV/cover letter drafter for the candidate described in candidateFacts.',
    'Generate a tailored CV and single-page Cover Letter for the following job opportunity.',
    '',
    'VOICE AND STYLE (MANDATORY — READ FIRST):',
    'Write in first person as the candidate. Use natural, conversational English — the way a real person',
    'would explain their work to a colleague over coffee. Every skills paragraph and experience section must',
    'tell a story grounded in a real situation: include the company name, what happened, and what was learned.',
    '',
    'BANNED PHRASES — never use any of these:',
    '"fast-paced environment", "leveraging", "robust solutions", "meticulous diagnostic capabilities",',
    '"seamless collaboration", "analytical and client-focused IT professional", "comprehensive cross-browser testing",',
    '"continuous quality control inspections", "equipment operational checks", "upheld rigorous workplace health, safety, hygiene",',
    'or any phrase that sounds like it came from a job description rather than a human being.',
    '',
    'MODEL CV TO IMITATE (this is the gold standard — match this voice exactly):',
    'Career Objective example: "I want to work in cyber security and IT operations, with a strong interest in',
    'security operations and network security. I like the moment when a system stops being a mystery: when a',
    'stack of logs or a strange ticket turns into a clear cause and a fix."',
    'Skills Summary example: "At a mid-size ISP I worked the L2 tier on a 24/7 rotating roster, sitting',
    'between L1 and L3 on live network faults. A typical case started as a vague customer complaint, and I had',
    'to work back through the ticket, the monitoring data and, when it came to it, a call with our upstream carrier..."',
    '',
    'GROUNDING RULES (STRICT AND NON-NEGOTIABLE) — every fact below is illustrative placeholder data;',
    'in production this whole block is populated from candidateFacts, never hardcoded like this demo:',
    '1. Candidate Identity & Contact:',
    '   - Full Name: from candidateFacts.name',
    '   - Address, phone, email, LinkedIn, personal site: from candidateFacts.contact',
    '   - Work Eligibility: from candidateFacts.workEligibility, stated exactly as provided — never paraphrased.',
    '   - Driver Licence: dedicated line if candidateFacts includes one, on its own line below Work Eligibility with distinct vertical breathing space.',
    '   - ZERO PII beyond the above: no street address, age, date of birth, nationality, marital status, gender, or bare "Referees" heading.',
    '',
    '2. Academic Qualifications:',
    '   - Pull every degree, research project, and institution verbatim from candidateFacts.education — never invent or substitute an affiliating university.',
    '',
    '3. Authentic Work History (describe what actually happened, not what sounds impressive):',
    '   - Order roles by relevance to the target role, most relevant technical roles first.',
    '   - Example shape only (replace with candidateFacts.workHistory in production):',
    '   - Role: L2 NOC Engineer at a regional ISP (2 years, rotating 24/7 roster)',
    '     Provided back-end network configuration and troubleshooting, coordinating with technical support, service',
    '     provisioning and sales teams to keep services at or above SLA. Raised and chased tickets with upstream',
    '     carriers. Documented every ticket so lessons learned made it into the team knowledge base.',
    '   - Role: Software Support Engineer at a hosting/outsourcing provider',
    '     Provided technical support for Linux and Windows servers and web hosting. Handled server security,',
    '     hardening and performance tuning through control panel management. Communicated directly with clients',
    '     over calls, email, live chat and helpdesk.',
    '   - A short-tenure or manual-labour role should stay in plain, unembellished language — do NOT inflate it.',
    '',
    '4. Certifications & Upskilling (be precise about status — never round up):',
    '   - State exactly what candidateFacts records: "held" vs "hold" for lapsed certifications, "completed" vs',
    '     "completing X of Y courses" for in-progress ones, "training" vs "certification" where the two differ.',
    '   - NEVER add a credential, tool, or platform the candidate has not confirmed — if candidateFacts explicitly',
    '     forbids naming a specific tool/platform, honour that exclusion on every document.',
    '',
    '5. STRICT ANTI-HALLUCINATION & FACTUAL GROUNDING (ZERO TOLERANCE FOR FABRICATION):',
    '   - You must NEVER claim experience with a proprietary tool named in the job ad unless it appears in candidateFacts.',
    '   - Do NOT mirror the employer\'s proprietary tool names into Skills or Work History.',
    '   - Highlight authentic, transferable fundamentals instead.',
    '',
    '6. STRICT PROHIBITION ON PERSONAL INTERESTS / HOBBIES:',
    '   NEVER include an "Interests & Activities" or hobbies section on the CV, unless candidateFacts explicitly opts in.',
    '   Keep the CV strictly focused on technical competencies, professional experience, education, projects, and verifiable credentials.',
    '',
    '7. Tailoring to Job Ad:',
    '   - Tailor the Career Objective to explain why this specific type of work appeals to the candidate, connected to real experience.',
    '   - Tailor the Skills Summary story-paragraphs to emphasize the genuine capabilities most relevant to the role.',
    '   - Tailor the Detailed Experience narratives to highlight genuine skills relevant to the role.',
    '   - Do NOT change facts, only emphasis and framing.',
    '',
    '8. Cover Letter Requirements:',
    '   - Date: MUST use the current date in standard New Zealand format (e.g. "11 September 2026"). Never hardcode a stale date.',
    '   - Greeting: MUST be standard professional English: "Dear Hiring Team," (or "Dear [Hiring Manager Name]," if known).',
    '     STRICTLY FORBIDDEN: Do NOT use Māori greetings such as "Tēnā koe" or "Kia ora" unless candidateFacts explicitly requests them.',
    '   - Structure:',
    '     - Opening: State the role and company, noting location and headline qualification from candidateFacts.',
    '     - Body Para 1: Technical & analytical alignment with key job responsibilities.',
    '     - Body Para 2: Proven operational discipline, ticketing, communication, and reliability, grounded in candidateFacts.workHistory.',
    '     - Body Para 3: Local presence/commute, work eligibility exactly as recorded in candidateFacts, and eager commitment.',
    '     - Closing: Professional, respectful appreciation and invitation to discuss further.',
    '   - Signoff: MUST be standard professional English: "Sincerely,\\n<candidate name>" (or "Kind regards,\\n<candidate name>").',
    '     STRICTLY FORBIDDEN: Do NOT use Māori signoffs such as "Ngā mihi nui" or "Ngā mihi" unless candidateFacts explicitly requests them.',
    '   - WORD COUNT BUDGET: The cover letter body (starting from greeting to before signoff) MUST be strictly between 330 and 365 words.',
    '   - Must state the work-eligibility phrase from candidateFacts exactly the same way in both the CV and cover letter.',
    '',
    'RETURN FORMAT:',
    'Return ONLY valid JSON with these keys:',
    '"company", "role", "profile", "skills", "workHistory", "education", "projects", "certifications", "coverLetter".',
    '',
    'Where:',
    '- profile is a string: crisp 3-4 sentence professional summary (60-80 words) tailored to the role, grounded in candidateFacts. MUST contain ONLY the paragraph text itself — NEVER include candidate name, address, contact details, visa info, or prefixes like "Professional Summary:".',
    '- skills is an array of {"category": string, "detail": string} — 5 core competencies tailored to the role, each with specific technical tools and responsibilities.',
    '- workHistory is an array of {"role": string, "company": string, "period": string, "bullets": string[]} — every role from candidateFacts.workHistory, each with 3-4 active, grounded bullet points.',
    '- education is an array of {"title": string, "institution": string, "bullets": string[]}.',
    '- projects is an array of {"title": string, "subtitle": string, "bullets": string[]}.',
    '- certifications is an array of strings.',
    '- coverLetter is {"date": string, "addressee": string, "greeting": string, "paragraphs": string[], "signoff": string}.',
  ].join('\n');

  const userPrompt = [
    `TARGET COMPANY: ${entry.company}`,
    `TARGET ROLE: ${entry.role}`,
    `TARGET LOCATION: ${entry.location || 'Wellington, NZ'}`,
    `EXISTING ROLE NOTES: ${entry.notes || 'None'}`,
    `USER SPECIFIED FACTS: ${entry.userFacts || 'None'}`,
    '',
    '--- JOB AD CONTENT ---',
    jobText || entry.notes || `${entry.company} — ${entry.role}`,
    '',
    '--- CANDIDATE SOURCE OF TRUTH ---',
    candidateFacts.slice(0, MAX_FACTS_CHARS),
  ].join('\n\n');

  const { text: rawJson, model } = await generateContent({
    parts: [{ text: `${systemContext}\n\n${userPrompt}` }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    apiKey,
  });
  console.log(`cv-worker: successfully drafted CV spec with ${model}`);

  const spec = JSON.parse(rawJson);
  spec.company = spec.company || entry.company;
  spec.role = spec.role || entry.role;
  const cleanCompany = spec.company
    .replace(/\s*[/\\|]\s*/g, ' - ')
    .replace(/[\?%*:"><]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Write into the entry's existing folder when it has one.
  //
  // This used to hardcode 'Pending to Apply/<company>' and then overwrite
  // entry.folderPath with it further down, so regenerating a CV for a role
  // already at Applied/ or Interview/ silently dragged its folderPath back to
  // Pending to Apply/ — while the documents for that role stayed where they
  // were. That is the most likely source of the tracker/disk mismatches found
  // in the 15 Sep 2026 cleanup audit, where five entries pointed at folders
  // that no longer existed.
  //
  // Guarded rather than trusted: folderPath is user-editable, so anything
  // absolute, empty, or escaping the repo falls back to the old default.
  const existing = typeof entry.folderPath === 'string' ? entry.folderPath.trim() : '';
  const insideRepo =
    existing &&
    !path.isAbsolute(existing) &&
    !path.normalize(existing).split(/[\\/]/).includes('..');
  spec.outputDir = insideRepo ? existing : path.join('Pending to Apply', cleanCompany);

  const todayFormatted = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Pacific/Auckland',
  });

  if (typeof spec.coverLetter === 'string') {
    spec.coverLetter = {
      date: todayFormatted,
      addressee: `Hiring Team\n${spec.company}\n${entry.location || 'Wellington, New Zealand'}`,
      greeting: 'Dear Hiring Team,',
      paragraphs: spec.coverLetter.split('\n\n').filter((p) => p.trim()),
      signoff: 'Sincerely,\nJordan Smith',
    };
  } else if (spec.coverLetter && typeof spec.coverLetter === 'object') {
    if (!spec.coverLetter.date || spec.coverLetter.date.trim() === '5 September 2026' || /october\s+2026/i.test(spec.coverLetter.date)) {
      spec.coverLetter.date = todayFormatted;
    }
    if (!spec.coverLetter.greeting || /t[eē]n[aā]|kia\s*ora/i.test(spec.coverLetter.greeting)) {
      spec.coverLetter.greeting = 'Dear Hiring Team,';
    }
    if (!spec.coverLetter.signoff || /ng[aā]\s*mihi/i.test(spec.coverLetter.signoff)) {
      spec.coverLetter.signoff = 'Sincerely,\nJordan Smith';
    }
    if (!spec.coverLetter.addressee) {
      spec.coverLetter.addressee = `Hiring Team\n${spec.company}\n${entry.location || 'Wellington, New Zealand'}`;
    }
  }

  // Sanitize certifications: strictly remove any ServiceNow hallucination
  if (Array.isArray(spec.certifications)) {
    spec.certifications = spec.certifications.filter((c) => {
      const txt = typeof c === 'string' ? c : (c?.title || c?.name || '');
      return !/servicenow/i.test(txt);
    });
  }

  // Delete interests permanently per candidate instruction
  delete spec.interests;

  return spec;
}

export async function processSingleCvRequest(
  requestFilePath,
  {
    requestsDir = DEFAULT_REQUESTS_DIR,
    dataFile = DEFAULT_DATA_FILE,
    auditFile = DEFAULT_AUDIT_FILE,
    generatorScript = DEFAULT_GENERATOR_SCRIPT,
    apiKey = process.env.GEMINI_API_KEY,
    execFileImpl = execFile,
    // Injected by index.js as withDataLock('applications', fn) so the worker
    // shares the one lock guarding this file. Defaults to a pass-through: the
    // tests drive this function directly against a temp file with no server
    // running, where there is nothing to serialise against.
    lock = (fn) => fn(),
  } = {}
) {
  const reqContent = await fsPromises.readFile(requestFilePath, 'utf8');
  const req = JSON.parse(reqContent);
  console.log(`cv-worker: processing request for ${req.company} — ${req.role}`);

  // 1. Read application entry from applications.json
  const appsRaw = await fsPromises.readFile(dataFile, 'utf8');
  const apps = JSON.parse(appsRaw);
  const entryIdx = apps.findIndex((a) => a.id === req.id || a.matchKey === req.matchKey);
  if (entryIdx === -1) {
    console.warn(`cv-worker: no application found matching ${req.id || req.matchKey}, cleaning up request`);
    await fsPromises.unlink(requestFilePath);
    return null;
  }
  const entry = apps[entryIdx];

  // 2. Fetch context and candidate facts
  let jobText = '';
  if (req.link) {
    jobText = await fetchJobText(req.link, execFileImpl);
  }
  const candidateFacts = await loadCandidateFacts();

  // 3. Generate tailored spec via Gemini
  const spec = await generateTailoredDocSpec({
    entry,
    candidateFacts,
    jobText,
    apiKey,
  });

  // 4. Write spec file for generator script
  const specFile = path.join(requestsDir, `spec__${entry.matchKey || 'temp'}__${Date.now()}.json`);
  await fsPromises.writeFile(specFile, JSON.stringify(spec, null, 2), 'utf8');

  // 5. Run generator script with python
  const pythonBin = resolvePython();
  await new Promise((resolve, reject) => {
    execFileImpl(
      pythonBin,
      [generatorScript, '--input', specFile, '--convert-pdf', '--verify'],
      { timeout: 90000 },
      (err, stdout, stderr) => {
        if (err) {
          console.error('cv-worker: generator script failed:', stderr || stdout || err.message);
          return reject(new Error(`Generator script failed: ${stderr || err.message}`));
        }
        console.log('cv-worker: generator output:\n' + stdout);
        resolve();
      }
    );
  });

  // Clean up spec file
  await fsPromises.unlink(specFile).catch(() => {});

  // 6. Update applications.json.
  //
  // The whole read-modify-write runs inside the caller-supplied lock, not just
  // the write: this worker fires off an fs.watch plus a 10s poll, so without it
  // it can read the same snapshot as an in-flight API request and clobber
  // whatever that request wrote. The generator call above deliberately stays
  // OUTSIDE the lock — it can take 90s, and holding the applications lock that
  // long would stall every API write behind it.
  const updatedEntry = await lock(async () => {
    const updatedApps = JSON.parse(await fsPromises.readFile(dataFile, 'utf8'));
    const idx = updatedApps.findIndex((a) => a.id === entry.id || a.matchKey === entry.matchKey);
    if (idx === -1) return null;
    updatedApps[idx] = {
      ...updatedApps[idx],
      cvStatus: 'drafted',
      cover: 'draft',
      folderPath: spec.outputDir,
      updated: Date.now(),
      activity: [
        ...(updatedApps[idx].activity || []),
        {
          at: Date.now(),
          kind: 'cv-generated',
          text: `Tailored CV & Cover Letter drafted in ${spec.outputDir}`,
        },
      ],
    };
    // Temp-then-rename, matching writeData() in server/index.js — rename is
    // atomic, so an interrupted write can never truncate the real file.
    const tmp = `${dataFile}.tmp`;
    await fsPromises.writeFile(tmp, JSON.stringify(updatedApps, null, 2), 'utf8');
    await fsPromises.rename(tmp, dataFile);
    return updatedApps[idx];
  });

  if (updatedEntry) {
    // 7. Sync to Notion
    try {
      await syncPage(updatedEntry);
    } catch (nErr) {
      console.error('cv-worker: Notion sync error (non-blocking):', nErr.message);
    }

    // 8. Append to audit log (triggers Telegram notification & PDF upload)
    const auditLine =
      JSON.stringify({
        action: 'cv-generated',
        entryId: entry.id,
        matchKey: entry.matchKey,
        detail: `Tailored CV and Cover Letter generated for ${entry.company} — ${entry.role}`,
        actor: 'cv-worker',
        at: Date.now(),
      }) + '\n';
    await fsPromises.appendFile(auditFile, auditLine, 'utf8');
  }

  // 9. Clean up request file
  await fsPromises.unlink(requestFilePath);
  console.log(`cv-worker: completed request for ${entry.company} — ${entry.role}`);
  return entry;
}

export async function processPendingCvRequests(opts = {}) {
  const requestsDir = opts.requestsDir || DEFAULT_REQUESTS_DIR;
  try {
    const files = await fsPromises.readdir(requestsDir);
    const cvRequests = files.filter((f) => f.startsWith('cv_request__') && f.endsWith('.json'));
    for (const reqFile of cvRequests) {
      const fullPath = path.join(requestsDir, reqFile);
      try {
        await processSingleCvRequest(fullPath, opts);
      } catch (err) {
        console.error(`cv-worker: failed to process ${reqFile}:`, err.message);
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('cv-worker: polling error:', err.message);
    }
  }
}

export function startCvWorker(opts = {}) {
  const requestsDir = opts.requestsDir || DEFAULT_REQUESTS_DIR;
  const pollIntervalMs = opts.pollIntervalMs || POLL_INTERVAL_MS;

  fsPromises.mkdir(requestsDir, { recursive: true }).catch(() => {});

  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      await processPendingCvRequests(opts);
    } finally {
      running = false;
    }
  }

  // Watch directory if possible
  try {
    fsSync.watch(requestsDir, () => tick());
  } catch {
    // fs.watch fallback to setInterval
  }

  setInterval(tick, pollIntervalMs);
  // Run an immediate check on startup
  setTimeout(tick, 1000);
  console.log('  autonomous cv worker: on');
}
