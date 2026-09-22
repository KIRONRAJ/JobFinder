import { useCallback, useEffect, useRef, useState } from 'react';
import { useModalPresence } from '../lib/useModalPresence';
import { playSound } from '../lib/sound';
import { Icon } from './Icons';
import { useDialog } from '../useDialog';
import { api, type PendingRequest } from '../api';

interface Line {
  stream: 'out' | 'err' | 'meta' | 'done';
  line: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onFinished: () => void;
  /** Mirrors the internal `running` flag outward so a card can show
   *  "Processing…" instead of a generic "Queued…" while a run is live. */
  onRunningChange?: (running: boolean) => void;
}

interface Progress {
  done: number;
  total: number;
}

const PROGRESS_RE = /^PROGRESS (\d+)\/(\d+):/;

const REQUEST_LABEL: Record<PendingRequest['type'], string> = {
  cv_request: 'CV/CL',
  delete_request: 'Delete',
  outreach_email_request: 'Email',
  analysis_request: 'ATS score',
  unknown: 'Request',
};

/** A bare http(s) URL takes the fast, narrow /api/claude/run path (unchanged
 *  since it was first built); anything else — a pasted email, a typed
 *  request — goes to /api/claude/command instead. */
function isHttpUrl(text: string): boolean {
  try {
    const u = new URL(text);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Paste a job link and the local Claude CLI runs the jobhq workflow against
 * it. Paste or type anything else — a rejection email, "check pending",
 * "what should I do today" — and it goes through the same CLI with a general
 * prompt instead, so this panel doubles as a lightweight chat with Claude
 * without needing a full terminal session. Output streams back here either way.
 *
 * Also surfaces whatever's sitting in App/requests/ (queued CV/CL drafts and
 * deletes) with a one-click "Process pending" trigger — the manual equivalent
 * of the on-demand loop described in the jobhq skill, for when Jordan wants
 * it processed now instead of waiting until he's next in chat.
 */
export function TerminalPanel({
  open,
  onClose,
  onFinished,
  onRunningChange,
}: Props) {
  const [input, setInput] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [provider, setProvider] = useState<'claude' | 'gemini'>(() =>
    localStorage.getItem('ai_provider') === 'gemini' ? 'gemini' : 'claude'
  );
  const [mode, setMode] = useState<'analyse' | 'command' | 'pending' | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const runIdRef = useRef<string | null>(null);

  const dialogRef = useDialog(open, onClose);
  const presence = useModalPresence(open);

  useEffect(() => {
    onRunningChange?.(running);
  }, [running, onRunningChange]);

  const changeProvider = (next: 'claude' | 'gemini') => {
    setProvider(next);
    localStorage.setItem('ai_provider', next);
  };

  const refreshPending = useCallback(() => {
    api
      .pendingRequests()
      .then((r) => setPending(r.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) refreshPending();
  }, [open, refreshPending]);

  // A run can take minutes; without a visible clock the panel looks hung.
  useEffect(() => {
    if (!running) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [lines]);

  // Deliberately NOT closing the EventSource when the panel merely hides: the
  // Claude process keeps running either way, and dropping the stream would
  // mean the list never refreshes with whatever it just logged. Only a real
  // unmount tears it down.
  useEffect(() => () => sourceRef.current?.close(), []);

  /** Shared by both trigger paths — a job-URL analyse run and a pending-requests
   *  run land in the same log, both just start a fetch that returns a runId. */
  const beginRun = async (
    runMode: 'analyse' | 'command' | 'pending',
    initialProgress: Progress | null,
    start: () => Promise<Response>,
    /** True when this run is a reply to the previous one (see send()) — keeps
     *  the prior output on screen instead of wiping it, so the question being
     *  answered stays visible. */
    isReply = false
  ) => {
    if (running) return;

    setError(null);
    if (!isReply) setLines([]);
    setMode(runMode);
    setProgress(initialProgress);
    setRunning(true);

    try {
      const res = await start();
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not start the run.');

      runIdRef.current = body.runId;
      const source = new EventSource(`/api/claude/stream/${body.runId}`);
      sourceRef.current = source;

      source.onmessage = (event) => {
        const payload: Line = JSON.parse(event.data);
        if (payload.stream === 'done') {
          source.close();
          sourceRef.current = null;
          setRunning(false);
          refreshPending();
          onFinished();
          // A run can take minutes, so this is the one place a chime earns
          // its keep — the result arrives while attention is elsewhere.
          // `analyse` is specifically the single-URL "log this job" fast
          // path, so it gets its own brighter chime distinct from `done`,
          // the general "some command finished" one below — made louder and
          // longer on request (30 Aug 2026) since these runs finish in the
          // background and a subtle chime was easy to miss.
          playSound(runMode === 'analyse' ? 'added' : 'done');
          return;
        }
        const match = payload.line.match(PROGRESS_RE);
        if (match) setProgress({ done: Number(match[1]), total: Number(match[2]) });
        setLines((prev) => [...prev, payload]);
      };
      source.onerror = () => {
        source.close();
        sourceRef.current = null;
        setRunning(false);
        setError('Lost connection to the process.');
        playSound('error');
      };
    } catch (err) {
      setRunning(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const send = () => {
    const value = input.trim();
    if (!value) return;
    setInput('');
    // No discrete step count for either shape of run — indeterminate bar.
    if (isHttpUrl(value)) {
      // A fresh job link always starts a new topic, never a reply.
      return beginRun('analyse', null, () =>
        fetch('/api/claude/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobUrl: value, provider }),
        })
      );
    }
    // Any prior run in this panel — including one that ended by asking a
    // clarifying question ("log it separately?") — becomes the thread this
    // reply continues. The server falls back to a fresh, stateless command
    // if that run's session can't be resumed (e.g. it's aged out).
    const resumeRunId = runIdRef.current;
    return beginRun(
      'command',
      null,
      () =>
        fetch('/api/claude/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: value, provider, resumeRunId }),
        }),
      Boolean(resumeRunId)
    );
  };

  const processPending = () =>
    // Seed the bar at 0/N immediately from what we already know, before the
    // first `PROGRESS` line arrives to confirm/advance it.
    beginRun('pending', { done: 0, total: pending.length }, () =>
      fetch('/api/claude/process-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
    );

  // The homescreen Gmail button used to auto-start its run through this panel,
  // via a counter prop and a ref comparison. It never fired — React batches the
  // "open the panel" and "bump the counter" setStates into one render, so the
  // panel always mounted with the ref already equal to the counter. It runs
  // itself from App.tsx now (see handleGmailFetch), with no terminal at all,
  // which is what that one-fixed-action button wanted in the first place.

  const stop = async () => {
    if (!runIdRef.current) return;
    await fetch(`/api/claude/cancel/${runIdRef.current}`, { method: 'POST' }).catch(() => {});
  };

  if (!presence.mounted) return null;

  return (
    <div
      ref={presence.ref}
      className="fixed inset-0 z-[75] flex items-end justify-center bg-black/25 p-0 backdrop-blur-md sm:items-center sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        data-modal-panel
        role="dialog"
        aria-modal="true"
        aria-labelledby="terminal-title"
        tabIndex={-1}
        className="flex h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border
                   border-line bg-panel shadow-float outline-none sm:h-[70vh] sm:rounded-3xl"
      >
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <Icon.Terminal className="h-4 w-4 text-ink-soft" />
                <span id="terminal-title" className="text-body font-semibold">
                  Terminal
                </span>
                <select
                  value={provider}
                  onChange={(e) => changeProvider(e.target.value as 'claude' | 'gemini')}
                  disabled={running}
                  aria-label="AI provider"
                  className="rounded-full border border-line bg-panel-2 px-2.5 py-1 text-micro font-medium
                             text-ink-soft disabled:opacity-50"
                >
                  <option value="claude">Claude</option>
                  <option value="gemini">Gemini</option>
                </select>
                {running && (
                  <span className="flex items-center gap-1.5 text-micro text-amber">
                    <span className="dot animate-pulse bg-amber" />
                    running · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {running && (
                  <button
                    onClick={stop}
                    className="rounded-full border border-rose/40 px-3 py-1 text-micro font-medium
                               text-rose transition hover:bg-rose hover:text-white"
                  >
                    Stop
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="rounded-full p-1.5 text-ink-soft transition hover:bg-panel-2 hover:text-ink"
                  aria-label="Close terminal"
                >
                  <Icon.Close />
                </button>
              </div>
            </div>

            {running && (
              <div className="border-b border-line px-5 py-2.5">
                {mode === 'pending' && progress ? (
                  <>
                    <div className="h-1.5 overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full bg-accent transition-[width] duration-300"
                        style={{
                          width: `${progress.total > 0 ? Math.min(100, (progress.done / progress.total) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1.5 text-label text-ink-faint">
                      {progress.done} of {progress.total} processed
                    </p>
                  </>
                ) : (
                  <>
                    <div className="progress-indeterminate h-1.5 rounded-full" />
                    <p className="mt-1.5 text-label text-ink-faint">Working…</p>
                  </>
                )}
              </div>
            )}

            <div className="border-b border-line px-5 py-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    // Shift+Enter still inserts a newline — needed for pasting
                    // a multi-line rejection email without submitting mid-paste.
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  disabled={running}
                  rows={2}
                  placeholder="Paste a job link or a rejection email, or type a request — e.g. “check pending requests”, “what should I do today?”"
                  className="field-input flex-1 resize-none font-mono text-meta disabled:opacity-50"
                />
                <button
                  onClick={send}
                  disabled={running || !input.trim()}
                  className="btn-primary self-start disabled:opacity-40 sm:self-auto"
                >
                  <Icon.Sparkles className="h-4 w-4" />
                  {running ? 'Working…' : isHttpUrl(input.trim()) ? 'Analyse & log' : 'Send'}
                </button>
              </div>
              <p className="mt-2.5 text-micro text-ink-faint">
                A job link gets fetched, assessed and logged. Anything else — a pasted rejection
                email, a status update, a request — runs through the same jobhq skill. If it ends
                by asking you something, just type your answer here and send it.
              </p>
              {error && <p className="mt-2 text-micro text-rose">{error}</p>}
            </div>

            {pending.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel-2/40 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-meta font-medium text-ink">
                    {pending.length} pending request{pending.length === 1 ? '' : 's'}
                  </p>
                  <p className="mt-0.5 truncate text-micro text-ink-faint">
                    {pending
                      .slice(0, 3)
                      .map((p) => `${REQUEST_LABEL[p.type]} — ${p.company || p.role || p.file}`)
                      .join(' · ')}
                    {pending.length > 3 ? ` · +${pending.length - 3} more` : ''}
                  </p>
                </div>
                <button
                  onClick={processPending}
                  disabled={running}
                  className="btn-quiet shrink-0 disabled:opacity-40"
                >
                  <Icon.Zap className="h-3.5 w-3.5" />
                  {running ? 'Working…' : 'Process pending'}
                </button>
              </div>
            )}

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto bg-canvas px-5 py-4 font-mono text-micro leading-relaxed"
            >
              {lines.length === 0 && !running && (
                <p className="text-ink-faint">Output will appear here.</p>
              )}
              {lines.map((l, i) => (
                <div
                  key={i}
                  className={`whitespace-pre-wrap break-words ${
                    l.stream === 'err'
                      ? 'text-rose'
                      : l.stream === 'meta'
                        ? 'text-ink-faint'
                        : 'text-ink'
                  }`}
                >
                  {l.line}
                </div>
              ))}
              {running && <span className="inline-block h-4 w-2 animate-pulse bg-accent align-middle" />}
            </div>
      </div>
    </div>
  );
}
