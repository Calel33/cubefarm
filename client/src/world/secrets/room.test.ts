import { describe, expect, it } from 'vitest';
import { collide, HALF_D, lobbyColliders, type Rect } from '../layout';
import { ARCADE, graveSpot, GRAVES, inSecretRoom, PLAQUE, polaroidSpot, POLAROIDS, SECRET_DOOR, SECRET_ROOM, SECRET_SHELF, shelfRect, shelfSpot, withSecretRoom, DUCK_SHELF } from './room';

/** Walks the player north from the manager's office through the doorway, a small step at a time. */
function walkNorth(rects: Rect[]) {
  let p = { x: (SECRET_DOOR.minX + SECRET_DOOR.maxX) / 2, z: -10.5 };
  for (let i = 0; i < 200; i++) p = collide(p.x, p.z - 0.03, rects);
  return p;
}

describe('the secret room', () => {
  it('is shut behind the bookshelf until it opens', () => {
    expect(inSecretRoom(walkNorth(withSecretRoom(lobbyColliders(), false)).x, walkNorth(withSecretRoom(lobbyColliders(), false)).z)).toBe(false);
    const p = walkNorth(withSecretRoom(lobbyColliders(), true));
    expect(inSecretRoom(p.x, p.z)).toBe(true);
    expect(p.z).toBeGreaterThan(SECRET_ROOM.minZ); // the room's north wall stops you
  });

  it('hides the doorway behind the shut bookshelf, and clears it open', () => {
    const shut = shelfRect(false);
    expect(shut.minX).toBeLessThan(SECRET_DOOR.minX);
    expect(shut.maxX).toBeGreaterThan(SECRET_DOOR.maxX);
    const open = shelfRect(true);
    expect(open.maxX).toBeLessThan(SECRET_DOOR.minX);
    expect(open.minX).toBeGreaterThan(-16); // still inside the manager's office
  });

  it('only cuts the doorway into the north wall while open', () => {
    const shut = withSecretRoom(lobbyColliders(), false);
    expect(shut.length).toBe(lobbyColliders().length + 1);
    const open = withSecretRoom(lobbyColliders(), true);
    const north = open.filter((r) => r.maxZ === -HALF_D && r.minZ < -HALF_D);
    expect(north.some((r) => r.maxX === SECRET_DOOR.minX)).toBe(true);
    expect(north.some((r) => r.minX === SECRET_DOOR.maxX)).toBe(true);
  });

  it('fits its things inside its walls', () => {
    const r = SECRET_ROOM;
    for (let i = 0; i < DUCK_SHELF.rows * DUCK_SHELF.perRow; i++) {
      const s = shelfSpot(i);
      expect(s.z).toBeGreaterThan(DUCK_SHELF.z - DUCK_SHELF.l / 2);
      expect(s.z).toBeLessThan(DUCK_SHELF.z + DUCK_SHELF.l / 2);
      expect(s.y).toBeLessThan(DUCK_SHELF.h);
    }
    for (let i = 0; i < POLAROIDS.cols * POLAROIDS.rows; i++) {
      const p = polaroidSpot(i);
      expect(p.x - POLAROIDS.w / 2).toBeGreaterThan(ARCADE.x + ARCADE.w / 2);
      expect(p.x + POLAROIDS.w / 2).toBeLessThan(r.maxX - 0.6);
    }
    expect(PLAQUE.z).toBeGreaterThan(r.minZ);
    expect(PLAQUE.z).toBeLessThan(-HALF_D - 0.3);
    expect(SECRET_SHELF.x).toBeGreaterThan(r.minX);
  });

  it('keeps the graveyard in the lobby, south of the manager’s office', () => {
    for (let i = 0; i < GRAVES.max; i++) {
      const g = graveSpot(i);
      expect(g.z).toBeGreaterThan(-3.5);
      expect(g.x).toBeGreaterThan(-16);
      expect(g.x).toBeLessThan(-13.5); // clear of the holiday showpiece slot
    }
  });
});
