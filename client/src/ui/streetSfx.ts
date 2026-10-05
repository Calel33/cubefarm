// The street's sounds (#264), all synthesized: the fountain's splash (one long-lived loop, built once and reused, muffled
// and turned down through the lobby's walls like the rest of the outside), the food truck's sizzle and its order bell,
// the pigeons' wing-claps and coos, the bus's brakes, doors and pull-away, and the crossing light's chirp. Everything
// goes through the 'outside' group (the Outside slider), the bites and the bell through 'toys', then the master gain.
// Street.tsx decides when; the rate limits are here, so a busy lunch hour never piles sounds up.

import { cutoffHz } from './outsideMix';
import { audio, createPanner, groupOutput, noise, recordSfx, setPannerPosition, tone, type Vec3 } from './sfx';

const OUT = { group: 'outside' } as const;
const TOYS = { group: 'toys' } as const;
const vary = (k = 0.08) => 1 - k + Math.random() * k * 2;

// ---------- the food truck ----------

/** One crackle off the truck's griddle: a hiss of fat, now and then a pop. `level` 0-1: busier while an order cooks. */
export function sizzle(pos: Vec3, level: number) {
  noise({ ...OUT, name: 'truck-sizzle', pos, dur: 0.06 + Math.random() * 0.2, peak: (0.008 + Math.random() * 0.02) * level, filter: 'highpass', freq: 2800 + Math.random() * 3600, attack: 0.004 });
  if (Math.random() < 0.15 * level) noise({ ...OUT, name: 'truck-pop', pos, dur: 0.03, peak: 0.035 * level, filter: 'bandpass', freq: 1400 + Math.random() * 1500, q: 2, attack: 0.001 });
}

/** The order going onto the griddle: a big hiss. */
export function griddleHiss(pos: Vec3) {
  noise({ ...OUT, name: 'truck-hiss', pos, dur: 0.8, peak: 0.05, filter: 'highpass', freq: 3000 * vary(), to: 5000, attack: 0.01 });
}

/** Order up: the truck's little bell, two strikes, a touch different each time. */
export function orderBell(pos: Vec3) {
  const f = 1760 * vary(0.03);
  for (let i = 0; i < 2; i++) {
    tone({ ...TOYS, name: 'truck-bell', pos, freq: f, at: i * 0.16, type: 'sine', dur: 0.5, peak: 0.05, attack: 0.002 });
    tone({ ...TOYS, name: 'truck-bell', pos, freq: f * 2.76, at: i * 0.16, type: 'sine', dur: 0.25, peak: 0.012, attack: 0.002 });
  }
}

/** Food handed over in its paper: a rustle. */
export function paperRustle(pos: Vec3) {
  noise({ ...TOYS, name: 'truck-paper', pos, dur: 0.18, peak: 0.03, filter: 'bandpass', freq: 3500 * vary(), q: 0.8, attack: 0.01 });
}

// ---------- the fountain ----------

/** The splash's level up close, before distance and the Outside slider: a soft bed under the footsteps. */
export const FOUNTAIN_PEAK = 0.05;
let noiseBuf: AudioBuffer | null = null;
let fountain: { ctx: BaseAudioContext; src: AudioBufferSourceNode; gain: GainNode; muffle: BiquadFilterNode; panner: PannerNode; out: AudioNode; hooked: boolean } | null = null;
let fountainHeard: boolean | null = null;
let lastPlink = 0;

/**
 * The fountain at `pos`, as loud as `level` (0-1: how well the outside carries to you, 0 while quiet) and as clear as
 * `clarity`. Builds its loop once, the first time audio is there, and keeps it; called a few times a second.
 */
export function fountainLevel(pos: Vec3, level: number, clarity: number) {
  const out = groupOutput('outside');
  const a = audio();
  if (!fountain && a && out && level > 0) {
    try {
      const ctx = a.ctx;
      if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        // a splashy noise: white with slow swells, so the loop never sounds like a hiss
        let swell = 0.6;
        for (let i = 0; i < d.length; i++) {
          if (i % 2048 === 0) swell = 0.45 + Math.random() * 0.55;
          d[i] = (Math.random() * 2 - 1) * swell;
        }
      }
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 700;
      const peak = ctx.createBiquadFilter();
      peak.type = 'peaking';
      peak.frequency.value = 2400;
      peak.gain.value = 5;
      const muffle = ctx.createBiquadFilter();
      muffle.type = 'lowpass';
      muffle.frequency.value = cutoffHz(clarity);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const panner = createPanner(ctx, pos);
      src.connect(hp).connect(peak).connect(muffle).connect(gain).connect(panner);
      src.start();
      fountain = { ctx, src, gain, muffle, panner, out, hooked: false };
    } catch {
      fountain = null;
    }
  }
  const heard = level > 0.02;
  if (heard !== fountainHeard) {
    fountainHeard = heard;
    recordSfx('fountain', { ...OUT, pos, peak: FOUNTAIN_PEAK * level, played: heard && !!fountain });
  }
  if (!fountain) return;
  const f = fountain;
  try {
    const now = f.ctx.currentTime;
    setPannerPosition(f.panner, pos.x, pos.y, pos.z);
    if (heard && !f.hooked) {
      f.panner.connect(f.out);
      f.hooked = true;
    }
    // a slow wander in the level, so it breathes
    f.gain.gain.setTargetAtTime(FOUNTAIN_PEAK * level * vary(0.12), now, heard ? 0.4 : 0.15);
    f.muffle.frequency.setTargetAtTime(cutoffHz(clarity), now, 0.3);
    if (!heard && f.hooked && f.gain.gain.value < 1e-4) {
      f.panner.disconnect();
      f.hooked = false;
    }
  } catch {
    // audio is optional
  }
}

