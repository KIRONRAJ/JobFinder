# JobFinder

A personal job-search tracker I built for my own hunt — a single React + Express app that turns "which roles did I apply to and how did they go" into a real pipeline, instead of a spreadsheet.

This repo is a **code-only showcase**. It contains the full application source but none of my real tracker data, applications, or CVs/cover letters — those live in a private repo and stay there. Cloning this repo gives you a runnable app with empty/local data, not my personal job search.

## What it does

- **Application pipeline** — board and list views across the full lifecycle (researching → applied → interview → offer/rejected/withdrawn), with deadlines, follow-up reminders, and an activity timeline per role.
- **Fit analysis & ATS scoring** — an 8-field scoring rubric (keyword/semantic/technical/experience/industry match, recruiter readability, parsing risk) scored against a job ad before a CV is even drafted.
- **Evidence-backed CV/cover-letter workflow** — every claim on a generated CV traces back to real, cited evidence rather than invented experience; a deterministic Python gate checks page count, PII, and keyword survival before a document ships.
- **Insights dashboard** — charts for response-time distribution, ATS-score-vs-outcome, source × fit heatmaps, application volume over time, and recurring-gap tracking.
- **Learning Loop** — every rejection feeds a running "recurring gaps" report so patterns across declines are visible instead of forgotten.
- **Interview prep & Study** — a spaced, confidence-rated skill-guide system plus a per-role "refreshers" view built from that role's own fit analysis, an answer bank for behavioral questions, and dynamic assessment prep.
- **Outreach tracking** — a parallel log for recruiter contact and direct-approach outreach, separate from the formal application pipeline.
- Single-password login gate (scrypt-hashed, signed session cookie), designed to run on a home network/VPN rather than the open internet.

## Stack

React 18 + TypeScript + Vite, Tailwind CSS, GSAP for motion, Recharts for charts, an Express API backed by local JSON files (no external database), with optional Notion sync for the same data.

## Running it locally

```
npm install
npm run dev      # starts the Express API + Vite dev server together
```

Copy `.env.example` to `.env` and run `node scripts/set-password.mjs` to set a login password — the app works fully without any of the other optional keys in that file (Notion sync, daily wallpaper), it just skips those features.

## Version history

- **v3.9.0** — dismiss-required error alerts, a standalone-events banner, 5 new Insights charts (recurring-gaps bar chart, response-time histogram, ATS-score-vs-outcome scatter, apply-delay conversion bars, source×fit heatmap).
- **v3.8.0** — in-app sound cues, one-click local delete with Notion dedupe, mobile button-row layout fix.
- **v3.7.0** — new visual theme, daily wallpaper feature, full animation-library migration (Framer Motion → GSAP).
- **v3.6.0** — dedicated Withdrawn pipeline stage.
- **v3.1.0** — second pass on the redesign: migration finished, motion polish, dark-mode fixes.
- **v3.0.0** — major visual redesign, interview-silence flag, negotiation ROI helper, weekly digest.
- **v2.7.0** — mobile navigation rebuild, ops-console redesign, real mobile performance fix, calendar-based agenda view.
- **v2.6.x** — data-loss guard for the core data file, Candidate Key Facts routing, assorted fixes.

## What's not in this repo

Real application data, CVs/cover letters, and API secrets — those live in a private repo and were never part of this export.
