import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../components/Icons';
import { TabStrip } from '../components/TabStrip';
import { MatchaPageHead } from '../components/matcha/MatchaPageHead';
import { useMatcha } from '../lib/useMatcha';

type Status = 'new' | 'logged' | 'skipped' | 'dismissed';
type Source = 'seek' | 'linkedin' | 'indeed' | 'adzuna' | 'employer' | 'trademe' | 'jobsgovt' | 'recruiter' | 'other';

interface Candidate {
  id: string;
  source: Source;
  title: string;
  company: string;
  location: string;
  salary: string;
  url: string;
  listedAt: string;
  score: number;
  reasons: string[];
  status: Status;
}

interface RadarResponse {
  items: Candidate[];
  lastFetchedAt: number | null;
  fetch: { running: boolean; stage: string; added: number; error: string | null };
}

const SOURCE_LABEL: Record<Source, string> = {
  seek: 'SEEK', linkedin: 'LinkedIn', indeed: 'Indeed', adzuna: 'Adzuna', employer: 'Employer site',
  trademe: 'Trade Me', jobsgovt: 'NZ Govt Jobs', recruiter: 'Recruiter', other: 'Alert email',
};
const TABS: { key: Status; label: string; icon: (p: { className?: string }) => JSX.Element }[] = [
  { key: 'new', label: 'New', icon: Icon.Inbox },
  { key: 'logged', label: 'Logged', icon: Icon.Check },
  { key: 'skipped', label: 'Skipped', icon: Icon.Close },
];

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`);
  return body as T;
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

export function Radar({ toast, onLogged }: { toast: (t: string, tone?: 'info' | 'error') => void; onLogged: () => void }) {
  const matcha = useMatcha();
  const [data, setData] = useState<RadarResponse | null>(null);
  const [tab, setTab] = useState<Status>('new');
  const running = data?.fetch.running ?? false;

  const load = useCallback(async () => {
    try {
      setData(await call<RadarResponse>('/api/radar'));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);
  // Poll only while a fetch is running; the Indeed step takes a minute or two.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [running, load]);

  // Announce the result once when a fetch we were watching finishes.
  const [wasRunning, setWasRunning] = useState(false);
  useEffect(() => {
    if (running) setWasRunning(true);
    else if (wasRunning && data) {
      setWasRunning(false);
      toast(data.fetch.error ?? `Radar fetch done: ${data.fetch.added} new role${data.fetch.added === 1 ? '' : 's'}.`, data.fetch.error ? 'error' : 'info');
    }
  }, [running, wasRunning, data, toast]);

  const fetchNow = async () => {
    try {
      await call('/api/radar/fetch', { method: 'POST' });
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const decide = async (c: Candidate, decision: 'skipped' | 'dismissed') => {
    setData((d) => d && { ...d, items: d.items.map((i) => (i.id === c.id ? { ...i, status: decision } : i)) });
    try { await call(`/api/radar/${encodeURIComponent(c.id)}/decision`, { method: 'POST', body: JSON.stringify({ decision }) }); }
    catch (e) { toast((e as Error).message, 'error'); load(); }
  };

  // Same path as pasting a link into the terminal: the jobhq flow fetches, fit-checks and logs it.
  const log = async (c: Candidate) => {
    try {
      await call('/api/claude/run', { method: 'POST', body: JSON.stringify({ jobUrl: c.url }) });
      await call(`/api/radar/${encodeURIComponent(c.id)}/decision`, { method: 'POST', body: JSON.stringify({ decision: 'logged' }) });
      toast(`Logging ${c.title} at ${c.company}…`);
      await load();
      onLogged();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const items = (data?.items ?? []).filter((i) => i.status === tab);
  const counts = (s: Status) => data?.items.filter((i) => i.status === s).length ?? 0;

  return (
    <div>
      {matcha && <MatchaPageHead eyebrow="Pipeline" title="Radar" />}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={fetchNow} disabled={running}>
          <Icon.Refresh className={running ? 'animate-spin' : ''} /> {running ? 'Fetching…' : 'Fetch new jobs'}
        </button>
        <span className="text-meta text-ink-soft" aria-live="polite">
          {running
            ? data?.fetch.stage
            : data?.lastFetchedAt
              ? `Last fetched ${ago(data.lastFetchedAt)}. Runs daily after 8am.`
              : 'Not fetched yet.'}
        </span>
      </div>
      <TabStrip
        items={TABS.map((t) => ({ ...t, count: counts(t.key) }))}
        active={tab}
        onPick={setTab}
        ariaLabel="Radar status"
      />
      {data?.items.some((i) => i.source === 'adzuna') && (
        <p className="mb-3 text-meta text-ink-faint">
          Some roles are <a className="underline" href="https://www.adzuna.co.nz" target="_blank" rel="noreferrer">Jobs by Adzuna</a>.
        </p>
      )}
      {items.length === 0 ? (
        <div className="panel-empty py-16 text-center">
          <Icon.Inbox className="mx-auto h-8 w-8 text-ink-faint" />
          <p className="mt-3 text-subhead text-ink-soft">
            {tab === 'new' ? 'Nothing new. Press Fetch new jobs.' : `No ${tab} roles yet.`}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <a href={c.url} target="_blank" rel="noreferrer" className="font-bold text-ink hover:underline">
                    {c.title}
                  </a>
                  <p className="text-meta text-ink-soft">
                    {c.company}{c.location ? ` · ${c.location}` : ''}{c.salary ? ` · ${c.salary}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="chip">{SOURCE_LABEL[c.source]}</span>
                    {c.reasons.map((r) => <span key={r} className="chip">{r}</span>)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-meta text-ink-soft" title="Match score">{Math.round(c.score)}</span>
                  {c.status === 'new' && (
                    <>
                      <button className="btn-primary" onClick={() => log(c)}>Log</button>
                      <button className="btn-ghost" onClick={() => decide(c, 'skipped')}>Skip</button>
                      <button className="btn-quiet" onClick={() => decide(c, 'dismissed')} aria-label="Dismiss" title="Dismiss without teaching the radar">
                        <Icon.Close />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
