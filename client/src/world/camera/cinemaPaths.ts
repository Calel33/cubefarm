// The cinematic camera's paths and rules, as plain numbers (cinema.ts flies them): which intro a visit gets, the
// start screen's slow orbit round the tower, the flyover from that orbit down over the street, through the lobby's side
// door to reception (a centripetal Catmull-Rom spline, timed by a monotone curve so it slows for the door, banking
// into its turns), the idle screensaver's orbit inside a floor, and the elevator ride's timing and floor counter.
// Pure, so the tests check shapes, durations and skips. Poses are as in cameraMath.ts, plus a roll for banking.

import { angleDelta } from '../body';
import type { Tier } from '../gfx/quality';
import { BALCONY_OUT, EYE_HEIGHT, HALF_D, HALF_W, RECEPTION, ROOF, SIDE_OPENINGS, WALL_T, type Side } from '../layout';
import { allInView, blendPose, ease, newOrbit, newPose, orbitPose, towerSpan, type Orbit, type Pose } from './cameraMath';

export interface CinePose extends Pose {
  /** Banking, radians: positive tips the view's left side down (a turn to the left). */
  roll: number;
}

export const newCinePose = (): CinePose => ({ ...newPose(), roll: 0 });

export function copyCinePose(a: CinePose, out: CinePose) {
  Object.assign(out, a);
  return out;
}

