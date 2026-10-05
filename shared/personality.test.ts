import { describe, expect, it } from 'vitest';
import { CATCHPHRASE_MAX, cleanTraits, DRINKS, HOBBIES, seedTraits, traitsOf, traitWords } from './personality';

describe('seedTraits', () => {
  it('is the same personality every time for the same id', () => {
    expect(seedTraits('ada')).toEqual(seedTraits('ada'));
  });

  it('spreads people over every option', () => {
    const all = Array.from({ length: 200 }, (_, i) => seedTraits(`agent-${i}`));
    for (const d of DRINKS) expect(all.some((t) => t.drink === d)).toBe(true);
    for (const h of HOBBIES) expect(all.some((t) => t.hobby === h)).toBe(true);
    for (let n = 0; n <= 4; n++) {
      expect(all.some((t) => t.social === n)).toBe(true);
      expect(all.some((t) => t.energy === n)).toBe(true);
      expect(all.some((t) => t.tidiness === n)).toBe(true);
    }
    expect(all.every((t) => t.catchphrase.length > 0)).toBe(true);
  });
});

describe('cleanTraits', () => {
  const base = seedTraits('base');

  it('keeps valid picks and the base for the rest', () => {
    const t = cleanTraits({ social: 4, drink: 'tea' }, base);
    expect(t).toEqual({ ...base, social: 4, drink: 'tea' });
  });

  it('drops values that are not options and clamps the scales', () => {
    expect(cleanTraits({ social: 9, energy: -3, tidiness: 2.6, drink: 'whisky', hobby: 42 }, base)).toEqual({ ...base, social: 4, energy: 0, tidiness: 3 });
    expect(cleanTraits({ social: 'loud', energy: Number.NaN }, base)).toEqual(base);
  });

  it('falls back to the base for junk (an old state file)', () => {
    for (const junk of [null, undefined, 'x', 3, [1, 2]]) expect(cleanTraits(junk, base)).toEqual(base);
  });

  it('keeps a catchphrase to one short line, and allows none', () => {
    expect(cleanTraits({ catchphrase: '  Ship\nit!\u0007  ' }, base).catchphrase).toBe('Ship it!');
    expect(cleanTraits({ catchphrase: 'x'.repeat(100) }, base).catchphrase).toHaveLength(CATCHPHRASE_MAX);
    expect(cleanTraits({ catchphrase: '' }, base).catchphrase).toBe('');
  });
});

describe('traitsOf and traitWords', () => {
  it("uses an agent's own traits, else the seeded ones", () => {
    const own = { ...seedTraits('x'), hobby: 'plants' as const };
    expect(traitsOf({ id: 'x', traits: own })).toBe(own);
    expect(traitsOf({ id: 'x' })).toEqual(seedTraits('x'));
  });

  it('says each trait in a word or two', () => {
    expect(traitWords({ social: 0, energy: 4, drink: 'tea', hobby: 'reading', tidiness: 1, catchphrase: '' })).toEqual(['Introvert', 'Night owl', '🍵 Tea', '📖 Reading', 'Tidy']);
  });
});
