export type Status =
  | 'researching'
  | 'applied'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

export type Fit = 'strong' | 'good' | 'stretch';
export type Employment = 'job' | 'internship';
export type CoverStatus = 'no' | 'draft' | 'sent';
export type CvStatus = '' | 'queued' | 'drafted' | 'sent';
export type RoleType =
  | 'SOC Analyst'
  | 'GRC'
  | 'Network Security'
  | 'IT Security Support'
  | 'Other';

export type WorkArrangement = 'onsite' | 'hybrid' | 'remote';
export type Source = 'Seek' | 'LinkedIn' | 'Trade Me Jobs' | 'Company site' | 'Other';

export type ActivityKind =
  | 'created'
  | 'status'
  | 'applied'
  | 'cv'
  | 'note'
  | 'deadline'
  | 'contact';

export interface ActivityEntry {
  at: number;
  kind: ActivityKind;
  text: string;
}

/**
 * A single priority Claude has flagged for today. `expiresAt` is what makes
 * this safe to render without a per-render staleness check — an outdated
 * priority just falls out of the query rather than needing to be cleared.
 */
export interface Priority {
  rank: number;
  reason: string;
  action: 'apply' | 'follow-up' | 'improve' | 'prepare';
  /** 'claude' when set from chat with judgement, 'app' when auto-picked from
   *  deterministic rules (readiness + deadline + follow-up) as a fallback. */
  setBy: 'claude' | 'app';
  setAt: number;
  expiresAt?: number;
}

/**
 * One STAR-format answer prepared for an interview. `evidenceKeys` links the
 * answer back to entries in `evidenceMap`, so the war-room UI can flag when
 * the answer relies on evidence in `learning-gap` or `do-not-claim` state.
 */
export interface StarAnswer {
  question: string;
  answer: string;
  evidenceKeys?: string[];
}

export interface InterviewPack {
  when?: string;
  medium?: string;
  starAnswers?: StarAnswer[];
  technicalQs?: string[];
  behaviouralQs?: string[];
  questionsToAsk?: string[];
  companyResearch?: string;
  weakAnswerFlags?: string[];
  draftedAt?: number;
}

export interface RejectionInfo {
  userNote?: string;
  likelyReasons?: string[];
  improvements?: string[];
  draftedAt?: number;
  /** Drafted reply to the rejection email — copy-and-send-yourself, same as
   *  the outreach/follow-up email drafts. Local only, no Notion mirror. */
  reply?: {
    to?: string;
    subject: string;
    body: string;
    draftedAt: number;
  };
}

/**
 * One quantified negotiation talking point — a real achievement translated
 * into an estimated dollar value. `verifiedSource` must quote the exact
 * number + unit as it appears in the CV or Candidate Key Facts; a claim that
 * doesn't clear that bar is left out entirely rather than included with a
 * caveat — see "Negotiation ROI" in the jobhq skill.
 */
export interface NegotiationTalkingPoint {
  claim: string;
  estimatedValue: string;
  verifiedSource: string;
  note?: string;
}

/** Drafted by Claude once an entry reaches `status: offer`. Never computed
 *  by the app — same split as `interview` and `rejection`. */
export interface Negotiation {
  talkingPoints: NegotiationTalkingPoint[];
  scriptNotes?: string;
  draftedAt: number;
}

export type EvidenceState = 'verified' | 'needs-wording' | 'learning-gap' | 'do-not-claim';
export type EvidenceUse = 'cv' | 'cover' | 'interview' | 'form';

export interface EvidenceItem {
  state: EvidenceState;
  source?: string;
  useIn?: EvidenceUse[];
}

/** Keyed by the raw ATS keyword (verbatim from the ad, case as-is). */
export type EvidenceMap = Record<string, EvidenceItem>;

export const EVIDENCE_STATES: EvidenceState[] = [
  'verified',
  'needs-wording',
  'learning-gap',
  'do-not-claim',
];

export type ParsingRisk = 'low' | 'medium' | 'high';

