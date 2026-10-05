// Personalities (#267): each agent's traits, seeded from their id when hired and editable in their Setup panel. The
// server keeps and checks them on the agent; the client turns them into small weights on what people already do
// (client/src/world/traitWeights.ts). Pure.

/** The scales are 0-4: social 0 an introvert, 4 an extrovert; energy 0 an early bird, 4 a night owl; tidiness 0 spotless, 4 cluttered. */
export const SCALE_MAX = 4;
export const DRINKS = ['coffee', 'tea', 'energy'] as const;
export const HOBBIES = ['hoops', 'pong', 'reading', 'plants', 'music'] as const;
export const CATCHPHRASE_MAX = 40;

export type Drink = (typeof DRINKS)[number];
export type Hobby = (typeof HOBBIES)[number];

export interface Traits {
  social: number;
  energy: number;
  drink: Drink;
  hobby: Hobby;
  tidiness: number;
  catchphrase: string;
}

export const SOCIAL_LABELS = ['Introvert', 'Quiet', 'Ambivert', 'Chatty', 'Extrovert'] as const;
export const ENERGY_LABELS = ['Early bird', 'Morning person', 'Steady', 'Evening person', 'Night owl'] as const;
export const TIDY_LABELS = ['Spotless', 'Tidy', 'Lived-in', 'Messy', 'Cluttered'] as const;
export const DRINK_LABELS: Record<Drink, string> = { coffee: '☕ Coffee', tea: '🍵 Tea', energy: '⚡ Energy drink' };
export const HOBBY_LABELS: Record<Hobby, string> = { hoops: '🏀 Hoops', pong: '🏓 Ping-pong', reading: '📖 Reading', plants: '🪴 Plants', music: '🎧 Music' };

const CATCHPHRASES = [
  'Ship it!',
  'Works on my machine.',
  'One more test…',
  "Let's gooo!",
  'Easy peasy.',
  'Coffee first.',
  'Trust the process.',
  'Clean code, happy life.',
  'Bugs fear me.',
  'Small PRs, big smiles.',
  'Green is my colour.',
  'Hold my mug.',
];

/** FNV-1a: a stable 32-bit hash of a string. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A tiny seeded generator (mulberry32) giving numbers in [0, 1). */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pickOf = <T>(list: readonly T[], r: number) => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/** The personality someone is hired with, the same every time for the same id. */
export function seedTraits(id: string): Traits {
  const r = seeded(hash(`traits:${id}`));
  const scale = () => Math.min(SCALE_MAX, Math.floor(r() * (SCALE_MAX + 1)));
  return { social: scale(), energy: scale(), drink: pickOf(DRINKS, r()), hobby: pickOf(HOBBIES, r()), tidiness: scale(), catchphrase: pickOf(CATCHPHRASES, r()) };
}

const scaleOf = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(SCALE_MAX, Math.max(0, Math.round(v))) : undefined);
const oneOf = <T extends string>(list: readonly T[], v: unknown) => ((list as readonly unknown[]).includes(v) ? (v as T) : undefined);

/** A catchphrase as kept: one line, no control characters, at most CATCHPHRASE_MAX characters ('' is allowed: none). */
export function cleanCatchphrase(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  return v
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CATCHPHRASE_MAX);
}

/**
 * The valid traits in `raw` (a request body or an old state file) over `base`: anything missing or not one of the
 * options keeps `base`'s value, so a partial edit changes only what it names.
 */
export function cleanTraits(raw: unknown, base: Traits): Traits {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    social: scaleOf(r.social) ?? base.social,
    energy: scaleOf(r.energy) ?? base.energy,
    drink: oneOf(DRINKS, r.drink) ?? base.drink,
    hobby: oneOf(HOBBIES, r.hobby) ?? base.hobby,
    tidiness: scaleOf(r.tidiness) ?? base.tidiness,
    catchphrase: cleanCatchphrase(r.catchphrase) ?? base.catchphrase,
  };
}

/** Someone's traits: their own, or the ones seeded from their id (an older server, or a replayed day). */
export const traitsOf = (a: { id: string; traits?: Traits | null }): Traits => a.traits ?? seedTraits(a.id);

/** A few words for the card: "Introvert · Night owl · 🍵 Tea · 📖 Reading · Tidy". */
export function traitWords(t: Traits): string[] {
  return [SOCIAL_LABELS[t.social], ENERGY_LABELS[t.energy], DRINK_LABELS[t.drink], HOBBY_LABELS[t.hobby], TIDY_LABELS[t.tidiness]];
}
