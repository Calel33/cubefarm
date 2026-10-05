// The street's pure rules (#264): the food truck's rotating menu and its orders, the people walking by on the pavements
// (their routes, the crossings they wait at, how many by graphics tier), the pigeons that scatter when you walk at
// them, and the newsstand's headlines from the office's day. No three.js: Street.tsx and its parts run them every frame
// on objects made once, and the tests check them.

import type { Tier } from '../gfx/quality';
import type { Pt } from '../toys/roombaBrain';
import { CROSSINGS, PAVEMENT, PIGEON_HOME, type Crossing } from './plaza';

// ---------- the food truck ----------

export type Dish = 'taco' | 'bao' | 'gelato';
export const DISHES: readonly Dish[] = ['taco', 'bao', 'gelato'];

export const MENU: Record<Dish, { name: string; emoji: string; bites: number; blurb: string }> = {
  taco: { name: 'Tacos', emoji: '🌮', bites: 3, blurb: 'al pastor, pineapple, lime' },
  bao: { name: 'Bao', emoji: '🥟', bites: 3, blurb: 'pork belly, pickles, peanut' },
  gelato: { name: 'Gelato', emoji: '🍨', bites: 4, blurb: 'pistachio and stracciatella' },
};

/** Minutes each dish is on before the next: the menu rotates through the three all day. */
export const MENU_MINUTES = 3;
/** Seconds from ordering to the food in your hands. */
export const COOK_SECONDS = 1.6;

/** What the truck is serving at `now` (ms). */
export function dishAt(now: number): Dish {
  return DISHES[Math.floor(now / 60000 / MENU_MINUTES) % DISHES.length];
}

/** Seconds until the menu moves on to the next dish. */
export function menuChangesIn(now: number) {
  const period = MENU_MINUTES * 60000;
  return Math.ceil((period - (now % period)) / 1000);
}

export interface Truck {
  /** performance.now()-style seconds the current order was placed, or null. */
  since: number | null;
  dish: Dish;
}

export type TruckState = 'open' | 'cooking' | 'ready';

export const truckState = (t: Truck, now: number): TruckState => (t.since === null ? 'open' : now - t.since < COOK_SECONDS ? 'cooking' : 'ready');

/**
 * E at the hatch: an order goes in (`order`), unless one's cooking (`busy`) or your hands are full (`full`). Food's
 * always free: coins are each floor's own, earned by its merges, and only the catalogue spends them.
 */
export function orderAt(t: Truck, now: number, dish: Dish, handsFull: boolean): { op: 'order' | 'busy' | 'full'; truck: Truck } {
  if (t.since !== null) return { op: 'busy', truck: t };
  if (handsFull) return { op: 'full', truck: t };
  return { op: 'order', truck: { since: now, dish } };
}

export function truckLabel(state: TruckState, dish: Dish) {
  const d = MENU[dish];
  return state === 'open' ? `${d.emoji} Order ${d.name.toLowerCase()}` : `${d.emoji} Cooking…`;
}

// ---------- people walking by ----------

/** A walk round the block (or over the road and back): its corners, and which legs cross a road. */
export interface Route {
  pts: Pt[];
  /** Per leg (pts[i] to pts[i + 1], the last back to pts[0]): the crossing it goes over, or null. */
  cross: (Crossing['id'] | null)[];
  /** Each leg's length, and the whole loop's. */
  lens: number[];
  total: number;
}

function route(pts: Pt[], cross: (Crossing['id'] | null)[]): Route {
  const lens = pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return Math.hypot(q.x - p.x, q.z - p.z);
  });
  return { pts, cross, lens, total: lens.reduce((a, b) => a + b, 0) };
}

const reversed = (r: Route) => route([...r.pts].reverse(), r.pts.map((_, i) => r.cross[(r.pts.length * 2 - 2 - i) % r.pts.length]));

/** The far pavement across the west road, where crossers walk. */
export const FAR_X = CROSSINGS[0].far - 0.8;

/** The routes: round the block either way, and round by the far pavement, over both zebra crossings, either way. */
export function routes(): Route[] {
  const X = PAVEMENT.x;
  const Z = PAVEMENT.z;
  const block = route(
    [
      { x: -X, z: -Z },
      { x: X, z: -Z },
      { x: X, z: Z },
      { x: -X, z: Z },
    ],
    [null, null, null, null],
  );
  const over = route(
    [
      { x: -X, z: -Z },
      { x: FAR_X, z: -Z },
      { x: FAR_X, z: Z },
      { x: -X, z: Z },
      { x: X, z: Z },
      { x: X, z: -Z },
    ],
    ['nw', null, 'sw', null, null, null],
  );
  return [block, reversed(block), over, reversed(over)];
}

/** How many walk by on each graphics tier: none on Low (the plaza stays still and cheap). */
export const PEDESTRIANS: Record<Tier, number> = { low: 0, medium: 8, high: 14 };
export const pedestrianCap = (tier: Tier) => PEDESTRIANS[tier];

