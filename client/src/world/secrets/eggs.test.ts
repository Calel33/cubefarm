import { describe, expect, it } from 'vitest';
import { GONG } from '../layout';
import { advance, ceoHello, ceoLine, CEO_CLICKS, CEO_WINDOW_MS, cleanPolaroids, gongShot, isPiTime, KONAMI, pinPolaroid, POLAROID_KEEP, SPILL_WORD, wantsPolaroid, type Polaroid } from './eggs';

const type = (seq: readonly string[], keys: string[]) => {
  let at = 0;
  let done = 0;
  for (const k of keys) {
    at = advance(seq, at, k);
    if (at === seq.length) {
      done++;
      at = 0;
    }
  }
  return done;
};

describe('typed eggs', () => {
  const konami = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  it('spots the Konami code, in any case', () => {
    expect(type(KONAMI, konami)).toBe(1);
    expect(type(KONAMI, konami.map((k) => k.toUpperCase()))).toBe(1);
  });
  it('forgives an extra ↑ at the start, and anything typed before', () => {
    expect(type(KONAMI, ['x', 'ArrowUp', ...konami])).toBe(1);
  });
  it("doesn't go off for a near miss", () => {
    expect(type(KONAMI, konami.slice(0, 9).concat('c'))).toBe(0);
    expect(type(KONAMI, ['w', 'a', 's', 'd'])).toBe(0);
  });
  it('spots "coffee" even after "cof"', () => {
    expect(type(SPILL_WORD, [...'cofcoffee'])).toBe(1);
    expect(type(SPILL_WORD, [...'cofee'])).toBe(0);
  });
});

describe("the CEO's fan club", () => {
  it('waves on the tenth hello in a row', () => {
    let times: number[] = [];
    let waves = 0;
    for (let i = 0; i < CEO_CLICKS; i++) {
      const r = ceoHello(times, i * 500);
      times = r.times;
      if (r.wave) waves++;
    }
    expect(waves).toBe(1);
    expect(times).toEqual([]);
  });
  it('forgets hellos that are too old', () => {
    let times: number[] = [];
    for (let i = 0; i < CEO_CLICKS - 1; i++) times = ceoHello(times, i).times;
    expect(ceoHello(times, CEO_WINDOW_MS + 100).wave).toBe(false);
  });
  it('has a line to say', () => expect(ceoLine(3).length).toBeGreaterThan(5));
});

describe('the gong shot', () => {
  const face = GONG.z + GONG.d / 2;
  it('rings for a ball on the disc', () => expect(gongShot({ x: GONG.x, y: GONG.y, z: face + 0.12 }, 0.12)).toBe(true));
  it('not for one beside it, above it or far in front', () => {
    expect(gongShot({ x: GONG.x + 1.2, y: GONG.y, z: face + 0.12 }, 0.12)).toBe(false);
    expect(gongShot({ x: GONG.x, y: GONG.y + 1.1, z: face + 0.12 }, 0.12)).toBe(false);
    expect(gongShot({ x: GONG.x, y: GONG.y, z: face + 1 }, 0.12)).toBe(false);
  });
});

describe('π o’clock', () => {
  it('is 3:14 pm, local time', () => {
    expect(isPiTime(new Date(2026, 2, 14, 15, 14, 30).getTime())).toBe(true);
    expect(isPiTime(new Date(2026, 2, 14, 3, 14).getTime())).toBe(false);
    expect(isPiTime(new Date(2026, 2, 14, 15, 15).getTime())).toBe(false);
  });
});

describe('polaroids', () => {
  const at = new Date(2026, 9, 5, 10).getTime();
  const p = (moment: Polaroid['moment'], t: number): Polaroid => ({ moment, at: t, caption: 'x', image: null });
  it('takes only the first merge of each day', () => {
    expect(wantsPolaroid([], 'first-merge', at)).toBe(true);
    expect(wantsPolaroid([p('first-merge', at)], 'first-merge', at + 3_600_000)).toBe(false);
    expect(wantsPolaroid([p('first-merge', at)], 'first-merge', at + 86_400_000)).toBe(true);
  });
  it('takes other moments at most once a minute', () => {
    expect(wantsPolaroid([p('kaiju', at)], 'kaiju', at + 30_000)).toBe(false);
    expect(wantsPolaroid([p('kaiju', at)], 'kaiju', at + 90_000)).toBe(true);
  });
  it('keeps the newest few', () => {
    let wall: Polaroid[] = [];
    for (let i = 0; i < POLAROID_KEEP + 3; i++) wall = pinPolaroid(wall, p('gong-run', at + i));
    expect(wall).toHaveLength(POLAROID_KEEP);
    expect(wall[0].at).toBe(at + POLAROID_KEEP + 2);
  });
  it('drops saved junk', () => {
    expect(cleanPolaroids([p('kaiju', at), { moment: 'party', at, caption: '', image: null }, { ...p('kaiju', at), image: 'javascript:1' }, null])).toHaveLength(1);
  });
});
