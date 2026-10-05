// Personalities and relationships on this tab (#267): everyone's traits and bonds as the store has them, the office
// hour the routines follow, who cheers louder on a merge, and the friends sent over to high-five the author.
// What people chose (errands, drinks, toys) and did together is kept briefly for window.__swarmSocial, the probe:
// traits, each floor's graph, the strongest pairs and the recent interactions, server's and this tab's.

import { traitsOf, type Traits } from '../../../shared/personality';
import { bondsOf, friendsOf, rivalsOf, strongest } from '../../../shared/relations';
import { useStore } from '../store';
import { isFree } from './errands';
import { liveBodies, sendOnErrand } from './people';
import { dayTime } from './sky/useDayTime';
import { arrivalRank, lingers, routineFor, FRIEND_CHEER } from './traitWeights';

let pinnedHour: number | null = null;

/** The office's hour of the day (0-24) by the sky's clock, or the one QA pinned (__swarmSocial.hour). */
export const officeHour = () => pinnedHour ?? (((dayTime.t % 1) + 1) % 1) * 24;

/** Someone's traits, if they're in the store. */
export function traitsFor(id: string): Traits | undefined {
  const a = useStore.getState().agents[id];
  return a ? traitsOf(a) : undefined;
}

const graphFor = (id: string) => {
  const s = useStore.getState();
  const a = s.agents[id];
  return a ? s.social[a.repoId] : undefined;
};

/** Their friends and rivals on their floor right now, closest first. */
export const friendsNow = (id: string) => friendsOf(graphFor(id), id, Date.now());
export const rivalsNow = (id: string) => rivalsOf(graphFor(id), id, Date.now());

/** A rival of theirs on the floor drawn here with nothing to do (a ping-pong opponent). */
export function rivalFree(id: string) {
  const agents = useStore.getState().agents;
  return rivalsNow(id).some((r) => liveBodies().has(r) && !!agents[r] && isFree(agents[r].status));
}

// ---------- what this tab saw ----------

interface Seen {
  at: number;
  what: string;
  id: string;
  with?: string;
  detail?: string;
}

const KEEP = 60;
const seen: Seen[] = [];
const counts = new Map<string, Record<string, number>>();

/** Something someone did that their personality or a bond shaped: an errand, a drink, a high five, trash talk. */
export function noteSocial(what: string, id: string, detail?: string, withId?: string) {
  seen.push({ at: Date.now(), what, id, detail, with: withId });
  if (seen.length > KEEP) seen.splice(0, seen.length - KEEP);
  if (what === 'errand' && detail) {
    const c = counts.get(id) ?? {};
    c[detail] = (c[detail] ?? 0) + 1;
    counts.set(id, c);
  }
}

// ---------- merges: friends cheer louder and come over for a high five ----------

const loud = new Map<string, number>();
const fives = new Map<string, string>();
/** Seconds after a merge before friends set off: the author has the gong to bang first. */
const FIVE_DELAY_MS = 7000;

/** How loud someone cheers (1 normal): louder for a friend's merge, for a little while after it. */
export const cheerBoost = (id: string) => ((loud.get(id) ?? 0) > Date.now() ? FRIEND_CHEER : 1);

/** Who a friend is on their way to high-five. */
export const fiveFor = (id: string) => fives.get(id);
export const fiveDone = (id: string) => void fives.delete(id);

/** `dev`'s PR merged: their friends cheer louder, and the free ones on this floor come over to high-five them. */
export function friendMerged(dev: string) {
  const agents = useStore.getState().agents;
  for (const f of friendsNow(dev)) {
    loud.set(f, Date.now() + 15_000);
    const a = agents[f];
    if (!a || !liveBodies().has(f) || !liveBodies().has(dev) || !isFree(a.status)) continue;
    fives.set(f, dev);
    setTimeout(() => {
      if (fives.get(f) === dev) sendOnErrand(f, 'highfive');
    }, FIVE_DELAY_MS);
  }
}

/** Who comes in first in the morning: early birds. */
export const byArrival = (ids: readonly string[]) => [...ids].sort((x, y) => arrivalRank(traitsFor(x) ?? traitsOf({ id: x })) - arrivalRank(traitsFor(y) ?? traitsOf({ id: y })));

/** Whether someone stays on at home time (a night owl's music). */
export const stillHere = (id: string, hour: number) => {
  const t = traitsFor(id);
  return !!t && lingers(t, hour);
};

// ---------- the probe ----------

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__swarmSocial = {
    /** Everyone's traits, and their routine at the office hour now. */
    get traits() {
      const h = officeHour();
      return Object.fromEntries(Object.values(useStore.getState().agents).map((a) => [a.id, { name: a.name, ...traitsOf(a), routine: routineFor(traitsOf(a), h)?.label ?? null }]));
    },
    /** Each floor's graph (as the server keeps it), with the strongest pairs and everyone's friends and rivals now. */
    get graph() {
      const s = useStore.getState();
      const now = Date.now();
      return Object.fromEntries(
        Object.entries(s.social).map(([repoId, v]) => [
          repoId,
          {
            bonds: v.bonds,
            strongest: strongest(v, now, 5),
            people: Object.fromEntries(Object.values(s.agents).filter((a) => a.repoId === repoId).map((a) => [a.id, { name: a.name, friends: friendsOf(v, a.id, now), rivals: rivalsOf(v, a.id, now), bonds: bondsOf(v, a.id, now) }])),
          },
        ]),
      );
    },
    /** The latest interactions: the server's (what grew the bonds) and this tab's (errands, drinks, high fives, trash talk). */
    get recent() {
      const s = useStore.getState();
      return { server: Object.values(s.social).flatMap((v) => v.recent).sort((a, b) => a.at - b.at), here: seen.map((x) => ({ ...x })) };
    },
    /** How often each person picked each idle errand on the floors this tab showed. */
    get errands() {
      return Object.fromEntries([...counts].map(([id, c]) => [id, { name: useStore.getState().agents[id]?.name ?? id, ...c }]));
    },
    /** The office hour the routines follow; `hour(h)` pins it for QA (null: the sky's again). */
    get now() {
      return officeHour();
    },
    hour(h: number | null) {
      pinnedHour = h === null ? null : ((Number(h) % 24) + 24) % 24;
      return officeHour();
    },
    /** Plays a merge for `dev` by hand: their friends cheer louder and come over to high-five them. */
    merged: friendMerged,
  };
}
