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
import { isFetchableUrl, SAFE_CURL_ARGS, guardCurlOutput } from './safe-url.js';
import { extractAdText, adTextBlocker } from './ad-snapshot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..');
const CAREER_DIR = path.resolve(APP_DIR, '..');
const DEFAULT_REQUESTS_DIR = path.join(APP_DIR, 'requests');
const DEFAULT_DATA_FILE = path.join(APP_DIR, 'data', 'applications.json');
const DEFAULT_AUDIT_FILE = path.join(APP_DIR, 'data', 'audit-log.jsonl');
const SCRIPTS_DIR = path.join(APP_DIR, 'scripts');
const DEFAULT_GENERATOR_SCRIPT = path.join(SCRIPTS_DIR, 'generate-tailored-docs.py');
// Deterministic, evidence-only CV builder (no model calls). See
// docs/superpowers/plans/2026-09-25-deterministic-ats-cv-engine.md.
const DEFAULT_ENGINE_SCRIPT = path.join(SCRIPTS_DIR, 'cv_engine.py');
// Shorter than this is a JS shell or an error page, not a job ad.
const MIN_JOB_TEXT = 400;
const KEY_FACTS_DIR = path.join(CAREER_DIR, 'Project Notes');
const POLL_INTERVAL_MS = 10_000;
const CL_MAX_RETRIES = 3;
const CL_RETRY_DELAY_MS = 10 * 60_000;

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

export const DEFAULT_MEMORY_FILE = path.join(APP_DIR, 'data', 'tailor-memory.json');

export async function loadTailorMemory(memoryFile = DEFAULT_MEMORY_FILE) {
  try {
    const raw = await fsPromises.readFile(memoryFile, 'utf8');
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter((r) => r && r.active && typeof r.rule === 'string');
  } catch {
    return [];
  }
}

export async function addTailorMemoryRule(
  { topic = 'general', rule, company = '', role = '' },
  memoryFile = DEFAULT_MEMORY_FILE
) {
  if (!rule || typeof rule !== 'string') return null;
  let list = [];
  try {
    const raw = await fsPromises.readFile(memoryFile, 'utf8');
    list = JSON.parse(raw);
    if (!Array.isArray(list)) list = [];
  } catch {
    list = [];
  }
  const newEntry = {
    id: `RULE-${String(list.length + 1).padStart(3, '0')}`,
    topic,
    company,
    role,
    rule: rule.trim(),
    active: true,
    created: Date.now(),
  };
  list.push(newEntry);
  if (list.length > 25) {
    list = list.slice(-25);
  }
  const tmp = `${memoryFile}.tmp`;
  await fsPromises.writeFile(tmp, JSON.stringify(list, null, 2), 'utf8');
  await fsPromises.rename(tmp, memoryFile);
  return newEntry;
}

