import { describe, expect, it } from 'vitest';
import { FLOOR_HEIGHT, HALF_D, HALF_W, WALL_T, WINDOW } from '../layout';
import { facadeFloors, facadeWindows, floorActivity, glowLevel, isLit, litShare, paneColor, paneOpacity, silhouetteCount } from './windowLights';

describe('facadeWindows', () => {
  const list = facadeWindows([0, 2]);

  it('puts each storey a window per bay on all four walls', () => {
    const perFloor = list.filter((w) => w.floor === 0).length;
    expect(perFloor).toBeGreaterThanOrEqual(20);
    expect(list.filter((w) => w.floor === 2).length).toBe(perFloor);
  });

  it('sits on the outside of the walls, at the storey’s window height', () => {
    for (const w of list) {
      expect(w.y).toBeCloseTo(w.floor * FLOOR_HEIGHT + WINDOW.y, 6);
      expect(w.h).toBe(WINDOW.h);
      const onX = Math.abs(Math.abs(w.x) - (HALF_W + WALL_T + 0.03)) < 1e-6;
      const onZ = Math.abs(Math.abs(w.z) - (HALF_D + WALL_T + 0.03)) < 1e-6;
      expect(onX || onZ).toBe(true);
      // and within its wall's length
      if (onZ) expect(Math.abs(w.x) + w.w / 2).toBeLessThanOrEqual(HALF_W + WALL_T + 1e-6);
      if (onX) expect(Math.abs(w.z) + w.w / 2).toBeLessThanOrEqual(HALF_D + WALL_T + 1e-6);
    }
  });

  it('faces each wall outward', () => {
    for (const w of list) {
      const nx = Math.sin(w.rotY);
      const nz = Math.cos(w.rotY);
      expect(nx * w.x + nz * w.z).toBeGreaterThan(0);
    }
  });

  it('leaves out the storey you are on', () => {
    expect(facadeFloors(2, 4)).toEqual([0, 1, 3, 4]);
    expect(facadeFloors(-1, 2)).toEqual([0, 1, 2]);
  });
});

describe('lighting by activity', () => {
  it('lights more windows, brighter, the busier the floor', () => {
    expect(floorActivity(0, 0)).toBe(0);
    expect(floorActivity(3, 4)).toBe(0.75);
    expect(litShare(1, 4)).toBeGreaterThan(litShare(0, 4));
    expect(glowLevel(1, 0)).toBeGreaterThan(glowLevel(0, 0));
    expect(glowLevel(0.5, 1)).toBeGreaterThan(glowLevel(0.5, 0));
  });
  it('paints lit panes warm, unlit ones dark at night and not at all by day', () => {
    const rgb = [0, 0, 0];
    expect(paneColor(true, 1, 1, rgb)).toBe(true);
    const night = [...rgb];
    expect(night[0]).toBeGreaterThan(night[2]); // warm
    paneColor(true, 0, 1, rgb);
    expect(rgb[0]).toBeLessThan(night[0]); // a quiet floor is dimmer
    expect(paneColor(false, 1, 0, rgb)).toBe(false);
    expect(paneColor(false, 1, 1, rgb)).toBe(true);
    expect(rgb[2]).toBeLessThan(0.5);
    expect(paneOpacity(1)).toBeGreaterThan(paneOpacity(0));
  });
  it('keeps the same windows lit as a floor gets busier', () => {
    for (let i = 0; i < 40; i++) if (isLit(3, i, 0.4)) expect(isLit(3, i, 0.8)).toBe(true);
    const lit = Array.from({ length: 200 }, (_, i) => isLit(1, i, 0.5)).filter(Boolean).length;
    expect(lit).toBeGreaterThan(70);
    expect(lit).toBeLessThan(130);
  });
  it('shows a silhouette per busy person, as the lit windows allow', () => {
    expect(silhouetteCount(5, 10, 1)).toBe(5);
    expect(silhouetteCount(5, 2, 1)).toBe(2);
    expect(silhouetteCount(5, 2, 2)).toBe(4);
    expect(silhouetteCount(5, 10, 0)).toBe(0);
  });
});
