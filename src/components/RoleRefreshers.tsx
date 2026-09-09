import { useEffect, useMemo, useRef, useState } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsapSetup';
import { useAccordionPresence } from '../lib/useAccordionPresence';
import { Icon } from './Icons';
import { CompanyAvatar } from './CompanyAvatar';
import { StatusPill } from './Badges';
import { ReadinessBar } from './ReadinessBar';
import { ConceptDiagram, hasDiagram } from './ConceptDiagram';
import { api } from '../api';
import { copyText } from '../lib/clipboard';
import {
  CONFIDENCE_META,
  roleReadiness,
  rolesToRefresh,
  termFrequencies,
  type Confidence,
  type ConfidenceMap,
  type RoleRefresherEntry,
  type RoleTerm,
  type TermBucket,
} from '../lib/refreshers';
import type { Application } from '../types';

/**
 * Role Refreshers — the second half of the Study split.
 *
 * Skill Guides answers "what should I learn this month". This answers a much
 * narrower question: "I have an interview for this specific role, what
 * vocabulary is in that ad and can I actually explain it out loud?" It is
 * built entirely from data the tracker already holds — each entry's stored
 * `analysis.ats` keywords — so it costs nothing to keep current and cannot
 * drift out of sync with the applications themselves.
 *
 * Two reading modes on purpose:
 *  - Read  — expandable rows, diagrams, the full three-line refresher.
 *  - Drill — flip cards, term on the front, answer on the back. Same data,
 *            but it forces recall before revealing, which reading does not.
 */

/** Literal class strings, not `bg-${tone}` — Tailwind's scanner only emits
 *  classes it can find verbatim in the source, so an interpolated one silently
 *  produces no CSS. Same reason ReadinessBar keys its gradients this way. */
const CONFIDENCE_DOT: Record<'rose' | 'amber' | 'grass', string> = {
  rose: 'bg-rose',
  amber: 'bg-amber',
  grass: 'bg-grass',
};

const BUCKET_META: Record<
  TermBucket,
  { label: string; tone: string; icon: (p: { className?: string }) => JSX.Element; hint: string }
> = {
  missing: {
    label: 'Gap',
    tone: 'border-rose/40 text-rose',
    icon: Icon.Triangle,
    hint: "The ad asks for this and your CV doesn't evidence it. Highest-value revision, and the one most likely to be probed.",
  },
  toEvidence: {
    label: 'Under-stated',
    tone: 'border-amber/40 text-amber',
    icon: Icon.Warning,
    hint: 'You have real experience here but the CV states it too weakly. Worth rehearsing so you can say it plainly.',
  },
  matched: {
    label: 'Evidenced',
    tone: 'border-grass/40 text-grass',
    icon: Icon.CheckCircle,
    hint: 'Already evidenced on the CV. Skim to keep it fresh — expect it to come up as an easy opener.',
  },
};

interface Props {
  apps: Application[];
  onOpenTerminal: () => void;
}

