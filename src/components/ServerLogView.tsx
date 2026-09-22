import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from './Icons';
import { api } from '../api';
import { copyText } from '../lib/clipboard';
import type { ServerLogLine } from '../types';

const LINE_CHOICES = [200, 500, 1000, 2000];

/**
 * ponytail: text heuristic, not journald severity. systemd gives a unit's
 * stdout and stderr the same syslog level, so every line this service writes
 * lands as PRIORITY 6 (850 of 853 at the time of writing, the rest 5) and
 * `journalctl -p err` returns nothing even though the server calls
 * console.error in plenty of places. Matching the text is the only signal
 * available. Upgrade path: set a real SyslogLevel split in the unit, or have
 * the server prefix its own error lines, then filter on PRIORITY instead.
 */
const PROBLEM = /\b(error|errors|failed|failing|failure|exception|unhandled|rejected|timeout|timed out|ENOENT|EACCES|ECONNREFUSED|fatal|crash)\b/i;

function isProblem(line: ServerLogLine) {
  return line.priority <= 4 || PROBLEM.test(line.message);
}

function when(at: number) {
  return new Date(at).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * The server's own journald output. Sibling of AuditView and deliberately a
 * separate tab: the audit log is the permanent record of what changed, this is
 * a live rotating window onto whether the process was healthy. When a CV never
 * appears, the audit log shows the request and no completion — this shows why.
 */
export function ServerLogView() {
  const [lines, setLines] = useState<ServerLogLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(500);
  const [q, setQ] = useState('');
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(
    (n: number) => {
      setLoading(true);
      setError(null);
      return api
        .serverLog(n)
        .then(setLines)
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    load(count);
  }, [count, load]);

  const filtered = useMemo(() => {
    if (!lines) return [];
    const needle = q.trim().toLowerCase();
    return lines.filter((l) => {
      if (problemsOnly && !isProblem(l)) return false;
      if (needle && !l.message.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [lines, q, problemsOnly]);

  const problemCount = useMemo(() => (lines ?? []).filter(isProblem).length, [lines]);

  const copyAll = async () => {
    await copyText(filtered.map((l) => `${new Date(l.at).toISOString()}  ${l.message}`).join('\n'));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <>
      <div className="panel mb-4 p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-meta text-ink">
            <span className="font-mono">{filtered.length.toLocaleString()}</span>
            {lines && filtered.length !== lines.length && (
              <span className="text-ink-faint"> of {lines.length.toLocaleString()}</span>
            )}{' '}
            lines
            {problemCount > 0 && (
              <span className="text-ink-faint">
                {' · '}
                <span className="text-amber">{problemCount}</span> look like problems
              </span>
            )}
          </p>
          <div className="flex items-center gap-3">
            {filtered.length > 0 && (
              <button onClick={copyAll} className="link-quiet">
                <Icon.Copy className="h-3 w-3" />
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            <button onClick={() => load(count)} disabled={loading} className="link-quiet">
              <Icon.Refresh className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <label className="sm:col-span-2">
            <span className="field-label">Search</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="cv-worker, telegram, notion…"
              className="field-input"
            />
          </label>
          <label>
            <span className="field-label">Lines</span>
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="field-input"
            >
              {LINE_CHOICES.map((n) => (
                <option key={n} value={n}>
                  Last {n.toLocaleString()}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-3 flex items-center gap-2 text-meta text-ink-soft">
          <input
            type="checkbox"
            checked={problemsOnly}
            onChange={(e) => setProblemsOnly(e.target.checked)}
            className="accent-accent"
          />
          Problems only
          <span className="text-micro text-ink-faint">
            (matches the text — systemd tags every line from this unit as info)
          </span>
        </label>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose/30 bg-panel p-5 text-meta text-rose">
          Couldn't read the server log — {error}
        </div>
      ) : !lines ? (
        <div className="py-16 text-center text-meta text-ink-faint">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="panel-empty px-6 py-16 text-center">
          <Icon.Server className="mx-auto mb-3 h-8 w-8 text-ink-faint" />
          <p className="text-subhead text-ink">
            {lines.length === 0 ? 'Nothing in the journal' : 'No lines match'}
          </p>
          <p className="mt-1.5 text-meta text-ink-soft">
            {lines.length === 0
              ? 'The service may have just restarted, or journald rotated its window.'
              : problemsOnly
                ? 'Nothing looks like a problem in this window — that is the good outcome.'
                : 'Widen the search or ask for more lines.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-panel">
          {filtered.map((l, i) => {
            const problem = isProblem(l);
            return (
              <div
                key={`${l.at}-${i}`}
                className="flex items-start gap-3 border-b border-line-soft px-5 py-2 last:border-b-0"
              >
                <span className="mt-px shrink-0 text-ink-faint">
                  {problem ? (
                    <Icon.Triangle className="h-3 w-3 text-amber" />
                  ) : (
                    <Icon.Circle className="h-3 w-3" />
                  )}
                </span>
                <time className="shrink-0 font-mono text-micro text-ink-faint">{when(l.at)}</time>
                <pre
                  className={`min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-micro leading-relaxed ${
                    problem ? 'text-ink' : 'text-ink-soft'
                  }`}
                >
                  {l.message}
                </pre>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 px-1 text-micro text-ink-faint">
        Read live from journald for <span className="font-mono">jobsearchhq.service</span>. This is a
        rotating window that resets as journald ages out old records — the permanent trail is the
        Audit log tab.
      </p>
    </>
  );
}
