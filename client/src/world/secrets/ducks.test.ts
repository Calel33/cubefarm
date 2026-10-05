import { describe, expect, it } from 'vitest';
import { collide, decorSlots, DECOR_SLOT_AT, EYE_HEIGHT, inBuilding, lobbyColliders, officeColliders, ROOF_EDGE, roofColliders, SPAWN, WALL_H, type Rect } from '../layout';
import { addFound, canHint, cleanFound, DUCK_RANGE, DUCKS, duckCount, foundLine, hintsLeft, type DuckPlace } from './ducks';
import { withSecretRoom } from './room';

const STEP = 0.2;

const collidersOf = (place: DuckPlace): Rect[] => (place === 'lobby' ? withSecretRoom(lobbyColliders(), false) : place === 'office' ? officeColliders() : roofColliders());
const inside = (place: DuckPlace, x: number, z: number) => (place === 'roof' ? Math.abs(x) < ROOF_EDGE.x && Math.abs(z) < ROOF_EDGE.z + 3 : inBuilding(x, z) || (Math.abs(x) < 1.6 && z < 15));

/** Every spot on a STEP grid the player can walk to from the elevator, by flood fill. */
function walkable(place: DuckPlace): { x: number; z: number }[] {
  const rects = collidersOf(place);
  const free = (x: number, z: number) => {
    if (!inside(place, x, z)) return false;
    const p = collide(x, z, rects);
    return Math.abs(p.x - x) < 1e-9 && Math.abs(p.z - z) < 1e-9;
  };
  const key = (i: number, j: number) => `${i},${j}`;
  const start = [Math.round(SPAWN.x / STEP), Math.round(SPAWN.z / STEP)];
  const seen = new Set([key(start[0], start[1])]);
  const queue = [start];
  const out: { x: number; z: number }[] = [];
  while (queue.length) {
    const [i, j] = queue.pop()!;
    out.push({ x: i * STEP, z: j * STEP });
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = key(i + di, j + dj);
      if (seen.has(k) || !free((i + di) * STEP, (j + dj) * STEP)) continue;
      seen.add(k);
      queue.push([i + di, j + dj]);
    }
  }
  return out;
}

describe('the rubber ducks', () => {
  it('are twenty, each with a unique id, a name and a hint', () => {
    expect(DUCKS).toHaveLength(20);
    expect(new Set(DUCKS.map((d) => d.id)).size).toBe(20);
    for (const d of DUCKS) {
      expect(d.name.length).toBeGreaterThan(3);
      expect(d.hint.length).toBeGreaterThan(10);
    }
    for (const place of ['lobby', 'office', 'roof'] as const) expect(DUCKS.some((d) => d.place === place)).toBe(true);
  });

  for (const place of ['lobby', 'office', 'roof'] as const) {
    const spots = walkable(place);
    for (const d of DUCKS.filter((x) => x.place === place)) {
      it(`${d.id} can be reached from the elevator`, () => {
        const best = Math.min(...spots.map((s) => Math.hypot(s.x - d.x, EYE_HEIGHT - (d.y + 0.1), s.z - d.z)));
        expect(best).toBeLessThanOrEqual(DUCK_RANGE - 0.2);
      });
      it(`${d.id} isn't inside a collider (it sits on top of anything under it)`, () => {
        for (const r of collidersOf(place)) {
          if (d.x > r.minX && d.x < r.maxX && d.z > r.minZ && d.z < r.maxZ) expect(d.y).toBeGreaterThanOrEqual((r.h ?? WALL_H) - 0.03);
        }
      });
      it(`${d.id} stays clear of decoration and holiday slots`, () => {
        const kind = place === 'roof' ? null : place;
        if (!kind) return;
        for (const s of decorSlots(kind)) {
          if (Math.abs(s.y - d.y) < 0.6) expect(Math.hypot(s.x - d.x, s.z - d.z)).toBeGreaterThan(0.45);
        }
        if (kind !== 'office') return;
        for (const s of Object.values(DECOR_SLOT_AT)) {
          if (s.y !== undefined) continue; // wall slots hang on the walls
          const half = Math.max(s.w, s.d) / 2 + 0.15;
          const cz = s.back ? s.z - Math.sign(s.z) * (s.d / 2) : s.z;
          const cx = s.back ? s.x - Math.sign(s.x) * (s.d / 2) : s.x;
          expect(Math.abs(d.x - cx) > half || Math.abs(d.z - cz) > half).toBe(true);
        }
      });
    }
  }

  it('keep apart from each other', () => {
    for (const a of DUCKS)
      for (const b of DUCKS) if (a !== b && a.place === b.place) expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThan(0.5);
  });
});

describe('the hunt', () => {
  it('cleans saved ids into shelf order, once each', () => {
    expect(cleanFound(['fridge', 'nope', 'reception-bot', 'fridge', 3])).toEqual(['reception-bot', 'fridge']);
    expect(cleanFound('junk')).toEqual([]);
  });
  it('adds a duck once', () => {
    const one = addFound([], 'gong');
    expect(one).toEqual(['gong']);
    expect(addFound(one, 'gong')).toBe(one);
    expect(addFound(one, 'not-a-duck')).toBe(one);
  });
  it('counts like the phone', () => expect(duckCount(['gong', 'fridge'])).toBe('🦆 2 / 20'));
  it('gives one hint to start and one more a duck', () => {
    expect(hintsLeft([], [])).toBe(1);
    expect(canHint([], [], 'gong')).toBe(true);
    expect(canHint([], ['fridge'], 'gong')).toBe(false);
    expect(hintsLeft(['fridge'], ['fridge'])).toBe(1);
    expect(canHint(['gong'], [], 'gong')).toBe(false); // already found
  });
  it('says when the fifth opens the bookshelf, and when they are all found', () => {
    expect(foundLine(5)).toMatch(/click/);
    expect(foundLine(20)).toMatch(/All 20/);
    expect(foundLine(3)).toMatch(/3 \/ 20/);
  });
});