/** The street's gone (the floor changed): stop the fountain and let its nodes go. */
export function stopFountain() {
  const f = fountain;
  fountain = null;
  if (fountainHeard) recordSfx('fountain', { ...OUT, peak: 0, played: false });
  fountainHeard = null;
  if (!f) return;
  try {
    f.gain.gain.setTargetAtTime(0, f.ctx.currentTime, 0.05);
    f.src.stop(f.ctx.currentTime + 0.3);
    setTimeout(() => {
      try {
        f.panner.disconnect();
      } catch {
        // already gone
      }
    }, 400);
  } catch {
    // audio is optional
  }
}

/** A drop landing in the basin: a little plink, never more than a few a second. */
export function plink(pos: Vec3) {
  const now = performance.now();
  if (now - lastPlink < 250) return;
  lastPlink = now;
  const f = 900 + Math.random() * 1600;
  tone({ ...OUT, name: 'fountain-plink', pos, freq: f, to: f * 1.5, type: 'sine', dur: 0.08, peak: 0.012, attack: 0.003 });
}

// ---------- pigeons ----------

let lastFlutter = 0;
let lastCoo = 0;

/** A flurry of wings as the flock takes off: claps that thin out as they go. Once per scatter at most. */
export function flutter(pos: Vec3, birds: number) {
  const now = performance.now();
  if (now - lastFlutter < 800) return;
  lastFlutter = now;
  const claps = Math.min(10, 4 + birds);
  for (let i = 0; i < claps; i++) {
    const k = i / claps;
    noise({ ...OUT, name: 'pigeon-flutter', pos, at: i * (0.045 + Math.random() * 0.03), dur: 0.05, peak: 0.05 * (1 - k * 0.7), filter: 'bandpass', freq: 1300 + Math.random() * 1200, q: 1.1, attack: 0.002 });
  }
}

/** A pigeon's coo: a soft warble, now and then. */
export function coo(pos: Vec3) {
  const now = performance.now();
  if (now - lastCoo < 5000) return;
  lastCoo = now;
  const f = 330 * vary(0.06);
  tone({ ...OUT, name: 'pigeon-coo', pos, freq: f, to: f * 0.82, type: 'sine', dur: 0.32, peak: 0.022, attack: 0.05 });
  tone({ ...OUT, name: 'pigeon-coo', pos, freq: f * 0.9, to: f * 0.78, at: 0.36, type: 'sine', dur: 0.42, peak: 0.018, attack: 0.06 });
}

// ---------- the bus ----------

/** The bus braking into the stop: a long sigh of air brakes and the engine winding down. */
export function busArrives(pos: Vec3) {
  tone({ ...OUT, name: 'bus-engine', pos, freq: 95 * vary(), to: 55, type: 'sawtooth', dur: 2.6, peak: 0.018, attack: 0.3 });
  noise({ ...OUT, name: 'bus-brakes', pos, at: 2.4, dur: 0.9, peak: 0.05, filter: 'highpass', freq: 2500 * vary(), to: 4200, attack: 0.02 });
}

/** The doors folding open (or shut): a hiss and a clunk. */
export function busDoors(pos: Vec3, opening: boolean) {
  noise({ ...OUT, name: 'bus-doors', pos, dur: 0.45, peak: 0.035, filter: 'bandpass', freq: opening ? 3200 : 2600, q: 1.2, attack: 0.01 });
  tone({ ...OUT, name: 'bus-doors', pos, freq: 140, to: 90, at: 0.4, type: 'triangle', dur: 0.12, peak: 0.04, attack: 0.004 });
}

/** Pulling away: the engine winding up. */
export function busLeaves(pos: Vec3) {
  tone({ ...OUT, name: 'bus-engine', pos, freq: 55, to: 120 * vary(), type: 'sawtooth', dur: 3, peak: 0.02, attack: 0.4 });
}

// ---------- the crossing ----------

/** The crossing light turning green: a gentle two-note chirp, not the endless beeping of a real one. */
export function crossingChirp(pos: Vec3) {
  tone({ ...OUT, name: 'crossing-chirp', pos, freq: 2100, to: 2600, type: 'sine', dur: 0.09, peak: 0.02, attack: 0.004 });
  tone({ ...OUT, name: 'crossing-chirp', pos, freq: 2600, to: 3000, at: 0.12, type: 'sine', dur: 0.09, peak: 0.016, attack: 0.004 });
}
