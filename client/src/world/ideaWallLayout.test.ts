import { describe, expect, it } from 'vitest';
import { areaAt, boardToCanvas, cardAt, cardRect, headerH, type WallGrid } from './ideaWallLayout';
import { CEO_DESK, MANAGER_DESK, QA_LAB, ROOF } from './layout';

const g: WallGrid = { w: 1200, h: 680, cols: 4, rows: 3 };

describe('idea wall cards', () => {
  it('fills rows below the header, inside the board, without overlapping', () => {
    const rects = Array.from({ length: 12 }, (_, i) => cardRect(g, i)!);
    for (const r of rects) {
      expect(r.y).toBeGreaterThan(headerH(g));
      expect(r.x + r.w).toBeLessThanOrEqual(g.w);
      expect(r.y + r.h).toBeLessThanOrEqual(g.h);
    }
    expect(rects[1].x).toBeGreaterThan(rects[0].x + rects[0].w);
    expect(rects[4].y).toBeGreaterThan(rects[0].y + rects[0].h);
    expect(cardRect(g, 12)).toBeNull();
  });

  it('aims at the card under the crosshair, and at nothing in the header or gaps', () => {
    for (const i of [0, 5, 11]) {
      const r = cardRect(g, i)!;
      expect(cardAt(g, r.x + r.w / 2, r.y + r.h / 2)).toBe(i);
    }
    expect(cardAt(g, 600, 20)).toBe(-1);
    expect(cardAt(g, 2, 400)).toBe(-1);
  });

  it('maps the board plane to the canvas: middle to middle, top left to the origin', () => {
    expect(boardToCanvas(g, [3, 1.7], 0, 0)).toEqual({ u: 600, v: 340 });
    const tl = boardToCanvas(g, [3, 1.7], -1.5, 0.85);
    expect(tl.u).toBeCloseTo(0);
    expect(tl.v).toBeCloseTo(0);
  });
});

describe('where the manager stands', () => {
  it('names the lobby rooms and the office areas', () => {
    expect(areaAt(0, MANAGER_DESK.x, MANAGER_DESK.z + 1)).toBe("the manager's office");
    expect(areaAt(0, CEO_DESK.x, CEO_DESK.z + 1.5)).toBe("the CEO's office");
    expect(areaAt(2, QA_LAB.x - 0.5, -2)).toBe('the QA lab');
    expect(areaAt(2, 0, -10.5)).toBe('the whiteboard');
    expect(areaAt(2, -3.5, -1)).toBe('the desks');
    expect(areaAt(ROOF, 0, 0)).toBeNull();
  });
});
