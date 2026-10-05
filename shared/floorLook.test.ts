import { describe, expect, it } from 'vitest';
import { cleanFloorLook, DEFAULT_FLOOR_LAYOUT, DEFAULT_FLOOR_STYLE, FLOOR_LAYOUTS, FLOOR_STYLES, isFloorLayout, isFloorStyle, LAYOUT_INFO, STYLE_INFO } from './floorLook.ts';

describe('floor looks', () => {
  it('defaults to the office as it always was', () => {
    expect(DEFAULT_FLOOR_STYLE).toBe('classic');
    expect(DEFAULT_FLOOR_LAYOUT).toBe('open');
    expect(cleanFloorLook({})).toEqual({ style: 'classic', layout: 'open' });
  });

  it('keeps known values and drops anything else', () => {
    expect(cleanFloorLook({ style: 'library', layout: 'cubicles' })).toEqual({ style: 'library', layout: 'cubicles' });
    expect(cleanFloorLook({ style: 'disco', layout: 3 })).toEqual({ style: 'classic', layout: 'open' });
    expect(isFloorStyle('neon')).toBe(true);
    expect(isFloorStyle('NEON')).toBe(false);
    expect(isFloorLayout('pods')).toBe(true);
    expect(isFloorLayout(undefined)).toBe(false);
  });

  it('names every style and layout for the console', () => {
    for (const s of FLOOR_STYLES) expect(STYLE_INFO[s].name).toBeTruthy();
    for (const l of FLOOR_LAYOUTS) expect(LAYOUT_INFO[l].name).toBeTruthy();
  });
});