export async function loadCandidateFacts() {
  const parts = [];
  const files = [
    path.join(KEY_FACTS_DIR, 'Candidate Key Facts.md'),
    path.join(KEY_FACTS_DIR, 'candidate-facts', 'research-project.md'),
    path.join(KEY_FACTS_DIR, 'candidate-facts', 'skills-and-experience.md'),
    path.join(KEY_FACTS_DIR, 'candidate-facts', 'certifications.md'),
    path.join(KEY_FACTS_DIR, 'candidate-facts', 'review-answers.md'),
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
        ...SAFE_CURL_ARGS,
        '--max-time',
        '10',
        '-A',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        url,
      ],
      { timeout: 12000 },
      (err, rawOut) => {
        const stdout = err ? '' : guardCurlOutput(rawOut);
        if (!stdout) return resolve('');
        const ad = extractAdText(stdout);
        if (ad) return resolve(ad.slice(0, 8000));
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

export function outputDirFor(entry) {
  const cleanCompany = entry.company
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
  return (insideRepo ? existing : path.join('Pending to Apply', cleanCompany)).replace(/\\/g, '/');
}

/**
 * Returns the folder the entry should end up in. If its current folderPath
 * (re-read under the lock) differs from where the generator just wrote, the
 * entry moved mid-run: move the new files into the current folder, newest wins.
 */
async function settleOutputDir(currentPath, generatedDir) {
  const cur = typeof currentPath === 'string' ? currentPath.trim().replace(/\\/g, '/') : '';
  const ok = cur && !path.isAbsolute(cur) && !path.normalize(cur).split(/[\\/]/).includes('..');
  if (!ok || path.normalize(cur) === path.normalize(generatedDir)) return generatedDir;
  const from = path.join(CAREER_DIR, generatedDir);
  const to = path.join(CAREER_DIR, cur);
  try {
    await fsPromises.mkdir(to, { recursive: true });
    for (const f of await fsPromises.readdir(from)) await fsPromises.rename(path.join(from, f), path.join(to, f));
    await fsPromises.rmdir(from).catch(() => {});
    return cur;
  } catch (err) {
    console.error('cv-worker: could not move output into', cur, err.message);
    return generatedDir;
  }
}

export async function generateTailoredDocSpec({
  entry,
  candidateFacts,
  jobText = '',
  apiKey = process.env.GEMINI_API_KEY,
  memoryFile = DEFAULT_MEMORY_FILE,
  reviewFeedback = '',
}) {
  const memoryRules = await loadTailorMemory(memoryFile);
  const memoryRulesText = memoryRules.length > 0
    ? [
        '',
        'CONTINUOUS LEARNING — USER-VERIFIED TAILORING RULES (HIGHEST PRIORITY):',
        ...memoryRules.map((r, i) => `  ${i + 1}. [${r.topic || 'General'}] ${r.rule}`),
      ]
    : [];

  const systemContext = [
    'You are the expert career assistant and CV/cover letter drafter for Jordan Smith.',
    'Generate a tailored CV and single-page Cover Letter for the following job opportunity.',
    ...memoryRulesText,
    '',
    'VOICE AND STYLE (MANDATORY — READ FIRST):',
    'CV: an ATS scans it literally before a human reads it. Resume style, no "I". Start bullets with strong',
    'past-tense verbs. For any skill Jordan genuinely has, use the job ad\'s EXACT wording and spelling',
    '(e.g. "judgement", "incident management", "communication skills") — a synonym scores zero.',
    '(When the ad text is available the CV sections are rebuilt deterministically from the evidence bank',
    'after this step, so the cover letter is what matters most here.)',
    'Cover letter: first person, natural conversational English, grounded in real situations.',
    '',
    'ANTI-AI WRITING RULES & BANNED SLOP (STRICT ENFORCEMENT — checked by verify-docs.py):',
    '1. Banned AI Vocabulary (use plain, grounded human alternatives):',
    '   - NEVER use: "delve", "tapestry", "testament", "underscore", "underscores", "pivotal", "intricate", "meticulous",',
    '     "bolster", "interplay", "realm", "landscape", "embark", "leverage", "leveraging", "elevate", "unlock",',
    '     "unleash", "harness", "robust", "robust solutions", "seamless", "seamlessly", "seamless collaboration",',
    '     "holistic", "myriad", "plethora", "beacon", "cornerstone", "game-changer", "paradigm", "synergy",',
    '     "foster", "cultivate", "supercharge", "transformative", "bespoke", "fast-paced environment",',
    '     "cutting-edge", "world-class", "best-in-class", "meticulous diagnostic capabilities",',
    '     "analytical and client-focused IT professional", "continuous quality control inspections",',
    '     "upheld rigorous workplace health, safety, hygiene". (The ad\'s own specific technical tools are NOT banned).',
    '2. No Negative Parallelism (The #1 AI Tell):',
    '   - NEVER write "not just X, but Y", "not only X, but also Y", or "more than just X". State the positive achievement directly.',
    '3. No Throat-Clearing Openers & Academic Transitions:',
    '   - NEVER open sentences with "In today\'s fast-paced/ever-evolving world...", "When it comes to...",',
    '     "It is important to note...", "It is worth noting that...", or "Needless to say...".',
    '   - NEVER start cover letter sentences with "Furthermore,", "Moreover,", or "Additionally,". Use "Also,", "And", or assert directly.',
    '4. No Present-Participle Tailings:',
    '   - Do NOT end sentences with vague ",-ing" clauses (e.g. "...ensuring seamless operations", "...fostering collaboration").',
    '5. Punctuation Cleanliness:',
    '   - ZERO em dashes ("—") and ZERO semicolons (";"). Use full stops, commas, or parentheses only.',
    '6. Burstiness & Cadence:',
    '   - Mix sentence lengths naturally. Include short, punchy sentences (< 7 words) alongside compound technical points.',
    '   - State concrete specifics: tools, ticket volumes, protocols, and hardware.',
    '',
    'MODEL CV TO IMITATE (this is the gold standard — match this voice exactly):',
    'Career Objective example: "I want to work in cyber security and IT operations, with a strong interest in',
    'security operations and network security. I like the moment when a system stops being a mystery: when a',
    'stack of logs or a strange ticket turns into a clear cause and a fix."',
    'Skills Summary example: "At Northline Broadband I worked the L2 tier on a 24/7 rotating roster, sitting',
    'between L1 and L3 on live network faults. A typical case started as a vague customer complaint, and I had',
    'to work back through the ticket, the monitoring data and, when it came to it, a call with our upstream carrier..."',
    '',
    'GROUNDING RULES (STRICT AND NON-NEGOTIABLE):',
    '1. Candidate Identity & Contact:',
    '   - Full Name: JORDAN SMITH',
    '   - Address: Petone, Lower Hutt, Wellington',
    '   - Phone: +64 21 555 0100',
    '   - Email: jordan.smith.demo@example.com',
    '   - LinkedIn: linkedin.com/in/jordansmithdemo',
    '   - Web: www.example.com',
    '   - Work Eligibility: 3-year Post Study Work Visa (Open Work Visa) – full open work rights, no sponsorship required.',
    '   - Driver Licence: Dedicated line: "Full clean New Zealand Class 1 Driver Licence and personal vehicle." (Must be placed on its own separate line below Work Eligibility with distinct vertical breathing space).',
    '   - ZERO PII: Do not include street address, age, date of birth, nationality, marital status, gender, or bare "Referees" heading.',
    '',
    '2. Academic Qualifications:',
    "   - Master's Degree: Master of Information Technology (Cyber Security specialisation), completed with Merit (July 2026), Riverside Institute of Technology, Wellington.",
    "   - Master's Research Project: MUST be included under Project Experience: \"Replay Attack Prevention in Smart Car IoT Systems. Evaluated hybrid nonce- and counter-based defense across latency and detection rate in a simulated smart-vehicle IoT environment.\"",
    '   - Undergraduate Degree: Bachelor of Technology in Electronics and Communication Engineering, Hillcrest Engineering College, Northgate University (06/2013 – 07/2017), Thrissur, India. (NEVER cite any other affiliating university).',
    '',
    '3. Authentic Work History (4 roles — describe what actually happened, not what sounds impressive):',
    '   - For IT, Systems, NOC, Cyber, Engineering, or Software roles:',
    '     Lead with primary technical roles: Cascade Infovision (Software Engineer / Systems Support) and Northline Broadband (L2 NOC Engineer) prioritized for Page 1.',
    '     Place a local brewery (Production Labourer) and Freelance Web Developer on Page 2.',
    '   - Role 1: L2 NOC Engineer at Northline Broadband (11/2017 – 06/2019 | Thrissur, Kerala)',
    '     Northline is a well-known ISP across Kerala. Worked the L2 tier on a 24/7 rotating roster, providing',
    '     back-end network configuration and troubleshooting, coordinating with technical support, service provisioning',
    '     and sales teams to keep services at or above SLA. Raised and chased tickets with upstream carriers (Jio,',
    '     Airtel, Vodafone, Powertel). Supported customers and operators via AnyDesk and TeamViewer. Helped with',
    '     server installation on DNS and speed-test servers. Documented every ticket so lessons learned made it into',
    '     the team knowledge base.',
    '   - Role 2: Software Engineer at Cascade Infovision, trading internationally as Cascade (04/2021 – 07/2021 | Kochi, Kerala)',
    '     Cascade is a 24/7 outsourced technical support provider for hosting companies. Provided technical support for',
    '     Linux and Windows servers and web hosting. Handled server security, hardening and performance tuning through',
    '     control panel management. Set up and administered VPS and dedicated servers. Worked with the development and',
    '     testing team to build solutions meeting client requirements. Communicated directly with clients over calls,',
    '     email, live chat and helpdesk. Worked over VNC, diagnosing server problems from logs and behaviour.',
    '   - Role 3: Production Labourer at a local brewery (02/2026 – 03/2026 | Brewtown, Upper Hutt, New Zealand)',
    '     Packed and sealed beer bottles and cans. Checked batches for labeling accuracy and fill levels. Organized',
    '     finished products in the storage area for shipping. Plain language only — do NOT inflate this role.',
    '   - Role 4: Freelance Web Developer (07/2021 – 06/2025 | Thrissur, India)',
    '     Built websites using HTML, CSS, JavaScript and jQuery. Discussed requirements with clients and produced',
    '     development plans. Ran debugging tools before publishing. Implemented changes to streamline business operations.',
    '',
    '4. Certifications & Upskilling (be precise about status — never round up):',
    '   - Red Hat Certified System Administrator (RHCSA, RHEL 7) — Certificate ID: 170-264-105 (earned Dec 2017 — foundational enterprise Linux credential; never claim active status or lead pitch with it)',
    '   - Google Cybersecurity Professional Certificate — Coursera (currently completing, 5 of 8 courses complete — say exactly this)',
    '   - cPanel Professional Certification (CPP) & cPanel & WHM Administrator (CWA) — held 2021–2022 (lapsed — say "held", not "hold")',
    '   - freeCodeCamp Responsive Web Design certification (around 300 hours of coursework)',
    '   - CCNA training certificate (Vidya Academy — this is a TRAINING certificate, NOT a Cisco-issued certification)',
    '   - STRICT PROHIBITION ON SERVICENOW: NEVER add ServiceNow (e.g. "ServiceNow Fundamentals", "ServiceNow training") anywhere on the CV or Cover Letter. Candidate is only beginning self-study and has explicitly forbidden adding it to applications.',
    '   - Do NOT claim Google Cybersecurity cert as complete until all 8 courses are done.',
    '',
    '5. STRICT ANTI-HALLUCINATION & FACTUAL GROUNDING (ZERO TOLERANCE FOR FABRICATION):',
    '   - You must NEVER claim experience with proprietary tools from the job ad (e.g. "Kraken", "Salesforce", etc.)',
    '     unless they appear in Candidate Key Facts.',
    '   - Do NOT mirror the employer\'s proprietary tool names into Skills or Work History.',
    '   - Highlight authentic, transferable fundamentals instead.',
    '',
    '6. STRICT PROHIBITION ON PERSONAL INTERESTS / HOBBIES:',
    '   NEVER include an "Interests & Activities" or hobbies section on the CV.',
    '   Candidate explicitly considers personal hobbies unprofessional for technical and engineering roles.',
    '   Keep the CV strictly focused on technical competencies, professional experience, education, projects, and verifiable credentials.',
    '',
    '7. Tailoring to Job Ad:',
    '   - Tailor the Career Objective to explain why this specific type of work appeals to Jordan, connected to real experience.',
    '   - Tailor the Skills Summary story-paragraphs to emphasize the genuine capabilities most relevant to the role.',
    '   - Tailor the Detailed Experience narratives to highlight genuine skills relevant to the role.',
    '   - Do NOT change facts, only emphasis and framing.',
    '',
    '8. Cover Letter Requirements:',
    '   - Date: MUST use current date in standard New Zealand format (e.g. "11 September 2026"). Never hardcode stale dates.',
    '   - Greeting: MUST be standard professional English: "Dear Hiring Team," (or "Dear [Hiring Manager Name]," if known).',
    '     STRICTLY FORBIDDEN: Do NOT use Māori greetings such as "Tēnā koe" or "Kia ora".',
    '   - Structure:',
    '     - Opening: State the role and company, noting living locally, engineering degree + Master of IT with Merit.',
    '     - Body Para 1: Technical & analytical alignment with key job responsibilities.',
    '     - Body Para 2: Proven operational discipline, ticketing, communication, and reliability from Northline & Cascade.',
    '     - Body Para 3: Local Upper Hutt presence, full clean NZ driver licence, reliable commute, 3-year Post Study Work Visa (Open Work Visa), and eager commitment.',
    '     - Closing: Professional, respectful appreciation and invitation to discuss further.',
    '   - Signoff: MUST be standard professional English: "Sincerely,\\nJordan Smith" (or "Kind regards,\\nJordan Smith").',
    '     STRICTLY FORBIDDEN: Do NOT use Māori signoffs such as "Ngā mihi nui" or "Ngā mihi".',
    '   - WORD COUNT BUDGET: The cover letter body (starting from greeting to before signoff) MUST be strictly between 330 and 365 words.',
    '   - Must use exact phrase "3-year Post Study Work Visa (Open Work Visa)" to match the CV.',
    '',
    'CLAIM BOUNDARY (STRICT, enforced by verify-docs.py; a violation blocks handover):',
    '  A job ad asking for something is NOT evidence Jordan has done it. Never echo an ad requirement back as experience.',
    '  a. Never claim: business continuity work, SOP/procedure authoring, team leadership, supervising, mentoring, onboarding others, or "managing/owning the ticket queue". Real ticket work is "worked/resolved/escalated tickets".',
    '  b. Never write "guarantee", "for years", or "senior presence". Use plain, checkable wording.',
    '  c. M365, Intune, Azure, SharePoint, Entra, Active Directory, Autotask, MDM and RMM are NOT confirmed hands-on. On the CV, omit them. On the cover letter, if the ad centres on them, say so in ONE honest sentence ("my tooling to date has been Linux/Windows administration rather than X; I will build toward it") instead of staying silent or claiming familiarity.',
    '  d. If the ad wants leadership, mentoring or continuity work, leave it unaddressed or name it as something to grow into. Do not stretch adjacent NOC/support work to cover it.',
    '  f. Laptop/mobile-device troubleshooting, password resets and user account administration are NOT confirmed experience. Never claim them on either document. IAM is coursework-level only: write "identity and access management concepts from my Cyber Security specialisation". Confirmed desk evidence is network/connectivity, printers and peripherals, remote support and ticketing.',
    '  g. Every skill or experience claim in the cover letter MUST also be supportable from the CV and Candidate Key Facts. If the CV omits it, the letter must not claim it. Only cite items marked CONFIRMED in the facts, never items marked toEvidence/missing.',
    '  h. A degree is not experience. Never infer "strong foundation", "natural familiarity" or "grounding" in IAM, hardware diagnostics, device configuration or warranty handling from the Master\'s or the 2017 ECE degree. State coursework as coursework, in one clause, or leave it out. The ONLY allowed IAM wording is the exact phrase "identity and access management concepts" (e.g. "identity and access management concepts from my Cyber Security specialisation"); never write "IAM", "solid/strong understanding of identity and access management", or "foundation/grounding/familiarity in" anything.',
    '  i. Never name ServiceNow in the cover letter, not even as a gap. Describe the gap generically ("enterprise ITSM tooling") or omit it.',
    '  e. The opening and closing paragraphs must name the specific company, role and one concrete detail from the ad. No generic "strong interest" or "welcome the opportunity" filler.',
    'RETURN FORMAT:',
    'Return ONLY valid JSON with these keys:',
    '"company", "role", "profile", "skills", "workHistory", "education", "projects", "certifications", "coverLetter".',
    '',
    'Where:',
    '- profile is a string: crisp 3-4 sentence professional summary (60-80 words) tailored to the role, grounded in actual engineering qualifications and support experience. MUST contain ONLY the paragraph text itself — NEVER include candidate name, address, contact details, visa info, or prefixes like "Professional Summary:".',
    '- skills is an array of {"category": string, "detail": string} — 5 core competencies tailored to the role, each with specific technical tools and responsibilities.',
    '- workHistory is an array of {"role": string, "company": string, "period": string, "bullets": string[]} — 4 authentic roles (a local brewery, Freelance, Cascade, Northline), each with 3-4 active, grounded bullet points.',
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

  let spec;
  let feedback = reviewFeedback
    ? `\n\nAN INDEPENDENT REVIEWER FOUND THESE PROBLEMS IN THE PREVIOUS DRAFT. Rewrite the cover letter so none of them remain, keeping every other rule:\n${reviewFeedback}`
    : '';
  const baseFeedback = feedback;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text: rawJson, model } = await generateContent({
      parts: [{ text: `${systemContext}\n\n${userPrompt}${feedback}` }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      apiKey,
    });
    console.log(`cv-worker: successfully drafted CV spec with ${model}`);
    spec = JSON.parse(rawJson);
    const cl = spec.coverLetter;
    const body = typeof cl === 'string' ? cl : (cl?.paragraphs || []).join(' ');
    const words = body.split(/\s+/).filter(Boolean).length;
    if (!body || (words >= 320 && words <= 380)) break;
    console.warn(`cv-worker: cover letter is ${words} words (need 330-365); retrying once`);
    feedback = `${baseFeedback}\n\nYOUR PREVIOUS COVER LETTER WAS ${words} WORDS. Rewrite it so the body is between 340 and 360 words, keeping every other rule.`;
  }
  spec.company = spec.company || entry.company;
  spec.role = spec.role || entry.role;
  spec.outputDir = outputDirFor({ ...entry, company: spec.company });

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
    engineScript = DEFAULT_ENGINE_SCRIPT,
    apiKey = process.env.GEMINI_API_KEY,
    execFileImpl = execFile,
    generate = generateTailoredDocSpec,
    onGenerated = null,
    // Injected by index.js as withDataLock('applications', fn) so the worker
    // shares the one lock guarding this file. Defaults to a pass-through: the
    // tests drive this function directly against a temp file with no server
    // running, where there is nothing to serialise against.
    lock = (fn) => fn(),
  } = {}
) {
  const reqContent = await fsPromises.readFile(requestFilePath, 'utf8');
  const req = JSON.parse(reqContent);
  if (req.retryAfter && Date.now() < req.retryAfter) return null; // CV-only fallback waiting to retry
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
  const blocked = adTextBlocker(entry);
  if (blocked) throw new Error(blocked);

  // 2. Job ad text: the saved copy first (entry.jobText), else fetch the link.
  let jobText = typeof entry.jobText === 'string' ? entry.jobText : '';
  if (jobText.length < MIN_JOB_TEXT && req.link) {
    const fetched = await fetchJobText(req.link, execFileImpl);
    if (fetched.length >= MIN_JOB_TEXT) jobText = fetched;
  }
  const hasAd = jobText.length >= MIN_JOB_TEXT;
  const candidateFacts = await loadCandidateFacts();

  // 3. LLM drafts the cover letter (and a CV the engine replaces when the ad is
  // known). If the LLM is unavailable but the ad is, the CV is still built
  // deterministically and only the cover letter is skipped.
  let spec;
  let cvOnly = false;
  let llmError = '';
  try {
    spec = await generate({ entry, candidateFacts, jobText, apiKey, ...(req.reviewFeedback ? { reviewFeedback: req.reviewFeedback } : {}) });
  } catch (err) {
    if (!hasAd) throw err;
    llmError = err.message;
    console.warn(`cv-worker: LLM unavailable (${err.message}); building the CV deterministically, no cover letter`);
    spec = { company: entry.company, role: entry.role, outputDir: outputDirFor(entry) };
    cvOnly = true;
  }

  // 4. Write spec file for the engine + generator
  const specFile = path.join(requestsDir, `spec__${entry.matchKey || 'temp'}__${Date.now()}.json`);
  await fsPromises.writeFile(specFile, JSON.stringify(spec, null, 2), 'utf8');

  const pythonBin = resolvePython();
  const runPython = (args) =>
    new Promise((resolve, reject) => {
      execFileImpl(pythonBin, args, { timeout: 90000 }, (err, stdout, stderr) => {
        if (err) return reject(new Error([stderr, stdout].filter(Boolean).join('\n') || err.message));
        console.log('cv-worker: ' + stdout);
        resolve();
      });
    });

  // 5. Evidence-only CV sections (replaces the LLM's), then render + verify.
  let jdFile = null;
  try {
    if (hasAd) {
      jdFile = specFile.replace(/\.json$/, '.jd.txt');
      await fsPromises.writeFile(jdFile, jobText, 'utf8');
      await runPython([engineScript, 'build', '--match-key', entry.id, '--jd', jdFile, '--merge', specFile]);
    }
    const generate_ = () => runPython([generatorScript, '--input', specFile, '--convert-pdf', '--verify', ...(cvOnly ? ['--cv-only'] : [])]);
    try {
      await generate_();
    } catch (err) {
      // The gate caught a claim the model wasn't allowed to make: redraft once with the FAIL lines as feedback.
      const fails = String(err.message).split('\n').filter((l) => l.startsWith('FAIL ')).join('\n');
      if (cvOnly || req.reviewFeedback || !fails) throw err;
      console.warn(`cv-worker: gate failed, redrafting once:\n${fails}`);
      spec = await generate({ entry, candidateFacts, jobText, apiKey, reviewFeedback: `The automated gate rejected the previous draft:\n${fails}\nRemove exactly those claims; do not echo the ad's requirement back as experience.` });
      await fsPromises.writeFile(specFile, JSON.stringify(spec, null, 2), 'utf8');
      if (hasAd) await runPython([engineScript, 'build', '--match-key', entry.id, '--jd', jdFile, '--merge', specFile]);
      await generate_();
    }
  } catch (err) {
    console.error('cv-worker: generator script failed:', err.message);
    throw new Error(`Generator script failed: ${err.message}`);
  } finally {
    await fsPromises.unlink(specFile).catch(() => {});
    if (jdFile) await fsPromises.unlink(jdFile).catch(() => {});
  }

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
    // The status may have changed while the generator ran (up to ~90s), in
    // which case relocateFolder already moved the folder and spec.outputDir is
    // stale. Keep the entry's current folder and carry the fresh files over.
    const finalDir = await settleOutputDir(updatedApps[idx].folderPath, spec.outputDir);
    updatedApps[idx] = {
      ...updatedApps[idx],
      cvStatus: 'drafted',
      cover: cvOnly ? updatedApps[idx].cover : 'draft',
      ...(hasAd && !updatedApps[idx].jobText ? { jobText } : {}),
      folderPath: finalDir,
      updated: Date.now(),
      activity: [
        ...(updatedApps[idx].activity || []),
        {
          at: Date.now(),
          kind: 'cv-generated',
          text: cvOnly
            ? `Deterministic CV built in ${spec.outputDir} (LLM unavailable, no cover letter)`
            : `Tailored CV & Cover Letter drafted in ${spec.outputDir}`,
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

  // A CV-only run usually means a transient outage (e.g. "fetch failed"), and
  // nothing else ever re-requests the cover letter, so re-queue with backoff.
  const retries = (req.retries || 0) + 1;
  const willRetry = cvOnly && retries <= CL_MAX_RETRIES;

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
        detail: cvOnly
          ? `CV only for ${entry.company} — ${entry.role}: cover letter NOT generated (LLM unavailable: ${llmError}); ` +
            (willRetry ? `retry ${retries}/${CL_MAX_RETRIES} in ${CL_RETRY_DELAY_MS / 60000} min` : 'no retries left, re-request it')
          : `Tailored CV and Cover Letter generated for ${entry.company} — ${entry.role}`,
        actor: 'cv-worker',
        at: Date.now(),
      }) + '\n';
    await fsPromises.appendFile(auditFile, auditLine, 'utf8');
  }

  // 9. Clean up request file (or re-queue it for the missing cover letter)
  if (willRetry) {
    const retryReq = { ...req, retries, retryAfter: Date.now() + CL_RETRY_DELAY_MS };
    await fsPromises.writeFile(requestFilePath, JSON.stringify(retryReq, null, 2), 'utf8');
  } else {
    await fsPromises.unlink(requestFilePath);
  }
  console.log(`cv-worker: completed request for ${entry.company} — ${entry.role}`);
  // Fire-and-forget: a review takes minutes and must not hold the worker. Regeneration rounds
  // carry reviewFeedback and never re-trigger it.
  if (onGenerated && updatedEntry && !cvOnly && !req.reviewFeedback) {
    Promise.resolve(onGenerated(updatedEntry)).catch((e) => console.error('cv-worker: onGenerated failed:', e.message));
  }
  return entry;
}

async function markCvFailed(reqPath, err, opts) {
  const dataFile = opts.dataFile || DEFAULT_DATA_FILE;
  const auditFile = opts.auditFile || DEFAULT_AUDIT_FILE;
  const lock = opts.lock || ((fn) => fn());
  const req = JSON.parse(await fsPromises.readFile(reqPath.replace(/cv_request__/, 'cv_failed__'), 'utf8'));
  const reason = String(err.message).slice(0, 200);
  let hit = null;
  await lock(async () => {
    const apps = JSON.parse(await fsPromises.readFile(dataFile, 'utf8'));
    const i = apps.findIndex((a) => a.id === req.id || a.matchKey === req.matchKey);
    if (i === -1 || apps[i].cvStatus !== 'queued') return;
    apps[i] = {
      ...apps[i],
      cvStatus: '',
      updated: Date.now(),
      activity: [...(apps[i].activity || []), { at: Date.now(), kind: 'cv-failed', text: `CV generation failed: ${reason}. Click Create CV to retry.` }],
    };
    const tmp = `${dataFile}.tmp`;
    await fsPromises.writeFile(tmp, JSON.stringify(apps, null, 2), 'utf8');
    await fsPromises.rename(tmp, dataFile);
    hit = apps[i];
  });
  if (!hit) return;
  await fsPromises.appendFile(auditFile, JSON.stringify({ action: 'cv-failed', entryId: hit.id, matchKey: hit.matchKey, detail: `CV generation failed for ${hit.company} — ${hit.role}: ${reason}`, actor: 'cv-worker', at: Date.now() }) + '\n', 'utf8');
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
        // Park it: left in place it would be retried (and Gemini re-called) every poll.
        const parked = path.join(requestsDir, reqFile.replace(/^cv_request__/, 'cv_failed__'));
        await fsPromises.rename(fullPath, parked).catch(() => {});
        await markCvFailed(fullPath, err, opts).catch((e) => console.error('cv-worker: could not record failure:', e.message));
        console.error(`cv-worker: failed to process ${reqFile} (parked as ${path.basename(parked)}):`, err.message);
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

