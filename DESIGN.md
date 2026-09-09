# Design

<!-- impeccable:design-schema 1 -->

Recorded from the built surface (**23 Aug 2026 Bauhaus redesign**,
superseding "Ops console, warmed" below), not from intention. If code and
this file disagree, the code is the truth and this file is stale.

## Second pass (23 Aug 2026, same day) — migration finished, motion, emoji

Three things, in order of blast radius.

**1. The rest of the app migrated to Bauhaus, via three classes.** The
"Not yet migrated" list below (modals, Insights/charts, Study, Outreach,
Agenda, command palette) is gone. Those ~29 surfaces were already routed
through `.panel` / `.panel-inset` / `.panel-empty`, so changing those three
rules in `index.css` — `rounded-2xl border` → `rounded-md border-2`, plus
`shadow-hardSm` on `.panel` — migrated all of them at once instead of
view-by-view. `.panel-inset` deliberately takes **no** shadow: a hard shadow
inside a hard shadow reads as a rendering bug. Depth is one layer deep.
`.field-input` and `TabStrip` were brought to the same geometry so a form row
reads as one built object rather than a soft input beside a hard button.

**2. Hard shadows were invisible in dark mode and nobody noticed.**
`tailwind.config.js` hard-coded the offset shadows as `#121212` — which is
*exactly* the dark theme's `--canvas`. Every hard shadow in the app rendered
black-on-black, so the entire depth system silently vanished at night and
dark mode was flat. They're now driven by `--shadow-hard`, which flips to the
same light grey `--line` does. Added `hardXs` (2px, for small controls) and
`hardAccent` (accent-coloured, used as the input focus state in place of the
old soft ring).

**3. Motion got the second half of its own physical model.** Buttons already
pressed *into* their shadow on `:active` but had no lift, so they had two
positions, not three. `.btn-primary`/`.btn-quiet`/`.btn-ghost` and `AppCard`
now translate diagonally away from the shadow on hover while the shadow
deepens (`hardSm` → `hardMd`), giving raised / resting / pressed. New named
motion, all rationed to a specific state:

- `.live-dot` (`animate-pulse-ring`) — an expanding ring, allowed **only**
  where something is genuinely in flight: a queued Claude run (PageHeader's
  pending badge), `interview`/`offer` status, the CLI-reachable dot. Set
  `--pulse` inline to the status hue. If everything pulses, nothing is live.
- `.sheen-layer` — one raking highlight across `AppCard` on hover, driven by
  the parent's `group` hover so it costs nothing at rest. Transform-only.
- `.link-quiet::after` — underline grows from the left instead of switching on.
- `PageHeader`'s `h1` is keyed on the view and cross-fades; the brand mark
  keeps its once-per-mount assembly (unchanged rule) but is now *pokeable* —
  `whileHover="poke"` re-triggers it. `Sidebar`/`MobileNav` active state moved
  from a 3px accent tick to a `layoutId` plate that slides between items
  (`nav-active-${mode}`, scoped per mode because the rail stays mounted under
  `md` while the sheet renders a second Sidebar).
- `MeterFull` animates its fill; the compact `Meter` deliberately does not —
  it renders ten segments per row across the whole pipeline list, and
  animating that is ~600 elements moving on the exact list the memo/reconcile
  work below exists to keep still.

**4. Emoji, as a personality layer beside the icon system — not instead of
it.** Requested explicitly. The rule enforced everywhere: an emoji only
appears where a real text label is already carrying the meaning, and is
`aria-hidden` at every call site. `VIEW_META` gained an `emoji` field, shown
only on the **active** nav item (every inactive one keeps the drawn SVG);
`STATUS_EMOJI` (`Badges.tsx`) is used only in `StatusPill`, which always
renders `STATUS_TEXT` beside it — `StatusIcon` and the dense-list `.dot` keep
the drawn `STATUS_ICON` shapes, which are load-bearing for colour-blind
scanning. The `.emoji` class pins the colour-emoji faces explicitly, because
Outfit ships monochrome glyph coverage that otherwise wins the cascade.

**5. The canvas got a constructivist grid** — 56px, ~3.5% ink,
`background-attachment: fixed`. Below the threshold of "pattern"; it exists
because the offset shadows looked pasted onto a flat void with nothing behind
them. Fixed rather than scrolling: a grid that scrolls reads as content, one
that doesn't reads as the surface underneath.

`.section-label::before` now draws a 6px accent square. Added there rather
than at ~30 call sites — one rule, every section in every view marked.

