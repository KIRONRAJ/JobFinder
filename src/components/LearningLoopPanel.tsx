import { Icon } from './Icons';
import type { Application } from '../types';

/** Loose theme buckets — same idea as SKILL_ALIASES: only merge things that
 *  really do point at the same lesson, don't over-cluster. */
const REASON_THEMES: { key: string; label: string; needles: RegExp[] }[] = [
  {
    key: 'eligibility',
    label: 'Eligibility / visa / clearance',
    needles: [
      /citizen/i,
      /permanent resident/i,
      /\bpr\b/i,
      /visa/i,
      /pswv/i,
      /vetting/i,
      /clearance/i,
      /nz-only/i,
      /government/i,
    ],
  },
  {
    key: 'experience',
    label: 'Insufficient stated experience',
    needles: [
      // Specific to seniority/tenure claims — a bare "experience" match would
      // hit almost every rejection reason and inflate this bucket.
      /(?:more|greater|prior)\s+(?:senior|hands-on)?\s*experience/i,
      /(?:not|too)\s+(?:enough|much)\s+experience/i,
      /\bsenior(?:ity)?\b/i,
      /\b\d+\+?\s*years?/i,
      /over-?qualified/i,
      /under-?qualified/i,
    ],
  },
  {
    key: 'evidence-gap',
    label: 'Missing evidence for named skill',
    needles: [
      /splunk/i,
      /azure/i,
      /siem/i,
      /servicenow/i,
      /entra/i,
      /didn'?t (?:show|state|evidence)/i,
      /lacks/i,
    ],
  },
  {
    key: 'timing',
    label: 'Timing / late application',
    needles: [/late/i, /closing/i, /submitted (?:after|near)/i],
  },
  {
    key: 'form',
    label: 'Likely form-letter — no real signal',
    needles: [/form/i, /generic/i, /no signal/i, /template/i],
  },
];

interface ThemeCount {
  key: string;
  label: string;
  count: number;
  examples: { company: string; role: string; reason: string }[];
}

function classifyReason(reason: string): string | null {
  for (const t of REASON_THEMES) {
    if (t.needles.some((re) => re.test(reason))) return t.key;
  }
  return null;
}

export function LearningLoopPanel({ apps }: { apps: Application[] }) {
  const rejected = apps.filter((a) => a.status === 'rejected');
  const themes = new Map<string, ThemeCount>();

  for (const a of rejected) {
    const reasons = a.rejection?.likelyReasons ?? [];
    if (a.rejection?.userNote) reasons.push(a.rejection.userNote);
    for (const r of reasons) {
      const key = classifyReason(r);
      if (!key) continue;
      const meta = REASON_THEMES.find((t) => t.key === key)!;
      const cur = themes.get(key) ?? { key, label: meta.label, count: 0, examples: [] };
      cur.count++;
      if (cur.examples.length < 2) {
        cur.examples.push({ company: a.company, role: a.role, reason: r });
      }
      themes.set(key, cur);
    }
  }

  const ranked = Array.from(themes.values())
    .filter((t) => t.count >= 2)
    .sort((a, b) => b.count - a.count);

  if (rejected.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl border border-line bg-panel p-5">
      <header className="mb-3 flex items-center gap-2 text-micro font-medium uppercase tracking-wide text-ink-soft">
        <Icon.Zap className="h-3.5 w-3.5 text-accent" />
        Learning loop — {rejected.length} rejection{rejected.length === 1 ? '' : 's'}
      </header>

      {ranked.length === 0 ? (
        <p className="text-meta text-ink-soft">
          Not enough shared themes yet to spot a pattern. Add a reason note to each rejected
          entry, and ask Claude to analyse them.
        </p>
      ) : (
        <ul className="space-y-3">
          {ranked.map((t) => (
            <li key={t.key} className="rounded-xl border border-line-soft bg-panel-2/50 px-3.5 py-2.5">
              <p className="text-meta font-medium text-ink">
                {t.count}× · {t.label}
              </p>
              <ul className="mt-1 space-y-0.5 text-micro text-ink-faint">
                {t.examples.map((ex, i) => (
                  <li key={i} className="truncate" title={ex.reason}>
                    {ex.company} — {ex.role}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
