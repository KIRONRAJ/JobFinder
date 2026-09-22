import { useEffect, useMemo, useRef, useState } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsapSetup';
import { api } from '../api';
import { Icon } from './Icons';

interface Photo {
  url: string;
  photographer: string;
  photographerUrl: string;
  pageUrl: string;
}

interface Props {
  /** 0-100 from the Appearance slider — how strongly the scrim covers the
   *  photo. Mapped onto opacity 0.30-0.98 and blur 0-3px below rather than
   *  used directly, so 0 never goes fully-transparent-unreadable and 100
   *  never goes fully-opaque-invisible. */
  dim: number;
}

const NIGHT_START_HOUR = 19;
const NIGHT_END_HOUR = 6;

/** True 19:00-06:00 local time — independent of the dark/light toggle, which
 *  the user may leave on light all day. Read once per mount; the wallpaper
 *  re-mounts on every full page load anyway, which is a fine cadence for a
 *  dusk/dawn boundary. */
function isNightHours() {
  const h = new Date().getHours();
  return h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR;
}

/**
 * A tech-themed Pexels photo sitting fixed behind the whole app, refreshed
 * once a day automatically or on demand via the shuffle button. The server
 * caches the day's pick (see /api/wallpaper) so idle mounts never cost a
 * Pexels hit — only the shuffle button does, via ?refresh=1. A scrim keeps
 * foreground panels readable over whatever the photo looks like; the credit
 * link in the corner satisfies Pexels' attribution requirement.
 */
export function Wallpaper({ dim }: Props) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(false);
  const night = useMemo(isNightHours, []);
  const bgRef = useRef<HTMLDivElement>(null);
  const prevUrl = useRef<string | null>(null);

  // No AnimatePresence equivalent needed: it's the same one element the
  // whole time, so a crossfade is just "fade out, swap the image, fade
  // back in" on a persistent node rather than mounting/exiting a new one
  // per photo (framer-motion -> GSAP migration, 30 Aug 2026).
  useGSAP(
    () => {
      if (!bgRef.current || !photo) return;
      const reduce = prefersReducedMotion();
      if (prevUrl.current === null) {
        gsap.set(bgRef.current, { backgroundImage: `url(${photo.url})` });
        gsap.to(bgRef.current, { opacity: 1, duration: reduce ? 0 : 0.5, ease: 'power2.out' });
      } else if (prevUrl.current !== photo.url) {
        gsap
          .timeline()
          .to(bgRef.current, { opacity: 0, duration: reduce ? 0 : 0.25, ease: 'power2.in' })
          .set(bgRef.current, { backgroundImage: `url(${photo.url})` })
          .to(bgRef.current, { opacity: 1, duration: reduce ? 0 : 0.25, ease: 'power2.out' });
      }
      prevUrl.current = photo.url;
    },
    { dependencies: [photo?.url] }
  );

  const fetchPhoto = (refresh: boolean) => {
    setLoading(true);
    api
      .wallpaper(refresh)
      .then((p) => setPhoto(p))
      .catch(() => {
        /* PEXELS_API_KEY missing, Pexels unreachable, and no local fallback pack — the toggle just does nothing */
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPhoto(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!photo) return null;

  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
  const baseOpacity = 0.3 + (dim / 100) * 0.68;
  const baseBlur = (dim / 100) * 3;
  // A flat boost after dark, on top of whatever the slider says — a bright
  // midday photo at full slider strength shouldn't suddenly look identical
  // to 2am just because the user set Dim once and forgot about it.
  const opacity = clamp(baseOpacity + (night ? 0.08 : 0), 0, 0.98);
  const blur = clamp(baseBlur + (night ? 1 : 0), 0, 4);

  return (
    <>
      <div
        ref={bgRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center opacity-0"
      />
      {/* Inline style, not a Tailwind opacity-modifier class: the dim slider
          needs a continuous 0-100 range, and Tailwind's bg-opacity utilities
          only cover a fixed scale (0/5/10/20/25/30/40/50/60/70/75/80/90/95/
          100) — an off-scale class like bg-canvas/86 silently compiles to no
          utility at all (fully transparent), which is the bug that first
          shipped here and let a busy photo overpower the text underneath. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10"
        style={{ backgroundColor: `rgb(var(--canvas) / ${opacity})`, backdropFilter: `blur(${blur}px)` }}
      />

      <div className="fixed bottom-2 right-2 z-10 flex items-center gap-1.5">
        <button
          onClick={() => fetchPhoto(true)}
          disabled={loading}
          title="New wallpaper"
          aria-label="New wallpaper"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-canvas/70 text-ink-faint
                     backdrop-blur-sm transition-colors hover:text-accent disabled:opacity-50"
        >
          <Icon.Shuffle className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <a
          href={photo.pageUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-canvas/70 px-2.5 py-1 text-[10px] text-ink-faint
                     backdrop-blur-sm transition-colors hover:text-ink"
        >
          Photo by {photo.photographer} on Pexels
        </a>
      </div>
    </>
  );
}