/**
 * A real ATS/recruiter match estimate — not a mechanical keyword-count, a
 * holistic call the way Workday/Greenhouse/Lever-style scoring actually
 * behaves. `parsingRisk` is a gate, not a percentage: a genuine parsing
 * failure (tables, text boxes, header/footer content) means the ATS may never
 * see the CV's content at all, so medium/high must cap `overall` hard rather
 * than being averaged in as just another dimension. `overall` mirrors to
 * Notion's "ATS Score" property; everything else here stays local-only.
 */
export interface AtsScore {
  keywordMatch: number;
  semanticMatch: number;
  technicalMatch: number;
  experienceMatch: number;
  industryMatch: number;
  recruiterReadability: number;
  parsingRisk: ParsingRisk;
  /** 80+ is the commonly-cited "interview-ready" bar — the real target, not 100. */
  overall: number;
  /** Plain English: the single biggest thing holding the score back. */
  explanation: string;
}

/**
 * Written by Claude on request, never computed in the app — see
 * "Career and Job/AI Providers.md". Purely local (except `score.overall`,
 * mirrored to Notion): deliberately not mirrored in full, since nested arrays
 * have no sensible column there.
 */
export interface Analysis {
  at: number;
  ats: {
    /** Ad keywords the CV already evidences. */
    matched: string[];
    /** Ad keywords absent from the CV entirely. */
    missing: string[];
    /** True but under-evidenced — real experience the CV states too weakly. */
    toEvidence: string[];
    /** CV phrasing the evidence doesn't actually support. Fix these first. */
    unsupported: string[];
  };
  gap: {
    theyWant: string[];
    youHave: string[];
    /** An honest framing of the gap — never one that papers over it. */
    positioning: string;
    learningTasks: string[];
  };
  /** Forced on every CV/cover-letter generation as of 6 Aug 2026 — absent only
   *  on analyses written before that date. */
  score?: AtsScore;
  /**
   * The direct "does this job suit me" answer, added 19 Aug 2026 for on-demand
   * (pre-CV) analysis — distinct from `score.explanation` (explains the score)
   * and `gap.positioning` (CV/cover-letter framing language). Drives the
   * verdict banner's colour: strong-apply/apply → grass, borderline → amber,
   * skip → rose.
   */
  recommendation?: {
    verdict: 'strong-apply' | 'apply' | 'borderline' | 'skip';
    reasoning: string;
  };
  /**
   * Anything the ad requires beyond a CV + cover letter — a video response,
   * a portfolio link, a specific screening-question answer, an assessment
   * platform registration. Added 20 Aug 2026 after a submission went out on
   * SEEK missing a mandatory 3-minute video that had only ever been noted
   * inside `gap.learningTasks` prose — that wasn't loud enough to stop a
   * submission. This renders as a blocking banner on the role page instead.
   */
  submissionRequirements?: { label: string; done: boolean; note?: string }[];
}

export interface Application {
  id: string;
  matchKey: string;
  role: string;
  company: string;
  location?: string;
  type?: RoleType;
  status: Status;
  fit: Fit;
  employment?: Employment;
  link?: string;
  cover?: CoverStatus;
  cvStatus?: CvStatus;
  /** Mirrors cvStatus's queued/ready pattern, for the on-demand deep-analysis
   *  request added 19 Aug 2026 (v2.5) — set 'queued' the moment the request
   *  file is written, 'ready' once Claude has written `analysis`. */
  analysisStatus?: 'queued' | 'ready';
  /** Same pattern again, for the on-demand reviewer critique split out of the
   *  CV pipeline on 21 Aug 2026 (v2.6). Absent means never reviewed — which is
   *  now the normal state for a fresh draft, not a gap. */
  reviewStatus?: 'queued' | 'reviewed';
  resume?: string;
  date?: string;
  folderPath?: string;
  notes?: string;
  /** Corrections Kironraj gives the fit analysis in his own words — an
   *  eligibility clause Claude misread, a skill or a piece of experience the
   *  CV doesn't spell out. Distinct from `notes` above, which is a scratch
   *  field: these are *authoritative*. They ride along with every cv_request
   *  and analysis_request, and Claude must treat them as fact about Kironraj
   *  rather than re-deriving a contradicting verdict from the ad alone. */
  userFacts?: string;
  created?: number;
  updated?: number;
  staleNotifiedAt?: number;
  statusHistory?: { status: Status; at: number }[];

