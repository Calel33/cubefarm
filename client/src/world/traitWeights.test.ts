import { describe, expect, it } from 'vitest';
import type { Traits } from '../../../shared/personality';
import { arrivalRank, drinkChance, drinkLines, errandWeight, highFive, hobbyRoll, lingers, perk, restlessScale, routineFor, stretchSpots, trashTalk, withCatchphrase } from './traitWeights';

const t = (p: Partial<Traits> = {}): Traits => ({ social: 2, energy: 2, drink: 'coffee', hobby: 'reading', tidiness: 2, catchphrase: 'Ship it!', ...p });
const NOON = { hour: 11 };

describe('errand weights', () => {
  it('sends introverts off on their own and extroverts to visit people', () => {
    expect(errandWeight(t({ social: 0 }), 'stretch', NOON)).toBeGreaterThan(errandWeight(t({ social: 4 }), 'stretch', NOON));
    expect(errandWeight(t({ social: 4 }), 'visit', NOON)).toBeGreaterThan(errandWeight(t({ social: 0 }), 'visit', NOON));
    expect(errandWeight(t({ social: 2 }), 'visit', { ...NOON, friendBusy: true })).toBeGreaterThan(errandWeight(t({ social: 2 }), 'visit', NOON));
  });

  it('favours the toy of their hobby, and ping-pong when a rival is free', () => {
    expect(errandWeight(t({ hobby: 'hoops' }), 'hoops', NOON)).toBe(3);
    expect(errandWeight(t({ hobby: 'pong' }), 'hoops', NOON)).toBe(0.8);
    expect(errandWeight(t({ hobby: 'pong' }), 'pong-start', NOON)).toBe(3);
    expect(errandWeight(t(), 'pong', { ...NOON, rivalFree: true })).toBe(2 * errandWeight(t(), 'pong', NOON));
  });

  it("leaves errands traits don't touch alone, outside a routine", () => {
    expect(errandWeight(t(), 'lunch', NOON)).toBe(1);
    expect(errandWeight(t(), 'coffee', NOON)).toBe(1);
  });

  it('stretches by the window or the cooler by how social they are', () => {
    expect(stretchSpots(t({ social: 0 }))).toEqual(['window-*']);
    expect(stretchSpots(t({ social: 4 }))).toEqual(['cooler']);
    expect(stretchSpots(t({ social: 2 }))).toEqual(['cooler', 'window-*']);
    expect(stretchSpots(undefined)).toEqual(['cooler', 'window-*']);
  });
});

describe('the time of day', () => {
  it('perks early birds up in the morning and night owls late', () => {
    expect(perk(t({ energy: 0 }), 8)).toBe(1);
    expect(perk(t({ energy: 4 }), 8)).toBe(-1);
    expect(perk(t({ energy: 4 }), 21)).toBe(1);
    expect(perk(t({ energy: 2 }), 21)).toBe(0);
    expect(perk(t({ energy: 0 }), 14)).toBe(0);
    expect(restlessScale(t({ energy: 4 }), 22)).toBeLessThan(1);
    expect(restlessScale(t({ energy: 4 }), 8)).toBeGreaterThan(1);
  });

  it('gives early birds a morning coffee and night owls their late music', () => {
    expect(routineFor(t({ energy: 0 }), 7)?.id).toBe('early-coffee');
    expect(routineFor(t({ energy: 0, drink: 'tea' }), 7)?.line).toContain('🍵');
    expect(errandWeight(t({ energy: 0 }), 'coffee', { hour: 7 })).toBe(3);
    expect(drinkChance(t({ energy: 0 }), 7, 0.25)).toBe(0.6);
    expect(drinkChance(t({ energy: 4 }), 7, 0.25)).toBe(0.25);
    expect(routineFor(t({ energy: 4 }), 23)?.id).toBe('late-music');
    expect(routineFor(t({ energy: 4, hobby: 'pong' }), 14)?.id).toBe('afternoon-hobby');
    expect(errandWeight(t({ hobby: 'pong' }), 'pong-start', { hour: 14 })).toBeCloseTo(3 * 1.8);
    expect(routineFor(t({ energy: 2 }), 10)).toBeNull();
  });

  it('keeps night owls on at home time, and brings early birds in first', () => {
    expect(lingers(t({ energy: 4 }), 23.5)).toBe(true);
    expect(lingers(t({ energy: 3 }), 23.5)).toBe(false);
    expect(lingers(t({ energy: 3 }), 22.5)).toBe(true);
    expect(lingers(t({ energy: 2 }), 22.5)).toBe(false);
    expect(lingers(t({ energy: 4 }), 0.5)).toBe(false);
    expect(arrivalRank(t({ energy: 0 }))).toBeLessThan(arrivalRank(t({ energy: 4 })));
  });
});

describe('hobbyRoll', () => {
  const shares = { hoops: [0, 0.3] as const, pong: [0.5, 0.62] as const };
  it('now and then lands a restless moment on their hobby', () => {
    expect(hobbyRoll(t({ hobby: 'pong' }), 0.5, 0.1, shares)).toBeCloseTo(0.56);
    expect(hobbyRoll(t({ hobby: 'hoops' }), 0.5, 0.1, shares)).toBeCloseTo(0.15);
    expect(hobbyRoll(t({ hobby: 'hoops' }), 0.9, 0.8, shares)).toBe(0.9);
    expect(hobbyRoll(t({ hobby: 'reading' }), 0.9, 0.1, shares)).toBe(0.9);
  });

  it('pulls towards ping-pong when a rival is free', () => {
    expect(hobbyRoll(t({ hobby: 'reading' }), 0, 0.1, shares, true)).toBe(0.5);
  });
});

describe('lines', () => {
  it('says their catchphrase now and then', () => {
    expect(withCatchphrase('Hi!', t(), 0.1)).toBe('Ship it!');
    expect(withCatchphrase('Hi!', t(), 0.9)).toBe('Hi!');
    expect(withCatchphrase('Hi!', t({ catchphrase: '' }), 0.1)).toBe('Hi!');
  });

  it('talks about their own drink, and trash and high fives with names', () => {
    expect(drinkLines(t({ drink: 'tea' })).some((l) => l.includes('🍵'))).toBe(true);
    expect(drinkLines(t({ drink: 'energy' })).every((l) => !l.includes('☕'))).toBe(true);
    expect(trashTalk('Ada', 0)).toBe("You're going down, Ada!");
    expect(highFive('Ada', 0)).toBe('✋ High five, Ada!');
  });
});
