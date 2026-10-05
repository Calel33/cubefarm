import { CEO_ROOM, HALF_D, HALF_W, MANAGER_ROOM, PONG_TABLE, QA_RUG, RECEPTION, ROOF, WAITING } from './layout';

// Where the idea wall's index cards sit on its canvas (IdeaWall.tsx), and which card a point on the board is over:
// pure, so drawing and aiming agree. Sizes are canvas pixels; the board is `w`×`h` with a header strip on top. And
// the named part of a floor the manager stands in, for an idea's "where" line (ideaWhere.ts).

export interface WallGrid {
  w: number;
  h: number;
  cols: number;
  rows: number;
}

export interface CardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The header strip's height: the wall's name and how to pin. */
export const headerH = (g: WallGrid) => Math.round(g.h * 0.16);
const PAD = 14;

/** Card i's rectangle, filling rows left to right from the top; null past the last slot. */
export function cardRect(g: WallGrid, i: number): CardRect | null {
  if (i < 0 || i >= g.cols * g.rows) return null;
  const top = headerH(g) + PAD;
  const cw = (g.w - PAD * (g.cols + 1)) / g.cols;
  const ch = (g.h - top - PAD * g.rows) / g.rows;
  const col = i % g.cols;
  const row = Math.floor(i / g.cols);
  return { x: PAD + col * (cw + PAD), y: top + row * (ch + PAD), w: cw, h: ch };
}

/** The card slot under canvas point (u, v), or -1 (the header, the gaps, outside). */
export function cardAt(g: WallGrid, u: number, v: number): number {
  for (let i = 0; i < g.cols * g.rows; i++) {
    const r = cardRect(g, i)!;
    if (u >= r.x && u <= r.x + r.w && v >= r.y && v <= r.y + r.h) return i;
  }
  return -1;
}

/** A point on the board's plane (metres from its middle, y up) as canvas pixels. */
export function boardToCanvas(g: WallGrid, size: [number, number], x: number, y: number): { u: number; v: number } {
  return { u: (x / size[0] + 0.5) * g.w, v: (0.5 - y / size[1]) * g.h };
}

// ---------- where the manager stands ----------

const inside = (x: number, z: number, r: { minX: number; maxX: number; minZ: number; maxZ: number }) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

/** The named part of a floor at (x, z): an office's QA lab, kitchenette or lounge, the lobby's offices and reception. */
export function areaAt(floor: number, x: number, z: number): string | null {
  if (floor === ROOF) return null;
  if (floor === 0) {
    if (inside(x, z, MANAGER_ROOM)) return "the manager's office";
    if (inside(x, z, CEO_ROOM)) return "the CEO's office";
    if (Math.abs(x - RECEPTION.x) < RECEPTION.w / 2 + 1.5 && Math.abs(z - RECEPTION.z) < 2.5) return 'reception';
    if (x > WAITING.x - 2.5 && z > 3.5) return 'the waiting area';
    if (z > HALF_D - 3 && Math.abs(x) < 3) return 'the elevator';
    return null;
  }
  if (inside(x, z, QA_RUG)) return 'the QA lab';
  if (x > HALF_W - 2.5 && z > 4) return 'the kitchenette';
  if (x < -HALF_W + 4.5 && z > 4) return 'the lounge';
  if (Math.abs(x - PONG_TABLE.x) < 3 && Math.abs(z - PONG_TABLE.z) < 2.2) return 'the ping-pong corner';
  if (z < -HALF_D + 3) return 'the whiteboard';
  if (z > HALF_D - 3 && Math.abs(x) < 3) return 'the elevator';
  if (z > -8 && z < 4.5 && Math.abs(x) < 12) return 'the desks';
  return null;
}