  /** Closing date for the ad, when it publishes one. */
  deadline?: string;
  deadlineNotifiedAt?: number;

  /** Things Kironraj has to do by a point in time — assessments, take-home
   *  tasks. Distinct from `deadline` above; see ApplicationTask. */
  tasks?: ApplicationTask[];

  /** Where to check on this application after submitting, when the employer gives one. */
  trackingUrl?: string;
  trackingRef?: string;
  trackingNotes?: string;

  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  nextAction?: string;
  nextActionDue?: string;

  /** Free text — ads quote ranges, hourly rates and "competitive" as often as a number. */
  salary?: string;
  workArrangement?: WorkArrangement;
  /** Roster/shift hours, verbatim from the ad — often multi-line (different
   *  hours per day). Free text on purpose: normalising "Mon–Thu 8:30–4:30pm,
   *  Sat 8:30–5:30pm" into structured data would lose real information for
   *  no real gain on a single-user tool. */
  workHours?: string;
  source?: Source;

  /** Recommended nudge date, computed from `date` when the status becomes applied. */
  followUpDue?: string;

  activity?: ActivityEntry[];

  /** ATS keyword + gap analysis, when one has been run. */
  analysis?: Analysis;

  /** Set by Claude when it decides this role belongs in today's priority queue. */
  priority?: Priority;

  /** Populated once the entry moves toward or into interview stage. */
  interview?: InterviewPack;

  /** Populated once the entry is rejected — user reason first, Claude analysis later. */
  rejection?: RejectionInfo;

  /** Populated once the entry reaches offer stage, on request. */
  negotiation?: Negotiation;

  /**
   * Per-keyword evidence provenance. Overlays `analysis.ats`: an auto-derived
   * default is available via `deriveEvidenceMap()` when this field is absent.
   */
  evidenceMap?: EvidenceMap;

  /** Set once the row has been mirrored to Notion, so later edits update rather than duplicate. */
  notionPageId?: string;

  /**
   * Set when a positive, non-rejection reply arrives that doesn't yet change
   * the formal `status` (e.g. moved to psychometric testing, background
   * checks) — surfaces the entry under the "Progressing" tab alongside
   * Interview/Offer entries without forcing a status change that isn't
   * accurate yet. Cleared once the entry actually reaches Interview/Offer,
   * or Rejected/Withdrawn.
   */
  progressing?: boolean;
}

export type SortKey = 'updated' | 'created' | 'applied' | 'deadline' | 'company';

export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'updated', label: 'Recently updated' },
  { key: 'created', label: 'Date added' },
  { key: 'applied', label: 'Date applied' },
  { key: 'deadline', label: 'Closing date' },
  { key: 'company', label: 'Company A–Z' },
];

/* ---------- Outreach: direct-to-company and recruiter contact ---------- */

export type OutreachKind = 'company' | 'recruiter';

export type OutreachStatus =
  | 'to-contact'
  | 'emailed'
  | 'replied'
  | 'in-conversation'
  | 'no-reply'
  | 'closed';

export type OutreachEmailKind = 'intro' | 'follow-up';
export type OutreachEmailStatus = '' | 'queued' | 'drafted' | 'sent';

export interface OutreachEmail {
  kind: OutreachEmailKind;
  /** YYYY-MM-DD — the day *Kironraj* sent it. Nothing in this app sends mail. */
  sentOn: string;
  /** Relative to "Career and Job", e.g. Outreach/Recruiters/Absolute IT/Intro Email - Absolute IT.md */
  draftPath?: string;
  subject?: string;
}

export type OutreachActivityKind =
  | 'created'
  | 'status'
  | 'email-queued'
  | 'email-drafted'
  | 'email-sent'
  | 'reply'
  | 'note'
  | 'contact';

export interface OutreachActivityEntry {
  at: number;
  kind: OutreachActivityKind;
  text: string;
}

