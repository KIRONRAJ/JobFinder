import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStagger } from '../../lib/useStagger';
import { Icon } from '../Icons';
import { STATUS_DOT, STATUS_TEXT, StatusIcon } from '../Badges';
import { greetingFor, subtitleFor, useBriefingAudio } from '../dashboard/DashboardHero';
import { KIND, useTodayActions } from '../dashboard/TodayFocus';
import { UpcomingStrip } from '../UpcomingStrip';
import type { Application, Status } from '../../types';

const PIPELINE_ORDER: Status[] = ['researching', 'applied', 'interview', 'offer', 'rejected', 'withdrawn', 'skipped'];
const TICKER_LIMIT = 8;

/**
 * Matcha's dashboard top: hero greeting, stat strip, activity ticker, Today
 * list and pipeline bar. Everything is derived from the same `apps` array and
 * the same hooks the other themes use (todayActions, briefing audio); nothing
 * here fetches or writes on its own (the Upcoming strip makes the one GET /api/events, once per mount).
 */
export function MatchaHome({
  apps,
  onChanged,
  onOpenRole,
  onSchedule,
}: {
  apps: Application[];
  onChanged: () => void;
  onOpenRole: (a: Application) => void;
  onSchedule: (a: Application) => void;
}) {
  const stagger = useStagger<HTMLElement>();
  const greeting = useMemo(() => greetingFor(new Date().getHours()), []);
  const subtitle = useMemo(() => subtitleFor(apps), [apps]);
  const dateLine = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  const counts = useMemo(() => {
    const c = Object.fromEntries(PIPELINE_ORDER.map((s) => [s, 0])) as Record<Status, number>;
    for (const a of apps) c[a.status] += 1;
    return c;
  }, [apps]);

  const recent = useMemo(
    () =>
      apps
        .filter((a) => a.updated || a.created)
        .sort((x, y) => (y.updated ?? y.created ?? 0) - (x.updated ?? x.created ?? 0))
        .slice(0, TICKER_LIMIT),
    [apps]
  );

  const stats: { status: Status | null; label: string; value: number }[] = [
    { status: null, label: 'Tracked', value: apps.length },
    { status: 'applied', label: STATUS_TEXT.applied, value: counts.applied },
    { status: 'interview', label: STATUS_TEXT.interview, value: counts.interview },
    { status: 'rejected', label: STATUS_TEXT.rejected, value: counts.rejected },
  ];

  return (
    <div className="mb-10">
      <section
        ref={stagger}
        className="flex flex-col gap-5 pb-10 pt-6"
      >
        <p data-stagger className="mx-mono text-accent">
          {dateLine}
        </p>
        <h1 data-stagger data-parallax="0.12" className="mx-display-xl font-display-matcha font-normal">
          {greeting},
          <br />
          Jordan.
        </h1>
        <p data-stagger className="max-w-xl text-heading text-ink-soft">
          {subtitle}
        </p>
      </section>

      <section aria-label="Totals" className="grid grid-cols-2 border-y border-line-soft md:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`flex flex-col gap-2 px-4 py-6 md:px-8 ${i % 2 === 0 ? 'border-r border-line-soft' : ''} ${i < 3 ? 'md:border-r' : 'md:border-r-0'} ${i < 2 ? 'border-b border-line-soft md:border-b-0' : ''}`}
          >
            <span className="mx-mono flex items-center gap-2 text-ink-soft">
              {s.status && <StatusIcon status={s.status} />}
              {s.label}
            </span>
            <span className="mx-numeral font-display-matcha">{s.value}</span>
          </div>
        ))}
      </section>

      {recent.length > 0 && (
        <div className="mx-ticker overflow-hidden border-b border-line-soft bg-accent py-3 text-on-accent" aria-label="Recent activity" role="group">
          <div className="mx-tape mx-mono font-medium" style={{ animationDuration: `${recent.length * 7}s` }}>
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0 items-center gap-10 pr-10" aria-hidden={copy === 1 ? true : undefined}>
                {recent.map((a) => (
                  <span key={a.id} className="flex items-center gap-10 whitespace-nowrap">
                    {a.company} · {STATUS_TEXT[a.status].toLowerCase()}
                    <span className="h-1.5 w-1.5 rounded-full bg-on-accent" aria-hidden="true" />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <UpcomingStrip apps={apps} onOpen={onOpenRole} onSchedule={onSchedule} />

      <section className="grid gap-10 pt-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <MatchaToday apps={apps} onChanged={onChanged} />
        <aside className="flex flex-col gap-7">
          <div className="flex flex-col gap-4">
            <h2 className="mx-display-sm font-display-matcha font-normal">Pipeline</h2>
            <div
              className="flex h-3.5 gap-[3px] overflow-hidden rounded-full"
              role="img"
              aria-label={`Pipeline split: ${PIPELINE_ORDER.filter((s) => counts[s]).map((s) => `${counts[s]} ${STATUS_TEXT[s].toLowerCase()}`).join(', ')}`}
            >
              {PIPELINE_ORDER.filter((s) => counts[s] > 0).map((s) => (
                <div key={s} className={STATUS_DOT[s]} style={{ flexGrow: counts[s], flexBasis: 0 }} />
              ))}
            </div>
            <ul className="mx-mono flex flex-wrap gap-x-5 gap-y-2 text-ink-soft">
              {PIPELINE_ORDER.filter((s) => counts[s] > 0).map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <StatusIcon status={s} />
                  {STATUS_TEXT[s]} {counts[s]}
                </li>
              ))}
            </ul>
          </div>
          <BriefingCard />
        </aside>
      </section>
    </div>
  );
}

function MatchaToday({ apps, onChanged }: { apps: Application[]; onChanged: () => void }) {
  const navigate = useNavigate();
  const { rows, busyId, error, act, markTaskDone } = useTodayActions(apps, onChanged);
  return (
    <section aria-labelledby="mx-today-heading" className="flex min-w-0 flex-col">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 id="mx-today-heading" className="mx-display-sm font-display-matcha font-normal">
          Today
        </h2>
        <span className="mx-mono text-ink-faint">{rows.length === 0 ? 'Nothing owing' : `${rows.length} in order`}</span>
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-line-soft py-6 text-body text-ink-soft">Nothing owing. Go find the next role.</p>
      ) : (
        <ol className="border-b border-line-soft">
          {rows.map((r, i) => {
            const k = KIND[r.action];
            const disabled = busyId === r.app.id || (r.action === 'create-cv' && r.app.cvStatus === 'queued');
            return (
              <li key={r.app.id} className="mx-row flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line-soft px-2 py-5">
                <span aria-hidden className={`mx-numeral-sm w-12 shrink-0 font-display-matcha ${i === 0 ? 'text-accent' : 'text-ink-faint'}`}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <button onClick={() => navigate(`/role/${r.app.id}`)} className="min-w-0 flex-1 basis-56 text-left">
                  <span className="block truncate text-heading font-medium text-ink">{r.app.company}</span>
                  <span className="block truncate text-meta text-ink-soft">{r.app.role}</span>
                  <span className="mt-0.5 block text-micro text-ink-faint">{r.reason}</span>
                </button>
                <span className={`mx-mono inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 ${k.tone}`}>
                  <k.icon className="h-3 w-3" />
                  {k.label}
                </span>
                <button
                  onClick={() => act(r.action, r.app)}
                  disabled={disabled}
                  className={`${i === 0 ? 'btn-primary' : 'btn-ghost'} shrink-0 text-micro disabled:opacity-50`}
                >
                  {busyId === r.app.id ? <Icon.Clock className="h-3.5 w-3.5 animate-spin" /> : <k.icon className="h-3.5 w-3.5" />}
                  {r.action === 'create-cv' && r.app.cvStatus === 'queued' ? 'Queued' : k.button}
                </button>
                {r.action === 'task' && r.taskId && (
                  <button onClick={() => markTaskDone(r.app, r.taskId!)} disabled={disabled} className="btn-ghost shrink-0 text-micro disabled:opacity-50">
                    <Icon.Check className="h-3.5 w-3.5" />
                    Done
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {error && <p className="mt-2 text-micro text-rose">{error}</p>}
    </section>
  );
}

function BriefingCard() {
  const { isPlaying, isLoading, toggleBriefingAudio } = useBriefingAudio();
  return (
    <div className="panel flex flex-col gap-3 p-6">
      <span className="mx-mono text-accent">Audio briefing</span>
      <p className="text-subhead leading-snug">Hear today's spoken summary.</p>
      <button
        onClick={toggleBriefingAudio}
        disabled={isLoading}
        title="Play today's AI spoken briefing"
        className="btn-quiet self-start disabled:opacity-50"
      >
        {isPlaying ? <Icon.Mute className="h-4 w-4" /> : <Icon.Volume className="h-4 w-4" />}
        {isLoading ? 'Generating audio…' : isPlaying ? 'Stop briefing' : 'Play briefing'}
      </button>
    </div>
  );
}
