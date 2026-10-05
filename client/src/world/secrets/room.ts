// The secret room (#266): a cosy lounge built onto the lobby's north wall, behind a bookshelf in the manager's
// office. Pull the odd book (or find five ducks) and the bookshelf slides aside over a doorway through the wall.
// Pure layout and colliders; SecretBookshelf.tsx and SecretRoom.tsx draw them.

import { HALF_D, HALF_W, WALL_H, type Rect } from '../layout';

/** The building's north wall: its inside face is z = -HALF_D, its collider SHELL thick, drawn WALL thick. */
const SHELL = 0.4;
const WALL = 0.3;

/** The sliding bookshelf against the north wall, west of the manager's desk: `slide` is how far west it moves open. */
export const SECRET_SHELF = { x: -13.7, w: 1.4, d: 0.45, h: 2.2, slide: 1.45 };
/** The doorway through the north wall the bookshelf hides. */
export const SECRET_DOOR = { minX: -14.25, maxX: -13.15, h: 2.4 };
/** Which book is the lever: its row (0 the bottom shelf) and place along the shelf (of five). */
export const LEVER_BOOK = { row: 1, index: 3 };

/** The room inside its walls (`t` thick): from the north wall's outer face to `minZ`. */
export const SECRET_ROOM = { minX: -HALF_W - 0.1, maxX: -9.6, minZ: -17.6, maxZ: -HALF_D - WALL, t: 0.2, h: WALL_H };

// What stands in it.
/** The rubber-duck shelf along the west wall: `rows` shelves of `perRow` ducks. */
export const DUCK_SHELF = { x: SECRET_ROOM.minX + 0.22, z: -15, w: 0.42, l: 3.8, h: 2.25, rows: 4, perRow: 5 };
/** The arcade cabinet against the north wall, facing south into the room. */
export const ARCADE = { x: -14.3, z: SECRET_ROOM.minZ + 0.4, w: 0.85, d: 0.75, h: 1.9 };
/** The polaroid wall on the north wall: `cols` x `rows` photos centred on x, the middle row at y. */
export const POLAROIDS = { x: -11.6, y: 1.75, cols: 4, rows: 2, w: 0.5, h: 0.6, gap: 0.14 };
/** The lava lamp on its side table in the north-east corner. */
export const LAVA = { x: SECRET_ROOM.maxX - 0.45, z: SECRET_ROOM.minZ + 0.45, table: 0.62 };
/** The developer commentary plaque on the east wall, facing west. */
export const PLAQUE = { z: -15.1, y: 1.55, w: 1.3, h: 0.9 };
/** A little sofa against the south wall, east of the doorway, facing the polaroids. */
export const SOFA = { x: -11.4, z: SECRET_ROOM.maxZ - 0.48, w: 2.3, d: 0.9, h: 0.9 };

/** The bookshelf's collider, shut or slid open. */
export function shelfRect(open: boolean): Rect {
  const { x, w, d, h, slide } = SECRET_SHELF;
  const cx = open ? x - slide : x;
  return { minX: cx - w / 2, maxX: cx + w / 2, minZ: -HALF_D, maxZ: -HALF_D + d, h };
}

/** The room's walls and furniture (only while it's open: it isn't there otherwise). */
export function roomRects(): Rect[] {
  const r = SECRET_ROOM;
  const n = -HALF_D - SHELL;
  return [
    { minX: r.minX - r.t, maxX: r.minX, minZ: r.minZ - r.t, maxZ: n, h: r.h }, // west wall
    { minX: r.maxX, maxX: r.maxX + r.t, minZ: r.minZ - r.t, maxZ: n, h: r.h }, // east wall
    { minX: r.minX - r.t, maxX: r.maxX + r.t, minZ: r.minZ - r.t, maxZ: r.minZ, h: r.h }, // north wall
    { minX: DUCK_SHELF.x - DUCK_SHELF.w / 2, maxX: DUCK_SHELF.x + DUCK_SHELF.w / 2, minZ: DUCK_SHELF.z - DUCK_SHELF.l / 2, maxZ: DUCK_SHELF.z + DUCK_SHELF.l / 2, h: DUCK_SHELF.h },
    { minX: ARCADE.x - ARCADE.w / 2, maxX: ARCADE.x + ARCADE.w / 2, minZ: r.minZ, maxZ: ARCADE.z + ARCADE.d / 2, h: ARCADE.h },
    { minX: LAVA.x - 0.3, maxX: r.maxX, minZ: r.minZ, maxZ: LAVA.z + 0.3, h: LAVA.table },
    { minX: SOFA.x - SOFA.w / 2, maxX: SOFA.x + SOFA.w / 2, minZ: SOFA.z - SOFA.d / 2, maxZ: r.maxZ, h: SOFA.h },
  ];
}

/** Whether `r` is the building's north wall (shellColliders' first rect), which the doorway goes through. */
const isNorthWall = (r: Rect) => r.maxZ === -HALF_D && r.minZ <= -HALF_D - SHELL + 1e-9 && r.minX <= SECRET_DOOR.minX && r.maxX >= SECRET_DOOR.maxX;

/**
 * The lobby's colliders with the secret bookshelf: shut, it stands against the wall; open, it has slid aside, the
 * north wall has a doorway through it and the room is there behind it.
 */
export function withSecretRoom(rects: readonly Rect[], open: boolean): Rect[] {
  const out: Rect[] = [];
  for (const r of rects) {
    if (open && isNorthWall(r)) {
      out.push({ ...r, maxX: SECRET_DOOR.minX }, { ...r, minX: SECRET_DOOR.maxX });
    } else out.push(r);
  }
  out.push(shelfRect(open));
  if (open) out.push(...roomRects());
  return out;
}

/** Whether (x, z) is inside the secret room, past the doorway. */
export const inSecretRoom = (x: number, z: number) => x > SECRET_ROOM.minX && x < SECRET_ROOM.maxX && z > SECRET_ROOM.minZ && z < -HALF_D - SHELL / 2;

/** Where the duck in shelf place `i` (DUCKS order) sits: shelves run along z, bottom row first. */
export function shelfSpot(i: number): { x: number; y: number; z: number } {
  const row = Math.floor(i / DUCK_SHELF.perRow);
  const col = i % DUCK_SHELF.perRow;
  const step = (DUCK_SHELF.l - 0.5) / (DUCK_SHELF.perRow - 1);
  return { x: DUCK_SHELF.x + 0.04, y: 0.42 + row * 0.5, z: DUCK_SHELF.z - (DUCK_SHELF.l - 0.5) / 2 + col * step };
}

/** Where polaroid `i` hangs (row-major from the top left), facing south. */
export function polaroidSpot(i: number): { x: number; y: number } {
  const { x, y, cols, rows, w, h, gap } = POLAROIDS;
  const col = i % cols;
  const row = Math.floor(i / cols);
  return { x: x + (col - (cols - 1) / 2) * (w + gap), y: y + ((rows - 1) / 2 - row) * (h + gap) };
}

/** The lobby's little graveyard against the west wall, south of the manager's office: two columns, newest first. */
export const GRAVES = { x: -HALF_W + 0.65, z: -2.8, dx: 0.8, dz: 0.9, rows: 4, max: 8 };

/** Where gravestone `i` stands. */
export const graveSpot = (i: number) => ({ x: GRAVES.x + Math.floor(i / GRAVES.rows) * GRAVES.dx, z: GRAVES.z + (i % GRAVES.rows) * GRAVES.dz });
