// The rubber duck hunt (#266): twenty ducks hand-placed round the building, and the hunt's pure rules. Every office
// floor shares the office ducks (find one on any floor and it's found everywhere). Positions are on the floor you're
// on: x/z as in layout.ts, y the height of whatever the duck sits on. ducks.test.ts checks each one can be reached,
// isn't buried in a collider and stays clear of decorations and theme slots.

import { APP_SCREEN, BALCONY, BALCONY_OUT, GONG, HALF_D, HALF_W, JUKEBOX, PICNIC, PLANTER, RECEPTION, ROOF_HUT, TREE_PLANTERS, TROPHY_SHELF, WAITING_TABLE, WINDSOCK } from '../layout';

export type DuckPlace = 'lobby' | 'office' | 'roof';

export interface Duck {
  id: string;
  place: DuckPlace;
  x: number;
  y: number;
  z: number;
  /** Which way it looks (radians about y; 0 faces south, +z). */
  rotY: number;
  /** What the phone calls it once found. */
  name: string;
  /** The hint the phone can unlock while it's still hidden. */
  hint: string;
  /** Its colour on the shelf and in the world: most are yellow, a few are not. */
  color: string;
}

const YELLOW = '#ffd23f';

/** The twenty ducks. Order is the shelf's order in the secret room. */
export const DUCKS: readonly Duck[] = [
  // ---------- the lobby ----------
  { id: 'reception-bot', place: 'lobby', x: RECEPTION.x + 0.14, y: 1.88, z: RECEPTION.z - 0.08, rotY: 0, name: "The receptionist's hat", hint: 'One duck has a very cheerful head to sit on.', color: YELLOW },
  { id: 'trophy-cabinet', place: 'lobby', x: 10.3, y: 2.1, z: -11.0, rotY: 0.3, name: 'Top of the trophy cabinet', hint: 'One duck thinks it deserves a trophy too.', color: '#ffb703' },
  { id: 'jukebox-gap', place: 'lobby', x: 8.1, y: 0, z: HALF_D - 0.3, rotY: Math.PI, name: 'Between the jukebox and the coffee', hint: 'One duck likes music with its coffee.', color: YELLOW },
  { id: 'corner-plant', place: 'lobby', x: -14.55, y: 0, z: HALF_D - 0.35, rotY: 0.8, name: 'Behind the corner plant', hint: 'One duck is hiding in the leafiest corner by the blasters.', color: '#80ed99' },
  { id: 'waiting-table', place: 'lobby', x: WAITING_TABLE.x, y: 0.5, z: WAITING_TABLE.z - 0.18, rotY: -Math.PI / 2, name: 'In the waiting room', hint: "One duck is waiting for an interview that'll never come.", color: YELLOW },
  { id: 'patio-planter', place: 'lobby', x: -(BALCONY_OUT - BALCONY.railT - PLANTER.w / 2), y: PLANTER.h, z: 10.3, rotY: Math.PI / 2, name: 'In a planter on the patio', hint: 'One duck went outside for some fresh air.', color: YELLOW },
  { id: 'manager-shelf', place: 'lobby', x: -15.5, y: 2.2, z: -9.8, rotY: Math.PI / 2, name: "On top of the manager's bookshelf", hint: 'One duck reads over the manager’s shoulder, from very high up.', color: '#4cc9f0' },
  { id: 'trophy-shelf', place: 'lobby', x: TROPHY_SHELF.x - 0.85, y: TROPHY_SHELF.h, z: TROPHY_SHELF.z, rotY: Math.PI, name: 'On top of the trophy shelf', hint: 'One duck sits above all the achievements.', color: YELLOW },
  { id: 'ceo-plant', place: 'lobby', x: 7.1, y: 0, z: -4.75, rotY: -0.6, name: "In the CEO's office", hint: 'One duck reports straight to the CEO.', color: '#9b5de5' },
  // ---------- every office floor ----------
  { id: 'water-cooler', place: 'office', x: HALF_W - 0.5, y: 1.5, z: -9.5, rotY: -Math.PI / 2, name: 'On the water cooler', hint: 'One duck gossips where the water is.', color: YELLOW },
  { id: 'gong', place: 'office', x: GONG.x + 0.55, y: GONG.h, z: GONG.z, rotY: 0, name: 'On top of the merge gong', hint: 'One duck waits for the next merge, ears covered.', color: '#ff8a5b' },
  { id: 'jukebox-top', place: 'office', x: JUKEBOX.officeX, y: JUKEBOX.h, z: HALF_D - JUKEBOX.d / 2 - 0.05, rotY: 0, name: 'On the office jukebox', hint: 'One duck is the floor’s DJ.', color: YELLOW },
  { id: 'couch-end', place: 'office', x: -HALF_W + 0.4, y: 0, z: 8.45, rotY: Math.PI / 4, name: 'At the end of the couch', hint: 'One duck fell down the side of the sofa.', color: '#f15bb5' },
  { id: 'balcony-planter', place: 'office', x: BALCONY_OUT - BALCONY.railT - PLANTER.w / 2, y: PLANTER.h, z: -10.3, rotY: -Math.PI / 2, name: 'In a balcony planter', hint: 'One duck enjoys the view from a balcony.', color: YELLOW },
  { id: 'app-monitor', place: 'office', x: APP_SCREEN.x - 0.9, y: APP_SCREEN.y + APP_SCREEN.h / 2 + APP_SCREEN.bezel, z: -HALF_D + APP_SCREEN.depth / 2, rotY: 0, name: 'On top of the app monitor', hint: 'One duck keeps an eye on the app from above.', color: YELLOW },
  { id: 'fridge', place: 'office', x: HALF_W - 0.45, y: 2.0, z: 9.45, rotY: -Math.PI / 2, name: 'On top of the fridge', hint: 'One duck is keeping cool, very high up in the kitchen.', color: '#e9ecef' },
  // ---------- the roof ----------
  { id: 'hut-top', place: 'roof', x: 1.75, y: ROOF_HUT.h, z: HALF_D + 0.15, rotY: 0, name: 'On top of the elevator hut', hint: 'One duck enjoys the view from very high up.', color: YELLOW },
  { id: 'tree-planter', place: 'roof', x: TREE_PLANTERS[0].x + 0.35, y: TREE_PLANTERS[0].h, z: TREE_PLANTERS[0].z + 0.35, rotY: 0.4, name: 'Under the little tree on the roof', hint: 'One duck sits in the shade of a rooftop tree.', color: YELLOW },
  { id: 'picnic', place: 'roof', x: PICNIC.x - 0.6, y: PICNIC.h + 0.035, z: PICNIC.z, rotY: 0, name: 'On the picnic table', hint: 'One duck is waiting for the barbecue.', color: '#ef476f' },
  { id: 'windsock', place: 'roof', x: WINDSOCK.x, y: 0, z: WINDSOCK.z + 0.45, rotY: Math.PI / 2, name: 'At the foot of the windsock', hint: 'One duck checks which way the wind blows.', color: YELLOW },
];

