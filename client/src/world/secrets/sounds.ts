// The secrets' little sounds (#266), through the office's mixer (ui/sfx.ts).

import { noise, tone } from '../../ui/sfx';

type Vec3 = { x: number; y: number; z: number };

/** A rubber duck squeezed: two quick rising squeaks. */
export function squeak(pos?: Vec3) {
  const o = { name: 'duck:squeak', group: 'toys', pos } as const;
  tone({ ...o, freq: 900, to: 1500, type: 'square', dur: 0.09, peak: 0.05, attack: 0.005 });
  tone({ ...o, at: 0.11, freq: 1100, to: 1900, type: 'square', dur: 0.12, peak: 0.045, attack: 0.005 });
  noise({ ...o, dur: 0.18, peak: 0.02, filter: 'bandpass', freq: 2400, q: 3 });
}

/** A heavy bookshelf sliding on its rails, with a click of the catch first. */
export function shelfSlide(pos?: Vec3) {
  const o = { name: 'secret:shelf', group: 'toys', pos } as const;
  tone({ ...o, freq: 1800, to: 900, type: 'square', dur: 0.04, peak: 0.04, attack: 0.002 });
  noise({ ...o, at: 0.1, dur: 1.1, peak: 0.05, filter: 'lowpass', freq: 380, to: 220, attack: 0.15 });
}

/** A mug tipping over: a clunk and a splash. */
export function splash(pos?: Vec3) {
  const o = { name: 'secret:splash', group: 'toys', pos } as const;
  tone({ ...o, freq: 620, to: 380, type: 'triangle', dur: 0.08, peak: 0.06, attack: 0.003 });
  noise({ ...o, at: 0.06, dur: 0.45, peak: 0.08, filter: 'bandpass', freq: 1400, to: 500, q: 0.8, attack: 0.01 });
}

/** A short rising sparkle for an easter egg. */
export function sparkle() {
  const o = { name: 'secret:egg', group: 'toys' } as const;
  [660, 880, 1320].forEach((freq, i) => tone({ ...o, at: i * 0.07, freq, type: 'triangle', dur: 0.18, peak: 0.04 }));
}
