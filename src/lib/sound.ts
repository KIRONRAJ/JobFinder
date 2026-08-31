/**
 * Tiny synth-based sound effects — Web Audio oscillators, not audio files.
 * No asset to source/license/host, and no dependency: the browser's own
 * AudioContext already does everything this needs.
 *
 * Module-level enabled flag (not a React context) so any component can call
 * `playSound()` directly without threading a prop down — App.tsx just keeps
 * `setSoundEnabled` in sync with the persisted preference.
 *
 * Deliberately NOT gated behind `prefers-reduced-motion`: that media query is
 * about animation (vestibular triggers — parallax, spin, zoom), a different
 * accessibility axis from audio. Muting sound is its own, separate control
 * (the Sidebar toggle) rather than inherited from a motion setting.
 */

export type SoundKind =
  | 'info'
  | 'success'
  | 'error'
  | 'reject'
  | 'milestone'
  | 'reminder'
  | 'added'
  | 'done'
  | 'tick';

let ctx: AudioContext | null = null;
let enabled = false;

export function setSoundEnabled(value: boolean) {
  enabled = value;
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

interface Recipe {
  /** Plain entries play as a single note in sequence; a nested array plays
   *  those frequencies together as a chord at that step — used by `done` for
   *  a fuller final beat. */
  freqs: (number | number[])[];
  type: OscillatorType;
  peak: number;
  step: number;
  dur: number;
}

const RECIPES: Record<SoundKind, Recipe> = {
  // Generic toast — every routine save/add/queue funnels through this.
  info: { freqs: [740], type: 'sine', peak: 0.05, step: 0, dur: 0.09 },
  // Offer landed, Claude terminal run finished cleanly — the big win.
  success: { freqs: [523.25, 659.25, 783.99], type: 'sine', peak: 0.06, step: 0.07, dur: 0.14 },
  // Generic toast error, lost terminal connection — an alert, not bad news.
  error: { freqs: [220, 174.61], type: 'triangle', peak: 0.05, step: 0.09, dur: 0.16 },
  // A role turned into a rejection — status news, not a system error, so it
  // gets its own darker, slower falling interval rather than reusing `error`.
  reject: { freqs: [349.23, 261.63], type: 'sine', peak: 0.045, step: 0.11, dur: 0.22 },
  // Interview reached — a real milestone, but one step below an Offer, so a
  // shorter two-note rise rather than `success`'s full three-note arpeggio.
  milestone: { freqs: [587.33, 880], type: 'sine', peak: 0.055, step: 0.08, dur: 0.16 },
  // A gentle nudge, once per load, for "you have a follow-up due" — softer
  // and slower than `info`, more a doorbell than a notification blip.
  reminder: { freqs: [880, 659.25], type: 'sine', peak: 0.045, step: 0.1, dur: 0.2 },
  // A role was just logged via the Claude terminal's single-URL fast path —
  // brighter and snappier than `done`, distinct from the general
  // run-finished chime so "something got added" reads differently.
  added: { freqs: [659.25, 987.77], type: 'triangle', peak: 0.09, step: 0.07, dur: 0.16 },
  // A Claude terminal run finished — the one sound explicitly asked to be
  // more evident (30 Aug 2026), since these runs go for minutes in the
  // background and the first `success` chime here was too easy to miss.
  // Louder and longer than every other kind, triangle for more harmonic
  // presence on small speakers, and ends on a two-note chord rather than a
  // single note for a clear "that's finished" landing.
  done: {
    freqs: [523.25, 659.25, [783.99, 1046.5]],
    type: 'triangle',
    peak: 0.11,
    step: 0.1,
    dur: 0.24,
  },
  // Near-inaudible UI chrome — command palette open, a board-column drop.
  // Present more than heard.
  tick: { freqs: [1200], type: 'sine', peak: 0.025, step: 0, dur: 0.035 },
};

export function playSound(kind: SoundKind) {
  if (!enabled) return;
  const audioCtx = getCtx();
  if (!audioCtx) return;
  const recipe = RECIPES[kind];
  const now = audioCtx.currentTime;
  for (let i = 0; i < recipe.freqs.length; i++) {
    const start = now + i * recipe.step;
    const entry = recipe.freqs[i];
    const freqs = Array.isArray(entry) ? entry : [entry];
    for (const freq of freqs) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = recipe.type;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(recipe.peak, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + recipe.dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + recipe.dur + 0.02);
    }
  }
}
