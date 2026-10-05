import { afterEach, describe, expect, it } from 'vitest';
import { LAYOUTS, setOfficeLook } from './layout';
import { lookFor, noteLayout, overrideFrom, takeLayoutMove } from './floorLook';
import { deskSpot, findPath, nearestStandable, spot, standable, walkways } from './walkways';

afterEach(() => setOfficeLook({ layout: 'open', style: 'classic' }));

describe('a floor look on screen', () => {
  it("reads ?style= and ?layout=, ignoring what it doesn't know", () => {
    expect(overrideFrom('?style=library&layout=cubicles')).toEqual({ style: 'library', layout: 'cubicles' });
    expect(overrideFrom('?layout=pods&stats')).toEqual({ layout: 'pods' });
    expect(overrideFrom('?style=disco&layout=')).toEqual({});
  });

  it("is the floor's own, overridden where asked, and classic open plan for floors saved before makeovers", () => {
    expect(lookFor({ style: 'neon', layout: 'benching' }, {})).toEqual({ style: 'neon', layout: 'benching' });
    expect(lookFor({ style: 'neon', layout: 'benching' }, { layout: 'pods' })).toEqual({ style: 'neon', layout: 'pods' });
    expect(lookFor({}, {})).toEqual({ style: 'classic', layout: 'open' });
  });

  it('remembers a layout change on the floor you stay on, once, but not arriving on a changed floor', () => {
    noteLayout('o/a', 'open');
    noteLayout('o/a', 'open');
    expect(takeLayoutMove('o/a')).toBeUndefined();
    noteLayout('o/a', 'pods');
    expect(takeLayoutMove('o/a')).toBe('open');
    expect(takeLayoutMove('o/a')).toBeUndefined();
    noteLayout('o/b', 'cubicles'); // up to another floor…
    noteLayout('o/a', 'benching'); // …and back to one changed meanwhile
    expect(takeLayoutMove('o/a')).toBeUndefined();
  });
});

describe('changing desks', () => {
  it('walks everyone from their old desk to their new one, whichever layouts', () => {
    for (const from of Object.keys(LAYOUTS) as (keyof typeof LAYOUTS)[])
      for (const to of Object.keys(LAYOUTS) as (keyof typeof LAYOUTS)[]) {
        setOfficeLook({ layout: to, style: 'classic' });
        const w = walkways('office');
        for (let s = 0; s < LAYOUTS[to].desks.length; s++) {
          const old = deskSpot(s, from);
          const start = nearestStandable(w, old.x, old.z);
          expect(start, `${from} → ${to} desk ${s}`).not.toBeNull();
          expect(standable(w, start!.x, start!.z)).toBe(true);
          expect(findPath(w, start!, spot(w, `desk-${s}`)!), `${from} → ${to} desk ${s}`).not.toBeNull();
        }
      }
  });
});
