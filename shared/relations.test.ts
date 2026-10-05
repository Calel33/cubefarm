import { describe, expect, it } from 'vitest';
import { bondOf, closeGame, dropAgent, emptySocial, FRIEND_AT, friendsOf, GAINS, HALF_LIFE_MS, interact, loadSocial, RECENT_KEEP, rivalsOf, strength, strongest } from './relations';

const T = 1_000_000;

describe('interact', () => {
  it('grows a friendship from pairing on work, the same whichever way round', () => {
    let v = interact(emptySocial(), 'qa-pass', 'qa1', 'dev1', T, 'PR #3');
    v = interact(v, 'qa-pass', 'dev1', 'qa1', T + 1000, 'PR #5');
    expect(v.bonds).toHaveLength(1);
    const b = bondOf(v, 'qa1', 'dev1')!;
    expect(b.a < b.b).toBe(true);
    expect(b.friend).toBeGreaterThanOrEqual(FRIEND_AT);
    expect(b.rival).toBe(0);
    expect(friendsOf(v, 'dev1', T + 1000)).toEqual(['qa1']);
    expect(v.recent.map((r) => r.note)).toEqual(['PR #3', 'PR #5']);
  });

  it('grows a rivalry from close games and fixes that go back and forth', () => {
    let v = interact(emptySocial(), 'close-pong', 'a', 'b', T, '12-10');
    v = interact(v, 'fix-swap', 'a', 'b', T);
    expect(rivalsOf(v, 'a', T)).toEqual(['b']);
    expect(strength(bondOf(v, 'a', 'b')!, T).rival).toBe(GAINS['close-pong'].rival + GAINS['fix-swap'].rival);
  });

  it('ignores an agent with themselves', () => {
    const v = emptySocial();
    expect(interact(v, 'chat', 'a', 'a', T)).toBe(v);
  });

  it('caps a bond and keeps only the latest interactions', () => {
    let v = emptySocial();
    for (let i = 0; i < 40; i++) v = interact(v, 'qa-pass', 'a', 'b', T + i);
    expect(bondOf(v, 'a', 'b')!.friend).toBe(100);
    expect(v.recent).toHaveLength(RECENT_KEEP);
  });
});

describe('decay', () => {
  it('halves a bond each half-life without contact, and contact picks it up from there', () => {
    let v = interact(emptySocial(), 'qa-pass', 'a', 'b', T);
    v = interact(v, 'qa-pass', 'a', 'b', T);
    const b = bondOf(v, 'a', 'b')!;
    expect(strength(b, T + HALF_LIFE_MS).friend).toBeCloseTo(b.friend / 2);
    expect(friendsOf(v, 'a', T + 2 * HALF_LIFE_MS)).toEqual([]);
    const later = interact(v, 'chat', 'a', 'b', T + HALF_LIFE_MS);
    expect(bondOf(later, 'a', 'b')!.friend).toBeCloseTo(b.friend / 2 + GAINS.chat.friend, 0);
  });

  it('drops bonds that have faded away when the graph next changes', () => {
    let v = interact(emptySocial(), 'chat', 'a', 'b', T);
    v = interact(v, 'chat', 'c', 'd', T + 20 * HALF_LIFE_MS);
    expect(v.bonds.map((b) => b.a)).toEqual(['c']);
  });
});

describe('the rest', () => {
  it('knows a close game', () => {
    expect(closeGame([11, 9])).toBe(true);
    expect(closeGame([12, 14])).toBe(true);
    expect(closeGame([11, 5])).toBe(false);
  });

  it('forgets someone let go', () => {
    let v = interact(emptySocial(), 'chat', 'a', 'b', T);
    v = interact(v, 'chat', 'c', 'b', T);
    v = dropAgent(v, 'b');
    expect(v).toEqual({ bonds: [], recent: [] });
  });

  it('loads only well-formed data from a state file, and sorts each pair', () => {
    expect(loadSocial(undefined)).toEqual(emptySocial());
    const v = loadSocial({ bonds: [{ a: 'z', b: 'y', friend: 40, rival: 0, at: T }, { a: 'x', b: 'x', friend: 1, rival: 1, at: T }, { a: 'q' }], recent: [null, { at: T, kind: 'chat', a: 'z', b: 'y', friend: 6, rival: 0 }] });
    expect(v.bonds).toEqual([{ a: 'y', b: 'z', friend: 40, rival: 0, at: T }]);
    expect(v.recent).toHaveLength(1);
    expect(v.recent[0].note).toBe('');
  });

  it('lists the strongest pairs of either kind', () => {
    let v = emptySocial();
    for (let i = 0; i < 3; i++) v = interact(v, 'qa-pass', 'a', 'b', T);
    for (let i = 0; i < 2; i++) v = interact(v, 'close-pong', 'c', 'd', T);
    v = interact(v, 'chat', 'e', 'f', T);
    expect(strongest(v, T).map((p) => `${p.a}-${p.b}:${p.kind}`)).toEqual(['a-b:friend', 'c-d:rival']);
  });
});
