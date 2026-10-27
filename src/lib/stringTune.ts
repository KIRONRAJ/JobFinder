import { StringTune, StringMagnetic } from '@fiddle-digital/string-tune';
import { prefersReducedMotion } from './gsapSetup';

// Registered once, at import time, before any `string="…"` element mounts —
// same pattern as gsapSetup.ts. Skipped under reduced-motion since it's pure
// flourish (cursor pull), nothing a user relies on to read the page.
//
// Only StringMagnetic is wired up. Parallax/split-text/progress were tried
// on list cards and the dashboard hero but skipped: cards already drive
// `transform` via useCardTilt (cursor tilt) and useFlipList (GSAP Flip
// reorder animation) — a third system writing `transform` on the same
// element fights both. Add parallax on a wrapper *around* the card (not the
// tilt/Flip target itself) if this gets revisited.
if (!prefersReducedMotion()) {
  const stringTune = StringTune.getInstance();
  stringTune.use(StringMagnetic);
  stringTune.start(60);
}
