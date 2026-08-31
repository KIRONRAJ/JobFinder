import { useState } from 'react';
import { Icon } from './Icons';
import type { Application } from '../types';
import { copyText } from '../lib/clipboard';

interface Props {
  app: Application;
}

/**
 * Rendered only for `status: offer` entries. `negotiation` is Claude-drafted
 * on request only, never automatic — each talking point's dollar value must
 * trace to a claim that also appears verbatim in the CV/Candidate Key Facts
 * (see "Negotiation ROI" in the jobhq skill's verification gate). If nothing's
 * been drafted yet, this just points at the ask instead of rendering empty.
 */
export function NegotiationPanel({ app }: Props) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const neg = app.negotiation;

  if (!neg || neg.talkingPoints.length === 0) {
    return (
      <div className="rounded-2xl border border-line-soft bg-panel-2/40 px-4 py-4">
        <p className="text-meta text-ink-faint">
          Ask Claude in chat to draft negotiation talking points — "draft negotiation points for
          the {app.company} offer" — and it will pull verified, quantified achievements from your
          CV and interview story bank into ROI-framed talking points.
        </p>
      </div>
    );
  }

  const copy = async (i: number, text: string) => {
    const ok = await copyText(text);
    if (ok) {
      setCopiedIdx(i);
      setTimeout(() => setCopiedIdx((cur) => (cur === i ? null : cur)), 1800);
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <header className="mb-3 flex items-center gap-2 text-micro font-medium text-ink-soft">
        <Icon.Handshake className="h-3.5 w-3.5 text-accent" />
        Negotiation talking points · drafted by Claude
      </header>

      <ul className="space-y-3">
        {neg.talkingPoints.map((tp, i) => (
          <li key={i} className="rounded-xl border border-line-soft bg-panel-2/50 px-3.5 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-meta leading-relaxed text-ink">{tp.claim}</p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  copy(i, tp.claim);
                }}
                className="btn-quiet shrink-0 px-2 py-1 text-micro"
              >
                {copiedIdx === i ? (
                  <Icon.Check className="h-3 w-3 text-grass" />
                ) : (
                  <Icon.Copy className="h-3 w-3" />
                )}
              </button>
            </div>
            <p className="mt-1.5 text-micro font-medium text-accent">{tp.estimatedValue}</p>
            <p className="mt-1 text-label text-ink-faint">Verified in: {tp.verifiedSource}</p>
            {tp.note && <p className="mt-1 text-label text-ink-faint">{tp.note}</p>}
          </li>
        ))}
      </ul>

      {neg.scriptNotes && (
        <div className="mt-4 border-t border-line-soft pt-3">
          <p className="mb-1.5 text-micro font-medium text-ink-soft">Script notes</p>
          <p className="text-meta leading-relaxed text-ink-soft">{neg.scriptNotes}</p>
        </div>
      )}

      <p className="mt-4 text-label text-ink-faint">
        Every dollar value here is only as good as the achievement behind it — this is what to
        say, not what to send. You still make the call.
      </p>
    </div>
  );
}