**Verified:** typecheck and production build clean; desktop light and dark
inspected live at 1440px. Mobile (`MobileNav`'s new sliding bar) was **not**
visually verified — the browser window wouldn't reflow to a phone width.

## Direction (23 Aug 2026 — Bauhaus foundation + flagship)

**Bauhaus / constructivist.** A deliberate token-foundation + flagship pass,
adapted from a supplied Bauhaus design-system prompt (source: a public
"Design Style: Bauhaus" spec — geometric primitives, primary-colour
blocking, hard offset shadows, Outfit typeface). Scope was explicitly
phased, confirmed with Kironraj before building:

- **Foundation (app-wide):** every colour token, the sans font (Outfit,
  replacing Inter), `.section-label`, and the three button classes
  (`.btn-primary`/`.btn-quiet`/`.btn-ghost`) in `index.css`. These cascade
  everywhere via the same CSS vars every component already used, so the
  whole app's colour/type/button language changed in one pass even on pages
  nothing else here touched.
- **Flagship (component-level Bauhaus treatment):** `PageHeader` (massive
  uppercase display type + a circle/square/triangle brand mark), `AppCard`
  / the pipeline list (hairline rows → individually bordered cards with a
  thick coloured status edge and a hard offset shadow), `Sidebar`/
  `MobileNav` (the accent-theme picker removed entirely — see Colour).
- ~~**Not yet migrated:** modals, Insights/charts, Study, Outreach, Agenda,
  the command palette, and most other panels.~~ **Resolved the same day** —
  see "Second pass" above. All of these went through `.panel` /
  `.panel-inset` / `.panel-empty` already, so migrating those three classes
  migrated the surfaces. Bauhaus shape rules now apply app-wide; a component
  still carrying `rounded-2xl border border-line` inline is one that never
  used the shared classes, and should be moved onto them rather than
  hand-restyled.

Four scope decisions Kironraj made before this was built, load-bearing for
anything that extends it:
1. **Dark mode kept**, not dropped — the spec is light-only; a dark variant
   was designed to match (off-black canvas, light-grey borders instead of
   black, primaries at adjusted luminance).
2. **Status hues extended past the spec's 3 primaries** — 6 fixed job
   statuses need 6 distinct hues; see Colour below for the mapping.
3. **The accent-theme picker (cyan/teal/indigo/violet) was removed**, not
   reskinned — Bauhaus's whole point is one deliberate primary as the action
   colour, not a user-swappable one. `ThemeName`/`THEMES` no longer exist in
   `types.ts`.
4. Scope is **foundation + flagship first**, extend view-by-view later —
   not a full one-shot reskin of all 60+ components.

**Radius exception (added 23 Aug 2026, same day):** the spec's binary 0/full
rule was relaxed on request — square/rectangular flagship elements
(`.btn-quiet`, `.btn-ghost`, `AppCard`, the brand mark's square) now carry
`rounded-md` (6px) instead of `rounded-none`. `.btn-primary` and every pill
chip/badge stay `rounded-full` — the softening is only on elements that were
sharp corners, not a return to the old 9–16px panel scale. The circle and
triangle in the brand mark are untouched (a circle has no corners to round;
the triangle's clip-path can't take `border-radius`).

**Motion (added 23 Aug 2026, same day):** three additions, each tied to a
real state/identity job rather than scattered decoration —
1. `PageHeader`'s brand mark assembles in (scale + fade, the square also
   rotating in) staggered ~70ms apart, once per mount — the redesign's one
   authored focal moment, not a loop (a tool opened dozens of times a day
   shouldn't replay a brand animation every visit past the first paint of
   each page load).
2. `AppCard`'s status-colour edge grows in from the top (`scaleY` from a top
   `transformOrigin`) on the same staggered delay as the card itself — a
   "constructed" reveal instead of a static bar.
3. Icon-bearing buttons (`.btn-primary`/`.btn-quiet`/`.btn-ghost`) scale
   their icon slightly on hover (`hover:[&>svg]:scale-110`) — direct feedback
   on the actionable element, matching the Bauhaus spec's own "icon hover:
   scale up on grouped shapes" micro-interaction rule.

All three inherit `<MotionConfig reducedMotion="user">` from `main.tsx`
automatically — no extra reduced-motion handling needed.

## Colour

