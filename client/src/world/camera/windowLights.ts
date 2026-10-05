// The tower's windows as the start screen lights them: where each window of the facade's texture is (Outside.tsx draws
// one every BAY metres along each outer wall, a storey's band from WINDOW.y), and how lit a floor's windows are by how
// busy its people are. Pure, so the tests check the layout and the rules; StartWindows.tsx draws them.

import { FLOOR_HEIGHT, HALF_D, HALF_W, WALL_T, WINDOW } from '../layout';

/** The facade texture's window repeat along the walls, metres (as Outside.tsx's BAY), and the window's share of it. */
export const BAY = 5;
const WIN_X0 = 0.12;
const WIN_X1 = 0.88;

export interface FacadeWindow {
  /** The storey it's on (0 the lobby). */
  floor: number;
  /** Its middle, metres from the ground's centre; y up from the street. */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  /** Its wall's turn (a yaw): 0 faces south. */
  rotY: number;
}

const X = HALF_W + WALL_T;
const Z = HALF_D + WALL_T;
const FACES = [
  { len: 2 * X, rot: 0, x: 0, z: Z },
  { len: 2 * X, rot: Math.PI, x: 0, z: -Z },
  { len: 2 * Z, rot: Math.PI / 2, x: X, z: 0 },
  { len: 2 * Z, rot: -Math.PI / 2, x: -X, z: 0 },
];

/** Every facade window on storeys `floors`, `out` metres proud of the wall. */
export function facadeWindows(floors: readonly number[], out = 0.03): FacadeWindow[] {
  const list: FacadeWindow[] = [];
  for (const f of floors) {
    for (const face of FACES) {
      const bays = face.len / BAY;
      for (let k = 0; k + WIN_X0 < bays; k++) {
        const u0 = k + WIN_X0;
        const u1 = Math.min(k + WIN_X1, bays);
        if (u1 - u0 < 0.15) continue;
        const lx = ((u0 + u1) / 2) * BAY - face.len / 2;
        const c = Math.cos(face.rot);
        const s = Math.sin(face.rot);
        list.push({
          floor: f,
          x: face.x + lx * c + s * out,
          y: f * FLOOR_HEIGHT + WINDOW.y,
          z: face.z - lx * s + c * out,
          w: (u1 - u0) * BAY,
          h: WINDOW.h,
          rotY: face.rot,
        });
      }
    }
  }
  return list;
}

/** The storeys the facade draws (all of them but the one you're on, whose own walls and windows are there). */
export const facadeFloors = (floor: number, top: number) => Array.from({ length: Math.max(0, top) + 1 }, (_, f) => f).filter((f) => f !== floor);

/** How busy a floor is, 0 to 1: a share of its people at work (an empty floor stays dark). */
export const floorActivity = (busy: number, team: number) => (team <= 0 ? 0 : Math.min(1, busy / team));

/** The share of a floor's windows with the lights on: a few even when it's quiet, all of them when it's busy. */
export const litShare = (activity: number, team: number) => (team <= 0 ? 0.08 : 0.3 + 0.7 * activity);

/** A window's brightness when lit, 0 to 1: brighter on a busy floor, and far brighter after dark. */
export const glowLevel = (activity: number, night: number) => (0.22 + 0.25 * activity) * (1 - night) + (0.6 + 0.4 * activity) * night;

const WARM_DAY = [1, 0.95, 0.82];
const WARM_NIGHT = [1, 0.62, 0.24];
const DARK = [0.12, 0.15, 0.27];

/**
 * How a window's pane looks, written into `out` (RGB, may go over 1 so it blooms): lit, warm and brighter on a busy
 * floor; dark after dusk; not drawn at all (false) when it's unlit by day, so the facade's own glass shows.
 */
export function paneColor(lit: boolean, activity: number, night: number, out: number[]) {
  if (lit) {
    const k = 0.6 + 0.6 * glowLevel(activity, night);
    for (let c = 0; c < 3; c++) out[c] = (WARM_DAY[c] + (WARM_NIGHT[c] - WARM_DAY[c]) * night) * k;
    return true;
  }
  if (night < 0.35) return false;
  for (let c = 0; c < 3; c++) out[c] = DARK[c];
  return true;
}

/** The panes' opacity: faint by day (the lights barely show), solid at night. */
export const paneOpacity = (night: number) => 0.45 + 0.5 * night;

/** A steady pseudo-random 0..1 per window, so the same windows stay lit as the numbers change a little. */
export function windowHash(floor: number, index: number) {
  let h = Math.imul(floor + 1, 0x9e3779b1) ^ Math.imul(index + 7, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Whether window `index` (counted within its floor) is lit at `share`. */
export const isLit = (floor: number, index: number, share: number) => windowHash(floor, index) < share;

/** How many silhouettes a floor shows: one per busy person, up to `perWindow` in each lit window. */
export const silhouetteCount = (busy: number, lit: number, perWindow: number) => Math.max(0, Math.min(busy, lit * perWindow));