export interface OutreachEntry {
  id: string;
  kind: OutreachKind;
  matchKey: string;
  name: string;
  status: OutreachStatus;

  website?: string;
  linkedin?: string;
  location?: string;

  contactName?: string;
  contactRole?: string;
  contactEmail?: string;
  contactPhone?: string;

  /** company-only */
  careersUrl?: string;
  whatTheyDo?: string;
  whyInteresting?: string;
  sector?: string;

  /** recruiter-only */
  specialisms?: string[];
  locationsCovered?: string[];
  registered?: boolean;
  portalUrl?: string;

  emailStatus?: OutreachEmailStatus;
  emails?: OutreachEmail[];
  firstEmailedOn?: string;
  lastEmailedOn?: string;
  repliedOn?: string;
  followUpDue?: string;
  nextAction?: string;
  nextActionDue?: string;

  /** Seeded research confidence — 1 = contact first. */
  priorityTier?: 1 | 2 | 3;

  notes?: string;
  /** Always under "Outreach/…" — never a relocateFolder() destination. */
  folderPath?: string;

  activity?: OutreachActivityEntry[];
  statusHistory?: { status: OutreachStatus; at: number }[];
  created?: number;
  updated?: number;
  notionPageId?: string;
}

export const OUTREACH_STATUSES: { key: OutreachStatus; label: string }[] = [
  { key: 'to-contact', label: 'To contact' },
  { key: 'emailed', label: 'Emailed' },
  { key: 'replied', label: 'Replied' },
  { key: 'in-conversation', label: 'In conversation' },
  { key: 'no-reply', label: 'No reply' },
  { key: 'closed', label: 'Closed' },
];

/** Terminal states — no follow-up is ever computed for these. */
export const OUTREACH_CLOSED_STATUSES: OutreachStatus[] = ['no-reply', 'closed'];

export type OutreachView = 'companies' | 'recruiters';

// 'board' used to be its own view; it's now a `?layout=board` query param on
// 'list' instead (drag-to-status stays, it just isn't a separate destination
// any more). 'analytics' / 'fit' / 'evidence' / 'market' / 'audit' collapsed
// into 'insights', a single tabbed page — see routes/Insights.tsx.
export type View = 'list' | 'agenda' | 'study' | 'insights' | OutreachView;

export function isOutreachView(v: View): v is OutreachView {
  return v === 'companies' || v === 'recruiters';
}

export const VIEW_KIND: Record<OutreachView, OutreachKind> = {
  companies: 'company',
  recruiters: 'recruiter',
};

/** Every kind-specific difference lives here, so nothing branches on `kind`
 *  ad hoc in JSX and the two sections stay identical by construction. */
export const KIND_META: Record<
  OutreachKind,
  { view: OutreachView; title: string; singular: string; plural: string; folderSegment: string }
> = {
  company: {
    view: 'companies',
    title: 'Direct Approach',
    singular: 'company',
    plural: 'companies',
    folderSegment: 'Companies',
  },
  recruiter: {
    view: 'recruiters',
    title: 'Recruiters',
    singular: 'recruiter',
    plural: 'agencies',
    folderSegment: 'Recruiters',
  },
};

/** Longer than the 8-day job follow-up: a cold intro deserves more room before
 *  a nudge reads as chasing. A reply, by contrast, is a debt you owe them. */
export const OUTREACH_FOLLOW_UP_BUSINESS_DAYS = 7;
export const OUTREACH_REPLY_TURNAROUND_BUSINESS_DAYS = 2;
/** After this many nudges with no reply, the card offers to mark it no-reply.
 *  Never applied automatically — see the note in the server's PATCH handler. */
export const OUTREACH_MAX_NUDGES = 2;

/** One line of App/data/audit-log.jsonl. `actor` distinguishes edits made
 *  through the app from ones an AI assistant wrote to disk directly. */
export interface AuditEvent {
  at: number;
  actor: 'user' | 'claude' | string;
  action: string;
  entryId?: string;
  matchKey?: string;
  detail?: string;
}

