import { Icon } from './Icons';
import type { Application, RoleType } from '../types';

/**
 * Shown only once a role reaches Interview. The talking points are drawn from
 * Jordan's real, confirmed background (Candidate Key Facts.md) — nothing
 * here is invented, and anything role-specific he adds lives in his notes.
 */
const TALKING_POINTS = [
  "Master's in Cyber Security, Riverside Institute of Technology, Wellington — completed July 2026",
  'Master’s research: Replay Attack Prevention in Smart Car IoT Systems (hybrid nonce + counter defence)',
  '~4 years Linux/Windows server and network experience',
  'Genuine 24/7 rotating-shift NOC experience (L2 NOC Engineer, Northline Broadband)',
  'Full, clean NZ driver’s licence',
  '3-year Post Study Work Visa granted — full open work rights, no sponsorship needed',
];

const QUESTIONS_BY_TYPE: Record<RoleType, string[]> = {
  'SOC Analyst': [
    'Walk me through how you’d triage a suspected phishing alert.',
    'What’s the difference between an IDS and an IPS, and when would you use each?',
    'How would you tell a true positive from a false positive in a SIEM alert?',
    'Describe the stages of an incident response process.',
  ],
  GRC: [
    'How would you explain a risk register to a non-technical manager?',
    'What do you know about the NZ Privacy Act and how it affects security controls?',
    'How would you approach an ISO 27001 gap assessment?',
    'How do you prioritise remediation when everything is flagged critical?',
  ],
  'Network Security': [
    'How would you segment a flat network, and why?',
    'Explain how you’d troubleshoot intermittent packet loss between two sites.',
    'What’s your approach to firewall rule review and cleanup?',
    'How does a VPN tunnel establish trust?',
  ],
  'IT Security Support': [
    'A user says their machine is "acting weird" — what are your first three questions?',
    'How do you balance security controls against keeping people productive?',
    'Talk me through onboarding a new starter securely (accounts, MFA, device).',
    'How do you handle a ticket you don’t know the answer to?',
  ],
  Other: [
    'Why this role, and why this company?',
    'Tell me about a time you solved a problem under time pressure.',
    'Where do you want your security career to go in three years?',
    'What have you learned recently that you’re excited about?',
  ],
};

export function InterviewPrep({ app }: { app: Application }) {
  if (app.status !== 'interview') return null;
  const questions = QUESTIONS_BY_TYPE[app.type ?? 'Other'] ?? QUESTIONS_BY_TYPE.Other;

  return (
    <div className="rounded-2xl border border-amber/30 bg-amber/[0.06] px-4 py-3.5">
      <div className="mb-3 flex items-center gap-2 text-micro font-medium text-amber">
        <Icon.Chat className="h-3.5 w-3.5" />
        Interview prep
      </div>

      <div className="mb-4">
        <div className="mb-1.5 text-micro font-medium text-ink-soft">Your talking points</div>
        <ul className="space-y-1">
          {TALKING_POINTS.map((p) => (
            <li key={p} className="flex gap-2 text-meta leading-snug">
              <Icon.Check className="mt-[5px] h-3 w-3 shrink-0 text-grass" />
              {p}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="mb-1.5 text-micro font-medium text-ink-soft">
          Likely questions · {app.type ?? 'Other'}
        </div>
        <ul className="space-y-1">
          {questions.map((q) => (
            <li key={q} className="flex gap-2 text-meta leading-snug text-ink-soft">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
              {q}
            </li>
          ))}
        </ul>
      </div>

      {app.company && (
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(`${app.company} New Zealand company news`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="link-quiet mt-3.5"
        >
          <Icon.External className="h-3.5 w-3.5" />
          Research {app.company}
        </a>
      )}
    </div>
  );
}
