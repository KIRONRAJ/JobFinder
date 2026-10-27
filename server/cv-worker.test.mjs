import test from 'node:test';
import assert from 'node:assert/strict';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  resolvePython,
  loadCandidateFacts,
  fetchJobText,
  generateTailoredDocSpec,
  processSingleCvRequest,
  processPendingCvRequests,
} from './cv-worker.js';

test('resolvePython: returns a valid python command', () => {
  const py = resolvePython();
  assert.ok(py && typeof py === 'string');
  assert.ok(py.includes('python'));
});

test('loadCandidateFacts: never throws, even when the facts files do not exist on disk', async () => {
  // Candidate Key Facts.md lives outside this repo (a private "Project Notes"
  // folder, per PRODUCT.md) — a fresh clone won't have it, so this only
  // asserts the loader degrades gracefully, not any specific fact content.
  const facts = await loadCandidateFacts();
  assert.equal(typeof facts, 'string');
});

test('fetchJobText: returns empty string for empty url or handles errors gracefully', async () => {
  const empty = await fetchJobText('');
  assert.equal(empty, '');

  const mockExecFile = (cmd, args, opts, cb) => {
    cb(new Error('connection failed'), null);
  };
  const failed = await fetchJobText('https://example.com/job', mockExecFile);
  assert.equal(failed, '');
});

test('generateTailoredDocSpec: parses Gemini response into valid doc spec', async () => {
  const mockEntry = {
    id: 'app_test_123',
    company: 'Acme Corp',
    role: 'Systems Support Specialist',
    location: 'Wellington, NZ',
    notes: 'Support Linux and network environments',
  };

  const mockSpec = {
    company: 'Acme Corp',
    role: 'Systems Support Specialist',
    profile: 'Dedicated systems support specialist with Master of IT with Merit.',
    skills: [
      { category: 'Technical Support: ', detail: 'Tier 1/2 troubleshooting' }
    ],
    workHistory: [
      {
        role: 'L2 NOC Engineer',
        company: 'Northline Broadband',
        period: '11/2017 – 06/2019 | Riverton, India',
        bullets: ['Monitored network telemetry']
      }
    ],
    education: [
      {
        title: 'Master of Information Technology (Cyber Security specialisation)',
        institution: 'Riverside Institute of Technology, Wellington | Completed with Merit (July 2026)',
        bullets: ['Master’s Research Project: Replay Attack Prevention in Smart Car IoT Systems.']
      }
    ],
    certifications: ['Red Hat Certified System Administrator (RHCSA)', 'ServiceNow Fundamentals'],
    coverLetter: {
      date: '5 September 2026',
      addressee: 'Hiring Manager\nAcme Corp\nWellington',
      greeting: 'Dear Hiring Team,',
      paragraphs: [
        'I am writing to express my strong interest in the Systems Support Specialist position at Acme Corp. Living locally in Petone, Upper Hutt, and holding a Master of Information Technology completed with Merit from Riverside Institute of Technology, Wellington, I bring authentic Tier 1 and Tier 2 operations experience.',
        'Throughout my career at Northline Broadband and Cascade Infovision, I have managed high-reliability environments, investigated complex anomalies, and provided empathetic support under strict response SLAs.',
        'I hold full open work rights on a 3-year Post Study Work Visa (Open Work Visa) and a full clean New Zealand driver licence. I am eager to contribute to Acme Corp.'
      ],
      signoff: 'Sincerely,\nJordan Smith'
    }
  };

  // Mock global fetch
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify(mockSpec) }]
          }
        }
      ]
    })
  });

  try {
    const spec = await generateTailoredDocSpec({
      entry: mockEntry,
      candidateFacts: 'Mock candidate facts',
      jobText: 'Job ad text',
      apiKey: 'test-api-key',
    });

    assert.equal(spec.company, 'Acme Corp');
    assert.equal(spec.role, 'Systems Support Specialist');
    assert.equal(spec.outputDir, 'Pending to Apply/Acme Corp');
    assert.ok(spec.coverLetter);
    assert.equal(spec.coverLetter.greeting, 'Dear Hiring Team,');
    assert.equal(spec.coverLetter.signoff, 'Sincerely,\nJordan Smith');
    // Verify ServiceNow was stripped
    assert.equal(spec.certifications.length, 1);
    assert.equal(spec.certifications[0], 'Red Hat Certified System Administrator (RHCSA)');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('processSingleCvRequest: executes end-to-end flow and updates data & audit log', async () => {
  const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'cv-worker-test-'));
  const requestsDir = path.join(tmpDir, 'requests');
  const dataFile = path.join(tmpDir, 'applications.json');
  const auditFile = path.join(tmpDir, 'audit-log.jsonl');
  await fsPromises.mkdir(requestsDir, { recursive: true });

  const initialApps = [
    {
      id: 'app_unit_001',
      company: 'TestCo',
      role: 'Support Analyst',
      matchKey: 'testco-support-analyst',
      status: 'researching',
      cvStatus: 'queued',
      folderPath: '',
      notes: 'Great role for NOC background',
    }
  ];
  await fsPromises.writeFile(dataFile, JSON.stringify(initialApps, null, 2), 'utf8');

  const reqPayload = {
    type: 'cv_request',
    id: 'app_unit_001',
    matchKey: 'testco-support-analyst',
    company: 'TestCo',
    role: 'Support Analyst',
    link: '',
  };
  const reqFile = path.join(requestsDir, 'cv_request__testco-support-analyst__12345.json');
  await fsPromises.writeFile(reqFile, JSON.stringify(reqPayload, null, 2), 'utf8');

  // Mock fetch for Gemini API
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  company: 'TestCo',
                  role: 'Support Analyst',
                  profile: 'Profile text',
                  skills: [],
                  workHistory: [],
                  education: [],
                  certifications: ['Red Hat Certified System Administrator (RHCSA)'],
                  coverLetter: {
                    date: '5 September 2026',
                    greeting: 'Dear Hiring Team,',
                    paragraphs: ['Paragraph 1'],
                    signoff: 'Sincerely,\nJordan Smith'
                  }
                })
              }
            ]
          }
        }
      ]
    })
  });

  // Mock execFile to simulate successful python generator script execution
  const mockExecFile = (cmd, args, opts, cb) => {
    cb(null, 'DOCX and PDF generated successfully', '');
  };

  try {
    const result = await processSingleCvRequest(reqFile, {
      requestsDir,
      dataFile,
      auditFile,
      generatorScript: 'mock-generator.py',
      apiKey: 'test-key',
      execFileImpl: mockExecFile,
    });

    assert.ok(result);
    assert.equal(result.id, 'app_unit_001');

    // Verify request file was deleted
    let reqExists = true;
    try {
      await fsPromises.access(reqFile);
    } catch {
      reqExists = false;
    }
    assert.equal(reqExists, false, 'Request file should be unlinked after processing');

    // Verify applications.json was updated
    const updatedApps = JSON.parse(await fsPromises.readFile(dataFile, 'utf8'));
    const entry = updatedApps.find((a) => a.id === 'app_unit_001');
    assert.equal(entry.cvStatus, 'drafted');
    assert.equal(entry.cover, 'draft');
    assert.equal(entry.folderPath, 'Pending to Apply/TestCo');

    // Verify audit log has cv-generated event
    const auditContent = await fsPromises.readFile(auditFile, 'utf8');
    assert.match(auditContent, /cv-generated/);
    assert.match(auditContent, /testco-support-analyst/);
  } finally {
    globalThis.fetch = originalFetch;
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  }
});

