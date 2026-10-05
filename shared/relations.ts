// Relationships (#267): a small graph per floor of who gets on with whom, grown from real office events and kept by
// the server (swarm.ts). Friendship grows when two agents pair on work (a QA pass, one fixing the other's PR), chat
// or play ping-pong; a friendly rivalry from close games and fixes that go back and forth on a PR. Both fade slowly
// without contact: a bond keeps its values as of its last contact and decays when read, so nothing needs a timer.
// The client reads the same helpers for the career card, the chemistry view and who seeks out whom. Pure.

/** Two agents' bond: friendship and rivalry (0-100) as of `at`, their last contact (ms). `a` sorts before `b`. */
export interface Bond {
  a: string;
  b: string;
  friend: number;
  rival: number;
  at: number;
}

export type InteractionKind = 'qa-pass' | 'fix' | 'fix-swap' | 'chat' | 'pong' | 'close-pong';

/** Something two agents did together, and what it did to their bond. */
export interface Interaction {
  at: number;
  kind: InteractionKind;
  a: string;
  b: string;
  friend: number;
  rival: number;
  /** "PR #12", "11-9", the venue: a few words for the probe and the chemistry view. */
  note: string;
}

/** One floor's graph: its bonds and the latest interactions, newest last. */
export interface SocialView {
  bonds: Bond[];
  recent: Interaction[];
}

/** What each kind of interaction adds. */
export const GAINS: Record<InteractionKind, { friend: number; rival: number }> = {
  'qa-pass': { friend: 18, rival: 0 },
  fix: { friend: 12, rival: 0 },
  'fix-swap': { friend: 0, rival: 15 },
  chat: { friend: 6, rival: 0 },
  pong: { friend: 4, rival: 0 },
  'close-pong': { friend: 3, rival: 16 },
};

/** At this much a bond counts as a friendship, or a rivalry. */
export const FRIEND_AT = 25;
export const RIVAL_AT = 25;
export const BOND_MAX = 100;
/** Without contact a bond halves this often. */
export const HALF_LIFE_MS = 5 * 24 * 3_600_000;
/** Interactions kept per floor, and bonds weaker than this (both ways) are dropped. */
export const RECENT_KEEP = 24;
const FADED = 1;

export const emptySocial = (): SocialView => ({ bonds: [], recent: [] });

const ordered = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

/** A bond's friendship and rivalry at `now`, after fading since its last contact. */
export function strength(b: Bond, now: number): { friend: number; rival: number } {
  const k = 0.5 ** (Math.max(0, now - b.at) / HALF_LIFE_MS);
  return { friend: b.friend * k, rival: b.rival * k };
}

/** The bond between two agents, if any. */
export function bondOf(v: SocialView, x: string, y: string): Bond | undefined {
  const [a, b] = ordered(x, y);
  return v.bonds.find((o) => o.a === a && o.b === b);
}

/** A close ping-pong game: decided by two points, or the loser on 9 or more. */
export const closeGame = (score: readonly [number, number]) => Math.abs(score[0] - score[1]) <= 2 && Math.min(score[0], score[1]) >= 9;

/** The graph after an interaction between `x` and `y` (a new object): their bond refreshed and grown, the faded ones gone. */
export function interact(v: SocialView, kind: InteractionKind, x: string, y: string, now: number, note = ''): SocialView {
  if (!x || !y || x === y) return v;
  const [a, b] = ordered(x, y);
  const gain = GAINS[kind];
  const old = bondOf(v, a, b);
  const was = old ? strength(old, now) : { friend: 0, rival: 0 };
  const bond: Bond = { a, b, friend: round(Math.min(BOND_MAX, was.friend + gain.friend)), rival: round(Math.min(BOND_MAX, was.rival + gain.rival)), at: now };
  const bonds = [...v.bonds.filter((o) => o !== old && !faded(o, now)), bond];
  const recent = [...v.recent, { at: now, kind, a: x, b: y, friend: gain.friend, rival: gain.rival, note }].slice(-RECENT_KEEP);
  return { bonds, recent };
}

const round = (n: number) => Math.round(n * 10) / 10;
const faded = (b: Bond, now: number) => {
  const s = strength(b, now);
  return s.friend < FADED && s.rival < FADED;
};

/** The graph without someone (let go): their bonds and interactions go. */
export function dropAgent(v: SocialView, id: string): SocialView {
  return { bonds: v.bonds.filter((b) => b.a !== id && b.b !== id), recent: v.recent.filter((r) => r.a !== id && r.b !== id) };
}

/** A graph from a state file (or anything): well-formed bonds and interactions only. */
export function loadSocial(raw: unknown): SocialView {
  const r = (raw ?? {}) as Partial<SocialView>;
  const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : null);
  const bonds = (Array.isArray(r.bonds) ? r.bonds : []).filter(
    (b): b is Bond => !!b && typeof b.a === 'string' && typeof b.b === 'string' && b.a !== b.b && num(b.friend) !== null && num(b.rival) !== null && num(b.at) !== null,
  );
  const recent = (Array.isArray(r.recent) ? r.recent : []).filter((i): i is Interaction => !!i && typeof i.a === 'string' && typeof i.b === 'string' && typeof i.kind === 'string' && num(i.at) !== null);
  return {
    bonds: bonds.map((x) => {
      const [a, b] = ordered(x.a, x.b);
      return { a, b, friend: x.friend, rival: x.rival, at: x.at };
    }),
    recent: recent.slice(-RECENT_KEEP).map((i) => ({ ...i, note: typeof i.note === 'string' ? i.note : '' })),
  };
}

/** Someone's bonds at `now`: who with, and how much of each. */
export function bondsOf(v: SocialView | undefined, id: string, now: number): { id: string; friend: number; rival: number }[] {
  if (!v) return [];
  return v.bonds.filter((b) => b.a === id || b.b === id).map((b) => ({ id: b.a === id ? b.b : b.a, ...strength(b, now) }));
}

/** Their friends at `now`, the closest first (at most `n`). */
export function friendsOf(v: SocialView | undefined, id: string, now: number, n = Infinity): string[] {
  return bondsOf(v, id, now)
    .filter((b) => b.friend >= FRIEND_AT)
    .sort((x, y) => y.friend - x.friend)
    .slice(0, n)
    .map((b) => b.id);
}

/** Their rivals at `now`, the fiercest first (at most `n`). */
export function rivalsOf(v: SocialView | undefined, id: string, now: number, n = Infinity): string[] {
  return bondsOf(v, id, now)
    .filter((b) => b.rival >= RIVAL_AT)
    .sort((x, y) => y.rival - x.rival)
    .slice(0, n)
    .map((b) => b.id);
}

/** The floor's strongest pairs at `now`, friendships and rivalries together, strongest first. */
export function strongest(v: SocialView | undefined, now: number, n = 3): { a: string; b: string; kind: 'friend' | 'rival'; value: number }[] {
  if (!v) return [];
  const out: { a: string; b: string; kind: 'friend' | 'rival'; value: number }[] = [];
  for (const b of v.bonds) {
    const s = strength(b, now);
    if (s.friend >= FRIEND_AT) out.push({ a: b.a, b: b.b, kind: 'friend', value: s.friend });
    if (s.rival >= RIVAL_AT) out.push({ a: b.a, b: b.b, kind: 'rival', value: s.rival });
  }
  return out.sort((x, y) => y.value - x.value).slice(0, n);
}
