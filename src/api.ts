import type {
  Application,
  ApplicationTask,
  AssessmentOutcome,
  AssessmentStore,
  AuditEvent,
  EventItem,
  EventStore,
  FolderStatus,
  InterviewBank,
  InterviewCategory,
  InterviewQuestion,
  LearningLoopReport,
  OutreachEmailKind,
  OutreachEntry,
  ServerLogLine,
  StudyData,
  StudyGuideProgress,
  UpskillReport,
  Employment,
  Fit,
  RoleType,
  Source,
  WorkArrangement,
} from './types';
import type {
  Confidence as TermConfidence,
  ConfidenceMap as TermConfidenceMap,
} from './lib/refreshers';

export interface PendingRequest {
  file: string;
  type:
    | 'cv_request'
    | 'delete_request'
    | 'outreach_email_request'
    | 'analysis_request'
    | 'unknown';
  role: string;
  company: string;
  requestedAt: string | null;
}

/** One .md draft Claude has written into an outreach entry's folder. */
export interface OutreachEmailDraft {
  name: string;
  relPath: string;
  body: string;
  mtime: number;
}

export interface AppDocumentFile {
  name: string;
  kind: 'cvPdf' | 'cvDocx' | 'coverPdf' | 'coverDocx' | 'other';
  ext: string;
  size: number;
  mtime: number;
  url: string;
}

export interface AppDocumentsResponse {
  exists: boolean;
  folderPath?: string;
  company?: string;
  role?: string;
  files: AppDocumentFile[];
}

export interface ParsedJobAd {
  company: string;
  role: string;
  location: string;
  roleType: RoleType;
  employment: Employment;
  workArrangement?: WorkArrangement;
  salary?: string;
  deadline?: string;
  source?: Source;
  fit?: Fit;
  tags?: string[];
  notes?: string;
  link?: string;
}

