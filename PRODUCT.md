# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Single user: Kironraj Odatt Peringode, an entry-level SOC/GRC/Network Security job-seeker in Wellington, NZ. This is a personal tool for his own use only, run locally on his own PC — not multi-tenant, no other accounts, no plans to share or publish a version for other job-seekers.

## Product Purpose

A local job-application tracker ("Job Search HQ") that replaces spreadsheets/Notion-only tracking with a single source of truth for Kironraj's active pipeline: logging roles, tracking status through researching → applied → interview → offer, and triggering tailored CV/cover-letter drafting for a given role without leaving the tracker. Success means fewer stale, forgotten applications and less manual copy-pasting between job ads, his CV, and Notion.

## Positioning

Not a commercial product — no competitive positioning in the traditional sense. Its meaningfully different mechanism versus a generic tracker (spreadsheet, Notion template, Trello board) is that it is wired directly into an automated CV/cover-letter drafting pipeline: clicking "Create CV" on a logged role queues a request that a background Claude Code process picks up, drafts a tailored CV + cover letter from his real resume and a living facts file, saves both to a per-company folder, and updates the tracker and a mirrored Notion database automatically — no other tracker does the drafting step for him.

## Operating Context

- Runs locally via a `Start Job HQ.bat` launcher (installs npm deps on first run, then runs a Vite dev server + Express API together).
- Data lives in a single JSON file (`App/data/applications.json`) on Kironraj's PC, written atomically by the Express backend.
- Mirrored to a Notion database ("🌍 Job Search HQ") as the cross-device source of truth, kept in sync by a Claude Code skill (`jobhq`).
- "Create CV" and "Delete" actions write request files to `App/requests/`, processed by a recurring Claude Code background loop (session-scoped, re-armed periodically) that drafts CVs, updates Notion, and cleans up company folders.
- Company folders live under the parent "Career and Job" directory, one per employer, holding the tailored CV (`.docx` and `.pdf`) and cover letter (`.docx` only, since 20 Aug 2026) for that role.
- A legacy single-file HTML version (`Archive/job_search_hq.html`) preceded this React/Express app and is now frozen/deprecated, kept only for historical reference.

## Capabilities and Constraints

- List view, Kanban board view (drag-and-drop status changes), and an Analytics dashboard (pipeline funnel, applications-over-time, fit distribution, role-type breakdown).
- Fields per application: role, company, location, role type, status, fit assessment, employment type (job/internship), job ad link, cover letter status, CV status, resume version, date applied, folder path, notes, and a server-tracked status-change history.
- Desktop toast notifications (via `node-notifier`) nudge Kironraj when an "applied" entry has gone quiet past a stale threshold, so follow-ups aren't missed.
- Command palette (Ctrl/Cmd+K) for quick add, jump-to-entry, view switching, and theme toggling.
- Single fixed accent color (Bauhaus red) layered on top of light/dark mode; the accent-theme picker (four presets) was removed in the 23 Aug 2026 redesign, not reskinned — accent color is decorative UI chrome only and is kept separate from the fixed status colors (researching/applied/interview/offer/rejected/withdrawn each always render in the same color regardless of theme).
- Single-password login gate (timing-safe check, signed session cookie) since the app is reachable over Tailscale from Kironraj's phone, not just localhost — see `App/DESIGN.md` for the auth model. Still effectively single-user: no accounts, no per-user data.
- No accessibility requirement beyond general good practice: keyboard navigation (focusable cards, arrow-key list navigation, Escape to close modals), sufficient contrast, and `prefers-reduced-motion` support are already implemented; no specific personal accessibility need to design around.
- CV/cover-letter content must be grounded only in Kironraj's real base resume PDF and a living `Candidate Key Facts.md` file — never invented. Standing content rules currently include: use `kiron.raj.op@gmail.com` as contact email, always spell out "Whitecliffe College, Wellington" in full, and produce both `.docx` and `.pdf` for every drafted CV (the cover letter is `.docx`-only, since 20 Aug 2026 — not a defect).

## Brand Commitments

No formal brand identity — this is a personal utility, not a public-facing product. The existing visual system (Outfit/JetBrains Mono fonts, Bauhaus-influenced red/black/yellow with amber/rose/grass as fixed status colors, hard offset shadows, light/dark mode — shipped 23 Aug 2026, see `App/DESIGN.md`) is the incumbent look and should be treated as established visual authority for any refinement work, not replaced without the user asking for a redesign.

## Evidence on Hand

Real, live production data: `App/data/applications.json` currently holds Kironraj's actual in-progress job applications (company, role, status, dates). Per-company folders under "Career and Job" hold his real tailored CVs and cover letters. No fabricated testimonials, customers, or case studies apply — this is an internal tool with no external audience to demonstrate proof to.

## Product Principles

1. **Never lose or silently overwrite tracked data.** Every application entry, once logged, is additive — updates happen in place by match key, never wholesale replacement or silent deletion.
2. **Automate the tedious, keep judgment calls with Kironraj.** CV drafting, staleness checks, and Notion sync are automated; content decisions (what to disclose about visa status, whether a role is a fit) stay his call, surfaced clearly rather than decided silently.
3. **One source of truth per concern.** `applications.json` is the live local data; Notion is the cross-device source of truth; `Candidate Key Facts.md` is the source of truth for facts that change over time. Each has exactly one job, and they're kept in sync deliberately, not left to drift. `POST /api/notion/reconcile` only detects drift between the two (returns a diff) — it never applies a fix itself; a real edit still goes through a normal PATCH.
4. **Personal tool, not a product to please a market.** Design and feature decisions optimize for Kironraj's own workflow and taste, not for generalizing to unknown future users.
5. **Real automation over decorative polish.** Features earn their place by removing real manual work (folder creation, CV drafting, Notion updates, stale-application nudges) rather than existing for their own sake.

## Accessibility & Inclusion

No project-specific accessibility requirement was established; general good practice applies (keyboard operability, adequate contrast, respects `prefers-reduced-motion`), already implemented.
