import { useRef } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsapSetup';
import { Icon } from './Icons';
import { Meter } from './Meter';
import { aggregateSkills, analysedCount, type SkillStat } from '../lib/market';
import type { Application } from '../types';

interface Props {
  apps: Application[];
  onOpenTerminal: () => void;
}

const STRENGTH_META = {
  strong: { label: 'Strong', tone: 'text-grass', icon: Icon.CheckCircle },
  developing: { label: 'Developing', tone: 'text-amber', icon: Icon.Triangle },
  gap: { label: 'Gap', tone: 'text-rose', icon: Icon.Octagon },
} as const;

/** Static career-route strip from Kironraj's AI Job Search Profile. */
const CAREER_ROUTES = [
  { stage: 'Service Desk / NOC', now: true },
  { stage: 'Systems / Cloud Support', now: false },
  { stage: 'Security Operations', now: false },
];

export function MarketView({ apps, onOpenTerminal }: Props) {
  const skills = aggregateSkills(apps)
    .filter((s) => s.mentions >= 1)
    .sort((a, b) => b.mentions - a.mentions || b.matched - a.matched);
  const total = analysedCount(apps);

  if (total === 0) {
    return (
      <div className="panel-empty px-6 py-16 text-center">
        <Icon.Map className="mx-auto mb-3 h-8 w-8 text-ink-faint" />
        <p className="text-subhead text-ink">No analysed roles yet</p>
        <p className="mt-1.5 text-meta text-ink-soft">
          The market map builds from ATS analyses. Ask Claude to run one on any logged role.
        </p>
        <button onClick={onOpenTerminal} className="btn-quiet mt-4 px-4 py-2 text-micro">
          <Icon.Sparkle className="h-3.5 w-3.5" />
          Ask Claude
        </button>
      </div>
    );
  }

  const top = skills.slice(0, 12);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-line bg-panel p-5">
        <header className="mb-4">
          <h2 className="text-subhead font-medium">Your target market</h2>
          <p className="mt-1 text-meta text-ink-soft">
            Wellington IT / Cyber / NOC / DevOps · aggregated from {total} analysed{' '}
            {total === 1 ? 'role' : 'roles'}
          </p>
        </header>

        <ul className="space-y-3">
          {top.map((s, i) => (
            <SkillRow key={s.skill} stat={s} rank={i + 1} total={total} onAskClaude={onOpenTerminal} />
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-panel-2/40 p-5">
        <header className="mb-4 flex items-center gap-2">
          <Icon.Map className="h-4 w-4 text-accent" />
          <h2 className="text-subhead font-medium">Best-fit route</h2>
        </header>
        <div className="flex flex-wrap items-center gap-2">
          {CAREER_ROUTES.map((r, i) => (
            <div key={r.stage} className="flex items-center gap-2">
              <span
                className={`rounded-xl border px-3.5 py-1.5 text-meta ${
                  r.now
                    ? 'border-accent bg-accent/[0.08] text-accent'
                    : 'border-line text-ink-soft'
                }`}
              >
                {r.now && <Icon.Target className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />}
                {r.stage}
              </span>
              {i < CAREER_ROUTES.length - 1 && (
                <Icon.Arrow className="h-4 w-4 shrink-0 text-ink-faint" />
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-micro text-ink-faint">
          From `kironraj_ai_job_search_profile.md`. Progression, not a hard sequence.
        </p>
      </section>
    </div>
  );
}

function SkillRow({
  stat,
  rank,
  total,
  onAskClaude,
}: {
  stat: SkillStat;
  rank: number;
  total: number;
  onAskClaude: () => void;
}) {
  const meta = STRENGTH_META[stat.strength];
  const IconEl = meta.icon;
  const filled = Math.round((stat.matched / Math.max(stat.mentions, 1)) * 10);
  const rowRef = useRef<HTMLLIElement>(null);

  useGSAP(
    () => {
      if (!rowRef.current) return;
      const reduce = prefersReducedMotion();
      gsap.from(rowRef.current, {
        opacity: 0,
        y: 4,
        duration: reduce ? 0 : 0.28,
        ease: 'power2.out',
        delay: reduce ? 0 : Math.min(rank * 0.02, 0.2),
      });
    },
    { dependencies: [rank] }
  );

  return (
    <li
      ref={rowRef}
      className="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5
                 sm:grid-cols-[24px_minmax(0,1.5fr)_minmax(140px,1fr)_auto]"
    >
      <span className="font-mono text-micro tabular-nums text-ink-faint">{rank}.</span>
      <span className="min-w-0">
        <span className="block truncate text-meta font-medium text-ink">{stat.skill}</span>
        <span className="text-micro text-ink-soft">
          matched in {stat.matched}/{stat.mentions} of {total} analysed
        </span>
      </span>
      <Meter
        filled={filled}
        size="md"
        tone={stat.strength === 'strong' ? 'grass' : stat.strength === 'developing' ? 'amber' : 'rose'}
      />
      <span className="flex items-center gap-2">
        <span className={`flex items-center gap-1 text-micro ${meta.tone}`}>
          <IconEl className="h-3.5 w-3.5" />
          {meta.label}
        </span>
        {stat.strength !== 'strong' && (
          <button
            onClick={onAskClaude}
            title={`Ask Claude for a proof-project plan for ${stat.skill}`}
            className="link-quiet"
          >
            <Icon.Sparkle className="h-3 w-3" />
            Proof project
          </button>
        )}
      </span>
    </li>
  );
}