// Regression: this used to hardcode 'Pending to Apply/<company>' and then
// overwrite entry.folderPath with it, so regenerating a CV for a role already
// at Applied/ or Interview/ silently dragged its folderPath backwards while the
// documents stayed put. That is the most likely source of the five
// tracker/disk mismatches found in the 15 Sep 2026 cleanup audit.
function stubGemini() {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      candidates: [
        { content: { parts: [{ text: JSON.stringify({ company: 'Acme Ltd', role: 'Analyst', coverLetter: {} }) }] } },
      ],
    }),
  });
}

test('generateTailoredDocSpec: writes into the entry\'s existing folder', async () => {
  stubGemini();
  for (const folderPath of ['Applied/Acme Ltd', 'Interview/Acme Ltd', 'Declined/Acme Ltd']) {
    const spec = await generateTailoredDocSpec({
      entry: { company: 'Acme Ltd', role: 'Analyst', folderPath },
      candidateFacts: 'x',
      apiKey: 'K',
    });
    assert.equal(spec.outputDir, folderPath, 'must not drag the folder back to Pending to Apply');
  }
});

test('generateTailoredDocSpec: falls back to Pending to Apply when folderPath is unusable', async () => {
  stubGemini();
  // Empty, absolute, and traversal paths all fall back rather than being trusted —
  // folderPath is user-editable in the Add/Edit form.
  for (const folderPath of ['', undefined, '   ', '/etc', '../../etc', 'Applied/../../etc']) {
    const spec = await generateTailoredDocSpec({
      entry: { company: 'Acme Ltd', role: 'Analyst', folderPath },
      candidateFacts: 'x',
      apiKey: 'K',
    });
    assert.equal(spec.outputDir, 'Pending to Apply/Acme Ltd', `should reject ${JSON.stringify(folderPath)}`);
  }
});

