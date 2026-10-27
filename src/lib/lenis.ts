import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { gsap, prefersReducedMotion } from './gsapSetup';

// One page-level instance (the page scrolls on window). Lenis handles
// prefers-reduced-motion itself (respectReducedMotion defaults to true), and
// touch stays native. allowNestedScroll lets modals, the board columns, the
// palette list and <pre> blocks keep their own native scrolling.
const lenis = typeof window === 'undefined' ? null : new Lenis({ autoRaf: true, allowNestedScroll: true });

/** Lenis-aware replacements for window.scrollTo / scrollIntoView — with Lenis
 *  active, native `behavior: 'smooth'` is disabled, so these must go through it. */
export function scrollToTop(immediate = false) {
  if (lenis) lenis.scrollTo(0, { duration: 1, immediate });
  else window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function scrollToEl(el: HTMLElement) {
  if (lenis) lenis.scrollTo(el, { duration: 1 });
  else el.scrollIntoView({ block: 'start' });
}

/** Jump (no animation) to an absolute position; used to restore scroll on Back. */
export function scrollToY(y: number) {
  if (lenis) lenis.scrollTo(y, { immediate: true });
  else window.scrollTo(0, y);
}

export function currentScrollY() {
  return lenis ? lenis.scroll : window.scrollY;
}

// ---- DOM watching ----------------------------------------------------------
// One observer on the React root. It (a) marks the cached scroll targets stale
// whenever nodes are added, and (b) hands page sections to the reveal below.
let targetsDirty = true;
const revealers = new Set<(el: HTMLElement) => void>();

if (typeof window !== 'undefined') {
  new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        targetsDirty = true;
        const isSection = n.parentElement?.tagName === 'MAIN' || n.hasAttribute('data-reveal');
        if (isSection) revealers.forEach((r) => r(n));
        n.querySelectorAll<HTMLElement>('[data-reveal]').forEach((c) => revealers.forEach((r) => r(c)));
      });
    }
  }).observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true });
}

// ---- scroll-linked extras --------------------------------------------------
// Progress bar, [data-parallax] drift and the role page's section-nav spy all
// hang off Lenis's scroll event. All plain DOM, so no React tree is involved.
if (lenis && typeof document !== 'undefined') {
  const bar = document.createElement('div');
  bar.setAttribute('aria-hidden', 'true');
  bar.className = 'fixed inset-x-0 top-0 z-[90] h-[2px] origin-left bg-accent';
  bar.style.transform = 'scaleX(0)';
  document.body.appendChild(bar);

  const SPY_LINKS = 'nav[aria-label="Sections"] a[href^="#"]';
  let parallaxEls: HTMLElement[] = [];
  let spy: { link: HTMLAnchorElement; target: HTMLElement }[] = [];

  const refreshTargets = () => {
    targetsDirty = false;
    parallaxEls = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'));
    spy = Array.from(document.querySelectorAll<HTMLAnchorElement>(SPY_LINKS)).flatMap((link) => {
      const target = document.getElementById(link.hash.slice(1));
      return target ? [{ link, target }] : [];
    });
  };

  lenis.on('scroll', ({ scroll, limit }: { scroll: number; limit: number }) => {
    bar.style.transform = `scaleX(${limit > 0 ? Math.min(scroll / limit, 1) : 0})`;
    if (targetsDirty) refreshTargets();

    if (parallaxEls.length && !prefersReducedMotion()) {
      // `translate` is its own CSS property, so it can't clobber the transform
      // that GSAP/tilt already write on the same element.
      const y = Math.min(scroll, 600);
      parallaxEls.forEach((el) => {
        el.style.translate = `0 ${Math.min(y * parseFloat(el.dataset.parallax || '0.1'), 60)}px`;
      });
    }

    if (spy.length) {
      let current = spy[0].link;
      for (const s of spy) if (s.target.getBoundingClientRect().top <= 140) current = s.link;
      for (const s of spy) s.link.toggleAttribute('data-spy-active', s.link === current);
    }
  });

  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>(SPY_LINKS);
    const t = a && document.getElementById(a.hash.slice(1));
    if (!a || !t) return;
    e.preventDefault();
    scrollToEl(t);
    history.replaceState(null, '', a.hash);
  });
}

// ---- page motion -----------------------------------------------------------
// Every page renders its sections as direct children of <main> (or tags a block
// with data-reveal). Each one eases up and fades in as it enters the viewport.
// Opt out with data-no-reveal.
if (typeof window !== 'undefined' && !prefersReducedMotion()) {
  const show = (el: Element, delay = 0) => {
    if (!(el instanceof HTMLElement) || el.dataset.revealed === '2') return;
    el.dataset.revealed = '2';
    io.unobserve(el);
    gsap.to(el, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', delay, clearProps: 'opacity,transform' });
  };

  const io = new IntersectionObserver(
    (entries) => {
      let i = 0;
      for (const e of entries) if (e.isIntersecting) show(e.target, Math.min(i++, 6) * 0.07);
    },
    { rootMargin: '0px 0px -6% 0px' }
  );

  const inViewport = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  };

  revealers.add((el) => {
    if (el.dataset.noReveal !== undefined || el.dataset.revealed) return;
    el.dataset.revealed = '1';
    gsap.set(el, { opacity: 0, y: 24 });
    io.observe(el);
    // Safety net: if the observer never reports an element that is on screen,
    // never leave it invisible.
    setTimeout(() => {
      if (el.dataset.revealed === '1' && inViewport(el)) show(el);
    }, 1500);
  });
}