/**
 * Set once by LoginGate on mount. Lets any API call anywhere in the app drop
 * straight back to the login screen the moment a session expires mid-use,
 * not just on first load — a module-level hook rather than threading a
 * callback through every call site, matching this file's existing shape.
 */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (res.status === 401) onUnauthorized?.();
  if (!res.ok) {
    // Surface the server's own message where it gave one (duplicate matchKey,
    // bad folder path, …) rather than a generic HTTP error.
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* response wasn't JSON — keep the status text */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  list: () => request<Application[]>('/api/applications'),

  create: (data: Partial<Application>) =>
    request<Application>('/api/applications', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<Application> & { rejectionNote?: string }) =>
    request<Application>(`/api/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    request<{ ok: true; queued: string }>(`/api/applications/${id}`, {
      method: 'DELETE',
    }),

  /** Local-only discard — keeps the Notion row as a dedupe log. See the
   *  server route's comment for why this is a separate endpoint. */
  removeLocal: (id: string) =>
    request<{ ok: true }>(`/api/applications/${id}/local`, {
      method: 'DELETE',
    }),

  /** Mark a follow-up done (clears it) or push it out N days — the two
   *  actions that were missing: `followUpDue` used to only ever be set. */
  followUp: (id: string, action: 'done' | 'snooze', days?: number) =>
    request<Application>(`/api/applications/${id}/follow-up`, {
      method: 'POST',
      body: JSON.stringify({ action, days }),
    }),

  tasks: {
    add: (appId: string, data: { label: string; dueAt: string; note?: string }) =>
      request<Application>(`/api/applications/${appId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (appId: string, taskId: string, patch: Partial<ApplicationTask>) =>
      request<Application>(`/api/applications/${appId}/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    remove: (appId: string, taskId: string) =>
      request<Application>(`/api/applications/${appId}/tasks/${taskId}`, {
        method: 'DELETE',
      }),
  },

  requestCv: (id: string) =>
    request<{ ok: true; queued: string; entry: Application }>(`/api/cv-request/${id}`, {
      method: 'POST',
    }),

  cancelCvRequest: (id: string) =>
    request<{ ok: true; entry: Application }>(`/api/cv-request/${id}`, {
      method: 'DELETE',
    }),

  /** On-demand deep fit analysis (v2.5) — same request-file pattern as
   *  requestCv, but runs the ATS/gap/score protocol early so the apply/skip
   *  decision doesn't require drafting a CV first. */
  requestAnalysis: (id: string) =>
    request<{ ok: true; queued: string; entry: Application }>(`/api/analysis-request/${id}`, {
      method: 'POST',
    }),

  /** On-demand reviewer critique (v2.6; live-spawn since v2.7) — used to run
   *  automatically on every generation; now it's a button, for when a draft
   *  actually looks doubtful. Spawns immediately (no request-file queue) and
   *  hands back a runId so the caller can watch it live via
   *  /api/claude/stream/:runId, same mechanism as the terminal panel. The
   *  mechanical checks it partly duplicated run every time regardless, in
   *  scripts/verify-docs.py. */
  requestReview: (id: string, note?: string) =>
    request<{ ok: true; runId: string; entry: Application }>(`/api/review-request/${id}`, {
      method: 'POST',
      body: JSON.stringify({ note: note || '' }),
    }),

  // The Express server may run on a different machine from
  // the browser, so it can't launch Explorer on the client PC — that has to
  // happen client-side via a registered `openfolder://` protocol handler
  // (see Required Documents/README or ask Claude for the Windows setup).
  openFolder: (folderPath: string) => {
    const windowsPath = 'O:\\' + folderPath.split('/').join('\\');
    window.location.href = 'openfolder:' + encodeURIComponent(windowsPath);
    return Promise.resolve({ ok: true as const });
  },

  /** Lists available generated documents (.pdf, .docx) for an application (v5.0) */
  getDocuments: (id: string) => request<AppDocumentsResponse>(`/api/applications/${id}/documents`),

  /** URL to directly download a document from the server */
  documentDownloadUrl: (id: string, filename: string) =>
    `/api/applications/${encodeURIComponent(id)}/documents/${encodeURIComponent(filename)}?download=1`,

  /** URL to view/stream a document inline in browser */
  documentInlineUrl: (id: string, filename: string) =>
    `/api/applications/${encodeURIComponent(id)}/documents/${encodeURIComponent(filename)}`,

  /** Smart AI parsing of a job ad URL or raw text using Gemini Flash (v5.0) */
  parseJobAd: (data: { url?: string; text?: string }) =>
    request<ParsedJobAd>('/api/jobs/parse', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  folderStatus: () => request<Record<string, FolderStatus>>('/api/folder-status'),

  /** The one generic CV + cover letter pair attached to every cold approach —
   *  same files for recruiters and direct-approach companies, never tailored
   *  per target. Reports existence + mtime so the UI can show staleness. */
  genericDocs: () =>
    request<{
      folderPath: string;
      exists: boolean;
      items: { key: string; label: string; file: string; exists: boolean; updatedAt: number | null }[];
    }>('/api/generic-docs'),

  auditLog: (limit = 200) => request<AuditEvent[]>(`/api/audit-log?limit=${limit}`),

  /** Settings → Server log. Bounded by journald rotation, not by this limit. */
  serverLog: (lines = 500) => request<ServerLogLine[]>(`/api/server-log?lines=${lines}`),

  learningLoop: () => request<LearningLoopReport | null>('/api/learning-loop'),

  /** Written during `/eod`; had no client before this — the data was
   *  generated and never read. */
  upskillReport: () => request<UpskillReport | null>('/api/upskill-report'),

  /** The Skill Guides pack, parsed live from the markdown, plus the progress
   *  the app itself owns. */
  study: {
    get: () => request<StudyData>('/api/study'),
    update: (guide: string, patch: Partial<StudyGuideProgress>) =>
      request<StudyGuideProgress>(`/api/study/${encodeURIComponent(guide)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
  },

  /**
   * Role Refreshers self-rating. Keyed by canonical term rather than by role —
   * knowing what SIEM means is a fact about the reader, not about one
   * application, so rating it once covers every ad that asks for it.
   */
  refresherConfidence: {
    get: () => request<TermConfidenceMap>('/api/refresher-confidence'),
    set: (term: string, confidence: TermConfidence) =>
      request<TermConfidenceMap>('/api/refresher-confidence', {
        method: 'PATCH',
        body: JSON.stringify({ term, confidence }),
      }),
  },

  /**
   * Assessment prep (v2.4) — one entry per real upcoming test, replacing the
   * old hardcoded single-deadline component. Archiving is not deletion: prep
   * for a sat test stays readable for the next one.
   */
  assessments: {
    get: () => request<AssessmentStore>('/api/assessments'),

    archive: (id: string, outcome: AssessmentOutcome, outcomeNote?: string) =>
      request<AssessmentStore>(`/api/assessments/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'archived', outcome, outcomeNote }),
      }),

    restore: (id: string) =>
      request<AssessmentStore>(`/api/assessments/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'upcoming', outcome: null }),
      }),

    remove: (id: string) =>
      request<AssessmentStore>(`/api/assessments/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
  },

  /** Standalone calendar events (not tied to a job application). */
  events: {
    get: () => request<EventStore>('/api/events'),
    update: (id: string, patch: Partial<EventItem>) =>
      request<EventStore>(`/api/events/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
  },

  /**
   * The interview answer bank (v2.2). Unlike the other Study stores this one
   * is mixed-ownership — seeded answers are Claude's, added questions and the
   * practised flags are the user's — so the whole bank round-trips on write
   * rather than patching a single keyed value.
   */
  interviewBank: {
    get: () => request<InterviewBank>('/api/interview-bank'),

    add: (question: string, category: InterviewCategory) =>
      request<{ bank: InterviewBank; entry: InterviewQuestion }>('/api/interview-bank', {
        method: 'POST',
        body: JSON.stringify({ question, category }),
      }),

    update: (id: string, patch: Partial<Pick<InterviewQuestion, 'practised' | 'answer' | 'hints' | 'notes'>>) =>
      request<InterviewBank>(`/api/interview-bank/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),

    remove: (id: string) =>
      request<InterviewBank>(`/api/interview-bank/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),

    /** Spawns the real Claude CLI server-side; returns a runId the terminal
     *  panel already knows how to stream. */
    generate: (id: string) =>
      request<{ ok: true; runId: string }>(
        `/api/interview-bank/${encodeURIComponent(id)}/generate`,
        { method: 'POST' }
      ),
  },

  /** Direct-to-company and recruiter outreach. One store, two sections. */
  outreach: {
    list: () => request<OutreachEntry[]>('/api/outreach'),

    create: (data: Partial<OutreachEntry>) =>
      request<OutreachEntry>('/api/outreach', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: string, data: Partial<OutreachEntry>) =>
      request<OutreachEntry>(`/api/outreach/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    remove: (id: string) =>
      request<{ ok: true; folderDeleted: boolean }>(`/api/outreach/${id}`, {
        method: 'DELETE',
      }),

    requestEmail: (id: string, template: OutreachEmailKind) =>
      request<{ ok: true; queued: string; entry: OutreachEntry }>(
        `/api/outreach/${id}/email-request`,
        { method: 'POST', body: JSON.stringify({ template }) }
      ),

    emails: (id: string) =>
      request<{ items: OutreachEmailDraft[] }>(`/api/outreach/${id}/emails`),

    /** Records that Jordan sent it himself — this app never sends mail. */
    markSent: (id: string, emailKind: OutreachEmailKind, sentOn?: string) =>
      request<OutreachEntry>(`/api/outreach/${id}/mark-sent`, {
        method: 'POST',
        body: JSON.stringify({ emailKind, sentOn }),
      }),

    followUp: (id: string, action: 'done' | 'snooze', days?: number) =>
      request<OutreachEntry>(`/api/outreach/${id}/follow-up`, {
        method: 'POST',
        body: JSON.stringify({ action, days }),
      }),
  },

  autoPickPriorities: () =>
    request<{ ok: true; picked: number; cleared: number }>('/api/priorities/auto-pick', {
      method: 'POST',
    }),

  pendingRequests: () =>
    request<{ items: PendingRequest[]; count: number }>('/api/requests/pending'),

  processRequests: () =>
    request<{ ok: true; runId: string }>('/api/claude/process-requests', {
      method: 'POST',
    }),

  health: () =>
    request<{
      ok: true;
      notion: boolean;
      notionOutreach: boolean;
      notionError: string | null;
      notionQueueLength: number;
    }>('/api/health'),

  wallpaper: (refresh?: boolean) =>
    request<{
      date: string;
      url: string;
      avgColor: string | null;
      photographer: string;
      photographerUrl: string;
      pageUrl: string;
      /** Set only when Pexels was unreachable and this came from the bundled
       *  local fallback pack (public/wallpapers/fallback/) instead. */
      source?: 'local';
    }>(`/api/wallpaper${refresh ? '?refresh=1' : ''}`),

  /** Dry-run only — returns drift, never applies it. Applying a field is a
   *  normal `api.update` PATCH the caller issues per-field afterward. */
  notionReconcile: () =>
    request<{
      checked: number;
      drift: { id: string; role: string; company: string; fields: { field: string; local: unknown; notion: unknown }[] }[];
    }>('/api/notion/reconcile', { method: 'POST' }),

  session: () => request<{ authenticated: boolean }>('/api/session'),

  login: (password: string) =>
    request<{ ok: true }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  logout: () => request<{ ok: true }>('/api/logout', { method: 'POST' }),

  /**
   * Fetched as a blob rather than navigated to: a plain `location.href` on a
   * server that doesn't have this route replaces the whole app with an Express
   * "Cannot GET" page, which looks like the app broke rather than like a stale
   * server needing a restart.
   */
  exportCsv: async () => {
    const res = await fetch('/api/export.csv');
    if (res.status === 401) onUnauthorized?.();
    if (!res.ok) {
      throw new Error(
        res.status === 404
          ? 'Export needs the updated server — close and reopen Start Job HQ.bat.'
          : `Export failed (${res.status}).`
      );
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `job-search-hq-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
