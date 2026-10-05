// The easter eggs' pure rules (#266): the Konami code, a word typed on the manager's console, the CEO clicked ten
// times, a ball on the gong's disc, π o'clock, and which memorable moments get a polaroid. secretsState.ts runs them.

import { GONG } from '../layout';

export type EggId = 'disco' | 'spill' | 'ceo' | 'gong' | 'pi';

/** Each egg: its phone line and the achievement it unlocks (shared/progress.ts). */
export const EGGS: readonly { id: EggId; name: string; found: string; achievement: string }[] = [
  { id: 'disco', name: 'Disco fever', found: '🪩 Disco mode! Thirty seconds of glitter.', achievement: 'disco-fever' },
  { id: 'spill', name: 'Butterfingers', found: "☕ Oops. Coffee all over the manager's desk.", achievement: 'butterfingers' },
  { id: 'ceo', name: 'Fan club', found: '👋 The CEO waved back!', achievement: 'fan-club' },
  { id: 'gong', name: 'Gong shot', found: '🥁 Nice shot: the gong rang!', achievement: 'gong-shot' },
  { id: 'pi', name: 'Pi time', found: 'π It is 3:14. Every whiteboard knows.', achievement: 'pi-time' },
];
export const eggDef = (id: EggId) => EGGS.find((e) => e.id === id)!;
export const isEggId = (id: unknown): id is EggId => typeof id === 'string' && EGGS.some((e) => e.id === id);

// ---------- typed sequences ----------

/** ↑ ↑ ↓ ↓ ← → ← → B A, as KeyboardEvent.key (letters lowercased). */
export const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'] as const;
/** The word that spills a mug when typed on the manager's console. */
export const SPILL_WORD = ['c', 'o', 'f', 'f', 'e', 'e'] as const;

/**
 * How far into `seq` the keys typed so far are, after `key`: the next position, or `seq.length` when it's complete.
 * A wrong key starts over (or counts as the first key, if it is one).
 */
export function advance(seq: readonly string[], at: number, key: string): number {
  const k = key.toLowerCase();
  if (seq[at] === k) return at + 1;
  // "↑ ↑ ↑ ↓ …" still works: fall back to the longest prefix that ends with this key
  for (let back = Math.min(at, seq.length - 1); back > 0; back--) {
    let ok = seq[back] === k;
    for (let i = 0; ok && i < back; i++) ok = seq[i] === seq[at - back + i];
    if (ok) return back + 1;
  }
  return seq[0] === k ? 1 : 0;
}

/** How long disco mode lasts. */
export const DISCO_MS = 30_000;
/** How long the spilled coffee stays on the manager's desk. */
export const SPILL_MS = 60_000;

// ---------- the CEO's fan club ----------

export const CEO_CLICKS = 10;
/** The ten hellos must come within this long of each other's start. */
export const CEO_WINDOW_MS = 20_000;

/** Adds a hello at `now` to the recent ones (oldest first); `wave` when it's the tenth inside the window, which starts over. */
export function ceoHello(times: readonly number[], now: number): { times: number[]; wave: boolean } {
  const kept = [...times.filter((t) => now - t <= CEO_WINDOW_MS), now];
  if (kept.length >= CEO_CLICKS) return { times: [], wave: true };
  return { times: kept, wave: false };
}

/** What the CEO says when they finally wave back: one line, picked by `n`. */
export const CEO_LINES = [
  'Okay, okay, hi! 👋 Now back to shipping.',
  'You found me. Ten hellos is a company record.',
  'I see you. I always see you. 👀',
  "Ten clicks? Put that energy into the backlog!",
  'Hello to you too! Have you tried the jukebox?',
];
export const ceoLine = (n: number) => CEO_LINES[Math.abs(Math.floor(n)) % CEO_LINES.length];

// ---------- the gong ----------

/**
 * Whether a ball at `p` (radius r) has just hit the gong's disc: the front of the gong's solid, in front of the disc.
 * `moved` is how far it may have rebounded in the step since (as in impacts.ts).
 */
export function gongShot(p: { x: number; y: number; z: number }, r: number, moved = 0): boolean {
  const face = GONG.z + GONG.d / 2; // the gong's solid ends here; the disc hangs just behind it
  const touch = 0.06 + Math.min(0.3, Math.max(0, moved));
  return p.z - r <= face + touch && p.z > face - 0.2 && Math.hypot(p.x - GONG.x, p.y - GONG.y) <= GONG.r + r * 0.5;
}

// ---------- π o'clock ----------

/** Whether it's 3:14 pm (office time) at `ms`. */
export function isPiTime(ms: number): boolean {
  const d = new Date(ms);
  return d.getHours() === 15 && d.getMinutes() === 14;
}

// ---------- polaroids ----------

export type Moment = 'first-merge' | 'kaiju' | 'gong-run';

/** A photo on the secret room's wall: what happened, when, and a small JPEG data URL (null: not taken). */
export interface Polaroid {
  moment: Moment;
  at: number;
  caption: string;
  image: string | null;
}

/** How many polaroids the wall keeps (the newest). */
export const POLAROID_KEEP = 8;

export const MOMENT_CAPTION: Record<Moment, string> = {
  'first-merge': "Today's first merge 🎉",
  kaiju: 'The kaiju came by 🦖',
  'gong-run': 'A gong run 🥁',
};

/** The day `ms` falls on, locally, as YYYY-MM-DD. */
export function dayOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Whether a moment at `now` earns a polaroid: a merge only if it's the day's first, anything else at most once a
 * minute (a gong run's party, the kaiju's visit).
 */
export function wantsPolaroid(wall: readonly Polaroid[], moment: Moment, now: number): boolean {
  if (moment === 'first-merge') return !wall.some((p) => p.moment === 'first-merge' && dayOf(p.at) === dayOf(now));
  return !wall.some((p) => p.moment === moment && now - p.at < 60_000);
}

/** The wall after a new polaroid: newest first, at most POLAROID_KEEP. */
export const pinPolaroid = (wall: readonly Polaroid[], p: Polaroid): Polaroid[] => [p, ...wall].slice(0, POLAROID_KEEP);

/** Saved polaroids, checked. */
export function cleanPolaroids(raw: unknown): Polaroid[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (p): p is Polaroid =>
        !!p &&
        typeof p === 'object' &&
        (p.moment === 'first-merge' || p.moment === 'kaiju' || p.moment === 'gong-run') &&
        Number.isFinite(p.at) &&
        typeof p.caption === 'string' &&
        (p.image === null || (typeof p.image === 'string' && p.image.startsWith('data:image/'))),
    )
    .slice(0, POLAROID_KEEP);
}

// ---------- the developer commentary plaque ----------

/** Fun facts about how cubefarm works, one at a time on the plaque (E for the next). */
export const COMMENTARY = [
  'Every person here is a real coding-agent session, working in its own git worktree.',
  'The office is drawn with React Three Fiber; desks and chairs are instanced, a few draw calls a floor.',
  'Nobody merges their own PR: QA tests it, the checks pass, then the office merges it by itself.',
  'Click to grab the mouse never also acts: that is the quiet-click rule in Player.tsx.',
  'The city outside is seeded: the same streets and towers every time.',
  'This room is only built while the bookshelf is open, so it costs nothing the rest of the time.',
  'The jukebox songs are synthesised in your browser, beat by beat.',
  'There are twenty rubber ducks. The CEO knows where some of them are.',
];