/** How close (eye to duck) you need to be to pick one up. */
export const DUCK_RANGE = 3;
/** Ducks found that open the bookshelf by themselves. */
export const DUCKS_TO_OPEN = 5;

const BY_ID = new Map(DUCKS.map((d) => [d.id, d]));
export const duckById = (id: string) => BY_ID.get(id);
export const isDuckId = (id: unknown): id is string => typeof id === 'string' && BY_ID.has(id);

/** The ids from saved storage that are still ducks, once each, in shelf order. */
export function cleanFound(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const got = new Set(raw.filter(isDuckId));
  return DUCKS.filter((d) => got.has(d.id)).map((d) => d.id);
}

/** Adds a duck to the found list; the same list back when it was already there (or isn't a duck). */
export function addFound(found: readonly string[], id: string): readonly string[] {
  if (!isDuckId(id) || found.includes(id)) return found;
  return cleanFound([...found, id]);
}

/** The phone's counter. */
export const duckCount = (found: readonly string[]) => `🦆 ${found.length} / ${DUCKS.length}`;

/**
 * How many hints you may unlock: one to start, and one more for every duck found. Hints already unlocked for ducks
 * you've since found still count as used.
 */
export const hintsLeft = (found: readonly string[], hinted: readonly string[]) => Math.max(0, 1 + found.length - hinted.length);

/** Whether a hint for `id` can be unlocked now. */
export const canHint = (found: readonly string[], hinted: readonly string[], id: string) =>
  isDuckId(id) && !found.includes(id) && !hinted.includes(id) && hintsLeft(found, hinted) > 0;

/** What finding duck number `n` (1-based) says. */
export function foundLine(n: number): string {
  if (n >= DUCKS.length) return `🦆 All ${DUCKS.length} ducks found! You are the office's champion duck hunter.`;
  if (n === DUCKS_TO_OPEN) return `🦆 ${n} / ${DUCKS.length}: …did something just click in the manager's office?`;
  return `🦆 Squeak! ${n} / ${DUCKS.length} rubber ducks found`;
}

/** Ducks that live where you are now. */
export const ducksIn = (place: DuckPlace) => DUCKS.filter((d) => d.place === place);
