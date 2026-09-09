#!/usr/bin/env node
/**
 * scripts/seed-sample-data.mjs
 * Seeds realistic, zero-PII showcase applications into data/applications.json,
 * data/outreach.json, and data/study-progress.json so anyone test-driving JobFinder
 * can immediately experience a populated, live dashboard.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const now = Date.now();
const day = 86400000;

const SAMPLE_APPLICATIONS = [
  {
    id: 'app_sample_01',
    company: 'Datacom NZ',
    role: 'Junior SOC Analyst',
    status: 'interview',
    fit: 'strong',
    employment: 'job',
    workArrangement: 'hybrid',
    location: 'Wellington, NZ',
    source: 'Seek',
    salary: '$75,000 – $85,000 NZD',
    roleType: 'SOC Analyst',
    appliedDate: '2026-08-18',
    nextAction: 'Technical panel interview & incident triage scenario',
    nextActionDate: '2026-09-12',
    notes: 'Stage 2 interview scheduled. Panel consists of Lead Security Engineer and SOC Manager. Prepare SIEM rule tuning and phishing escalation walkthrough.',
    created: now - 24 * day,
    updated: now - 1 * day,
    cvStatus: 'sent',
    coverStatus: 'sent',
    deadline: '2026-08-25',
    priority: {
      rank: 1,
      reason: 'Upcoming technical panel interview this week.',
      action: 'prepare',
      setBy: 'claude',
      setAt: now - 2 * day,
    },
    analysis: {
      ats: {
        matched: ['Linux Administration', 'Incident Response', 'SIEM / Splunk', 'Network Protocols (TCP/IP, DNS)', 'TCPDump', 'Wireshark'],
        missing: ['CrowdStrike Falcon', 'ServiceNow ITSM'],
        toEvidence: ['Hands-on log correlation in lab environment', 'SLA-bound ticket escalation experience'],
        unsupported: [],
      },
      gap: {
        theyWant: ['CrowdStrike Falcon EDR', 'ServiceNow ITSM platform ticketing'],
        youHave: ['Active RHCSA credential', 'Snort/Suricata IDS lab experience', 'L2 NOC server operations'],
        positioning: 'Frame deep Linux CLI and network packet analysis as strong foundations that transfer rapidly to enterprise EDR workflows.',
        learningTasks: ['Review ServiceNow Incident & Change Management lifecycle', 'CrowdStrike Falcon architecture fundamentals'],
      },
      recommendation: {
        verdict: 'strong-apply',
        reasoning: 'Extremely high core technical overlap across Linux, network security fundamentals, and operational troubleshooting.',
      },
      score: {
        overall: 88,
        keyword: 85,
        semantic: 90,
        technical: 92,
        experience: 84,
        industry: 88,
        readability: 95,
        parsingRisk: 'low',
        explanation: 'Strong keyword saturation with clear technical grounding in networking and Linux administration.',
      },
    },
    interview: {
      when: '2026-09-12 10:00 AM',
      medium: 'Microsoft Teams',
      technicalQs: [
        'Walk through your triage process when an alert fires for anomalous PowerShell execution on an endpoint.',
        'Explain how you isolate malicious traffic in a packet capture using Wireshark display filters.',
        'How do you verify DNS exfiltration versus benign beaconing?',
      ],
      behaviouralQs: [
        'Describe a time you handled an urgent outage or security incident under tight SLA pressure.',
        'How do you communicate technical remediation steps to non-technical business stakeholders?',
      ],
      starAnswers: [
        {
          question: 'Handling an urgent operational outage under pressure.',
          answer: 'Situation: During an L2 NOC shift, a major transit link suffered intermittent packet loss affecting critical customer traffic.\nTask: Isolate the root cause quickly and maintain SLA compliance.\nAction: Ran automated traceroutes, identified anomalous BGP flapping on an upstream peer, rerouted priority circuits through secondary transit, and kept stakeholders updated every 15 minutes.\nResult: Restored full throughput within 22 minutes with zero SLA breach.',
        },
      ],
      draftedAt: now - 2 * day,
    },
    activity: [
      { at: now - 24 * day, kind: 'created', text: 'Discovered on Seek and logged to pipeline' },
      { at: now - 23 * day, kind: 'cv', text: 'Tailored CV generated with verified evidence map' },
      { at: now - 23 * day, kind: 'applied', text: 'Submitted application via Datacom Careers portal' },
      { at: now - 10 * day, kind: 'status', text: 'Phone screening completed with talent acquisition' },
      { at: now - 2 * day, kind: 'status', text: 'Invited to Stage 2 Technical Panel Interview' },
    ],
  },
  {
    id: 'app_sample_02',
    company: 'Xero',
    role: 'Junior Cloud Security Engineer',
    status: 'applied',
    fit: 'strong',
    employment: 'job',
    workArrangement: 'hybrid',
    location: 'Wellington, NZ',
    source: 'LinkedIn',
    salary: '$80,000 – $92,000 NZD',
    roleType: 'IT Security Support',
    appliedDate: '2026-08-28',
    nextAction: 'Follow up on application status if no update by Sept 15',
    nextActionDate: '2026-09-15',
    notes: 'Cloud security enablement team. Focus on AWS IAM governance, container baseline hardening, and CI/CD security scanning.',
    created: now - 14 * day,
    updated: now - 13 * day,
    cvStatus: 'sent',
    coverStatus: 'sent',
    deadline: '2026-09-04',
    analysis: {
      ats: {
        matched: ['AWS Foundations', 'Linux Server Security', 'Docker Basics', 'Python Scripting', 'Git / CI Pipelines'],
        missing: ['Terraform / IaC', 'Kubernetes / EKS'],
        toEvidence: ['Automated deployment scripts', 'AWS Certified Solutions Architect coursework'],
        unsupported: [],
      },
      gap: {
        theyWant: ['Hands-on Terraform infrastructure as code', 'AWS Organizations & SCP guardrails'],
        youHave: ['Solid Python automation', 'Docker containerisation', 'RHCSA Linux configuration'],
        positioning: 'Emphasize strong Linux internals and infrastructure fundamentals that enable quick adoption of declarative IaC tools.',
        learningTasks: ['Complete Terraform AWS beginner tutorial', 'Review AWS Security Hub baseline CIS benchmarks'],
      },
      recommendation: {
        verdict: 'apply',
        reasoning: 'Good alignment for entry-level cloud security. Missing deep IaC, but strong foundational systems knowledge.',
      },
      score: {
        overall: 82,
        keyword: 80,
        semantic: 85,
        technical: 81,
        experience: 80,
        industry: 85,
        readability: 96,
        parsingRisk: 'low',
        explanation: 'Clean technical match for an associate cloud security opening.',
      },
    },
    activity: [
      { at: now - 14 * day, kind: 'created', text: 'Added from LinkedIn Job post' },
      { at: now - 13 * day, kind: 'cv', text: 'Generated Cloud-aligned tailored CV & Cover Letter' },
      { at: now - 13 * day, kind: 'applied', text: 'Applied through Xero Careers' },
    ],
  },
  {
    id: 'app_sample_03',
    company: 'Kiwibank',
    role: 'Cyber Security Operations Analyst',
    status: 'offer',
    fit: 'strong',
    employment: 'job',
    workArrangement: 'hybrid',
    location: 'Wellington, NZ',
    source: 'Company site',
    salary: '$82,000 NZD',
    roleType: 'SOC Analyst',
    appliedDate: '2026-08-05',
    nextAction: 'Review offer contract terms and KiwiSaver employer contribution',
    nextActionDate: '2026-09-14',
    notes: 'Offer received! 3 days in office, 2 days remote. Positive culture and structured graduate rotation program.',
    created: now - 35 * day,
    updated: now - 1 * day,
    cvStatus: 'sent',
    coverStatus: 'sent',
    activity: [
      { at: now - 35 * day, kind: 'created', text: 'Identified on Kiwibank Careers page' },
      { at: now - 34 * day, kind: 'applied', text: 'Submitted application' },
      { at: now - 20 * day, kind: 'status', text: 'Technical interview completed' },
      { at: now - 7 * day, kind: 'status', text: 'Final culture & partner conversation' },
      { at: now - 1 * day, kind: 'status', text: 'Formal offer received' },
    ],
  },
  {
    id: 'app_sample_04',
    company: 'Trade Me',
    role: 'Junior Systems Administrator',
    status: 'researching',
    fit: 'good',
    employment: 'job',
    workArrangement: 'hybrid',
    location: 'Wellington, NZ',
    source: 'Summer of Tech',
    salary: '$70,000 – $78,000 NZD',
    roleType: 'IT Security Support',
    appliedDate: '',
    nextAction: 'Finalize cover letter and check submission requirements before deadline',
    nextActionDate: '2026-09-16',
    notes: 'Internal infrastructure and identity team. Great mentorship environment.',
    created: now - 3 * day,
    updated: now - 3 * day,
    cvStatus: '',
    coverStatus: 'no',
    deadline: '2026-09-20',
    submissionRequirements: [
      { item: 'Tailored CV (2 pages max)', done: true },
      { item: 'Cover Letter addressing infrastructure interest', done: false },
      { item: 'Academic transcript', done: true },
    ],
    activity: [
      { at: now - 3 * day, kind: 'created', text: 'Logged from Summer of Tech portal' },
    ],
  },
  {
    id: 'app_sample_05',
    company: 'Accenture NZ',
    role: 'Security Consultant (Graduate)',
    status: 'rejected',
    fit: 'good',
    employment: 'job',
    workArrangement: 'onsite',
    location: 'Wellington, NZ',
    source: 'Seek',
    salary: '$72,000 NZD',
    roleType: 'GRC',
    appliedDate: '2026-07-20',
    notes: 'Received automated decline. Feedback: Looking for candidates with direct client-facing consulting internship experience.',
    created: now - 50 * day,
    updated: now - 20 * day,
    cvStatus: 'sent',
    coverStatus: 'sent',
    rejection: {
      userNote: 'High volume graduate intake; prioritised business advisory internships.',
      likelyReasons: ['Lack of prior Big 4 / management consulting experience'],
      improvements: ['Emphasize stakeholder presentation skills in future consultancy applications'],
      draftedAt: now - 20 * day,
    },
    activity: [
      { at: now - 50 * day, kind: 'created', text: 'Logged from Seek' },
      { at: now - 48 * day, kind: 'applied', text: 'Application submitted' },
      { at: now - 20 * day, kind: 'status', text: 'Logged rejection & updated learning loop' },
    ],
  },
  {
    id: 'app_sample_06',
    company: 'Catalyst Cloud',
    role: 'Open Source Cloud Engineer Intern',
    status: 'withdrawn',
    fit: 'good',
    employment: 'internship',
    workArrangement: 'onsite',
    location: 'Wellington, NZ',
    source: 'Summer of Tech',
    salary: '$28.00 / hr',
    roleType: 'Network Security',
    appliedDate: '2026-08-10',
    notes: 'Role was closed early due to internal team restructuring.',
    created: now - 30 * day,
    updated: now - 15 * day,
    cvStatus: 'sent',
    coverStatus: 'sent',
    activity: [
      { at: now - 30 * day, kind: 'created', text: 'Saved from SOT' },
      { at: now - 28 * day, kind: 'applied', text: 'Applied via SOT portal' },
      { at: now - 15 * day, kind: 'status', text: 'Role withdrawn by employer' },
    ],
  },
];

const SAMPLE_OUTREACH = [
  {
    id: 'out_sample_01',
    name: 'Sarah Jenkins',
    company: 'CyberCX New Zealand',
    role: 'Talent Acquisition Partner - Security',
    kind: 'Recruiters',
    status: 'replied',
    contactedDate: '2026-08-22',
    lastContactDate: '2026-08-25',
    notes: 'Connected on LinkedIn after SOT event. Shared upcoming SOC analyst intake timelines.',
  },
  {
    id: 'out_sample_02',
    name: 'David Chen',
    company: 'Spark NZ',
    role: 'Head of Managed Cyber Defense',
    kind: 'Direct Approach',
    status: 'contacted',
    contactedDate: '2026-09-02',
    notes: 'Sent tailored introductory note highlighting RHCSA and NOC incident management background.',
  },
];

const SAMPLE_STUDY = {
  progress: {
    'servicenow-fundamentals': { score: 90, completedAt: now - 10 * day },
    'splunk-search-processing-language': { score: 95, completedAt: now - 5 * day },
    'aws-security-essentials': { score: 85, completedAt: now - 12 * day },
  },
};

async function seed() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const appFile = path.join(DATA_DIR, 'applications.json');
  const outreachFile = path.join(DATA_DIR, 'outreach.json');
  const studyFile = path.join(DATA_DIR, 'study-progress.json');

  await fs.writeFile(appFile, JSON.stringify(SAMPLE_APPLICATIONS, null, 2), 'utf8');
  await fs.writeFile(outreachFile, JSON.stringify(SAMPLE_OUTREACH, null, 2), 'utf8');
  await fs.writeFile(studyFile, JSON.stringify(SAMPLE_STUDY, null, 2), 'utf8');

  console.log('✅ [seed] Successfully seeded demo dataset:');
  console.log(`   - Applications: ${SAMPLE_APPLICATIONS.length} roles (Interview, Applied, Offer, Researching, Rejected, Withdrawn)`);
  console.log(`   - Outreach:     ${SAMPLE_OUTREACH.length} contacts`);
  console.log(`   - Study Guides: 3 completed technical modules`);
  console.log('\n🚀 Run "npm run dev" to test-drive JobFinder with live data!');
}

seed().catch((err) => {
  console.error('❌ [seed] Error seeding sample data:', err);
  process.exit(1);
});