export interface Pedestrian {
  route: number;
  leg: number;
  /** Metres along the leg. */
  d: number;
  /** m/s while walking. */
  speed: number;
  /** Seconds waited (at a kerb or for someone in the way). */
  waited: number;
  walking: boolean;
  /** On a crossing's stripes right now. */
  crossing: boolean;
  /** Their look: an index into the palette. */
  look: number;
}

/** n people spread round the routes, each with their own pace and look (`rand` in [0, 1)). */
export function spawnPedestrians(n: number, rs: readonly Route[], rand: () => number): Pedestrian[] {
  return Array.from({ length: n }, (_, i) => {
    const r = i % rs.length;
    let d = rand() * rs[r].total;
    let leg = 0;
    while (d > rs[r].lens[leg]) d -= rs[r].lens[leg++];
    // nobody starts out in the road
    if (rs[r].cross[leg]) d = 0;
    return { route: r, leg, d, speed: 1.05 + rand() * 0.45, waited: 0, walking: true, crossing: false, look: Math.floor(rand() * 1000) };
  });
}

/** How close (m) someone comes to the player (or the person ahead) before stopping for them. */
export const PERSONAL = 0.8;

/**
 * One step for someone walking by: along their leg, waiting at the kerb until the crossing's light is green (`green`),
 * and for the player standing in their way (`player`). Once on a crossing they keep going.
 */
export function stepPedestrian(p: Pedestrian, r: Route, dt: number, green: (id: Crossing['id']) => boolean, player: Pt | null, at: { x: number; z: number; heading: number }) {
  const cross = r.cross[p.leg];
  if (cross && p.d === 0 && !green(cross)) {
    p.walking = false;
    p.crossing = false;
    p.waited += dt;
    return pedestrianAt(p, r, at);
  }
  pedestrianAt(p, r, at);
  // a step ahead of them: is the player standing there? A few seconds, then they squeeze past.
  const ax = at.x - Math.sin(at.heading) * 0.6;
  const az = at.z - Math.cos(at.heading) * 0.6;
  const blocked = !!player && !cross && Math.hypot(player.x - ax, player.z - az) < PERSONAL;
  if (blocked && p.waited < 4) {
    p.walking = false;
    p.waited += dt;
    return at;
  }
  p.walking = true;
  if (!blocked) p.waited = 0;
  p.crossing = !!cross;
  p.d += p.speed * dt;
  while (p.d >= r.lens[p.leg]) {
    p.d -= r.lens[p.leg];
    p.leg = (p.leg + 1) % r.pts.length;
    if (r.cross[p.leg]) {
      p.d = 0; // at the kerb: the light decides
      break;
    }
  }
  return pedestrianAt(p, r, at);
}

/** Where someone is along their route, and their heading (body.ts: 0 faces -z). Written into `at`. */
export function pedestrianAt(p: Pedestrian, r: Route, at: { x: number; z: number; heading: number }) {
  const a = r.pts[p.leg];
  const b = r.pts[(p.leg + 1) % r.pts.length];
  const len = r.lens[p.leg] || 1;
  const k = Math.min(1, p.d / len);
  at.x = a.x + (b.x - a.x) * k;
  at.z = a.z + (b.z - a.z) * k;
  at.heading = Math.atan2(-(b.x - a.x), -(b.z - a.z));
  return at;
}

// ---------- pigeons ----------

export type PigeonState = 'peck' | 'fly' | 'away' | 'back';

export interface Pigeon {
  /** Where it pecks about, and where it is. */
  hx: number;
  hz: number;
  x: number;
  z: number;
  y: number;
  heading: number;
  state: PigeonState;
  /** Seconds into its flight, or left to wait. */
  t: number;
  /** A flight's start and end. */
  fx: number;
  fz: number;
  tx: number;
  tz: number;
  /** Seconds until its next little hop while pecking. */
  hop: number;
}

export const PIGEONS = {
  count: 7,
  /** Walk within this of one (or run within twice it) and it's off. */
  scare: 1.8,
  /** The whole flock goes when one does, if it's within this of you. */
  flock: 4.5,
  /** How far they fly, how long it takes, how high they go. */
  flee: [5, 9] as const,
  flight: 1.5,
  height: 2.6,
  /** Seconds before they come back, as long as you're not still standing on their spot. */
  away: [7, 14] as const,
};

export function spawnPigeons(rand: () => number, n = PIGEONS.count): Pigeon[] {
  return Array.from({ length: n }, () => {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * PIGEON_HOME.r;
    const hx = PIGEON_HOME.x + Math.cos(a) * r;
    const hz = PIGEON_HOME.z + Math.sin(a) * r;
    return { hx, hz, x: hx, z: hz, y: 0, heading: rand() * Math.PI * 2, state: 'peck', t: 0, fx: hx, fz: hz, tx: hx, tz: hz, hop: 1 + rand() * 4 };
  });
}

/** Whether the player at `p`, walking at `speed` m/s, scares a pigeon `d` metres away. */
export const scares = (d: number, speed: number) => (speed > 0.4 && d < PIGEONS.scare) || (speed > 4 && d < PIGEONS.scare * 2) || d < 0.6;

