// Lunch out (#264): now and then an idle developer or tester takes the elevator down, walks out through the lobby's
// west door to the food truck, eats in the park or on the avenue, and comes back. Who's out is kept here, shared by
// their floor's errand (lunchErrand.ts: into the elevator and, a while later, back out of it) and the street's own
// walkers (LunchPeople.tsx: out of the lobby's elevator, out and back), so whoever you follow down finds them there.
// The rules are pure; times are Date.now() ms. Like roof/roofBreaks.ts.

import { EAT_SPOTS, TRUCK_LINE } from './plaza';

export interface LunchVisit {
  id: string;
  /** When they step out of the lobby's elevator, and when they head back in for it. */
  arrive: number;
  leave: number;
  /** Their place in line at the truck (an index into TRUCK_LINE), and where they eat (into EAT_SPOTS). */
  line: number;
  eat: number;
}

export const LUNCH = {
  /** Seconds out, from the lobby's elevator and back to it. */
  stay: [70, 120] as const,
  /** Seconds the elevator takes down to the lobby. */
  ride: 4,
  /** At most this many out at once, building-wide: the walker cap still applies on every floor they pass. */
  max: 2,
  /** How likely lunch out is among the idle errands someone fancies (rare). */
  weight: 0.1,
};

const SECOND = 1000;

/** Whether a visit is still on at `now`: riding down, out, or riding back up. */
export const lunchOn = (v: LunchVisit, now: number) => now < v.leave + LUNCH.ride * SECOND;

/** Where a visit is: riding down, out on the street, or back up (and then gone). */
export function lunchStage(v: LunchVisit, now: number): 'riding' | 'out' | 'back' {
  if (now < v.arrive) return 'riding';
  return now < v.leave ? 'out' : 'back';
}

/** Whether there's room for `id` to go out now (someone already out can't go again). */
export function roomForLunch(visits: readonly LunchVisit[], id: string, now: number) {
  const on = visits.filter((v) => lunchOn(v, now));
  return !on.some((v) => v.id === id) && on.length < LUNCH.max;
}

/** A new lunch out for `id`, at the truck in a free place in line and eating somewhere nobody else is. Null without room. */
export function planLunch(visits: readonly LunchVisit[], id: string, now: number, rand: number, o: { ride?: number; stay?: number } = {}): LunchVisit | null {
  if (!roomForLunch(visits, id, now)) return null;
  const on = visits.filter((v) => lunchOn(v, now));
  const line = TRUCK_LINE.findIndex((_, i) => !on.some((v) => v.line === i));
  const free = EAT_SPOTS.map((_, i) => i).filter((i) => !on.some((v) => v.eat === i));
  if (line < 0 || !free.length) return null;
  const eat = free[Math.min(free.length - 1, Math.floor(rand * free.length))];
  const [lo, hi] = LUNCH.stay;
  const arrive = now + (o.ride ?? LUNCH.ride) * SECOND;
  return { id, arrive, leave: arrive + Math.round((o.stay ?? lo + rand * (hi - lo)) * SECOND), line, eat };
}

// ---------- who's out now ----------

const visits = new Map<string, LunchVisit>();

/** Every visit still on (stale ones are dropped as they're read). */
export function lunchVisits(now = Date.now()): LunchVisit[] {
  for (const [id, v] of visits) if (!lunchOn(v, now)) visits.delete(id);
  return [...visits.values()];
}

/** `id`'s visit while it's on, or null. */
export function lunchVisit(id: string, now = Date.now()): LunchVisit | null {
  const v = visits.get(id);
  return v && lunchOn(v, now) ? v : null;
}

export function startLunch(v: LunchVisit) {
  visits.set(v.id, v);
}

export function endLunch(id: string) {
  visits.delete(id);
}

/** Changes a visit (heading back early when work comes in). */
export function updateLunch(id: string, patch: Partial<Omit<LunchVisit, 'id'>>) {
  const v = visits.get(id);
  if (v) visits.set(id, { ...v, ...patch });
}
