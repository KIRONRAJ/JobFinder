import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icons';
import { CompanyAvatar } from '../components/CompanyAvatar';
import { ContactPanel } from '../components/AppCard';
import { ActivityTimeline } from '../components/ActivityTimeline';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { FitVerdictBanner } from '../components/FitVerdictBanner';
import { SkillsMatchChart } from '../components/SkillsMatchChart';
import { InterviewPrep } from '../components/InterviewPrep';
import { InterviewWarRoom } from '../components/InterviewWarRoom';
import { ReadinessBar } from '../components/ReadinessBar';
import { RejectionPanel } from '../components/RejectionPanel';
import { NegotiationPanel } from '../components/NegotiationPanel';
import { ResponseTimeline } from '../components/ResponseTimeline';
import { StatusTimeline } from '../components/StatusTimeline';
import { EvidenceRow } from '../components/EvidenceRow';
import { SkeletonPanels } from '../components/SkeletonRows';
import {
  ArrangementTag,
  DeadlineTag,
  FollowUpTag,
  SalaryTag,
  SourceTag,
  StatusPill,
} from '../components/Badges';
import { WorkHoursTag } from '../components/WorkHoursTag';
import { EditModal } from '../components/EditModal';
import { ConfirmDelete } from '../components/ConfirmDelete';
import { api } from '../api';
import { useAppData } from '../state/AppDataProvider';
import { computeReadiness } from '../lib/readiness';
import { resolveEvidenceMap } from '../lib/evidenceState';
import type { Application } from '../types';

interface Section {
  id: string;
  label: string;
  icon: (p: { className?: string }) => JSX.Element;
}

/**
 * The role detail page — assembly, not new UI. Every panel here already
 * existed inside AppCard's old expander or one of the retired "role dumped
 * as a list" global views (AnalysisView, EvidenceView); this pulls the same
 * panels onto one page, addressable by URL, instead of scattering them
 * across three surfaces.
 */