function flyTo(b: Pigeon, tx: number, tz: number, state: 'fly' | 'back') {
  b.state = state;
  b.t = 0;
  b.fx = b.x;
  b.fz = b.z;
  b.tx = tx;
  b.tz = tz;
  b.heading = Math.atan2(-(tx - b.x), -(tz - b.z));
}

/**
 * The flock for one step: pecking and hopping about, off in a flurry away from you when you walk at them (all within
 * `flock` of you go at once), down a little way off, and back once you've moved on. Returns how many took off.
 */
export function stepPigeons(flock: Pigeon[], dt: number, player: Pt & { speed: number }, rand: () => number): number {
  let scattered = 0;
  const startled = flock.some((b) => b.state === 'peck' && scares(Math.hypot(b.x - player.x, b.z - player.z), player.speed));
  for (const b of flock) {
    const d = Math.hypot(b.x - player.x, b.z - player.z);
    switch (b.state) {
      case 'peck': {
        if (startled && d < PIGEONS.flock) {
          const away = Math.atan2(b.z - player.z, b.x - player.x) + (rand() - 0.5) * 1.2;
          const far = PIGEONS.flee[0] + rand() * (PIGEONS.flee[1] - PIGEONS.flee[0]);
          flyTo(b, b.x + Math.cos(away) * far, b.z + Math.sin(away) * far, 'fly');
          scattered++;
          break;
        }
        b.hop -= dt;
        if (b.hop <= 0) {
          // a little hop to somewhere else on their patch
          const a = rand() * Math.PI * 2;
          const r = Math.sqrt(rand()) * PIGEON_HOME.r;
          b.tx = PIGEON_HOME.x + Math.cos(a) * r;
          b.tz = PIGEON_HOME.z + Math.sin(a) * r;
          b.hop = 1.5 + rand() * 4;
        }
        const dx = b.tx - b.x;
        const dz = b.tz - b.z;
        const dd = Math.hypot(dx, dz);
        if (dd > 0.02) {
          const step = Math.min(dd, 0.45 * dt);
          b.x += (dx / dd) * step;
          b.z += (dz / dd) * step;
          b.heading = Math.atan2(-dx, -dz);
        }
        b.y = 0;
        break;
      }
      case 'fly':
      case 'back': {
        b.t += dt;
        const k = Math.min(1, b.t / PIGEONS.flight);
        b.x = b.fx + (b.tx - b.fx) * k;
        b.z = b.fz + (b.tz - b.fz) * k;
        b.y = Math.sin(k * Math.PI) * PIGEONS.height;
        if (k >= 1) {
          b.y = 0;
          if (b.state === 'fly') {
            b.state = 'away';
            b.t = PIGEONS.away[0] + rand() * (PIGEONS.away[1] - PIGEONS.away[0]);
          } else {
            b.state = 'peck';
            b.hop = 1 + rand() * 3;
            b.tx = b.x;
            b.tz = b.z;
          }
        }
        break;
      }
      case 'away':
        b.t -= dt;
        // home once you've gone (or wandered well off their patch)
        if (b.t <= 0 && Math.hypot(PIGEON_HOME.x - player.x, PIGEON_HOME.z - player.z) > PIGEON_HOME.r + 3) flyTo(b, b.hx, b.hz, 'back');
        break;
    }
  }
  return scattered;
}

// ---------- the newsstand ----------

interface NewsRepo {
  floor: number;
  pulls: readonly { state: string; mergedAt: string | null }[];
  issues: readonly unknown[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The day's headlines from what the office has been up to: shipped features, PRs in review, people at work. */
export function headlines(repos: readonly NewsRepo[], agents: readonly { status: string }[], now: number, company = 'cubefarm'): string[] {
  const out: string[] = [];
  const day = 24 * 3600 * 1000;
  const floors = [...repos].sort((a, b) => a.floor - b.floor);
  for (const r of floors) {
    const shipped = r.pulls.filter((p) => p.state === 'MERGED' && p.mergedAt && now - Date.parse(p.mergedAt) < day).length;
    if (shipped) out.push(`Floor ${r.floor} ships ${plural(shipped, 'feature')}`);
  }
  for (const r of floors) {
    const open = r.pulls.filter((p) => p.state === 'OPEN').length;
    if (open) out.push(`Floor ${r.floor}: ${plural(open, 'PR')} up for review`);
  }
  const working = agents.filter((a) => a.status === 'working' || a.status === 'preparing').length;
  if (working) out.push(`${plural(working, 'agent')} hard at work at ${company}`);
  const issues = repos.reduce((n, r) => n + r.issues.length, 0);
  if (issues) out.push(`${plural(issues, 'issue')} on the whiteboards`);
  if (!out.length) out.push(`Quiet day at ${company}: the coffee's on`);
  return out;
}

/** Seconds each headline stays up. */
export const HEADLINE_SECONDS = 12;

export const headlineAt = (list: readonly string[], now: number) => list[Math.floor(now / 1000 / HEADLINE_SECONDS) % list.length] ?? '';