/**
 * Written by Claude on request when there are enough rejections to be worth
 * mining for a pattern — a deeper, narrative counterpart to the always-on
 * regex-based LearningLoopPanel. Stored at App/data/learning-loop.json,
 * mirrored to a Notion page. Purely local otherwise, same split as `analysis`.
 */
export interface LearningLoopReport {
  generatedAt: number;
  rejectionCount: number;
  sourceIds: string[];
  headline: string;
  signalStrength: {
    highSignal: string[];
    noSignal: string[];
  };
  themes: {
    title: string;
    detail: string;
    evidence: string[];
    action: string;
  }[];
  outliers?: { company: string; role: string; note: string }[];
  recommendations: string[];
}

/**
 * Written by Claude during /eod, only when something upskilling-relevant
 * changed that day — aggregates `analysis.gap.learningTasks` across every
 * application into a de-duplicated, recurrence-ranked view. Stored at
 * App/data/upskill-report.json. Separate from the hand-authored
 * `Career Roadmap - Next Steps.md` strategy doc, not a replacement for it.
 */
export interface UpskillReport {
  generatedAt: number;
  headline: string;
  recurringGaps: {
    skill: string;
    count: number;
    roles: string[];
  }[];
  recommendations: string[];
}

/**
 * The Study view — Required Documents/Skill Guides/*.md surfaced in-app.
 * Content is parsed server-side from the markdown on every `GET /api/study`
 * (the .md files stay the source of truth); progress is the one part the app
 * itself owns and writes, in `App/data/study-progress.json`.
 */
export interface StudyQuizItem {
  question: string;
  answer: string;
}

export interface StudyGuide {
  file: string;
  title: string;
  timeBudget: string;
  /** Everything except the title/time-budget lines and the quiz — rendered
   *  as markdown-lite prose, not parsed further into named sections. */
  bodyMarkdown: string;
  quiz: StudyQuizItem[];
}

export interface StudyScheduleRow {
  time: string;
  topic: string;
  file: string;
}

export interface StudyGuideProgress {
  conceptsRead: boolean;
  exerciseDone: boolean;
  quizScore?: number;
  /** Set once conceptsRead && exerciseDone && quizScore >= 4 — the index
   *  file's own "retake anything under 4/5" rule, not a separate threshold. */
  completedAt?: number;
}

export interface StudyData {
  guides: StudyGuide[];
  schedule: StudyScheduleRow[];
  progress: Record<string, StudyGuideProgress>;
}

export function studyGuideComplete(p?: StudyGuideProgress): boolean {
  return Boolean(p?.conceptsRead && p?.exerciseDone && (p?.quizScore ?? 0) >= 4);
}

/**
 * A time-bound thing Kironraj personally has to DO — an online assessment, a
 * take-home task, a form to return. Deliberately not the same as an entry's
 * `deadline`, which is the ad's closing date: once you've applied, the closing
 * date is no longer actionable, and treating the two as one thing is what made
 * the old hardcoded countdown banner useless the moment its assessment was sat.
 *
 * `dueAt` is an ISO 8601 string WITH offset, never a bare date — these deadlines
 * are routinely quoted in the employer's timezone (the Sova assessment was
 * 23:59 Australia/Melbourne, ~02:00 NZST the next day) and dropping the offset
 * silently moves them by hours.
 */
export interface ApplicationTask {
  id: string;
  label: string;
  dueAt: string;
  completedAt?: string;
  note?: string;
  /** Server-owned — last time the due-soon notifier fired for this task. */
  notifiedAt?: number;
}

/* ---------- assessment prep (v2.4) ---------- */

/**
 * Assessment/interview prep, one entry per real upcoming test.
 *
 * Replaces the hardcoded single-deadline AssessmentPrep component, which was
 * transcribed for exactly one Sova test and went stale the moment it was sat.
 * Prep is Claude-authored per assessment (grounded in the actual invite email
 * plus Candidate Key Facts), and archived — never deleted — once the result
 * is known, so the prep that worked stays readable for the next one.
 */
export type AssessmentKind =
  | 'psychometric'
  | 'video-interview'
  | 'technical'
  | 'interview'
  | 'other';