export function RoleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { apps, setApps, folders, refreshFolders, loading } = useAppData();
  const [editOpen, setEditOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [cvBusy, setCvBusy] = useState(false);
  const [skipBusy, setSkipBusy] = useState(false);
  const [skipConfirming, setSkipConfirming] = useState(false);
  const [deleteLocalBusy, setDeleteLocalBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const app = apps.find((a) => a.id === id);

  // React Router doesn't scroll to a URL's #hash on its own (that's a plain
  // anchor-tag browser behaviour, and this is a client-side navigation) — the
  // CommandPalette's section jumps rely on this actually happening. Waits for
  // `app` to resolve first, since the target section doesn't exist until then.
  useEffect(() => {
    if (!app || !location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    el?.scrollIntoView({ block: 'start' });
  }, [app, location.hash]);

  // Must sit above the `!app` early return below — a hook declared after a
  // conditional return fires on some renders and not others (app resolving
  // async on load), which crashes with "Rendered more hooks than during the
  // previous render."
  useEffect(() => {
    if (!skipConfirming) return;
    const t = setTimeout(() => setSkipConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [skipConfirming]);

  if (!app) {
    if (loading) {
      return (
        <div className="mx-auto max-w-[1400px] px-6 pb-24 pt-8 sm:px-10">
          <SkeletonPanels />
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-[720px] px-6 py-24 text-center sm:px-10">
        <Icon.Search className="mx-auto h-8 w-8 text-ink-faint" />
        <p className="mt-3 text-subhead text-ink-soft">No role found at this link.</p>
        <Link to="/" className="link-quiet mt-4 justify-center">
          <Icon.Arrow className="h-3.5 w-3.5 rotate-180" />
          Back to Pipeline
        </Link>
      </div>
    );
  }

  const folder = folders[app.id];
  const readiness = computeReadiness(app, folder);
  const evidenceMap = resolveEvidenceMap(app);
  const evidenceItems = Object.entries(evidenceMap);

  const sections: Section[] = [
    { id: 'overview', label: 'Overview', icon: Icon.Gauge },
    ...(app.analysis ? [{ id: 'fit', label: 'Fit & ATS', icon: Icon.Sparkles }] : []),
    ...(evidenceItems.length > 0 ? [{ id: 'evidence', label: 'Evidence', icon: Icon.Shield }] : []),
    ...(app.status === 'interview' ? [{ id: 'interview', label: 'Interview', icon: Icon.Chat }] : []),
    ...(app.status === 'rejected' ? [{ id: 'rejection', label: 'Rejection', icon: Icon.Close }] : []),
    ...(app.status === 'offer'
      ? [{ id: 'negotiation', label: 'Negotiation', icon: Icon.Handshake }]
      : []),
    { id: 'history', label: 'History', icon: Icon.Clock },
  ];

  const handleSave = async (data: Partial<Application>) => {
    const updated = await api.update(app.id, data);
    setApps((list) => list.map((a) => (a.id === updated.id ? updated : a)));
    setEditOpen(false);
    refreshFolders();
  };

  const handleDelete = async () => {
    setConfirming(false);
    await api.remove(app.id);
    setApps((list) => list.filter((a) => a.id !== app.id));
    navigate('/');
  };

  const openFolder = async () => {
    if (!app.folderPath) return;
    await api.openFolder(app.folderPath).catch(() => {});
  };

  const handleRunAnalysis = async () => {
    setAnalysisBusy(true);
    setActionError(null);
    try {
      const res = await api.requestAnalysis(app.id);
      setApps((list) => list.map((a) => (a.id === app.id ? res.entry : a)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalysisBusy(false);
    }
  };

  // Plain PATCH — `userFacts` isn't one of the Claude-owned fields the server
  // strips, so it needs no endpoint of its own. The server reads it back off
  // the entry when it writes the next cv/analysis request file.
  const handleSaveFacts = async (facts: string) => {
    const updated = await api.update(app.id, { userFacts: facts });
    setApps((list) => list.map((a) => (a.id === updated.id ? updated : a)));
  };

  const handleGenerateCv = async () => {
    setCvBusy(true);
    setActionError(null);
    try {
      const res = await api.requestCv(app.id);
      setApps((list) => list.map((a) => (a.id === app.id ? res.entry : a)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setCvBusy(false);
    }
  };

  const handleCancelCv = async () => {
    setCvBusy(true);
    setActionError(null);
    try {
      const res = await api.cancelCvRequest(app.id);
      setApps((list) => list.map((a) => (a.id === app.id ? res.entry : a)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setCvBusy(false);
    }
  };

  // Two clicks, not a native confirm() — same in-page-confirm convention as
  // the Delete flow, just lightweight since skipping is reversible (Edit ->
  // change status back) unlike a real delete.
  const handleSkipClick = async () => {
    if (!skipConfirming) {
      setSkipConfirming(true);
      return;
    }
    setSkipConfirming(false);
    setSkipBusy(true);
    setActionError(null);
    try {
      const updated = await api.update(app.id, { status: 'withdrawn' });
      setApps((list) => list.map((a) => (a.id === updated.id ? updated : a)));
      refreshFolders();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSkipBusy(false);
    }
  };

  // One click, no confirm — see FitVerdictBanner's prop comment for why this
  // is safe to fire immediately: the Notion row survives, so nothing outside
  // this app's own list is actually lost.
  const handleDeleteLocal = async () => {
    setDeleteLocalBusy(true);
    setActionError(null);
    try {
      await api.removeLocal(app.id);
      setApps((list) => list.filter((a) => a.id !== app.id));
      navigate('/');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      setDeleteLocalBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] px-6 pb-24 pt-8 sm:px-10">
      <Link to="/" className="link-quiet mb-6">
        <Icon.Arrow className="h-3.5 w-3.5 rotate-180" />
        Pipeline
      </Link>

      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-line-soft pb-6">
        <div className="flex min-w-0 gap-4">
          <CompanyAvatar name={app.company} source={app.source} className="mt-1 h-12 w-12 text-title" />
          <div className="min-w-0">
            <h1
              className={`text-display font-semibold tracking-[-0.02em] ${app.status === 'rejected' ? 'text-ink-soft line-through decoration-2' : ''}`}
            >
              {app.role}
            </h1>
            <p className="mt-1.5 text-subhead text-ink-soft">
              {app.company}
              {app.location ? ` · ${app.location}` : ''}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2.5">
          <StatusPill status={app.status} />
          <div className="flex items-center gap-1.5">
            <button onClick={() => setEditOpen(true)} className="btn-ghost">
              <Icon.Edit className="h-3.5 w-3.5" />
              Edit
            </button>
            {app.folderPath && (
              <button
                onClick={openFolder}
                disabled={folder?.exists === false}
                title={folder?.exists === false ? "Folder doesn't exist yet" : 'Open in File Explorer'}
                className="btn-ghost disabled:opacity-40"
              >
                <Icon.Folder className="h-3.5 w-3.5" />
                Folder
              </button>
            )}
            {app.link && (
              <a href={app.link} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                <Icon.External className="h-3.5 w-3.5" />
                Job ad
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Mobile section jump — the desktop rail below is `hidden md:block`,
          so without this the app's longest page loses in-page nav entirely
          on a phone (this app is reached over Tailscale, i.e. often a phone). */}
      {sections.length > 1 && (
        <nav
          aria-label="Sections"
          className="mb-6 flex gap-2 overflow-x-auto pb-1 md:hidden"
        >
          {sections.map((s) => {
            const SIcon = s.icon;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="chip shrink-0 whitespace-nowrap"
              >
                <SIcon className="h-3 w-3" />
                {s.label}
              </a>
            );
          })}
        </nav>
      )}

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_320px]">
        {/* Left column — narrative sections, only the ones that apply render. */}
        <div className="min-w-0 space-y-8">
          <section id="overview">
            <h2 className="section-label mb-3">Overview</h2>
            <div className="space-y-3">
              <ReadinessBar readiness={readiness} variant="full" />
              {actionError && (
                <p className="rounded-lg border border-rose/30 bg-rose/[0.06] px-3 py-2 text-micro text-rose">
                  {actionError}
                </p>
              )}
              {/* Added 20 Aug 2026 — a Hauora Taiwhenua application went out on
                  SEEK missing a mandatory video the ad required alongside the
                  CV/cover letter; the requirement existed only as prose inside
                  gap.learningTasks, not loud enough to stop the submission.
                  This is the loud version: unmet items block visually, not
                  just in text that scrolls away. */}
              {app.analysis?.submissionRequirements?.some((r) => !r.done) && (
                <div className="rounded-2xl border border-rose/30 bg-rose/[0.06] px-4 py-3.5">
                  <div className="flex items-start gap-2.5">
                    <Icon.Warning className="mt-0.5 h-4 w-4 shrink-0 text-rose" />
                    <div className="min-w-0">
                      <p className="text-meta font-semibold text-rose">
                        The ad asks for more than a CV and cover letter — don't submit without these
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {app.analysis.submissionRequirements
                          .filter((r) => !r.done)
                          .map((r, i) => (
                            <li key={i} className="text-micro text-ink-soft">
                              <span className="text-rose">✕</span> {r.label}
                              {r.note && <span className="text-ink-faint"> — {r.note}</span>}
                            </li>
                          ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
              {/* Normally absent post-v2.5.1 — jobhq writes a lightweight analysis
                  (fit + skills, no score) the moment a job is logged. This only
                  shows for legacy entries logged before that, or if something
                  genuinely failed to write one. */}
              {!app.analysis && (
                <div className="panel-inset flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                  <div>
                    <p className="text-meta font-medium text-ink">Fit check not run yet</p>
                    <p className="mt-0.5 text-micro text-ink-faint">
                      Skills match, gap analysis and an apply/skip verdict.
                    </p>
                  </div>
                  <button
                    onClick={handleRunAnalysis}
                    disabled={analysisBusy || app.analysisStatus === 'queued'}
                    className="btn-primary shrink-0 disabled:opacity-50"
                  >
                    <Icon.Target className="h-3.5 w-3.5" />
                    {app.analysisStatus === 'queued' ? 'Queued…' : 'Run fit check'}
                  </button>
                </div>
              )}
              {/* The normal case: fit already exists (written at logging time),
                  but the numeric ATS score is deliberately deferred until it's
                  actually needed — CV generation forces it anyway, this is just
                  for seeing it earlier if wanted. */}
              {app.analysis && !app.analysis.score && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-soft bg-panel-2/40 px-3 py-2.5">
                  <p className="text-micro text-ink-soft">
                    Full ATS score not run yet — worth it before drafting a CV, not required before then.
                  </p>
                  <button
                    onClick={handleRunAnalysis}
                    disabled={analysisBusy || app.analysisStatus === 'queued'}
                    className="btn-ghost shrink-0 text-micro disabled:opacity-50"
                  >
                    <Icon.Target className="h-3.5 w-3.5" />
                    {app.analysisStatus === 'queued' ? 'Queued…' : 'Run full ATS score'}
                  </button>
                </div>
              )}
              <ResponseTimeline app={app} />
              {app.trackingNotes && (
                <div className="panel-inset px-4 py-3.5">
                  <div className="mb-1.5 flex items-center gap-1.5 text-micro font-medium text-ink-soft">
                    <Icon.Note className="h-3.5 w-3.5" />
                    Tracking notes
                  </div>
                  <p className="whitespace-pre-wrap text-meta leading-relaxed">{app.trackingNotes}</p>
                </div>
              )}
            </div>
          </section>

          {app.analysis && (
            <section id="fit">
              <h2 className="section-label mb-3">Fit &amp; ATS</h2>
              <div className="space-y-4">
                {app.analysis.recommendation && (
                  <FitVerdictBanner
                    recommendation={app.analysis.recommendation}
                    onGenerateCv={handleGenerateCv}
                    onCancelCv={handleCancelCv}
                    cvBusy={cvBusy}
                    cvQueued={app.cvStatus === 'queued'}
                    cvDone={app.cvStatus === 'drafted' || app.cvStatus === 'sent'}
                    onSkip={handleSkipClick}
                    skipBusy={skipBusy}
                    skipConfirming={skipConfirming}
                    onDeleteLocal={handleDeleteLocal}
                    deleteLocalBusy={deleteLocalBusy}
                    userFacts={app.userFacts ?? ''}
                    onSaveFacts={handleSaveFacts}
                  />
                )}
                {evidenceItems.length > 0 && <SkillsMatchChart evidenceMap={evidenceMap} />}
                <div className="panel-inset px-4 py-4">
                  <AnalysisPanel analysis={app.analysis} />
                </div>
              </div>
            </section>
          )}

          {evidenceItems.length > 0 && (
            <section id="evidence">
              <h2 className="section-label mb-3">Evidence</h2>
              <div className="panel px-5 py-4">
                <ul className="divide-y divide-line-soft">
                  {evidenceItems.map(([keyword, item]) => (
                    <EvidenceRow key={keyword} keyword={keyword} item={item} />
                  ))}
                </ul>
                {!app.evidenceMap && (
                  <p className="mt-4 border-t border-line-soft pt-3 text-micro text-ink-faint">
                    Auto-derived from ATS analysis. Ask Claude in chat to refine — attach sources,
                    mark keywords Kironraj can actually back up.
                  </p>
                )}
              </div>
            </section>
          )}

          {app.status === 'interview' && (
            <section id="interview">
              <h2 className="section-label mb-3">Interview</h2>
              {app.interview ? <InterviewWarRoom app={app} /> : <InterviewPrep app={app} />}
            </section>
          )}

          {app.status === 'rejected' && (
            <section id="rejection">
              <h2 className="section-label mb-3">Rejection</h2>
              <RejectionPanel app={app} onSaved={(u) => setApps((l) => l.map((a) => (a.id === u.id ? u : a)))} />
            </section>
          )}

          {app.status === 'offer' && (
            <section id="negotiation">
              <h2 className="section-label mb-3">Negotiation</h2>
              <NegotiationPanel app={app} />
            </section>
          )}

          <section id="history">
            <h2 className="section-label mb-3">History</h2>
            <div className="space-y-3">
              {app.statusHistory && app.statusHistory.length > 1 && (
                <div className="panel-inset px-4 py-3">
                  <StatusTimeline history={app.statusHistory} />
                </div>
              )}
              <ActivityTimeline activity={app.activity} />
            </div>
          </section>
        </div>

        {/* Right rail — facts displaced off the list row, plus in-page nav. */}
        <aside className="space-y-6 md:sticky md:top-6 md:self-start">
          {sections.length > 1 && (
            <nav aria-label="Sections" className="hidden md:block">
              <ul className="space-y-0.5">
                {sections.map((s) => {
                  const SIcon = s.icon;
                  return (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-meta text-ink-soft transition hover:bg-panel-2/60 hover:text-ink"
                      >
                        <SIcon className="h-3.5 w-3.5" />
                        {s.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}

          <div className="panel-inset px-4 py-3.5">
            <p className="section-label mb-2.5">Details</p>
            <dl className="space-y-2 text-meta">
              {app.date && (
                <Fact label="Applied">{app.date}</Fact>
              )}
              {app.deadline && (
                <Fact label="Closes">
                  <DeadlineTag app={app} />
                </Fact>
              )}
              {app.followUpDue && (
                <Fact label="Follow up">
                  <FollowUpTag app={app} />
                </Fact>
              )}
              {app.salary && (
                <Fact label="Salary">
                  <SalaryTag app={app} />
                </Fact>
              )}
              {app.workArrangement && (
                <Fact label="Arrangement">
                  <ArrangementTag app={app} />
                </Fact>
              )}
              {app.workHours && (
                <Fact label="Hours">
                  <WorkHoursTag app={app} />
                </Fact>
              )}
              {app.source && (
                <Fact label="Source">
                  <SourceTag app={app} />
                </Fact>
              )}
              {app.type && <Fact label="Role type">{app.type}</Fact>}
              {app.employment === 'internship' && <Fact label="Employment">Internship</Fact>}
              {app.trackingRef && <Fact label="Reference">{app.trackingRef}</Fact>}
              {app.trackingUrl && (
                <Fact label="Track">
                  <a
                    href={app.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    Status page
                  </a>
                </Fact>
              )}
            </dl>
          </div>

          <ContactPanel app={app} onEdit={() => setEditOpen(true)} />
        </aside>
      </div>

      <EditModal
        open={editOpen}
        entry={app}
        onClose={() => setEditOpen(false)}
        onSave={handleSave}
        onDelete={() => setConfirming(true)}
      />
      <ConfirmDelete
        entry={confirming ? app : null}
        onCancel={() => setConfirming(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-ink-soft">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}
