import { useRef } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsapSetup';
import { Icon } from './Icons';
import { CompanyAvatar } from './CompanyAvatar';
import { useDismissed } from '../lib/dismissed';
import type { Application } from '../types';

interface Props {
  apps: Application[];
  onOpen: (app: Application) => void;
  onSchedule?: (app: Application) => void;
}

export function InterviewBanner({ apps, onOpen, onSchedule }: Props) {
  const { isDismissed, dismiss } = useDismissed();
  const bannerRef = useRef<HTMLDivElement>(null);
  const interviews = apps
    .filter((a) => a.status === 'interview')
    .sort((a, b) => {
      const ta = a.interview?.when ? new Date(a.interview.when).getTime() : Infinity;
      const tb = b.interview?.when ? new Date(b.interview.when).getTime() : Infinity;
      return ta - tb;
    });

  useGSAP(
    () => {
      if (!bannerRef.current) return;
      const reduce = prefersReducedMotion();
      if (!reduce) {
        gsap.from(bannerRef.current, {
          y: -10,
          opacity: 0,
          duration: 0.35,
          ease: 'back.out(1.8)',
        });
      }
    },
    { scope: bannerRef, dependencies: [interviews.length] }
  );

  if (interviews.length === 0) return null;

  const bannerId = `interviews:${interviews.map((a) => a.id).sort().join(',')}`;
  if (isDismissed(bannerId)) return null;

  return (
    <div
      ref={bannerRef}
      className="mb-4 rounded-md border-2 border-line bg-panel p-4 shadow-hardSm hover:shadow-hardMd transition-all"
    >
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-line-soft pb-2.5">
        <div className="flex items-center gap-2">
          <span className="live-dot inline-flex items-center gap-1.5 rounded border border-amber/40 bg-amber/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber">
            <Icon.Chat className="h-3.5 w-3.5" />
            {interviews.length === 1 ? '1 Interview In Play' : `${interviews.length} Interviews In Play`}
          </span>
          <span className="text-micro text-ink-soft hidden sm:inline">
            Active interview pipelines requiring schedule confirmation or prep
          </span>
        </div>
        <button
          onClick={() => dismiss(bannerId)}
          title="Dismiss interview banner"
          aria-label="Dismiss interview banner"
          className="rounded p-1 text-ink-faint transition hover:bg-ink/10 hover:text-ink"
        >
          <Icon.Close className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {interviews.map((a) => {
          const when = a.interview?.when;
          const whenFormatted = when
            ? new Date(when).toLocaleString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })
            : null;

          return (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 rounded border border-line bg-panel-2/40 p-2.5 transition hover:border-accent hover:bg-panel-2"
            >
              <div
                onClick={() => onOpen(a)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5"
              >
                <CompanyAvatar
                  name={a.company}
                  source={a.source}
                  tags={a.tags}
                  className="h-9 w-9 shrink-0 text-title"
                />
                <div className="min-w-0">
                  <p className="truncate text-meta font-semibold text-ink hover:text-accent transition-colors">
                    {a.role}
                  </p>
                  <p className="truncate text-micro text-ink-soft">
                    {a.company}
                    {a.interview?.medium ? ` · ${a.interview.medium}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {whenFormatted ? (
                  <div className="text-right">
                    <span className="block font-mono text-micro font-medium text-amber">
                      {whenFormatted}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpen(a)}
                      className="btn-quiet mt-0.5 rounded px-2 py-0.5 text-micro font-medium text-accent hover:bg-accent/10 transition"
                    >
                      War Room ➔
                    </button>
                  </div>
                ) : (
                  <div className="text-right">
                    <span className="mb-0.5 inline-block rounded bg-amber/15 px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider text-amber border border-amber/30">
                      No date set
                    </span>
                    <button
                      type="button"
                      onClick={() => (onSchedule ? onSchedule(a) : onOpen(a))}
                      className="inline-flex items-center gap-1 rounded border border-amber bg-amber/10 px-2 py-0.5 text-micro font-medium text-amber hover:bg-amber/20 transition shadow-hardXs"
                    >
                      <span>⚡ Set Date</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
