# JobFinder

A personal job-search tracker I built for my own hunt — a single React + Express app that turns "which roles did I apply to and how did they go" into a real pipeline, instead of a spreadsheet.

This repo is a **code-only showcase**. It contains the full application source but none of my real tracker data, applications, or CVs/cover letters — those live in a private repo and stay there. Cloning this repo gives you a runnable app with empty/local data, not my personal job search.

## How it works

The app is two processes talking over a REST API: an Express server that owns all persistence, and a Vite/React SPA that renders it. There's no external database — every collection (applications, outreach, events, the Learning Loop, interview bank, study progress) is a JSON file under `data/`, read and written by the server, with atomic temp-file-then-rename writes so a crash mid-write can never corrupt the one copy of the data. A login gate (scrypt-hashed password, signed HttpOnly session cookie, per-IP rate limiting) sits in front of every API route.

**The pipeline.** Every role logged becomes an entry moving through a status lifecycle — researching → applied → interview → offer / rejected / withdrawn — shown as both a Kanban-style board and a filterable list, with deadlines, follow-up reminders, and a per-entry activity timeline recording every status change.

**Fit analysis & ATS scoring.** Before a CV is drafted, a role gets scored against an 8-field rubric — keyword match, semantic match, technical match, experience match, industry match, recruiter readability, and a parsing-risk gate — producing a single overall score plus a breakdown of what's missing. This scoring runs automatically at logging time, not on request.

**Evidence-backed CVs.** Every claim that ends up on a generated CV has to trace back to a cited piece of real evidence rather than being invented to fit the ad — the app tracks an evidence map per application (matched / gap / unsupported) so positioning stays honest. A deterministic Python gate (`scripts/verify-docs.py`) then checks the generated document mechanically: page count, A4 sizing, PII scrubbing, visa-wording consistency between CV and cover letter, cover-letter word count, and that ATS keywords actually survive into the PDF's text layer — the same checks a human used to do by eye, now a single pass/fail script run.

**Insights.** A dedicated analytics view charts response-time distribution, ATS score against eventual outcome, application source against fit verdict as a heatmap, apply-delay conversion, and application volume over time.

**Learning Loop.** Every rejection feeds a running report of recurring gaps across declines, so a pattern (the same missing skill or same eligibility gate showing up three times) is visible instead of forgotten between applications.

**Study & interview prep.** A confidence-rated skill-guide system, a per-role "refreshers" view generated from that specific role's own fit analysis, a searchable answer bank for behavioural interview questions, and a dynamic assessment-prep tracker for online tests and take-home tasks.

**Outreach.** A separate log for recruiter contact and direct-approach outreach, kept apart from the formal application pipeline since it follows a different lifecycle.

## Stack

React 18 + TypeScript + Vite, Tailwind CSS, GSAP for motion, Recharts for charts, an Express API backed by local JSON files (no external database), with optional Notion sync for the same data.

## Running it locally

```
npm install
npm run dev      # starts the Express API + Vite dev server together
```

Copy `.env.example` to `.env` and run `node scripts/set-password.mjs` to set a login password — the app works fully without any of the other optional keys in that file (Notion sync, daily wallpaper), it just skips those features.

## Version history

Dates are when each version shipped during active development on the private tracker this repo is exported from.

- **v3.9.0** — 2026-08-31 — Dismiss-required error alerts (error toasts no longer auto-vanish), a standalone-events banner for calendar items outside the application pipeline, and 5 new Insights charts: a recurring-gaps bar chart, a response-time histogram, an ATS-score-vs-outcome scatter plot, apply-delay conversion bars, and a source × fit heatmap.
- **v3.8.0** — 2026-08-30 — In-app sound cues, one-click local delete with Notion-side dedupe, a mobile button-row layout fix.
- **v3.7.0** — 2026-08-30 — New visual theme, a daily wallpaper feature (server-side image fetch, key never reaches the browser), and a full animation-library migration from Framer Motion to GSAP.
- **v3.6.0** — 2026-08-28 — A dedicated "Withdrawn" pipeline stage, separate from "Rejected", for roles that expired or were pulled before a decision.
- **v3.1.0** — 2026-08-23 — Second pass on the visual redesign: the Framer Motion → GSAP migration finished, motion polish, a dark-mode shadow fix.
- **v3.0.0** — 2026-08-23 — Major visual redesign, an interview-silence flag (surfaces roles gone quiet post-interview), a negotiation ROI helper, and a weekly digest view.
- **v2.7.0** — 2026-08-22 — Mobile navigation rebuilt (a bottom tab bar + "more" sheet instead of a squeezed desktop nav), an ops-console redesign, a real mobile performance fix, and the agenda view became an actual calendar.
- **v2.6.4** — 2026-08-21 — Close button added to home-screen banners; fixed an "ARG" banner staying stuck open due to a non-ISO `completedAt` timestamp.
- **v2.6.3** — 2026-08-21 — A structural data-loss guard for `applications.json` (`scripts/check-data.mjs`): every write is checked against the last commit so an id or matchKey silently disappearing fails the run instead of surfacing weeks later. Also applied a round of over-engineering cuts.
- **v2.6.2** — 2026-08-21 — A single-file router for candidate background facts used across fit analysis; fixed a false-positive keyword check in the doc-verification gate.
- **v2.6.1** — 2026-08-21 — Split the operational tooling into a lightweight router plus on-demand reference docs, so routine runs stay cheap.
- **v2.6.0** — 2026-08-21 — The CV/cover-letter reviewer moved from an automatic step to an on-demand button; deterministic doc verification became its own script (`verify-docs.py`) instead of an LLM eyeballing the output each time.
- **v2.3–v2.4** — 2026-08-18 — A due-date engine for tasks and follow-ups, a UI consistency/touch-target pass, outcome analytics, and Notion reconciliation for drift between the app and its Notion mirror.
- **v2.2** — 2026-08-17 — An interview answer bank and dynamic assessment-prep tracking added to the Study section.
- **v2.1** — 2026-08-16 — Study split into two tabs: skill guides and per-role refreshers.
- **v2.0** — 2026-08-16 — Information-architecture redesign: routed navigation, a dedicated role-detail page, redesigned pipeline rows, and the first version of the Study view.
- **v1.0** — 2026-08-12 — Initial build: the application pipeline, agenda view, activity heatmap, and company-avatar iconography.

## What's not in this repo

Real application data, CVs/cover letters, and API secrets — those live in a private repo and were never part of this export.