The `applied` status used to just reuse `--accent` directly (safe when
accent was signal cyan, a hue no status owned). Now that accent is Bauhaus
red — the same family as `rejected` — that reuse would make two different
things read as one colour, so `applied` got its own token: Bauhaus blue.
Outreach's `emailed` status (the same "in flight" concept) was moved the
same way. Nothing else in the status vocabulary changed slot, just hue:

| Status | Token | Hue |
|---|---|---|
| `researching` / `withdrawn` | `neutral` | grey |
| `applied` / outreach `emailed` | `applied` (new) | Bauhaus blue `#1040C0` |
| `interview` | `amber` | dark mustard/gold — **not** the poster yellow, see below |
| `offer` | `grass` | green |
| `rejected` | `rose` | deep red — deliberately same family as `accent`, not a clash (Bauhaus's constrained-primary philosophy tolerates it; `accent` is action, `rose` is a status fact, and they're never adjacent in a way that reads as one thing) |
| — | `accent` | Bauhaus red `#D02020` (light) / `#F04438` (dark) — action only |

**`amber` is a contrast-safe mustard, not pure Bauhaus yellow.** The spec's
`#F0C020` fails 4.5:1 as text on white/off-white (~1.6:1) — DESIGN.md's own
accessibility bar predates this redesign and still applies. `--primary-
yellow` (pure, `#F0C020`) exists separately for decorative blocking only —
corner shapes, the brand mark's triangle — and must never carry a text
label. Every status/accent hex was contrast-checked against ~4.5:1 on its
own canvas/panel before being picked; don't casually brighten one back
toward the "true" poster primary without re-checking.

## Direction (superseded 22 Aug 2026 — "Ops console, warmed")

Three deliberate moves, chosen because the person using this daily works
SOC/GRC/cyber-security, and a job search from inside that field reads
naturally as a console, not a consumer app. Superseded by Bauhaus above; kept
here because un-migrated views still partly reflect it.

1. **Warm-tinted neutrals, not cold grey** — near-white/near-black surfaces
   keep their restraint, but every neutral (canvas, panel, ink, line) carries
   a warm undertone instead of a clinical one.
2. **Monospace for structure, Inter for content** — section labels, card
   titles, and eyebrows switch to JetBrains Mono (`.section-label`); body
   copy, row titles, and the page hero stay Inter. The mono treatment is
   what makes this read as a console rather than a re-skinned SaaS panel.
3. **Sharper, bolder panels; pill interactives untouched** — structural
   panels (cards, tiles) got sharper corners (was 14/18/24px, now 9/12/16px)
   and a doubled border (`border-2`) on the dashboard's console-readout
   surfaces (`ChartCard`, `KpiTile`) plus `StatusPill`, which went from
   tinted text to a filled status-hue badge. Buttons and chips stayed fully
   rounded pills — the boldness is structural, not applied everywhere, so
   the dense application list keeps the calm-rows read that was already
   working.

The underlying thesis is unchanged from the previous direction and is still
correct: a job search is a small number of live threads, each owing you a
next move. The surface shows the pipeline as calm rows readable at a glance
and refuses the dense dashboard-of-widgets arrangement that would treat six
applications like six thousand. Only the visual language changed, not the
information architecture.

## Visitor mode

**Operate.** A tool used most days by one person. Scanability, consistent state,
and discoverable affordances outrank expression. This is why the primary verb
on each row (Mark applied / Tracking) stays visible at rest — only the secondary
CV action is hover-revealed.

## Color (STALE as of 23 Aug 2026 — see "Colour" above for live values)

Every hex/token value below was overwritten by the Bauhaus redesign; this
section is historical record of the previous direction's intent only, kept
per this file's own "superseded, not deleted" convention. Do not copy a hex
value from here.

Strategy: **Restrained, warmed** — warm neutrals plus a single signal accent.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--canvas` | `#FAF8F5` | `#100E0B` | Page ground |
| `--panel` | `#FFFEFB` | `#1A1713` | Raised surfaces, modals |
| `--panel-2` | `#F5F2EC` | `#221E19` | Recessed / hover fills |
| `--ink` | `#1F1B17` | `#F5F1EA` | Primary text |
| `--ink-soft` | `#6C6458` | `#9E968A` | Secondary text |
| `--ink-faint` | `#787066` | `#8E867A` | Meta text (≥4.5:1 in both themes) |
| `--line` | `#E0D9CD` | `#38322A` | Borders |
| `--line-soft` | `#ECE7DE` | `#2C271B` | Row separators |
| `--accent` | `#087482` | `#22D3EE` | Action only — signal cyan |
| `--on-accent` | `#FFFFFF` | `#080E10` | Text on an accent fill |