export type AssessmentOutcome = 'passed' | 'failed' | 'no-result' | null;

export interface AssessmentSection {
  heading: string;
  markdown: string;
}

export interface AssessmentPracticeQ {
  kind: string;
  passage?: string;
  prompt: string;
  answer: string;
  why: string;
}

/** A competency/theme wheel: click a spoke to reveal the candidate's real,
 *  already-evidenced story for that theme. Generic — any assessment with a
 *  competency-based interview component can use it, not just one employer. */
export interface CompetencyWheelVisual {
  type: 'competency-wheel';
  title?: string;
  items: { label: string; evidence: string }[];
}

/** An interactive, locally-persisted prep checklist. */
export interface ChecklistVisual {
  type: 'checklist';
  title?: string;
  items: { label: string; note?: string }[];
}

/** A proportional time-budget bar (e.g. "30s read / 90s answer"), for
 *  timed-response formats where the split itself is the thing to internalise. */
export interface TimerBarVisual {
  type: 'timer-bar';
  title?: string;
  segments: { label: string; seconds: number }[];
}

export type AssessmentVisual = CompetencyWheelVisual | ChecklistVisual | TimerBarVisual;

export interface AssessmentItem {
  id: string;
  /** Links back to the application this belongs to, so the UI can deep-link. */
  entryId?: string;
  company: string;
  role: string;
  title: string;
  platform?: string;
  kind: AssessmentKind;
  /** ISO 8601 with offset — these deadlines are routinely quoted in the
   *  employer's timezone, same reasoning as ApplicationTask.dueAt. */
  dueAt?: string;
  status: 'upcoming' | 'archived';
  outcome?: AssessmentOutcome;
  outcomeNote?: string;
  archivedAt?: string | null;
  /** Sova-specific rotating-spoke figure; only that assessment uses it. */
  showSpokeDiagram?: boolean;
  /** Generic pictorial/interactive blocks, rendered after the sections. */
  visuals?: AssessmentVisual[];
  links?: { label: string; url: string }[];
  sections: AssessmentSection[];
  practice?: AssessmentPracticeQ[];
}

export interface AssessmentStore {
  version: number;
  updatedAt: string;
  items: AssessmentItem[];
}

/* ---------- standalone calendar events (not tied to an application) ---------- */

export interface EventItem {
  id: string;
  title: string;
  /** ISO 8601 with offset. */
  start: string;
  end: string;
  location?: string;
}

export interface EventStore {
  items: EventItem[];
}

/* ---------- interview answer bank (v2.2) ---------- */

export type InterviewCategory =
  | 'behavioural'
  | 'servicedesk'
  | 'police'
  | 'motivation'
  | 'experience';

export interface InterviewQuestion {
  id: string;
  category: InterviewCategory;
  question: string;
  /** `seed` = written during the v2.2 build, `generated` = written later by the
   *  Claude CLI, `user` = added in-app and not answered yet. Kept so a future
   *  regeneration pass can tell curated prose from machine output. */
  source: 'seed' | 'generated' | 'user';
  /** Coaching notes on how to approach the question — deliberately not a
   *  summary of the answer below, which would make them redundant. */
  hints: string[];
  answer: string;
  practised?: boolean;
  notes?: string;
  createdAt?: string;
}

export interface InterviewBank {
  version: number;
  updatedAt: string | null;
  questions: InterviewQuestion[];
}

export interface FolderStatus {
  exists: boolean;
  cv: boolean;
  coverLetter: boolean;
}

export const STATUSES: { key: Status; label: string }[] = [
  { key: 'researching', label: 'Researching' },
  { key: 'applied', label: 'Applied' },
  { key: 'interview', label: 'Interview' },
  { key: 'offer', label: 'Offer' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'withdrawn', label: 'Withdrawn' },
];

export const ROLE_TYPES: RoleType[] = [
  'SOC Analyst',
  'GRC',
  'Network Security',
  'IT Security Support',
  'Other',
];