const smoothstep = (a: number, b: number, v: number) => {
  const k = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpAngle = (a: number, b: number, k: number) => a + angleDelta(a, b) * k;

// ---------- which intro ----------

export type IntroMotion = 'flyover' | 'glide' | 'fade';

export interface IntroPlan {
  motion: IntroMotion;
  /** Where you end up: reception in the lobby (the first visit of the day), or where you left off. */
  dest: 'reception' | 'saved';
}

/** Seconds: the repeat visit's glide, a reduced-motion fade, and the flyover's range. */
export const GLIDE_S = 1;
export const FADE_S = 0.8;
export const FLYOVER_S = { min: 4, max: 6 };

/** Whether two moments fall on the same local calendar day. */
export function sameLocalDay(a: number, b: number) {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/**
 * The intro for a visit: the first of the day flies in to reception; a repeat visit that day (or "Skip intro") glides
 * to where you left off in a second. Reduced motion keeps the destination and fades instead of flying.
 */
export function introPlan(o: { lastVisit: number | null; now: number; skipIntro: boolean; reduced: boolean }): IntroPlan {
  const first = !o.skipIntro && (o.lastVisit === null || !sameLocalDay(o.lastVisit, o.now));
  const dest = first ? 'reception' : 'saved';
  if (o.reduced) return { motion: 'fade', dest };
  return { motion: first ? 'flyover' : 'glide', dest };
}

/** Where the flyover settles: in front of reception, facing the receptionist bot. */
export const RECEPTION_SPOT = { x: RECEPTION.x, z: RECEPTION.z + RECEPTION.d / 2 + 1.5, yaw: 0, pitch: -0.08 };

// ---------- the start screen's orbit ----------

export const START_ORBIT = {
  /** Out over the blocks round the plaza, so the whole tower fits; above their roofs (cityLayout.ts tops out under 30 m). */
  dist: 62,
  /** Height above the street the camera keeps, metres, and the least it looks down. */
  clearance: 33,
  minEl: 0.3,
  /** South-east of the tower to begin with. */
  yaw: 0.7,
  minFov: 30,
  maxFov: 70,
  margin: 0.08,
};

/** The city round the plaza: anything further out than this (on either axis) may be a building up to SKYLINE tall. */
export const SAFE = { x: 42, z: 38, skyline: 30 };

/** Whether a camera at (x, y, z) (y from the street) is clear of every building round the plaza. */
export const clearOfCity = (x: number, y: number, z: number) => (Math.abs(x) < SAFE.x && Math.abs(z) < SAFE.z) || y > SAFE.skyline;

/** How the orbit runs on each graphics tier: radians a second, and how many silhouettes a lit window may show. */
export const ORBIT_TIER: Record<Tier, { speed: number; silhouettes: number }> = {
  low: { speed: 0.015, silhouettes: 0 },
  medium: { speed: 0.035, silhouettes: 1 },
  high: { speed: 0.035, silhouettes: 2 },
};

/** The tower's corners (relative to the floor you're on), balconies included. */
function towerBox(floor: number, top: number) {
  const span = towerSpan(floor, top);
  const X = BALCONY_OUT;
  const Z = HALF_D + WALL_T;
  const pts: number[] = [];
  for (const x of [-X, X]) for (const z of [-Z, Z]) for (const y of [span.bottom, span.top]) pts.push(x, y, z);
  return { span, pts };
}

/** The start orbit's field of view: the whole tower in view from its widest (diagonal) bearing, within limits. */
export function startFov(floor: number, top: number, aspect: number, scratch: Pose = newPose()) {
  const o = startOrbit(floor, top, 0, START_ORBIT.minFov, newOrbit());
  o.yaw = Math.PI / 4;
  const { pts } = towerBox(floor, top);
  let lo = START_ORBIT.minFov;
  let hi = START_ORBIT.maxFov;
  o.fov = lo;
  if (allInView(orbitPose(o, scratch), aspect, pts, START_ORBIT.margin)) return lo;
  for (let i = 0; i < 24; i++) {
    o.fov = (lo + hi) / 2;
    if (allInView(orbitPose(o, scratch), aspect, pts, START_ORBIT.margin)) hi = o.fov;
    else lo = o.fov;
  }
  return hi;
}

/**
 * On a wide screen the start card covers the left: the tower is fitted into what's left (`fitAspect`) and the view
 * turned left by `yaw`, so the tower sits right of the card, its middle `at` (-1 to 1) across the screen.
 */
export function cardFraming(fov: number, aspect: number, wide: boolean, at = 0.38) {
  if (!wide) return { fitAspect: aspect, yaw: 0 };
  const halfH = Math.atan(Math.tan((fov * Math.PI) / 360) * aspect);
  return { fitAspect: aspect * 0.55, yaw: Math.atan(at * Math.tan(halfH)) };
}

/** The start orbit `angle` radians round from where it begins, looking at the tower's lower third. */
export function startOrbit(floor: number, top: number, angle: number, fov: number, out: Orbit) {
  const { span } = towerBox(floor, top);
  const mid = (span.top - span.bottom) * 0.3;
  out.fx = 0;
  out.fz = 0;
  out.fy = span.bottom + mid;
  out.yaw = START_ORBIT.yaw + angle;
  out.el = Math.max(START_ORBIT.minEl, Math.asin(Math.min(1, Math.max(0, (START_ORBIT.clearance - mid) / START_ORBIT.dist))));
  out.dist = START_ORBIT.dist;
  out.fov = fov;
  return out;
}

// ---------- splines ----------

export interface Path {
  xs: Float64Array;
  ys: Float64Array;
  zs: Float64Array;
  /** Arc length at each sample. */
  cum: Float64Array;
  length: number;
  /** The sample each control point landed on. */
  at: number[];
}

type P3 = readonly [number, number, number];

/** Samples a centripetal Catmull-Rom spline through `pts` (no loops or cusps, even with uneven spacing). */
export function samplePath(pts: readonly P3[], perSegment = 32): Path {
  const n = pts.length;
  const ext = (a: P3, b: P3): P3 => [2 * a[0] - b[0], 2 * a[1] - b[1], 2 * a[2] - b[2]];
  const all: P3[] = [ext(pts[0], pts[1]), ...pts, ext(pts[n - 1], pts[n - 2])];
  const count = (n - 1) * perSegment + 1;
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  const zs = new Float64Array(count);
  const at: number[] = [];
  const knot = (a: P3, b: P3) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])));
  let k = 0;
  for (let s = 0; s < n - 1; s++) {
    const [p0, p1, p2, p3] = [all[s], all[s + 1], all[s + 2], all[s + 3]];
    const t1 = knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    at.push(k);
    for (let i = 0; i < perSegment || (s === n - 2 && i === perSegment); i++) {
      const t = t1 + ((t2 - t1) * i) / perSegment;
      for (let c = 0; c < 3; c++) {
        // Barry and Goldman's pyramid
        const a1 = ((t1 - t) / t1) * p0[c] + (t / t1) * p1[c];
        const a2 = ((t2 - t) / (t2 - t1)) * p1[c] + ((t - t1) / (t2 - t1)) * p2[c];
        const a3 = ((t3 - t) / (t3 - t2)) * p2[c] + ((t - t2) / (t3 - t2)) * p3[c];
        const b1 = ((t2 - t) / t2) * a1 + (t / t2) * a2;
        const b2 = ((t3 - t) / (t3 - t1)) * a2 + ((t - t1) / (t3 - t1)) * a3;
        const v = ((t2 - t) / (t2 - t1)) * b1 + ((t - t1) / (t2 - t1)) * b2;
        (c === 0 ? xs : c === 1 ? ys : zs)[k] = v;
      }
      k++;
    }
  }
  at.push(count - 1);
  const cum = new Float64Array(count);
  for (let i = 1; i < count; i++) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1], zs[i] - zs[i - 1]);
  return { xs, ys, zs, cum, length: cum[count - 1], at };
}