**Accent is signal cyan, deliberately not warm/amber-family** — `interview`
status already owns that hue, and an accent has to stay visually distinct
from every fixed status hue or it stops reading as a signal. The warmth in
this direction lives in the neutrals and the mono/bold shape language, not
in the accent hue.

**Status hues are fixed meaning and are never themed** — pushed a step more
saturated in this redesign, same hue family. `researching` neutral, `applied`
accent-cyan, `interview` amber, `offer` green, `rejected` rose, `withdrawn`
neutral. Defined once in `STATUS_DOT` (`src/components/Badges.tsx`) and
reused everywhere including the board and the command palette. `StatusPill`
renders these as a filled badge (`STATUS_BADGE`, same file) rather than
tinted text — see Components below.

Accent is for action, not decoration: buttons, focus rings, links, active view
toggle, drag-target highlight. It never fills a large region.

**Accent themes:** the swatch picker's default is now `cyan` (was `blue`,
renamed to match); `teal`/`indigo`/`violet` are unchanged alternates.

## Type

**STALE as of 23 Aug 2026:** `font-sans` is now **Outfit Variable**
(`@fontsource-variable/outfit`), not Inter — Inter's package was removed
(`@fontsource-variable/inter` uninstalled) since nothing referenced it once
`tailwind.config.js`'s `fontFamily.sans` changed. `.section-label` moved off
JetBrains Mono to bold uppercase Outfit (matches the Bauhaus spec's own
"Labels" rule) — see `index.css`. JetBrains Mono is still self-hosted and
still used for the Claude terminal output, folder paths, reference numbers,
and `kbd` hints; it just isn't the section-heading identity any more.

- Self-hosted deliberately: this is an offline-capable local tool, so first
  paint must not depend on a font CDN. Same reasoning applies to Outfit.

Scale: `text-display` 44px/700 (page title), `text-stat` 40px/600 (pipeline
numerals), 17px/600 role titles, 15px body, 14px controls, 13px secondary,
12–12.5px meta. Negative tracking throughout (`-0.011em` base, tighter on
display sizes).

## Layout & rhythm

- Max width `1400px` (the shell in `App.tsx` and the role-detail page both
  use this now — they used to disagree, at `1400px` and `1100px`
  respectively; one number won, `1120px` never actually matched either),
  `px-6` mobile / `px-10` desktop, `pt-8` (`pt-0` once the sidebar takes over
  vertical rhythm on desktop).
- The application list is **hairline-separated rows**, not cards: `border-b
  border-line-soft`, `py-5`, no per-row border or shadow. The pipeline is the
  one bordered panel on the page.
- Radii (sharpened 22 Aug 2026, was `14px`/`18px`/`24px`): `10px` inputs,
  `9px`/`12px` panels, `16px` modals, `full` on buttons and chips — pill
  interactives are deliberately untouched by the sharpening.
- Shadows are rare: `shadow-lift` for chart cards, `shadow-float` for modals.
  List rows never lift — board cards are the one deliberate exception:
  they're draggable, and the lift is drag affordance, not decoration.
- **Bold borders on console-readout surfaces only** (22 Aug 2026): `ChartCard`
  and `KpiTile` (`AnalyticsView.tsx`) use `border-2` instead of the app-wide
  hairline `border`. Everywhere else — modals, the application list, form
  panels — keeps the original 1px border. Don't spread `border-2` further
  without a reason; it's a deliberate accent on the dashboard, not a new
  default.

## Components

- `.btn-primary` — accent fill, `text-on-accent`, pill.
- `.btn-quiet` — bordered, panel fill, pill.
- `.chip` — bordered pill for metadata (fit, applied age, deadline, CV status).
  Colour only when the state is exceptional (amber = attention, rose = overdue).
- `.dot` — 7px status dot, the primary status carrier in the dense list/board.
- `.section-label` — mono, uppercase, `text-ink-faint` eyebrow/card-title.
  Route any new section heading or card title through this class rather than
  hand-copying its Tailwind classes (`index.css`, `@layer components`).
- `StatusPill` (`Badges.tsx`) — filled status-hue badge (`STATUS_BADGE` map),
  used where a status needs to read as a standalone fact (card detail rows,
  role page) rather than the compact dot the dense list/board use.
- `.field-input` / `.field-label` — form primitives.
- `.link-quiet` — inline text link with icon, goes accent on hover.

## Motion

