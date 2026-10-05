// Personalities at work (#267): how someone's traits (shared/personality.ts) and bonds nudge what the office already
// does, as small weights rather than new behaviour: which errand they pick, where they stretch, how soon they get
// restless at their time of day, how often they fancy a drink, which toy they reach for, the light daily routine
// (in early with a coffee, lingering late with music), and a few lines of their own. Pure: ErrandDirector.tsx,
// coffeeErrand.ts, ritualRunner.ts and Chatter.tsx apply them.

import type { Hobby, Traits } from '../../../shared/personality';

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** 0 an introvert … 1 an extrovert. */
const outgoing = (t: Traits) => t.social / 4;

// ---------- the time of day ----------

/** How much it's their time of day, -1 to 1: early birds perk up in the morning, night owls late; nobody minds midday. */
export function perk(t: Traits, hour: number): number {
  const owl = (t.energy - 2) / 2; // -1 an early bird … 1 a night owl
  const h = ((hour % 24) + 24) % 24;
  const phase = h >= 5 && h < 12 ? -1 : h >= 17 || h < 3 ? 1 : 0;
  return phase === 0 ? 0 : owl * phase;
}

/** Scales how long they sit before getting restless: sooner at their time of day (livelier), later when it isn't. */
export const restlessScale = (t: Traits, hour: number) => 1 - 0.3 * perk(t, hour);

// ---------- routines ----------

export type RoutineId = 'early-coffee' | 'late-music' | 'afternoon-hobby';

/** A light routine for the hour: a label, extra weight on some errands, and something they say now and then at their desk. */
export interface Routine {
  id: RoutineId;
  label: string;
  boosts: Readonly<Record<string, number>>;
  line: string | null;
}

const HOBBY_ROUTINE: Record<Hobby, { label: string; boosts: Record<string, number>; line: string | null }> = {
  hoops: { label: 'Shooting hoops after lunch', boosts: { hoops: 1.6, toss: 1.3 }, line: '🏀 Who wants a game?' },
  pong: { label: 'Up for ping-pong after lunch', boosts: { 'pong-start': 1.8, pong: 1.3 }, line: '🏓 Anyone for ping-pong?' },
  reading: { label: 'An afternoon read', boosts: { stretch: 1.3 }, line: '📖 …' },
  plants: { label: 'Tending the plants', boosts: { stretch: 1.3 }, line: '🪴 Grow, little one' },
  music: { label: 'Headphones on', boosts: {}, line: '🎧 ♪ ♫' },
};

/** Their routine at this hour of the office day, layered on the rituals; null when there's nothing special to it. */
export function routineFor(t: Traits, hour: number): Routine | null {
  const h = ((hour % 24) + 24) % 24;
  if (t.energy <= 1 && h >= 6 && h < 10) return { id: 'early-coffee', label: 'In early with a coffee', boosts: { coffee: 3 }, line: t.drink === 'tea' ? '🍵 Early start!' : t.drink === 'energy' ? '⚡ Early start!' : '☕ Early start!' };
  if (t.energy >= 3 && (h >= 19 || h < 1)) return { id: 'late-music', label: 'Lingering late with music', boosts: { stretch: 1.4, coffee: t.drink === 'energy' ? 1.5 : 1 }, line: '🎧 ♪ ♫' };
  if (h >= 13 && h < 17) return { id: 'afternoon-hobby', ...HOBBY_ROUTINE[t.hobby] };
  return null;
}

/** Night owls stay on at home time (with their music) before they pack up: until 11 pm, or midnight for the keenest. */
export function lingers(t: Traits, hour: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  if (t.energy < 3 || h < 22) return false;
  return h < (t.energy >= 4 ? 24 : 23);
}

/** The order people come in in the morning: early birds first. */
export const arrivalRank = (t: Traits) => t.energy;

// ---------- errands ----------

/** What else the weights look at: the office hour, and whether a rival is free to play or a friend is busy to visit. */
export interface ErrandContext {
  hour: number;
  rivalFree?: boolean;
  friendBusy?: boolean;
}

