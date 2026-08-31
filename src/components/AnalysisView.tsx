import { useRef } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsapSetup';
import { Icon } from './Icons';
import { AnalysisPanel } from './AnalysisPanel';
import { StatusPill } from './Badges';
import type { Application } from '../types';

/** Open roles are the ones an analysis can still change the outcome of;
 *  running one against a rejected role is just archaeology. */
const OPEN: Application['status'][] = ['researching', 'applied', 'interview', 'offer'];

export function AnalysisView({ apps }: { apps: Application[] }) {
  const analysed = apps.filter((a) => a.analysis);
  const pending = apps.filter((a) => !a.analysis && OPEN.includes(a.status));
  const listRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduce = prefersReducedMotion();
      gsap.from('.analysis-card', {
        opacity: 0,
        y: 6,
        duration: reduce ? 0 : 0.3,
        ease: 'power2.out',
        delay: reduce ? 0 : (i: number) => Math.min(i * 0.04, 0.2),
      });
    },
    { scope: listRef, dependencies: [analysed.length] }
  );

  if (analysed.length === 0 && pending.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-panel px-6 py-16 text-center">
        <p className="text-subhead text-ink">Nothing to analyse yet</p>
        <p className="mt-1.5 text-meta text-ink-soft">Log a role first, then ask Claude for an analysis.</p>
      </div>
    );
  }

  return (
    <div ref={listRef} className="space-y-8">
      {analysed.map((app) => (
        <section key={app.id} className="analysis-card rounded-2xl border border-line bg-panel p-5">
          <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft pb-3.5">
            <div>
              <h2 className="text-subhead font-medium text-ink">{app.role}</h2>
              <p className="mt-0.5 text-meta text-ink-soft">{app.company}</p>
            </div>
            <div className="flex items-center gap-3">
              {app.analysis?.score && (
                <span
                  className={`chip ${
                    app.analysis.score.overall >= 80
                      ? 'border-grass/40 text-grass'
                      : app.analysis.score.overall >= 60
                        ? 'border-accent/40 text-accent'
                        : 'border-amber/40 text-amber'
                  }`}
                  title="ATS match score"
                >
                  <Icon.Target className="h-3 w-3" />
                  {app.analysis.score.overall}/100
                </span>
              )}
              <StatusPill status={app.status} />
            </div>
          </header>
          <AnalysisPanel analysis={app.analysis!} />
        </section>
      ))}

      {pending.length > 0 && (
        <section className="rounded-2xl border border-dashed border-line px-5 py-5">
          <p className="flex items-center gap-1.5 text-meta font-medium text-ink">
            <Icon.Sparkle className="h-3 w-3" />
            No analysis yet
          </p>
          <p className="mt-1 text-micro text-ink-soft">
            Ask Claude in chat — e.g. “run an ATS and gap analysis on the Docuvera role”.
          </p>
          <ul className="mt-3 space-y-1.5">
            {pending.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 text-meta">
                <span className="text-ink">{a.role}</span>
                <span className="text-ink-faint">{a.company}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