Framer Motion throughout, wrapped in `<MotionConfig reducedMotion="user">` in
`src/main.tsx` — the CSS `prefers-reduced-motion` block cannot reach JS-driven
animation, so that wrapper is what actually honours the preference.

Springs, not eases (`stiffness: 380-420`, `damping: 30-36`). List rows stagger
on mount at `0.03s`, capped at 8 items. **Values that change do not animate** —
the pipeline numerals deliberately have no entrance animation, because keying an
animation on the value made exactly the changed numbers render mid-fade.

## Accessibility

- All four modals: `role="dialog"` (`alertdialog` for delete), `aria-modal`,
  `aria-labelledby`, focus-in on open, Tab trapped, focus restored on close —
  via the shared `useDialog` hook (`src/useDialog.ts`).
- Row titles are real `<button>` elements; rows are **not** `role="button"`
  containers, which would flatten each row's nested controls into one
  unusable accessible name.
- Arrow-key navigation through the list; Escape closes every overlay.
- Icon-only controls carry `aria-label` and `aria-pressed` where they toggle.
- All text meets 4.5:1 in both themes, including meta text and the accent
  button's label.

## Conventions

- Theme via a `dark` class on `<html>`, persisted to `localStorage`
  (`theme_pref`); view and sort persisted the same way.
- Charts can't read CSS custom properties (recharts renders raw SVG attrs), so
  `useChartTheme()` in `AnalyticsView.tsx` mirrors the tokens per theme. If a
  token changes, that hook must change with it.
- Keyboard: `Ctrl/Cmd+K` command palette, `Ctrl/Cmd+J` Claude terminal.
  **Not** Ctrl+T — the browser reserves it and it never reaches the page.
- **Mobile navigation (added 22 Aug 2026):** `Sidebar` is desktop-only below
  `md` (`mode="rail"`, `hidden md:block`). Small screens get `MobileNav`
  (`src/components/MobileNav.tsx`) instead — a fixed, safe-area-aware bottom
  tab bar for the four most-used views (Roles/Agenda/Study/Insights), plus a
  "More" bottom sheet that renders the same `<Sidebar mode="sheet">` for
  Outreach nav, filters, appearance, and sign-out. One nav content source,
  two shells — don't hand-roll a second mobile menu when a view or a filter
  is added; extend `VIEW_META`/`Sidebar` and both surfaces pick it up.
- **Dashboard KPI row (added 22 Aug 2026):** `AnalyticsView` opens with a
  `KpiRow` — four `KpiTile`s (this week vs last, avg response, response
  spread, gone-quiet) in a 2-up/4-up grid, above "What's working". Any new
  headline metric belongs in this row, not a standalone card lower on the
  page — that's what buried these four the first time.
- `PageHeader`'s `h1` is `text-stat sm:text-display` — the 40px token below
  `sm`, the full 44px `display` token at and above it. A phone gets the
  smaller of two existing tokens, never a new arbitrary size.
- **Agenda is a month-grid calendar (added 22 Aug 2026, replacing the flat
  date-grouped list):** `AgendaView.tsx` still owns the same `buildAgenda()`
  reconciliation over applications + outreach (deadlines, follow-ups,
  next-actions, interviews, tasks), unchanged. The UI is now: an overdue
  section (only rendered when non-empty), a Monday-start month grid with a
  coloured dot per item per day (capped at 3 + overflow count, `kindDotColor`),
  and a detail list for whichever day is selected (defaults to today),
  reusing the row markup (`AgendaRow`) that used to be the whole view. Picking
  a far-future or far-past date is no longer cut off at 45 days — the old
  list's hard cutoff doesn't apply to a calendar the user navigates by month.
- **Performance:** `AppDataProvider.refresh()` reconciles the polled `apps`
  array by `updated` timestamp (`reconcileApps`) so unchanged entries keep
  their previous object reference instead of a fresh one every ~12s poll;
  `AppCard` is wrapped in `memo()` with a matching comparator
  (`appCardPropsEqual`) so an unchanged row actually skips re-render (and the
  layout re-measure framer-motion's `layout` prop triggers on every render).
  Without both halves this doesn't work — memo alone can't skip on a fresh
  object, and reconciliation alone doesn't stop a re-render without memo.
  `MobileNav`'s persistent bottom bar is opaque (`bg-panel`), not
  translucent+blurred — a fixed `backdrop-filter` bar re-composites everything
  scrolling under it every frame; a modal's blur only pays that cost while
  the modal is open.