// The deterministic engine (scripts/cv_engine.py) means a CV no longer needs a
// model: when the LLM is down but the ad text is saved on the entry, the worker
// still builds the CV from the evidence bank and skips only the cover letter.
test('processSingleCvRequest: builds the CV deterministically when the LLM fails', async () => {
  const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'cv-worker-test-'));
  const requestsDir = path.join(tmpDir, 'requests');
  const dataFile = path.join(tmpDir, 'applications.json');
  const auditFile = path.join(tmpDir, 'audit-log.jsonl');
  await fsPromises.mkdir(requestsDir, { recursive: true });
  await fsPromises.writeFile(dataFile, JSON.stringify([{
    id: 'app_unit_002', company: 'Acme', role: 'Coordinator', matchKey: 'acme-coordinator',
    status: 'researching', cvStatus: 'queued', folderPath: '', cover: 'none',
    jobText: 'Incident management and time management. '.repeat(20),
  }]), 'utf8');
  const reqFile = path.join(requestsDir, 'cv_request__acme-coordinator__1.json');
  await fsPromises.writeFile(reqFile, JSON.stringify({ type: 'cv_request', id: 'app_unit_002', link: '' }), 'utf8');

  const calls = [];
  const mockExecFile = (cmd, args, opts, cb) => { calls.push(args.join(' ')); cb(null, 'ok', ''); };
  try {
    const result = await processSingleCvRequest(reqFile, {
      requestsDir, dataFile, auditFile, generatorScript: 'mock-generator.py', apiKey: '',
      execFileImpl: mockExecFile,
      generate: async () => { throw new Error('quota exhausted'); },
    });
    assert.ok(result);
    assert.ok(calls.some((c) => c.includes('cv_engine.py build') && c.includes('--merge')), calls.join('\n'));
    assert.ok(calls.some((c) => c.includes('mock-generator.py') && c.includes('--cv-only')), calls.join('\n'));
    const entry = JSON.parse(await fsPromises.readFile(dataFile, 'utf8'))[0];
    assert.equal(entry.cvStatus, 'drafted');
    assert.equal(entry.cover, 'none', 'no cover letter was written, so cover state must not claim a draft');
    assert.equal(entry.folderPath, 'Pending to Apply/Acme');
    // The missing cover letter is flagged honestly and the request re-queued.
    const audit = await fsPromises.readFile(auditFile, 'utf8');
    assert.match(audit, /cover letter NOT generated.*retry 1\/3/);
    const requeued = JSON.parse(await fsPromises.readFile(reqFile, 'utf8'));
    assert.equal(requeued.retries, 1);
    assert.ok(requeued.retryAfter > Date.now());
    // Still backing off: a second pass is a no-op.
    assert.equal(await processSingleCvRequest(reqFile, { requestsDir, dataFile, auditFile, execFileImpl: mockExecFile }), null);
  } finally {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  }
});

// A failing request used to stay in requests/ and be retried every 10s poll,
// calling Gemini each time. The honesty gate (verify-docs FAILs unevidenced
// claims) makes failures more likely, so a failed request is parked instead.
test('processPendingCvRequests: parks a failed request instead of retrying it forever', async () => {
  const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'cv-worker-test-'));
  const requestsDir = path.join(tmpDir, 'requests');
  const dataFile = path.join(tmpDir, 'applications.json');
  await fsPromises.mkdir(requestsDir, { recursive: true });
  await fsPromises.writeFile(dataFile, JSON.stringify([{ id: 'app_unit_003', company: 'Acme', role: 'X' }]), 'utf8');
  await fsPromises.writeFile(path.join(requestsDir, 'cv_request__acme-x__1.json'), JSON.stringify({ id: 'app_unit_003' }), 'utf8');
  try {
    await processPendingCvRequests({
      requestsDir, dataFile, auditFile: path.join(tmpDir, 'audit.jsonl'), apiKey: '',
      execFileImpl: (cmd, args, opts, cb) => cb(null, 'ok', ''),
      generate: async () => { throw new Error('quota exhausted'); },
    });
    const files = await fsPromises.readdir(requestsDir);
    assert.deepEqual(files, ['cv_failed__acme-x__1.json']);
  } finally {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  }
});

test('processSingleCvRequest: fires onGenerated for a normal run, but not for a review regeneration (which passes reviewFeedback through)', async () => {
  const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'cv-worker-hook-'));
  const dataFile = path.join(tmpDir, 'applications.json');
  const auditFile = path.join(tmpDir, 'audit-log.jsonl');
  await fsPromises.writeFile(dataFile, JSON.stringify([{ id: 'a1', company: 'Co', role: 'R', matchKey: 'co-r', cvStatus: 'queued', folderPath: '' }]), 'utf8');
  const seen = [];
  const generate = async (args) => {
    seen.push(args.reviewFeedback);
    return { company: 'Co', role: 'R', outputDir: 'Pending to Apply/Co' };
  };
  const hooked = [];
  const run = async (extra) => {
    const reqFile = path.join(tmpDir, `req_${hooked.length}_${Math.random()}.json`);
    await fsPromises.writeFile(reqFile, JSON.stringify({ id: 'a1', matchKey: 'co-r', company: 'Co', role: 'R', ...extra }), 'utf8');
    await processSingleCvRequest(reqFile, {
      requestsDir: tmpDir, dataFile, auditFile, generate, generatorScript: 'x.py', apiKey: 'k',
      execFileImpl: (_c, _a, _o, cb) => cb(null, 'ok', ''),
      onGenerated: (e) => hooked.push(e.id),
    });
  };
  try {
    await run({});
    assert.deepEqual(hooked, ['a1']);
    await run({ reviewFeedback: '- fix IAM' });
    assert.deepEqual(hooked, ['a1']);
    assert.deepEqual(seen, [undefined, '- fix IAM']);
  } finally {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  }
});