export function RoleRefreshers({ apps, onOpenTerminal }: Props) {
  const [confidence, setConfidence] = useState<ConfidenceMap>({});
  const [mode, setMode] = useState<'read' | 'drill'>('read');
  const [focusTerm, setFocusTerm] = useState<string | null>(null);

  const entries = useMemo(() => rolesToRefresh(apps), [apps]);
  const frequencies = useMemo(() => termFrequencies(entries), [entries]);

  useEffect(() => {
    let alive = true;
    api.refresherConfidence
      .get()
      .then((c) => alive && setConfidence(c))
      // A missing/failed confidence store is not worth an error state — every
      // term simply renders as unrated, which is the correct starting point.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const setTermConfidence = (term: string, value: Confidence) => {
    const prev = confidence[term];
    setConfidence((c) => ({ ...c, [term]: value }));
    api.refresherConfidence.set(term, value).catch(() => {
      setConfidence((c) => {
        const next = { ...c };
        if (prev) next[term] = prev;
        else delete next[term];
        return next;
      });
    });
  };

  if (entries.length === 0) {
    return (
      <div className="panel-empty px-6 py-16 text-center">
        <Icon.GradCap className="mx-auto h-8 w-8 text-ink-faint" />
        <p className="mt-3 text-subhead text-ink-soft">No roles to refresh yet</p>
        <p className="mx-auto mt-1.5 max-w-md text-meta text-ink-faint">
          This section builds itself from the keyword analysis stored on each application, so it
          fills in once you have applied roles that Claude has analysed.
        </p>
        <button onClick={onOpenTerminal} className="btn-primary mt-5">
          <Icon.Sparkles className="h-4 w-4" />
          Ask Claude to analyse a role
        </button>
      </div>
    );
  }

  const allTerms = entries.flatMap((e) => e.terms);
  const uniqueTerms = new Map(allTerms.map((t) => [t.term, t]));

  return (
    <div className="space-y-8">
      <ConfidenceSummary terms={[...uniqueTerms.values()]} confidence={confidence} />

      <TermHeatStrip
        frequencies={frequencies}
        confidence={confidence}
        focusTerm={focusTerm}
        onFocus={(t) => setFocusTerm((cur) => (cur === t ? null : t))}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-micro text-ink-faint">
          {entries.length} live role{entries.length === 1 ? '' : 's'} ·{' '}
          {uniqueTerms.size} distinct term{uniqueTerms.size === 1 ? '' : 's'}
          {focusTerm && (
            <>
              {' '}
              · filtered to <span className="font-medium text-ink">{focusTerm}</span>
              <button onClick={() => setFocusTerm(null)} className="ml-1.5 link-quiet text-micro">
                clear
              </button>
            </>
          )}
        </p>

        <div
          className="flex items-center gap-0.5 rounded-full border border-line p-0.5"
          role="group"
          aria-label="Study mode"
        >
          {(
            [
              { key: 'read', label: 'Read', icon: Icon.Doc },
              { key: 'drill', label: 'Drill', icon: Icon.Zap },
            ] as const
          ).map(({ key, label, icon: IconEl }) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              aria-pressed={mode === key}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-micro font-medium transition
                          ${mode === key ? 'bg-panel-2 text-ink' : 'text-ink-faint hover:text-ink'}`}
            >
              <IconEl className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Each RoleCard hides itself when the focused term isn't in it, so a
          term that matches nothing would otherwise leave a blank page with no
          explanation — which happens whenever the glossary folds a term into
          another entry while a filter is still set. */}
      {focusTerm && !entries.some((e) => e.terms.some((t) => t.term === focusTerm)) ? (
        <div className="panel-empty px-6 py-12 text-center">
          <p className="text-meta text-ink-soft">
            No live role asks for <span className="font-medium text-ink">{focusTerm}</span> any
            more.
          </p>
          <button onClick={() => setFocusTerm(null)} className="btn-quiet mt-3 px-3 py-1.5 text-micro">
            Show all roles
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {entries.map((entry) => (
            <RoleCard
              key={entry.app.id}
              entry={entry}
              mode={mode}
              confidence={confidence}
              focusTerm={focusTerm}
              onRate={setTermConfidence}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The top-of-page meter.
 *
 * Deliberately NOT `ReadinessBar variant="full"` — that variant lists every
 * check in its breakdown, which is right for seven skill guides and completely
 * wrong here, where the term count runs into the hundreds and the breakdown
 * became a wall of unreadable rows. A stacked proportion bar answers the only
 * question worth asking at this altitude ("how much of my vocabulary can I
 * actually explain?") in one glance, and the per-role meters below still use
 * the shared ReadinessBar for the detail.
 */
function ConfidenceSummary({
  terms,
  confidence,
}: {
  terms: RoleTerm[];
  confidence: ConfidenceMap;
}) {
  const counts = { solid: 0, shaky: 0, unknown: 0 };
  for (const t of terms) counts[confidence[t.term] ?? 'unknown']++;
  const total = terms.length || 1;
  const pct = Math.round((counts.solid / total) * 100);

  const bands = [
    { key: 'solid', label: 'Solid', count: counts.solid, fill: 'bg-gradient-to-r from-grass/60 to-grass', dot: 'bg-grass' },
    { key: 'shaky', label: 'Shaky', count: counts.shaky, fill: 'bg-gradient-to-r from-amber/60 to-amber', dot: 'bg-amber' },
    { key: 'unknown', label: 'Not rated', count: counts.unknown, fill: 'bg-line', dot: 'bg-line' },
  ];

  const meterRef = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const reduce = prefersReducedMotion();
      // The segments' widths are proportional (flexbox), so `flex-grow`
      // itself is set statically to its final value — no layout property is
      // animated. The "grow in" is a scaleX transform on top of that
      // already-final layout, origin left, composite-only.
      gsap.from('.confidence-band', {
        scaleX: 0,
        transformOrigin: 'left center',
        duration: reduce ? 0 : 0.4,
        ease: 'power2.out',
      });
    },
    // Keyed on the actual band counts (primitives), not the `terms`/
    // `confidence` objects — those get new references on every ~12s poll
    // even when nothing changed, which replayed this meter's entrance the
    // same way the KpiRow bug did (fixed 30 Aug 2026, see AnalyticsView.tsx).
    { scope: meterRef, dependencies: [counts.solid, counts.shaky, counts.unknown] }
  );

  return (
    <div className="panel-inset px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between text-micro font-medium text-ink-soft">
        <span>Terms you could explain out loud</span>
        <span className="tabular-nums text-ink">
          {counts.solid} / {terms.length} · {pct}%
        </span>
      </div>

      <div ref={meterRef} className="flex h-2.5 gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
        {bands
          .filter((b) => b.count > 0)
          .map((b) => (
            <span
              key={b.key}
              className={`confidence-band ${b.fill} rounded-full`}
              style={{ flexGrow: b.count, flexBasis: 0 }}
            />
          ))}
      </div>

      <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-label text-ink-soft">
        {bands.map((b) => (
          <li key={b.key} className="flex items-center gap-1.5">
            <span className={`dot ${b.dot}`} aria-hidden="true" />
            {b.label}
            <span className="font-mono tabular-nums text-ink-faint">{b.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The recurrence view: which terms the market is asking for repeatedly.
 * Deliberately the first thing under the meter — one term wanted by four
 * employers earns an evening in a way a one-off keyword never does, and that
 * ranking is invisible when you read the roles one at a time.
 */
function TermHeatStrip({
  frequencies,
  confidence,
  focusTerm,
  onFocus,
}: {
  frequencies: ReturnType<typeof termFrequencies>;
  confidence: ConfidenceMap;
  focusTerm: string | null;
  onFocus: (term: string) => void;
}) {
  const top = frequencies.filter((f) => f.count > 1).slice(0, 12);
  const listRef = useRef<HTMLUListElement>(null);
  // A primitive signature, not the `top` array reference itself — `top` is
  // recomputed fresh on every ~12s poll regardless of whether the underlying
  // term frequencies actually changed (same bug/fix as ConfidenceSummary
  // above and KpiRow in AnalyticsView.tsx, 30 Aug 2026).
  const topSignature = top.map((f) => `${f.term}:${f.count}`).join('|');

  useGSAP(
    () => {
      const reduce = prefersReducedMotion();
      gsap.from('.term-bar-fill', {
        scaleX: 0,
        transformOrigin: 'left center',
        duration: reduce ? 0 : 0.4,
        ease: 'power2.out',
      });
    },
    { scope: listRef, dependencies: [topSignature] }
  );

  if (top.length === 0) return null;

  const max = top[0].count;

  return (
    <section className="panel px-5 py-4">
      <div className="panel-header">
        <div>
          <p className="panel-title">Recurring across your applications</p>
          <p className="mt-0.5 text-micro text-ink-soft">
            Click a term to filter the roles below to just the ones that ask for it.
          </p>
        </div>
      </div>

      <ul ref={listRef} className="space-y-1.5">
        {top.map((f) => {
          const rating = confidence[f.term] ?? 'unknown';
          const meta = CONFIDENCE_META.find((m) => m.key === rating)!;
          const active = focusTerm === f.term;
          return (
            <li key={f.term}>
              <button
                onClick={() => onFocus(f.term)}
                aria-pressed={active}
                title={f.roles.join('\n')}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition
                            ${active ? 'bg-accent/10' : 'hover:bg-panel-2'}`}
              >
                <span
                  className={`w-40 shrink-0 truncate text-micro ${active ? 'font-medium text-accent' : 'text-ink'}`}
                >
                  {f.term}
                </span>

                {/* The bar is the count; the dot on it is the confidence. Two
                    facts in one row, and the pairing is the actual insight —
                    a long bar with a red dot is the thing to fix tonight. */}
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-line">
                  <span
                    className={`term-bar-fill absolute inset-y-0 left-0 rounded-full ${
                      f.isGap ? 'bg-gradient-to-r from-rose/50 to-rose' : 'bg-gradient-to-r from-accent/50 to-accent'
                    }`}
                    style={{ width: `${(f.count / max) * 100}%` }}
                  />
                </span>

                <span className="flex w-24 shrink-0 items-center justify-end gap-1.5">
                  <span className={`dot ${CONFIDENCE_DOT[meta.tone]}`} aria-hidden="true" />
                  <span className="text-label text-ink-faint">{meta.short}</span>
                  <span className="w-6 text-right font-mono text-label tabular-nums text-ink-soft">
                    ×{f.count}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line-soft pt-3 text-label text-ink-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-6 rounded-full bg-gradient-to-r from-rose/50 to-rose" />
          at least one role has it as a gap
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-6 rounded-full bg-gradient-to-r from-accent/50 to-accent" />
          evidenced or under-stated only
        </span>
      </p>
    </section>
  );
}

function RoleCard({
  entry,
  mode,
  confidence,
  focusTerm,
  onRate,
}: {
  entry: RoleRefresherEntry;
  mode: 'read' | 'drill';
  confidence: ConfidenceMap;
  focusTerm: string | null;
  onRate: (term: string, value: Confidence) => void;
}) {
  const { app, terms, gapCount } = entry;
  const visible = focusTerm ? terms.filter((t) => t.term === focusTerm) : terms;
  const readiness = roleReadiness(terms, confidence);

  if (visible.length === 0) return null;

  return (
    <section className="panel px-5 py-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <CompanyAvatar
            name={app.company}
            source={app.source}
            tags={app.tags}
            className="h-9 w-9 shrink-0 text-meta"
          />
          <div className="min-w-0">
            <h3 className="truncate text-subhead font-medium text-ink">{app.role}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-micro text-ink-soft">
              <span>{app.company}</span>
              <StatusPill status={app.status} />
              {gapCount > 0 && (
                <span className="chip border-rose/40 text-rose">
                  <Icon.Triangle className="h-3 w-3" />
                  {gapCount} to revise
                </span>
              )}
            </div>
          </div>
        </div>
        <ReadinessBar readiness={readiness} variant="compact" />
      </div>

      {mode === 'drill' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((t) => (
            <FlipCard
              key={t.term}
              term={t}
              rating={confidence[t.term] ?? 'unknown'}
              onRate={(v) => onRate(t.term, v)}
            />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-line-soft">
          {visible.map((t) => (
            <TermRow
              key={t.term}
              term={t}
              app={app}
              rating={confidence[t.term] ?? 'unknown'}
              onRate={(v) => onRate(t.term, v)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Read mode. Collapsed it is one line — the definition — because that is what
 * you want when skimming twelve terms. Expanded it adds the "why they ask",
 * the speakable sentence, and a diagram where the concept is spatial enough
 * to earn one.
 */
function TermRow({
  term,
  app,
  rating,
  onRate,
}: {
  term: RoleTerm;
  app: Application;
  rating: Confidence;
  onRate: (v: Confidence) => void;
}) {
  const [open, setOpen] = useState(false);
  const openPresence = useAccordionPresence(open);
  const [copied, setCopied] = useState(false);
  const bucket = BUCKET_META[term.bucket];
  const BucketIcon = bucket.icon;

  const copySay = async () => {
    if (!term.refresher) return;
    if (await copyText(term.refresher.sayThis)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
        >
          <Icon.Chevron
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
          />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-meta font-medium text-ink">{term.term}</span>
              <span className={`chip ${bucket.tone}`} title={bucket.hint}>
                <BucketIcon className="h-3 w-3" />
                {bucket.label}
              </span>
              {hasDiagram(term.refresher?.diagram) && (
                <span className="chip border-accent/40 text-accent" title="Has an interactive diagram">
                  <Icon.Map className="h-3 w-3" />
                  Diagram
                </span>
              )}
            </span>
            <span className="mt-1 block text-micro leading-relaxed text-ink-soft">
              {term.refresher
                ? term.refresher.what
                : 'No refresher written for this one yet — it came straight from the ad.'}
            </span>
          </span>
        </button>

        <ConfidenceDial rating={rating} onRate={onRate} />
      </div>

      {openPresence.mounted && (
        <div ref={openPresence.ref} className="overflow-hidden">
            <div className="ml-6 mt-3 space-y-3">
              {term.refresher ? (
                <>
                  <div>
                    <p className="section-label mb-1">Why they ask for it</p>
                    <p className="text-micro leading-relaxed text-ink-soft">{term.refresher.why}</p>
                  </div>

                  <div className="rounded-xl border border-accent/30 bg-accent/[0.05] px-3.5 py-3">
                    <p className="section-label mb-1 text-accent">Say something like this</p>
                    <p className="text-micro leading-relaxed text-ink">"{term.refresher.sayThis}"</p>
                    <button onClick={copySay} className="btn-ghost mt-2.5">
                      {copied ? (
                        <>
                          <Icon.Check className="h-3 w-3 text-grass" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Icon.Copy className="h-3.5 w-3.5" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>

                  {hasDiagram(term.refresher.diagram) && (
                    <ConceptDiagram diagram={term.refresher.diagram} />
                  )}
                </>
              ) : (
                <p className="text-micro leading-relaxed text-ink-soft">
                  The glossary has no entry for this keyword. Ask Claude in chat for a short
                  refresher on it and it can be added to{' '}
                  <code className="font-mono text-label">src/lib/refreshers.ts</code>.
                </p>
              )}

              <p className="text-label text-ink-faint">
                As {app.company} worded it: "{term.raw}"
              </p>
            </div>
        </div>
      )}
    </li>
  );
}

/**
 * Drill mode. A real flip, not a disclosure toggle — the front deliberately
 * shows nothing but the term, so you have to attempt recall before the answer
 * is available. Rating the card is the natural next action once it is flipped,
 * which is why the dial only appears on the back.
 */
function FlipCard({
  term,
  rating,
  onRate,
}: {
  term: RoleTerm;
  rating: Confidence;
  onRate: (v: Confidence) => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const bucket = BUCKET_META[term.bucket];
  const BucketIcon = bucket.icon;
  const cardRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!cardRef.current) return;
      const reduce = prefersReducedMotion();
      gsap.to(cardRef.current, {
        rotateY: flipped ? 180 : 0,
        duration: reduce ? 0 : 0.45,
        ease: 'power3.inOut',
      });
    },
    { dependencies: [flipped] }
  );

  return (
    <div className="[perspective:1200px]">
      <div ref={cardRef} className="relative h-44 w-full [transform-style:preserve-3d]">
        {/* Front — term only. */}
        <button
          onClick={() => setFlipped(true)}
          aria-hidden={flipped}
          tabIndex={flipped ? -1 : 0}
          className="panel-inset absolute inset-0 flex flex-col items-center justify-center gap-2 px-4
                     text-center transition hover:border-accent/50
                     focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30
                     [backface-visibility:hidden]"
        >
          <span className={`chip ${bucket.tone}`}>
            <BucketIcon className="h-3 w-3" />
            {bucket.label}
          </span>
          <span className="text-subhead font-medium text-ink">{term.term}</span>
          <span className="mt-1 flex items-center gap-1.5 text-label text-ink-faint">
            <Icon.Arrow className="h-3 w-3" />
            Tap to reveal
          </span>
        </button>

        {/* Back — the answer, plus the rating that only makes sense once seen. */}
        <div
          aria-hidden={!flipped}
          className="panel-inset absolute inset-0 flex flex-col px-4 py-3
                     [backface-visibility:hidden] [transform:rotateY(180deg)]"
        >
          <p className="text-label font-medium uppercase tracking-wide text-ink-faint">
            {term.term}
          </p>
          <p className="mt-1.5 flex-1 overflow-y-auto text-micro leading-relaxed text-ink-soft">
            {term.refresher?.what ?? 'No refresher written for this term yet.'}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-line-soft pt-2">
            <ConfidenceDial rating={rating} onRate={onRate} compact />
            <button
              onClick={() => setFlipped(false)}
              tabIndex={flipped ? 0 : -1}
              className="link-quiet shrink-0 text-label"
            >
              Flip back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Three states rather than a checkbox, and every state carries an icon as well
 * as a hue — the standing rule in this design system, and it matters more than
 * usual here because the three tones are red/amber/green.
 */
function ConfidenceDial({
  rating,
  onRate,
  compact = false,
}: {
  rating: Confidence;
  onRate: (v: Confidence) => void;
  compact?: boolean;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-0.5 rounded-full border border-line p-0.5"
      role="group"
      aria-label="How well do you know this term?"
    >
      {CONFIDENCE_META.map((m) => {
        const on = rating === m.key;
        const Glyph =
          m.key === 'unknown' ? Icon.Circle : m.key === 'shaky' ? Icon.Warning : Icon.CheckCircle;
        const activeClass =
          m.tone === 'rose'
            ? 'bg-rose/12 text-rose'
            : m.tone === 'amber'
              ? 'bg-amber/12 text-amber'
              : 'bg-grass/12 text-grass';
        return (
          <button
            key={m.key}
            onClick={() => onRate(m.key)}
            aria-pressed={on}
            title={m.label}
            className={`flex items-center gap-1 rounded-full px-2 py-1 text-label font-medium transition
                        focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30
                        ${on ? activeClass : 'text-ink-faint hover:text-ink'}`}
          >
            <Glyph className="h-3 w-3" />
            {!compact && <span className={on ? '' : 'sr-only'}>{m.short}</span>}
          </button>
        );
      })}
    </div>
  );
}
