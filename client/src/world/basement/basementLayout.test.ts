import { describe, expect, it } from 'vitest';
import {
  BASEMENT,
  HALF_D,
  HALF_W,
  KEEPER,
  LOG_CRT,
  MAX_RACKS,
  PLAYER_RADIUS,
  POWER_WALL,
  RACK,
  RACK_ROWS,
  RACK_SEGMENTS,
  RACKS_PER_SEGMENT,
  ROOF,
  SPAWN,
  TRAY,
  VENTS,
  WALL_H,
  basementColliders,
  collide,
  rackRowRect,
  rackSpot,
  segmentSide,
  segmentZ,
  surfaceAt,
  type Rect,
} from '../layout';

const R = PLAYER_RADIUS;
const inside = (p: { x: number; z: number }, b: Rect, grow = 0) => p.x > b.minX - grow && p.x < b.maxX + grow && p.z > b.minZ - grow && p.z < b.maxZ + grow;
const overlap = (a: Rect, b: Rect) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
const full = Array.from({ length: RACK_SEGMENTS }, () => RACKS_PER_SEGMENT);

describe('the basement server room', () => {
  it('is its own stop, below the lobby and apart from the roof', () => {
    expect(BASEMENT).toBeLessThan(0);
    expect(BASEMENT).not.toBe(ROOF);
    expect(MAX_RACKS).toBe(RACKS_PER_SEGMENT * RACK_SEGMENTS);
    expect(MAX_RACKS).toBeGreaterThanOrEqual(1 + 10 * 16); // the big company, the CEO and every floor's main preview
  });

  it('stands every rack inside the walls, side by side along its row without touching', () => {
    for (let s = 0; s < RACK_SEGMENTS; s++) {
      for (let k = 0; k < RACKS_PER_SEGMENT; k++) {
        const p = rackSpot(s, k);
        expect(Math.abs(p.x) + RACK.w / 2).toBeLessThan(HALF_W - 2 * R);
        expect(Math.abs(p.z) + RACK.d / 2).toBeLessThan(HALF_D);
        expect(Math.abs(p.x)).toBeGreaterThan(RACK_ROWS.in);
      }
      expect(Math.abs(rackSpot(s, 1).x - rackSpot(s, 0).x)).toBeGreaterThan(RACK.w);
      expect(segmentSide(s) * rackSpot(s, 0).x).toBeGreaterThan(0);
    }
    // a row's solid covers exactly its racks
    const r = rackRowRect(1, 3)!;
    expect(r.minX).toBeCloseTo(rackSpot(1, 0).x - RACK.w / 2);
    expect(r.maxX).toBeCloseTo(rackSpot(1, 2).x + RACK.w / 2);
    expect(rackRowRect(0, 0)).toBeNull();
  });

  it('leaves aisles wide enough to walk between the rows, round their ends and down the middle', () => {
    const zs = [...RACK_ROWS.zs].sort((a, b) => a - b);
    for (let i = 1; i < zs.length; i++) expect(zs[i] - zs[i - 1] - RACK.d).toBeGreaterThan(2 * R + 0.6);
    expect(HALF_D + Math.min(...zs) - RACK.d / 2).toBeGreaterThan(2 * R + 0.3); // behind the back row
    expect(HALF_W - RACK_ROWS.out).toBeGreaterThan(2 * R + 0.4);
    expect(RACK_ROWS.in - KEEPER.w / 2).toBeGreaterThan(0);
    // standing in front of any rack, you're clear of everything
    const solids = basementColliders(full);
    for (let s = 0; s < RACK_SEGMENTS; s++) {
      const p = rackSpot(s, 4);
      const front = { x: p.x, z: p.z + RACK.d / 2 + 0.5 };
      expect(collide(front.x, front.z, solids)).toEqual(front);
    }
  });

  it('keeps the keeper, the power wall and the log clear of the racks and of the elevator', () => {
    const solids = basementColliders(full);
    expect(collide(SPAWN.x, SPAWN.z, solids)).toEqual({ x: SPAWN.x, z: SPAWN.z });
    const rows = full.map((n, s) => rackRowRect(s, n)!);
    const keeper: Rect = { minX: KEEPER.x - KEEPER.w / 2, maxX: KEEPER.x + KEEPER.w / 2, minZ: KEEPER.z - KEEPER.d / 2, maxZ: KEEPER.z + KEEPER.d / 2 };
    const pw = POWER_WALL;
    const lever: Rect = { minX: -HALF_W, maxX: -HALF_W + pw.lever.d, minZ: pw.lever.z - pw.lever.w / 2, maxZ: pw.lever.z + pw.lever.w / 2 };
    const log: Rect = { minX: HALF_W - LOG_CRT.desk.d, maxX: HALF_W, minZ: LOG_CRT.z - LOG_CRT.desk.w / 2, maxZ: LOG_CRT.z + LOG_CRT.desk.w / 2 };
    for (const thing of [keeper, lever, log]) for (const r of rows) expect(overlap(thing, r)).toBe(false);
    // room to walk out of the elevator round the keeper
    expect(HALF_D - (KEEPER.z + KEEPER.d / 2)).toBeGreaterThan(2 * R + 1);
    // the gauge, the display and the lever sit side by side on the wall, under the ceiling
    expect(pw.lever.z + pw.lever.w / 2).toBeLessThan(pw.gauge.z - pw.gauge.r);
    expect(pw.gauge.z + pw.gauge.r).toBeLessThan(pw.display.z - pw.display.w / 2);
    expect(pw.display.z + pw.display.w / 2).toBeLessThan(HALF_D);
    expect(pw.gauge.y + pw.gauge.r).toBeLessThan(WALL_H);
    // and the trays clear the racks and your head
    expect(TRAY.y - TRAY.h / 2).toBeGreaterThan(RACK.h);
    expect(TRAY.y - TRAY.h / 2).toBeGreaterThan(2);
  });

  it('puts the vents in the cold aisles, never under a rack', () => {
    const rows = full.map((n, s) => rackRowRect(s, n)!);
    expect(VENTS.length).toBeGreaterThan(6);
    for (const v of VENTS) for (const r of rows) expect(inside(v, r, 0.3)).toBe(false);
    for (const v of VENTS) expect(RACK_ROWS.zs.some((z) => v.z > z + RACK.d / 2)).toBe(true);
    expect(segmentZ(0)).toBe(RACK_ROWS.zs[0]);
  });

  it('sounds like the lobby underfoot (raised tiles), and the cabin past the doors', () => {
    expect(surfaceAt('basement', 5, 0)).toBe('lobby');
    expect(surfaceAt('basement', 0, HALF_D + 1)).toBe('cabin');
  });
});
