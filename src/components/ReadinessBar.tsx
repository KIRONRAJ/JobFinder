import { Icon } from './Icons';
import { Meter, MeterFull } from './Meter';
import { readinessTone, type Readiness } from '../lib/readiness';

/**
 * The single readiness meter. Three variants, one geometry:
 *  - compact: chip-wrapped, for a card header row
 *  - inline:  bare segments + number, no chip border, for a calm list row
 *  - full:    expanded version with the per-check breakdown
 *
 * There used to be a second implementation of this (`ReadinessTag` in
 * Badges.tsx) with a different segment height and a flat rather than gradient
 * fill, so the same score rendered two ways depending on where you looked.
 * All three variants below share the segment size and the fill.
 *
 * Colour never carries the meaning alone — the number is always in the label,
 * and (in the full variant) each check has an icon distinct from its neighbour.
 */

export function ReadinessBar({
  readiness,
  variant = 'compact',
  title = 'Ready to submit',
}: {
  readiness: Readiness;
  variant?: 'compact' | 'inline' | 'full';
  /** Full variant's header label — defaults to the job-application wording
   *  every existing call site relies on. Study's overall-progress meter is
   *  the one caller that needs different words for the same geometry. */
  title?: string;
}) {
  const { score, breakdown } = readiness;
  const filled = Math.round(score / 10);
  const tone = readinessTone(score);

  if (variant === 'compact' || variant === 'inline') {
    const strip = (
      <>
        <Meter filled={filled} tone={tone} size="sm" />
        <span className="tabular-nums">{score}%</span>
      </>
    );

    // `inline` drops the chip border and the icon: on a list row the meter sits
    // among plain text, and a bordered pill there is the chip inflation this
    // redesign is removing.
    return variant === 'inline' ? (
      <span
        className="inline-flex items-center gap-1.5 whitespace-nowrap text-micro text-ink-soft"
        title={`Readiness ${score}%`}
      >
        {strip}
      </span>
    ) : (
      <span className="chip whitespace-nowrap" title={`Readiness ${score}%`}>
        <Icon.Gauge className="h-3 w-3" />
        {strip}
      </span>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-panel-2/50 px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between text-micro font-medium text-ink-soft">
        <span>{title}</span>
        <span className="tabular-nums text-ink">{score}%</span>
      </div>
      <MeterFull filled={filled} tone={tone} />
      <div
        className="mb-3 mt-1 flex justify-between text-label tabular-nums text-ink-faint"
        aria-hidden="true"
      >
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
      <ul className="grid grid-cols-1 gap-1.5 text-micro sm:grid-cols-2">
        {breakdown.map((c) => (
          <li key={c.key} className="flex items-start gap-1.5">
            {c.done ? (
              <Icon.CheckCircle className="mt-[1px] h-3.5 w-3.5 shrink-0 text-grass" />
            ) : (
              <Icon.Circle className="mt-[1px] h-3.5 w-3.5 shrink-0 text-ink-faint" />
            )}
            <span className={c.done ? 'text-ink-soft' : 'text-ink'}>{c.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