/** The point `d` metres along a path (clamped to its ends). */
export function pointAt(p: Path, d: number, out = { x: 0, y: 0, z: 0 }) {
  const n = p.cum.length;
  if (d <= 0) return Object.assign(out, { x: p.xs[0], y: p.ys[0], z: p.zs[0] });
  if (d >= p.length) return Object.assign(out, { x: p.xs[n - 1], y: p.ys[n - 1], z: p.zs[n - 1] });
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (p.cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const k = (d - p.cum[lo]) / Math.max(1e-9, p.cum[hi] - p.cum[lo]);
  out.x = lerp(p.xs[lo], p.xs[hi], k);
  out.y = lerp(p.ys[lo], p.ys[hi], k);
  out.z = lerp(p.zs[lo], p.zs[hi], k);
  return out;
}

/** The heading (a yaw: 0 north, -Z) of travel `d` metres along a path. */
export function headingAt(p: Path, d: number) {
  const a = pointAt(p, d - 0.5);
  const b = pointAt(p, d + 0.5);
  return Math.atan2(-(b.x - a.x), -(b.z - a.z));
}

export interface Knot {
  t: number;
  d: number;
}

/**
 * Distance along at time `t` through `knots` (rising in both): a monotone cubic (Fritsch-Carlson), so the camera never
 * backs up, starting and stopping at rest and changing speed smoothly through each knot.
 */
export function distanceAt(knots: readonly Knot[], t: number) {
  const n = knots.length;
  if (t <= knots[0].t) return knots[0].d;
  if (t >= knots[n - 1].t) return knots[n - 1].d;
  const sec: number[] = [];
  for (let i = 0; i < n - 1; i++) sec.push((knots[i + 1].d - knots[i].d) / (knots[i + 1].t - knots[i].t));
  const m: number[] = [0];
  for (let i = 1; i < n - 1; i++) m.push(sec[i - 1] * sec[i] <= 0 ? 0 : (sec[i - 1] + sec[i]) / 2);
  m.push(0);
  for (let i = 0; i < n - 1; i++) {
    if (sec[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / sec[i];
    const b = m[i + 1] / sec[i];
    const h = a * a + b * b;
    if (h > 9) {
      const tau = 3 / Math.sqrt(h);
      m[i] = tau * a * sec[i];
      m[i + 1] = tau * b * sec[i];
    }
  }
  let i = 0;
  while (t > knots[i + 1].t) i++;
  const h = knots[i + 1].t - knots[i].t;
  const s = (t - knots[i].t) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * knots[i].d + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * knots[i + 1].d + (s3 - s2) * h * m[i + 1];
}

// ---------- the flyover ----------

export interface Flight {
  path: Path;
  knots: Knot[];
  /** Seconds. */
  duration: number;
  side: Side;
  /** Distances along the path of the patio in front of the door and of the doorway. */
  patio: number;
  door: number;
  from: CinePose;
  /** What the orbit looked at: the flyover keeps it in view until it dives. */
  focus: { x: number; y: number; z: number };
  end: CinePose;
}

/** The door the flyover takes: the side wall facing the camera (east when it's dead ahead). */
export const flyoverSide = (x: number): Side => (x < 0 ? 'west' : 'east');

/**
 * The flyover from the start orbit's pose `from` (in the lobby's frame: y 0 is the street) round the tower to the
 * side door facing it, low over the plaza, through the doorway and on to reception, ending at first person's `fov`.
 */
export function flyoverFlight(from: CinePose, focus: { x: number; y: number; z: number }, fov: number): Flight {
  const side = flyoverSide(from.x);
  const s = side === 'east' ? 1 : -1;
  const doorZ = SIDE_OPENINGS.lobby[side].door;
  const doorX = s * (HALF_W + WALL_T / 2);
  const pts: P3[] = [[from.x, from.y, from.z]];
  // round the tower above the roofs (never through it or them), closing in to over the street on the door's side,
  // then down into the plaza
  const r0 = Math.hypot(from.x, from.z);
  const a0 = Math.atan2(from.x, from.z);
  const a1 = Math.atan2(s, 0.15);
  const turn = angleDelta(a0, a1);
  const steps = Math.max(1, Math.ceil(Math.abs(turn) / (Math.PI / 4)));
  const high = Math.max(from.y, SAFE.skyline + 3);
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const a = a0 + turn * k;
    const r = lerp(r0, 40, k);
    pts.push([Math.sin(a) * r, lerp(from.y, high, Math.min(1, k * 2)), Math.cos(a) * r]);
  }
  pts.push([s * 33, 22, doorZ + 5]);
  const patioAt = pts.length + 1;
  pts.push([s * 25, 4.5, doorZ + 3.2]);
  pts.push([s * (BALCONY_OUT + 1.6), EYE_HEIGHT + 0.25, doorZ + 0.6]);
  const doorAt = pts.length;
  pts.push([doorX, EYE_HEIGHT, doorZ]);
  pts.push([s * 12, EYE_HEIGHT, doorZ - 1]);
  pts.push([RECEPTION_SPOT.x + s * 4, EYE_HEIGHT, RECEPTION_SPOT.z + 1.2]);
  pts.push([RECEPTION_SPOT.x, EYE_HEIGHT, RECEPTION_SPOT.z]);
  const path = samplePath(pts);
  const patio = path.cum[path.at[patioAt]];
  const door = path.cum[path.at[doorAt]];
  const duration = Math.min(FLYOVER_S.max, Math.max(FLYOVER_S.min, 3.4 + path.length / 45));
  const knots: Knot[] = [
    { t: 0, d: 0 },
    { t: duration * 0.5, d: patio },
    { t: duration * 0.64, d: door },
    { t: duration, d: path.length },
  ];
  const end: CinePose = { x: RECEPTION_SPOT.x, y: EYE_HEIGHT, z: RECEPTION_SPOT.z, yaw: RECEPTION_SPOT.yaw, pitch: RECEPTION_SPOT.pitch, fov, near: 0.05, roll: 0 };
  return { path, knots, duration, side, patio, door, from: copyCinePose(from, newCinePose()), focus: { ...focus }, end };
}

const scratchA = { x: 0, y: 0, z: 0 };
const scratchB = { x: 0, y: 0, z: 0 };

/** Where the flyover has got to `t` seconds in. */
export function flightPose(f: Flight, t: number, out: CinePose): CinePose {
  const T = f.duration;
  const d = distanceAt(f.knots, t);
  const p = pointAt(f.path, d, scratchA);
  out.x = p.x;
  out.y = p.y;
  out.z = p.z;
  // look a few metres ahead (past the end, on along where you'll face), after keeping the tower in view at first
  const ahead = d + 7;
  const q = scratchB;
  if (ahead <= f.path.length) pointAt(f.path, ahead, q);
  else {
    const over = ahead - f.path.length;
    q.x = f.end.x - Math.sin(f.end.yaw) * over;
    q.y = f.end.y;
    q.z = f.end.z - Math.cos(f.end.yaw) * over;
  }
  const aim = (tx: number, ty: number, tz: number) => {
    const dx = out.x - tx;
    const dz = out.z - tz;
    return { yaw: Math.atan2(dx, dz), pitch: Math.atan2(ty - out.y, Math.max(1e-6, Math.hypot(dx, dz))) };
  };
  const tower = aim(f.focus.x, f.focus.y, f.focus.z);
  const road = aim(q.x, q.y, q.z);
  const dive = smoothstep(T * 0.2, T * 0.5, t);
  let yaw = lerpAngle(tower.yaw, road.yaw, dive);
  let pitch = lerp(tower.pitch, road.pitch, dive);
  const start = ease(Math.min(1, t / 0.8));
  yaw = lerpAngle(f.from.yaw, yaw, start);
  pitch = lerp(f.from.pitch, pitch, start);
  const settle = smoothstep(T - 0.9, T, t);
  out.yaw = angleDelta(0, lerpAngle(yaw, f.end.yaw, settle));
  out.pitch = lerp(pitch, f.end.pitch, settle);
  // bank into the turns, never at the start or end
  const turn = angleDelta(headingAt(f.path, d - 3), headingAt(f.path, d + 3));
  out.roll = Math.max(-BANK, Math.min(BANK, turn * 0.45)) * Math.sin(Math.PI * Math.min(1, t / T));
  const k = ease(t / T);
  out.fov = lerp(f.from.fov, f.end.fov, k);
  out.near = lerp(f.from.near, f.end.near, smoothstep(0, T * 0.45, t));
  return out;
}

/** The most the flyover banks, radians. */
export const BANK = 0.2;

/** A plain eased move from one pose to another, `k` (0 to 1) of the way: the glide and the screensaver's drift. */
export function glidePose(a: CinePose, b: CinePose, k: number, out: CinePose) {
  const e = ease(k);
  blendPose(a, b, e, out);
  out.roll = lerp(a.roll, b.roll, e);
  return out;
}

// ---------- the screensaver ----------

export const SCREENSAVER = {
  /** Minutes without input before it starts. */
  idleMs: 10 * 60_000,
  /** An ellipse inside the floor, under the ceiling, round its middle. */
  rx: HALF_W - 3.5,
  rz: HALF_D - 3.5,
  y: 3,
  look: { x: 0, y: 0.9, z: 0 },
  /** Seconds for a full turn. */
  period: 150,
  /** Seconds to drift in, and to come back. */
  drift: 3,
  back: 0.8,
};

/** Whether the view has been left alone long enough. */
export const idleDue = (lastInput: number, now: number, ms = SCREENSAVER.idleMs) => now - lastInput >= ms;

/** The screensaver may start: you're on foot in the office, not busy with anything. */
export function mayIdle(o: { started: boolean; overlay: boolean; travel: boolean; photo: boolean; firstPerson: boolean; paddle: boolean }) {
  return o.started && !o.overlay && !o.travel && !o.photo && o.firstPerson && !o.paddle;
}

/** The screensaver's angle round the ellipse nearest to (x, z), so it starts from your side of the room. */
export const screensaverStart = (x: number, z: number) => Math.atan2(x / SCREENSAVER.rx, z / SCREENSAVER.rz);

/** The screensaver's pose at `angle` round its ellipse, looking at the middle of the room. */
export function screensaverPose(angle: number, fov: number, out: CinePose) {
  const S = SCREENSAVER;
  out.x = Math.sin(angle) * S.rx;
  out.y = S.y;
  out.z = Math.cos(angle) * S.rz;
  const dx = out.x - S.look.x;
  const dz = out.z - S.look.z;
  out.yaw = Math.atan2(dx, dz);
  out.pitch = Math.atan2(S.look.y - out.y, Math.hypot(dx, dz));
  out.roll = 0;
  out.fov = fov;
  out.near = 0.05;
  return out;
}

// ---------- the elevator ride ----------

export const RIDE = {
  /** The doors closing, ms. */
  closeMs: 600,
  /** The shaft view: this much a storey, between the limits. */
  perStoreyMs: 170,
  minRideMs: 650,
  maxRideMs: 1500,
  openMs: 750,
  /** Reduced motion: a plain fade out and in (as the elevator always was). */
  reducedCloseMs: 750,
  reducedOpenMs: 650,
};

/** Storeys from the ground: the roof is the one above the top floor. */
export const storeyOf = (floor: number, top: number) => (floor === ROOF ? Math.max(0, top) + 1 : Math.max(0, floor));

export interface RideTiming {
  closeMs: number;
  rideMs: number;
  openMs: number;
}

/** How long each part of a ride from `from` to `to` takes. */
export function rideTiming(from: number, to: number, top: number, reduced: boolean): RideTiming {
  if (reduced) return { closeMs: RIDE.reducedCloseMs, rideMs: 0, openMs: RIDE.reducedOpenMs };
  const storeys = Math.abs(storeyOf(to, top) - storeyOf(from, top));
  const rideMs = Math.min(RIDE.maxRideMs, Math.max(RIDE.minRideMs, storeys * RIDE.perStoreyMs));
  return { closeMs: RIDE.closeMs, rideMs, openMs: RIDE.openMs };
}

/** A storey as the car's indicator shows it: G, a number, or R for the roof. */
export const storeyLabel = (storey: number, top: number) => (storey <= 0 ? 'G' : storey > Math.max(0, top) ? 'R' : String(storey));

/** What the indicator shows `p` (0 to 1) of the way through the shaft view: it counts storey by storey. */
export function rideCounter(from: number, to: number, top: number, p: number) {
  const a = storeyOf(from, top);
  const b = storeyOf(to, top);
  return storeyLabel(Math.round(lerp(a, b, ease(p))), top);
}

/** The destination's name, for the fade and screen readers. */
export const floorName = (floor: number) => (floor === 0 ? 'Lobby' : floor === ROOF ? 'Roof' : `Floor ${floor}`);
