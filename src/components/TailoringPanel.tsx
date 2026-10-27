import { useState } from 'react';
import { Icon } from './Icons';
import { api } from '../api';
import type { Tailoring, TailoringBullet, TailoringTermState } from '../types';

const TERM_META: Record<TailoringTermState, { label: string; cls: string; icon: (p: { className?: string }) => JSX.Element; title: string }> = {
  proven: { label: 'Proven', cls: 'border-grass/40 bg-grass/[0.06] text-grass', icon: Icon.CheckCircle, title: 'A real CV bullet backs this term' },
  claimed: { label: 'Claimed', cls: 'border-accent/40 bg-accent/[0.06] text-accent', icon: Icon.Circle, title: 'Allowed via the claims list or as a personal trait, no bullet behind it' },
  unlockable: { label: 'Needs your OK', cls: 'border-amber/40 bg-amber/[0.06] text-amber', icon: Icon.Triangle, title: 'Held back until you confirm it in cv-evidence.json' },
  gap: { label: 'Gap', cls: 'border-rose/40 bg-rose/[0.06] text-rose', icon: Icon.Close, title: 'The ad asks for it; nothing on file proves it, so it stays off the CV' },
};

function Bullet({ b }: { b: TailoringBullet }) {
  return (
    <li className={`flex gap-2 text-micro ${b.chosen ? 'text-ink' : 'text-ink-faint line-through decoration-ink-faint/40'}`}>
      {b.chosen ? (
        <Icon.Check className="mt-0.5 h-3 w-3 shrink-0 text-grass" aria-label="On the CV" />
      ) : (
        <Icon.Close className="mt-0.5 h-3 w-3 shrink-0 opacity-60" aria-label="Left off" />
      )}
      <span className="min-w-0">
        {b.text}
        {b.matched.length > 0 && (
          <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle no-underline">
            {b.matched.map((t) => (
              <span key={t} className="rounded border border-grass/30 px-1 text-label text-grass">
                {t}
              </span>
            ))}
          </span>
        )}
      </span>
    </li>
  );
}

/** Recomputes what the deterministic engine keeps for this ad, so a CV can be sanity-checked before sending. */
export function TailoringPanel({ appId, hasAd }: { appId: string; hasAd: boolean }) {
  const [data, setData] = useState<Tailoring | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      setData(await api.tailoring(appId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const counts = data?.keywords.reduce<Record<string, number>>((m, k) => ((m[k.state] = (m[k.state] || 0) + 1), m), {});

  return (
    <div className="panel-inset space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-meta font-medium text-ink">What got tailored</p>
          <p className="mt-0.5 text-micro text-ink-faint">
            Which evidence bullets the CV engine keeps for this ad, and how each ad keyword is backed.
          </p>
        </div>
        <button onClick={load} disabled={busy || !hasAd} className="btn-ghost shrink-0 text-micro disabled:opacity-50">
          {busy ? <Icon.Clock className="h-3.5 w-3.5 animate-spin" /> : <Icon.Sparkles className="h-3.5 w-3.5" />}
          {!hasAd ? 'Needs ad text' : data ? 'Refresh' : 'Show'}
        </button>
      </div>
      {error && <p className="text-micro text-rose">{error}</p>}

      {data && (
        <>
          <div>
            <p className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-label uppercase tracking-wide text-ink-faint">
              <span>{data.keywords.length} ad keywords</span>
              {(Object.keys(TERM_META) as TailoringTermState[]).map(
                (s) => counts?.[s] ? <span key={s}>{counts[s]} {TERM_META[s].label.toLowerCase()}</span> : null
              )}
            </p>
            {data.keywords.length === 0 ? (
              <p className="text-micro text-ink-faint">No lexicon terms recognised in this ad.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {data.keywords.map((k) => {
                  const m = TERM_META[k.state];
                  return (
                    <li
                      key={k.term}
                      title={`${m.title}${k.note ? ` — ${k.note}` : ''} · ${k.priority}, ${k.jdCount}× in ad`}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-micro ${m.cls} ${k.priority === 'preferred' ? 'opacity-75' : ''}`}
                    >
                      <m.icon className="h-3 w-3" />
                      {k.surface}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            {data.roles.map((r) => (
              <div key={r.title + r.company}>
                <p className="text-micro font-medium text-ink">
                  {r.title} · <span className="text-ink-soft">{r.company}</span>
                  <span className="ml-2 text-label uppercase tracking-wide text-ink-faint">
                    {r.lead ? 'Experience' : 'Additional'}
                  </span>
                </p>
                <ul className="mt-1 space-y-1">
                  {r.bullets.map((b) => (
                    <Bullet key={b.text} b={b} />
                  ))}
                </ul>
              </div>
            ))}
            <div>
              <p className="text-micro font-medium text-ink">Projects</p>
              <ul className="mt-1 space-y-1">
                {data.projects.map((p) => (
                  <Bullet key={p.title} b={{ text: p.title, terms: [], matched: [...new Set(p.bullets.flatMap((b) => b.matched))], chosen: p.chosen }} />
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
