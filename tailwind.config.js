/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // Outfit — geometric sans, part of the Bauhaus redesign (DESIGN.md,
        // 23 Aug 2026): its circular letterforms read as constructed rather
        // than humanist, which is the whole point of the style.
        sans: [
          'Outfit Variable',
          'Outfit',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'ui-monospace', 'SF Mono', 'Cascadia Mono', 'monospace'],
      },
      colors: {
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-soft': 'rgb(var(--ink-soft) / <alpha-value>)',
        'ink-faint': 'rgb(var(--ink-faint) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        'panel-2': 'rgb(var(--panel-2) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        'line-soft': 'rgb(var(--line-soft) / <alpha-value>)',
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'on-accent': 'rgb(var(--on-accent) / <alpha-value>)',
        neutral: 'rgb(var(--neutral) / <alpha-value>)',
        // 'applied' status used to just reuse `accent` — safe when accent was
        // signal cyan, a hue no status owned. Now that accent is Bauhaus red
        // (== `rejected`'s family), applied needs its own hue: Bauhaus blue.
        applied: 'rgb(var(--applied) / <alpha-value>)',
        amber: 'rgb(var(--amber) / <alpha-value>)',
        rose: 'rgb(var(--rose) / <alpha-value>)',
        grass: 'rgb(var(--grass) / <alpha-value>)',
        // Pure, undarkened Bauhaus yellow — decorative blocking only (corner
        // shapes, background panels). `amber` above is a contrast-safe
        // mustard for status text/icons; this one fails 4.5:1 as text on
        // purpose and must never carry a label.
        'primary-yellow': 'rgb(var(--primary-yellow) / <alpha-value>)',
      },
      // The full type scale. Before this existed the app used 14 arbitrary
      // bracket sizes, 168 of them crammed between 11.5px and 13.5px — four
      // sizes doing one job at steps nobody can perceive as hierarchy. These
      // nine tokens replace all of them; `meta`/`micro`/`label` absorb that
      // whole band. Prefer a token over `text-[Npx]` everywhere.
      fontSize: {
        display: ['44px', { lineHeight: '1.05', letterSpacing: '-0.025em', fontWeight: '700' }],
        stat: ['40px', { lineHeight: '1', letterSpacing: '-0.03em', fontWeight: '600' }],
        // Size only — deliberately no lineHeight/fontWeight on these seven.
        // Tailwind's arbitrary `text-[13px]` sets font-size and nothing else,
        // so baking line-height or weight into the replacements would silently
        // change layout and boldness at all 259 call sites at once. Weight
        // stays with the existing `font-*` classes. Tuning line-height per
        // token is a real design decision and should be made visibly, later —
        // not smuggled in under a mechanical rename.
        title: '22px',
        heading: '17px',
        subhead: '15px',
        body: '14px',
        meta: '13px',
        micro: '12px',
        label: '11px',
      },
      // Sharper than the previous 14/18/24 — part of the "ops console,
      // warmed" redesign (DESIGN.md, 22 Aug 2026): structural panels read
      // more built, less soft-app. Buttons/chips stay `rounded-full`
      // (untouched by this scale) so touch targets keep their pill shape.
      borderRadius: {
        xl: '9px',
        '2xl': '12px',
        '3xl': '16px',
      },
      boxShadow: {
        lift: '0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -8px rgb(0 0 0 / 0.10)',
        float: '0 12px 48px -12px rgb(0 0 0 / 0.22), 0 2px 8px rgb(0 0 0 / 0.06)',
        // Hard offset shadows — Bauhaus flagship surfaces. Solid, never
        // blurred: depth through layering, not glow.
        //
        // These used to be hard-coded `#121212`, which is *exactly* the dark
        // theme's `--canvas` — so every hard shadow in the app was invisible
        // in dark mode and the whole depth system silently vanished at night.
        // Now driven by `--shadow-hard` (index.css), which flips to the same
        // light grey the borders do.
        hardXs: '2px 2px 0px 0px rgb(var(--shadow-hard))',
        hardSm: '3px 3px 0px 0px rgb(var(--shadow-hard))',
        hardMd: '6px 6px 0px 0px rgb(var(--shadow-hard))',
        hardLg: '8px 8px 0px 0px rgb(var(--shadow-hard))',
        // Accent-coloured hard shadow — the "live"/selected state only.
        hardAccent: '4px 4px 0px 0px rgb(var(--accent))',
      },
      keyframes: {
        // A ring that expands and dies out of a status dot — the app's one
        // "this is happening right now" signal (queued CV runs, live
        // interview stage). Deliberately scoped to genuinely live state.
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--pulse) / 0.65)' },
          '70%': { boxShadow: '0 0 0 9px rgb(var(--pulse) / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(var(--pulse) / 0)' },
        },
        // A diagonal highlight sweeping a card on hover — reads as light
        // raking across a physical panel, which is the Bauhaus material
        // read. Runs once per hover, not on a loop.
        sheen: {
          '0%': { transform: 'translateX(-140%) skewX(-20deg)' },
          '100%': { transform: 'translateX(240%) skewX(-20deg)' },
        },
        // A held, tiny tilt — hover only, for the active nav emoji.
        wiggle: {
          '0%, 100%': { transform: 'rotate(-9deg)' },
          '50%': { transform: 'rotate(9deg)' },
        },
        // A slow fade, not a hard on/off flash — for the Applied pill only,
        // so it reads as "still moving" without being an eyesore in a list.
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.9s cubic-bezier(0.22, 1, 0.36, 1) infinite',
        sheen: 'sheen 0.7s cubic-bezier(0.22, 1, 0.36, 1)',
        'emoji-pop': 'emoji-pop 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        wiggle: 'wiggle 0.45s ease-in-out 2',
        blink: 'blink 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