export const WORK_ARRANGEMENTS: { key: WorkArrangement; label: string }[] = [
  { key: 'onsite', label: 'On-site' },
  { key: 'hybrid', label: 'Hybrid' },
  { key: 'remote', label: 'Remote' },
];

export const SOURCES: Source[] = [
  'Seek',
  'LinkedIn',
  'Trade Me Jobs',
  'Company site',
  'Other',
];

export const STALE_APPLIED_DAYS = 7;

/** Days of silence after the last interview signal before it's flagged as
 *  gone quiet — same courtesy-tier idea as career-ops' rejection-latency
 *  check, no legal claim attached, just a nudge to follow up or move on. */
export const INTERVIEW_SILENCE_COURTESY_DAYS = 30;

/** The most recent interview-round signal for an entry: the later of its
 *  last `interview` status transition and a past `interview.when` date.
 *  Returns days since that signal, or null when there's nothing to measure
 *  from (e.g. status became `interview` with no statusHistory logged yet). */
export function daysSinceInterviewSignal(app: Application): number | null {
  const now = Date.now();
  let latest: number | null = null;
  for (const h of app.statusHistory ?? []) {
    if (h.status === 'interview' && (latest === null || h.at > latest)) latest = h.at;
  }
  if (app.interview?.when) {
    const when = new Date(app.interview.when).getTime();
    if (!Number.isNaN(when) && when <= now && (latest === null || when > latest)) latest = when;
  }
  if (latest === null) return null;
  return Math.floor((now - latest) / 86_400_000);
}

export function daysSince(dateStr?: string): number | null {
  if (!dateStr) return null;
  const then = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  then.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - then.getTime()) / 86_400_000);
}

export function appliedLabel(days: number | null): string {
  if (days === null) return 'Applied — no date logged';
  if (days <= 0) return 'Applied today';
  if (days === 1) return 'Applied yesterday';
  return `Applied ${days}d ago`;
}

/** Days until a closing date — negative once it's passed. */
export function daysUntil(dateStr?: string): number | null {
  const since = daysSince(dateStr);
  return since === null ? null : -since;
}

export const DEADLINE_SOON_DAYS = 3;

export function deadlineLabel(days: number | null): string {
  if (days === null) return '';
  if (days < 0) return `Closed ${Math.abs(days)}d ago`;
  if (days === 0) return 'Closes today';
  if (days === 1) return 'Closes tomorrow';
  return `Closes in ${days}d`;
}

/** Business days after `dateStr`, skipping weekends. Public holidays are
 *  deliberately ignored — the result is advisory, not a hard deadline. */
export const FOLLOW_UP_BUSINESS_DAYS = 8;

export function businessDaysFrom(dateStr?: string, n = FOLLOW_UP_BUSINESS_DAYS): string {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left--;
  }
  // Formatted from the local parts, not toISOString(): the date was built at
  // local midnight, and UTC+12 would roll it back a full day.
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function followUpLabel(days: number | null): string {
  if (days === null) return '';
  if (days < 0) return `Follow-up overdue by ${Math.abs(days)}d`;
  if (days === 0) return 'Follow up today';
  if (days === 1) return 'Follow up tomorrow';
  return `Follow up in ${days}d`;
}

/**
 * The date an outreach entry next needs attention, or '' when none is owed.
 * Two different clocks deliberately: a cold intro gets a long runway before a
 * nudge reads as chasing; a reply is a debt you owe them, so it's short.
 * Terminal statuses never generate one.
 */
export function outreachFollowUpDue(e: OutreachEntry): string {
  if (e.status === 'emailed' && e.lastEmailedOn) {
    return businessDaysFrom(e.lastEmailedOn, OUTREACH_FOLLOW_UP_BUSINESS_DAYS);
  }
  if (e.status === 'replied' && e.repliedOn) {
    return businessDaysFrom(e.repliedOn, OUTREACH_REPLY_TURNAROUND_BUSINESS_DAYS);
  }
  return '';
}

/** How many follow-up nudges have gone out with no reply back. */
export function outreachNudgeCount(e: OutreachEntry): number {
  return (e.emails ?? []).filter((m) => m.kind === 'follow-up').length;
}
