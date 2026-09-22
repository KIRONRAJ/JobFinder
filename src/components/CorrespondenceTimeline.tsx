import { useState, useMemo } from 'react';
import { Icon } from './Icons';
import { CompanyAvatar } from './CompanyAvatar';
import { copyText } from '../lib/clipboard';
import { playSound } from '../lib/sound';
import type { Application } from '../types';

interface MessageBlock {
  id: string;
  type: 'received' | 'sent' | 'call' | 'note';
  sender?: string;
  date?: string;
  subject?: string;
  body: string;
  isConfirmationCode?: boolean;
  confirmationCode?: string;
}

interface Props {
  app: Application;
  onLogMessage: () => void;
}

/**
 * Smart parser for app.trackingNotes into structured communication entries.
 * Fully compliant with Rule 6: parses incoming and outgoing employer email correspondence.
 */
function parseTrackingNotes(raw: string, company: string): MessageBlock[] {
  if (!raw || !raw.trim()) return [];

  // Check if divided by standard delimiter lines
  const delimiterPattern = /(?:={20,}|-{20,})/g;
  const rawSections = raw.split(delimiterPattern).map((s) => s.trim()).filter(Boolean);

  const blocks: MessageBlock[] = [];

  for (let i = 0; i < rawSections.length; i++) {
    const sec = rawSections[i];
    
    // Check if section contains email or call headers
    const fromMatch = sec.match(/(?:FROM|From):\s*([^\n\r]+)/i);
    const callMatch = sec.match(/(?:CALL|Call):\s*([^\n\r]+)/i);
    const dateMatch = sec.match(/(?:DATE|Date):\s*([^\n\r]+)/i);
    const subjectMatch = sec.match(/(?:SUBJECT|Subject):\s*([^\n\r]+)/i);
    const topicMatch = sec.match(/(?:TOPIC|Topic):\s*([^\n\r]+)/i);
    const toMatch = sec.match(/(?:TO|To):\s*([^\n\r]+)/i);

    // If section contains only header lines, it might be paired with the next section as body
    const isOnlyHeaders = (fromMatch || callMatch) && !sec.replace(/(?:FROM|CALL|DATE|SUBJECT|TOPIC|TO):[^\n\r]*/gi, '').trim();
    if (isOnlyHeaders && i + 1 < rawSections.length) {
      const nextSec = rawSections[i + 1];
      const from = fromMatch ? fromMatch[1].trim() : (callMatch ? callMatch[1].trim() : '');
      const date = dateMatch ? dateMatch[1].trim() : '';
      const subject = subjectMatch ? subjectMatch[1].trim() : (topicMatch ? topicMatch[1].trim() : '');
      const isOutgoing = /jordan|candidate|sent reply|outreach/i.test(from) || (toMatch && !fromMatch && !callMatch);

      blocks.push({
        id: `block-${i}`,
        type: callMatch ? 'call' : (isOutgoing ? 'sent' : 'received'),
        sender: from || company,
        date,
        subject,
        body: nextSec,
      });
      i++; // consume next section as body
      continue;
    }

    if (fromMatch || callMatch || dateMatch || subjectMatch || topicMatch) {
      // Clean headers out of body
      let body = sec
        .replace(/(?:FROM|From):\s*[^\n\r]+/i, '')
        .replace(/(?:CALL|Call):\s*[^\n\r]+/i, '')
        .replace(/(?:DATE|Date):\s*[^\n\r]+/i, '')
        .replace(/(?:SUBJECT|Subject):\s*[^\n\r]+/i, '')
        .replace(/(?:TOPIC|Topic):\s*[^\n\r]+/i, '')
        .replace(/(?:TO|To):\s*[^\n\r]+/i, '')
        .trim();

      const from = fromMatch ? fromMatch[1].trim() : (callMatch ? callMatch[1].trim() : company);
      const isOutgoing = /jordan|candidate|sent reply|outreach/i.test(from);

      blocks.push({
        id: `block-${i}`,
        type: callMatch ? 'call' : (isOutgoing ? 'sent' : 'received'),
        sender: from,
        date: dateMatch ? dateMatch[1].trim() : undefined,
        subject: subjectMatch ? subjectMatch[1].trim() : (topicMatch ? topicMatch[1].trim() : undefined),
        body,
      });
      continue;
    }

    // Check for call / meeting notes
    if (/call note|phone interview|spoke with|phone call/i.test(sec.slice(0, 50))) {
      blocks.push({
        id: `block-${i}`,
        type: 'call',
        sender: company,
        body: sec,
      });
      continue;
    }

    // Check for confirmation number / system note
    const confMatch = sec.match(/(?:confirmation (?:number|code|id)|ref(?:erence)? #?)\s*[:=]?\s*([A-Za-z0-9_-]{5,20})/i);
    if (confMatch) {
      blocks.push({
        id: `block-${i}`,
        type: 'note',
        sender: company,
        isConfirmationCode: true,
        confirmationCode: confMatch[1],
        body: sec,
      });
      continue;
    }

    // Check for standard email greetings
    if (/^(?:Kia ora|Hi|Hello|Dear|Tēnā koe)\b/i.test(sec)) {
      blocks.push({
        id: `block-${i}`,
        type: 'received',
        sender: company,
        body: sec,
      });
      continue;
    }

    // Fallback plain note
    blocks.push({
      id: `block-${i}`,
      type: 'note',
      sender: company,
      body: sec,
    });
  }

  return blocks;
}

export function CorrespondenceTimeline({ app, onLogMessage }: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const blocks = useMemo(
    () => parseTrackingNotes(app.trackingNotes || '', app.company),
    [app.trackingNotes, app.company]
  );

  const handleCopy = (text: string, key: string) => {
    copyText(text);
    setCopiedKey(key);
    playSound('tick');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
    playSound('tick');
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
            <Icon.Mail className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <span>Correspondence History</span>
              {blocks.length > 0 && (
                <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[11px] font-mono text-ink-soft">
                  {blocks.length} {blocks.length === 1 ? 'record' : 'records'}
                </span>
              )}
            </h3>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogMessage}
          className="btn-primary text-xs flex items-center gap-1.5 py-1.5 px-3 rounded-xl shadow-sm"
        >
          <Icon.Plus className="h-3.5 w-3.5" />
          <span>Log Email / Call Note</span>
        </button>
      </div>

      {/* Messages Feed */}
      {blocks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-soft bg-canvas/40 p-6 text-center">
          <Icon.Mail className="mx-auto h-7 w-7 text-ink-faint/60" />
          <p className="mt-2 text-xs font-medium text-ink-soft">
            No communication history logged yet for {app.company}.
          </p>
          <p className="text-[11px] text-ink-faint mt-0.5">
            Log incoming employer responses, confirmation numbers, or phone interviews to keep this record active.
          </p>
          <button
            type="button"
            onClick={onLogMessage}
            className="btn-secondary text-xs inline-flex items-center gap-1.5 py-1.5 px-3 rounded-xl mt-3"
          >
            <Icon.Plus className="h-3.5 w-3.5" />
            <span>Log First Message</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {blocks.map((block) => {
            const isLong = block.body.length > 320;
            const isExpanded = expandedIds[block.id];
            const displayBody = isLong && !isExpanded ? block.body.slice(0, 300) + '…' : block.body;

            return (
              <div
                key={block.id}
                className={`panel-inset overflow-hidden rounded-2xl border transition-all ${
                  block.type === 'sent'
                    ? 'border-blue-500/20 bg-blue-500/5'
                    : block.type === 'call'
                    ? 'border-amber-500/20 bg-amber-500/5'
                    : 'border-line-soft bg-panel/70'
                }`}
              >
                {/* Header row */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft/80 bg-canvas/40 px-4 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {block.type === 'sent' ? (
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400">
                        <Icon.Arrow className="h-3.5 w-3.5" />
                      </div>
                    ) : block.type === 'call' ? (
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                        <Icon.Phone className="h-3.5 w-3.5" />
                      </div>
                    ) : (
                      <CompanyAvatar name={app.company} className="h-6 w-6 shrink-0" tags={app.tags} />
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-bold text-ink">
                          {block.type === 'sent'
                            ? 'You (Outgoing Reply)'
                            : block.type === 'call'
                            ? 'Phone / Interview Call'
                            : block.sender || app.company}
                        </span>
                        {block.isConfirmationCode && (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.2 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            Confirmation
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-ink-faint">
                    {block.date && (
                      <span className="font-mono text-[10px] text-ink-soft">
                        {block.date}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => handleCopy(block.body, `copy-${block.id}`)}
                      className="btn-ghost py-0.5 px-1.5 text-[10px] flex items-center gap-1"
                      title="Copy message content"
                    >
                      <Icon.Copy className="h-2.5 w-2.5" />
                      <span>{copiedKey === `copy-${block.id}` ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                {/* Subject strip if present */}
                {block.subject && (
                  <div className="px-4 pt-2.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
                    <span className="text-ink-faint text-[10px] uppercase tracking-wider">Subject:</span>
                    <span className="truncate">{block.subject}</span>
                  </div>
                )}

                {/* Confirmation Code Chip */}
                {block.confirmationCode && (
                  <div className="mx-4 mt-2.5 flex items-center gap-2 rounded-xl bg-emerald-500/10 p-2.5 border border-emerald-500/20">
                    <Icon.Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                        Application Confirmation Reference:
                      </p>
                      <p className="font-mono text-xs font-bold text-ink truncate">
                        {block.confirmationCode}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(block.confirmationCode || '', `code-${block.id}`)}
                      className="btn-secondary text-[10px] py-1 px-2 rounded-lg"
                    >
                      {copiedKey === `code-${block.id}` ? 'Copied!' : 'Copy Code'}
                    </button>
                  </div>
                )}

                {/* Message Body */}
                <div className="p-4 pt-2.5">
                  <p className="whitespace-pre-wrap text-xs text-ink leading-relaxed font-sans">
                    {displayBody}
                  </p>

                  {isLong && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(block.id)}
                      className="mt-2 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline flex items-center gap-1"
                    >
                      <span>{isExpanded ? 'Show less' : 'Read full message'}</span>
                      <Icon.Arrow className={`h-2.5 w-2.5 transition-transform ${isExpanded ? '-rotate-90' : 'rotate-90'}`} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