/** How much more (or less) likely this person picks an errand, among those they could go on now. */
export function errandWeight(t: Traits, name: string, ctx: ErrandContext): number {
  const social = outgoing(t);
  let w = 1;
  switch (name) {
    case 'stretch':
      w = lerp(1.5, 0.7, social); // introverts slip off to a window on their own
      break;
    case 'visit':
      w = lerp(0.4, 2, social) * (ctx.friendBusy ? 1.8 : 1);
      break;
    case 'roof':
      w = lerp(1.4, 0.8, social);
      break;
    case 'hoops':
    case 'toss':
    case 'catch':
      w = t.hobby === 'hoops' ? 3 : 0.8;
      break;
    case 'pong':
    case 'pong-start':
      w = (t.hobby === 'pong' ? 3 : 0.8) * (ctx.rivalFree ? 2 : 1); // rivals can't leave the table alone
      break;
  }
  return w * (routineFor(t, ctx.hour)?.boosts[name] ?? 1);
}

/** Where they stretch their legs: introverts at a window, extroverts by the water cooler, the rest either. */
export function stretchSpots(t: Traits | undefined): string[] {
  if (!t) return ['cooler', 'window-*'];
  if (t.social <= 1) return ['window-*'];
  if (t.social >= 3) return ['cooler'];
  return ['cooler', 'window-*'];
}

/** The share of restless moments that become a drink at the coffee machine (coffeeBreak.ts BREAK.chance is the base). */
export const drinkChance = (t: Traits, hour: number, base: number) => Math.min(0.6, base * (routineFor(t, hour)?.boosts.coffee ?? 1));

/**
 * The number a restless moment draws to share out who does what (errands.ts ErrandState.roll): now and then it lands
 * on their hobby's toy (`shares`: each toy's slice of [0, 1)), more often when a rival is free for ping-pong.
 */
export function hobbyRoll(t: Traits, a: number, b: number, shares: Partial<Record<Hobby, readonly [number, number]>>, rivalFree = false): number {
  const toy = rivalFree && shares.pong ? 'pong' : t.hobby;
  const slice = shares[toy];
  const chance = toy === t.hobby ? 0.35 : 0.3;
  if (!slice || b >= chance) return a;
  return slice[0] + a * (slice[1] - slice[0]);
}

/** How strongly a chat pulls someone towards a friend (metres taken off the distance): friends seek each other out. */
export const FRIEND_PULL = 8;
/** How likely an extrovert is to start a chat, relative to an introvert. */
export const chatStarterWeight = (t: Traits) => lerp(0.3, 1.8, outgoing(t));

// ---------- what they say ----------

/** Sometimes a line becomes their catchphrase instead (chats and hellos). */
export const CATCHPHRASE_CHANCE = 0.22;
export const withCatchphrase = (line: string, t: Traits, rand: number) => (t.catchphrase && rand < CATCHPHRASE_CHANCE ? t.catchphrase : line);

const DRINK_LINES: Record<Traits['drink'], readonly string[]> = {
  coffee: ['Coffee time ☕', 'I need a coffee', 'Anyone want coffee?', 'Back in a sec, coffee!'],
  tea: ['Tea time 🍵', 'Kettle on 🍵', 'Fancy a cuppa?', 'A nice cup of tea 🍵'],
  energy: ['Energy drink time ⚡', 'Need a boost ⚡', 'Recharging ⚡', 'Fuel! ⚡'],
};
/** What someone heading for the coffee machine says, by what they drink. */
export const drinkLines = (t: Traits) => DRINK_LINES[t.drink];

const TRASH = ["You're going down, {name}!", 'Is that all you’ve got?', 'Too slow, {name}!', 'Best of three?', 'My table, my rules 😏', 'Not this time, {name}!', 'Warming up, are we?'];
/** A rival's trash talk across the ping-pong table. */
export const trashTalk = (name: string, rand: number) => TRASH[Math.min(TRASH.length - 1, Math.floor(rand * TRASH.length))].replace('{name}', name);

const FIVES = ['✋ High five, {name}!', 'Nice merge, {name}! ✋', '✋ That’s my friend!', 'Up top, {name}! ✋'];
/** A friend's line as they high-five someone whose PR just merged. */
export const highFive = (name: string, rand: number) => FIVES[Math.min(FIVES.length - 1, Math.floor(rand * FIVES.length))].replace('{name}', name);

/** A friend cheers louder on their friend's merge. */
export const FRIEND_CHEER = 1.6;
