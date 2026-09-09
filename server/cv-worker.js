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
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment or .env');
  }

  const systemContext = [
    'You are the expert career assistant and CV/cover letter drafter for Kironraj Odatt Peringode.',
    'Generate a tailored CV and single-page Cover Letter for the following job opportunity.',
    '',
    'VOICE AND STYLE (MANDATORY — READ FIRST):',
    'Write as Kironraj speaking in first person. Use natural, conversational English — the way a real person',
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
    'Skills Summary example: "At Keralavision Broadband I worked the L2 tier on a 24/7 rotating roster, sitting',
    'between L1 and L3 on live network faults. A typical case started as a vague customer complaint, and I had',
    'to work back through the ticket, the monitoring data and, when it came to it, a call with our upstream carrier..."',
    '',
    'GROUNDING RULES (STRICT AND NON-NEGOTIABLE):',
    '1. Candidate Identity & Contact:',
    '   - Full Name: KIRONRAJ ODATT PERINGODE',
    '   - Address: Trentham, Upper Hutt, Wellington',
    '   - Phone: +64-22-131-9495',
    '   - Email: kiron.raj.op@gmail.com',
    '   - LinkedIn: linkedin.com/in/kironrajop',
    '   - Web: www.kironraj.com',
    '   - Work Eligibility: 3-year Post Study Work Visa (Open Work Visa) – full open work rights, no sponsorship required.',
    "   - Driver Licence: Full, clean New Zealand driver's licence. Owns a car. Located in Trentham, Upper Hutt.",
    '   - ZERO PII: Do not include street address, age, date of birth, nationality, marital status, gender, or bare "Referees" heading.',
    '',
    '2. Academic Qualifications:',
    "   - Master's Degree: Master of Information Technology (Cyber Security specialisation), completed with Merit (July 2026), Whitecliffe College, Wellington.",
    "   - Master's Research Project: MUST be included under Project Experience: \"Replay Attack Prevention in Smart Car IoT Systems. Evaluated hybrid nonce- and counter-based defense across latency and detection rate in a simulated smart-vehicle IoT environment.\"",
    '   - Undergraduate Degree: Bachelor of Technology in Electronics and Communication Engineering, Jyothi Engineering College, University of Calicut (06/2013 – 07/2017), Thrissur, India. (NEVER cite any other affiliating university).',
    '',
    '3. Authentic Work History (4 roles — describe what actually happened, not what sounds impressive):',
    '   - Role 1: L2 NOC Engineer at Keralavision Broadband Pvt Limited (11/2017 – 06/2019 | Thrissur, Kerala)',
    '     Keralavision is a well-known ISP across Kerala. Worked the L2 tier on a 24/7 rotating roster, providing',
    '     back-end network configuration and troubleshooting, coordinating with technical support, service provisioning',
    '     and sales teams to keep services at or above SLA. Raised and chased tickets with upstream carriers (Jio,',
    '     Airtel, Vodafone, Powertel). Supported customers and operators via AnyDesk and TeamViewer. Helped with',
    '     server installation on DNS and speed-test servers. Documented every ticket so lessons learned made it into',
    '     the team knowledge base.',
    '   - Role 2: Software Engineer at Poornam Infovision Pvt Ltd, trading internationally as Bobcares (04/2021 – 07/2021 | Kochi, Kerala)',
    '     Poornam is a 24/7 outsourced technical support provider for hosting companies. Provided technical support for',
    '     Linux and Windows servers and web hosting. Handled server security, hardening and performance tuning through',
    '     control panel management. Set up and administered VPS and dedicated servers. Worked with the development and',
    '     testing team to build solutions meeting client requirements. Communicated directly with clients over calls,',
    '     email, live chat and helpdesk. Worked over VNC, diagnosing server problems from logs and behaviour.',
    '   - Role 3: Production Labourer at Tuatara Brewery (02/2026 – 03/2026 | Brewtown, Upper Hutt, New Zealand)',
    '     Packed and sealed beer bottles and cans. Checked batches for labeling accuracy and fill levels. Organized',
    '     finished products in the storage area for shipping. Plain language only — do NOT inflate this role.',
    '   - Role 4: Freelance Web Developer (07/2021 – 06/2025 | Thrissur, India)',
    '     Built websites using HTML, CSS, JavaScript and jQuery. Discussed requirements with clients and produced',
    '     development plans. Ran debugging tools before publishing. Implemented changes to streamline business operations.',
    '',
    '4. Certifications & Upskilling (be precise about status — never round up):',
    '   - Red Hat Certified System Administrator (RHCSA) — Verification ID: 240-025-115 (active, genuine held certification)',
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
    '   - Tailor the Career Objective to explain why this specific type of work appeals to Kironraj, connected to real experience.',
    '   - Tailor the Skills Summary story-paragraphs to emphasize the genuine capabilities most relevant to the role.',
    '   - Tailor the Detailed Experience narratives to highlight genuine skills relevant to the role.',
    '   - Do NOT change facts, only emphasis and framing.',
    '',
    '8. Cover Letter Requirements:',
    '   - Greeting: MUST be standard professional English: "Dear Hiring Team," (or "Dear [Hiring Manager Name]," if known).',
    '     STRICTLY FORBIDDEN: Do NOT use Māori greetings such as "Tēnā koe" or "Kia ora".',
    '   - Structure:',
    '     - Opening: State the role and company, noting living in Trentham, Upper Hutt, engineering degree + Master of IT with Merit.',
    '     - Body Para 1: Technical & analytical alignment with key job responsibilities.',
    '     - Body Para 2: Proven operational discipline, ticketing, communication, and reliability from Keralavision & Poornam.',
    '     - Body Para 3: Local Upper Hutt presence, full clean NZ driver licence, reliable commute, 3-year Post Study Work Visa (Open Work Visa), and eager commitment.',
    '     - Closing: Professional, respectful appreciation and invitation to discuss further.',
    '   - Signoff: MUST be standard professional English: "Sincerely,\\nKironraj Odatt Peringode" (or "Kind regards,\\nKironraj Odatt Peringode").',
    '     STRICTLY FORBIDDEN: Do NOT use Māori signoffs such as "Ngā mihi nui" or "Ngā mihi".',
    '   - WORD COUNT BUDGET: The cover letter body (starting from greeting to before signoff) MUST be strictly between 330 and 365 words.',
    '   - Must use exact phrase "3-year Post Study Work Visa (Open Work Visa)" to match the CV.',
    '',
    'RETURN FORMAT:',
    'Return ONLY valid JSON with these keys:',
    '"company", "role", "profile", "skills", "workHistory", "education", "projects", "certifications", "coverLetter".',
    '',
    'Where:',
    '- profile is a string: crisp 3-4 sentence professional summary (60-80 words) tailored to the role, grounded in actual engineering qualifications and support experience.',
    '- skills is an array of {"category": string, "detail": string} — 5 core competencies tailored to the role, each with specific technical tools and responsibilities.',
    '- workHistory is an array of {"role": string, "company": string, "period": string, "bullets": string[]} — 4 authentic roles (Tuatara, Freelance, Poornam, Keralavision), each with 3-4 active, grounded bullet points.',
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
    candidateFacts.slice(0, 6000),
  ].join('\n\n');

  const candidateModels = [
    'gemini-3.5-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
  ];

  const payload = {
    contents: [
      {
        parts: [{ text: `${systemContext}\n\n${userPrompt}` }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  };

  let rawJson = null;
  let lastErr = null;

  for (const model of candidateModels) {
    try {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        lastErr = new Error(`Gemini API HTTP ${response.status}: ${await response.text()}`);
        continue;
      }

      const resData = await response.json();
      const text = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        rawJson = text;
        console.log(`cv-worker: successfully drafted CV spec with ${model}`);
        break;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  if (!rawJson) {
    throw lastErr || new Error('All Gemini model candidates failed to produce CV spec');
  }

  const spec = JSON.parse(rawJson);
  spec.company = spec.company || entry.company;
  spec.role = spec.role || entry.role;
  const cleanCompany = spec.company.replace(/\s*[/\\|]\s*/g, ' - ').replace(/[\?%*:"><]/g, '').replace(/\s+/g, ' ').trim();
  spec.outputDir = path.join('Pending to Apply', cleanCompany);

  if (typeof spec.coverLetter === 'string') {
    spec.coverLetter = {
      date: '5 September 2026',
      addressee: `Hiring Team\n${spec.company}\nWellington, New Zealand`,
      greeting: 'Dear Hiring Team,',
      paragraphs: spec.coverLetter.split('\n\n').filter((p) => p.trim()),
      signoff: 'Sincerely,\nKironraj Odatt Peringode',
    };
  } else if (spec.coverLetter && typeof spec.coverLetter === 'object') {
    if (!spec.coverLetter.greeting || /t[eē]n[aā]|kia\s*ora/i.test(spec.coverLetter.greeting)) {
      spec.coverLetter.greeting = 'Dear Hiring Team,';
    }
    if (!spec.coverLetter.signoff || /ng[aā]\s*mihi/i.test(spec.coverLetter.signoff)) {
      spec.coverLetter.signoff = 'Sincerely,\nKironraj Odatt Peringode';
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

  // 6. Update applications.json
  const updatedAppsRaw = await fsPromises.readFile(dataFile, 'utf8');
  const updatedApps = JSON.parse(updatedAppsRaw);
  const idx = updatedApps.findIndex((a) => a.id === entry.id || a.matchKey === entry.matchKey);
  if (idx !== -1) {
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
    await fsPromises.writeFile(dataFile, JSON.stringify(updatedApps, null, 2), 'utf8');

    // 7. Sync to Notion
    try {
      await syncPage(updatedApps[idx]);
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
