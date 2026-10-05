import { describe, expect, it } from 'vitest';
import { MOD_SLOT, type ModPosterView, type ModPropView, type ModThemeView, type ModView } from '../../../shared/mods';
import { decorSlots } from '../world/layout';
import { modColliders, modPlacements, POSTER_Y } from './placing';

const prop = (id: string, extra: Partial<ModPropView> = {}): ModPropView => ({
  key: `mod:m/${id}`,
  id,
  name: id,
  icon: '🗿',
  model: null,
  shapes: [{ shape: 'box', size: [1, 1, 1], at: [0, 0, 0], color: '#ffffff' }],
  height: 1,
  place: [],
  footprint: null,
  ...extra,
});

const poster = (id: string, extra: Partial<ModPosterView> = {}): ModPosterView => ({
  key: `mod:m/${id}`,
  id,
  name: id,
  image: '/x.png',
  width: 1,
  height: 1.3,
  pixels: [400, 520],
  frame: true,
  place: [],
  ...extra,
});

const mod = (props: ModPropView[], posters: ModPosterView[] = []): ModView => ({
  id: 'm',
  name: 'M',
  version: '1.0.0',
  author: 'a',
  description: '',
  kinds: ['props'],
  enabled: true,
  ok: true,
  errors: [],
  props,
  posters,
  songs: [],
  themes: [],
});

const theme: ModThemeView = {
  key: 'mod:m/t',
  id: 't',
  name: 'T',
  emoji: '🎉',
  dates: null,
  decor: [{ slots: 'desk-*', item: 'mod:m/mini' }],
  lights: null,
  bunting: null,
  tint: { color: '#ffffff', amount: 0 },
  sky: null,
  costumes: { dev: [], qa: [], ceo: [] },
  greetings: [],
  playlist: [],
  confetti: null,
};

describe('mod slots', () => {
  it('every holiday slot is one a mod can name', () => {
    for (const kind of ['office', 'lobby'] as const) for (const s of decorSlots(kind)) expect(s.id, s.id).toMatch(MOD_SLOT);
  });
});

describe('modPlacements', () => {
  it('puts a prop in its named spot on the floor that has it, and a poster at its fixed point', () => {
    const mods = [mod([prop('statue', { place: [{ slot: 'lobby-feature' }] })], [poster('p', { place: [{ floor: 'lobby', x: 15.97, z: 7.5, turn: -90 }] })])];
    const lobby = modPlacements(mods, 'lobby');
    expect(lobby.map((p) => p.where)).toEqual(['slot:lobby-feature', 'at:0']);
    expect(lobby[1]).toMatchObject({ x: 15.97, y: POSTER_Y, z: 7.5, rotY: -Math.PI / 2 });
    expect(modPlacements(mods, 'office')).toEqual([]);
  });

  it('fills every desk for a family of spots, and keeps to a floor kind when told', () => {
    const office = modPlacements([mod([prop('cube', { place: [{ slot: 'desk-*' }, { slot: 'elevator-*', floor: 'lobby' }] })])], 'office');
    expect(office.length).toBe(decorSlots('office').filter((s) => s.id.startsWith('desk-')).length);
    expect(modPlacements([mod([prop('cube', { place: [{ slot: 'elevator-*', floor: 'lobby' }] })])], 'lobby')).toHaveLength(2);
  });

  it("leaves a holiday's spots to the holiday, and gives a spot to the first mod that claims it", () => {
    const mods = [mod([prop('a', { place: [{ slot: 'lobby-feature' }] }), prop('b', { place: [{ slot: 'lobby-feature' }] })])];
    expect(modPlacements(mods, 'lobby', null, 'christmas')).toEqual([]); // the tree stands there
    expect(modPlacements(mods, 'lobby').map((p) => (p.item.kind === 'prop' ? p.item.prop.id : ''))).toEqual(['a']);
  });

  it("adds a mod theme's decorations only while it's on", () => {
    const mods = [mod([prop('mini')])];
    expect(modPlacements(mods, 'office')).toEqual([]);
    expect(modPlacements(mods, 'office', theme).length).toBeGreaterThan(3);
  });
});

describe('modColliders', () => {
  it('makes props with a footprint on the floor solid, turned with them', () => {
    const placed = modPlacements([mod([prop('s', { footprint: [2, 1], height: 1.4, place: [{ floor: 'lobby', x: 0, z: 0, turn: 90 }] }), prop('t', { place: [{ floor: 'lobby', x: 3, z: 3 }] })])], 'lobby');
    const [r, ...rest] = modColliders(placed);
    expect(rest).toEqual([]);
    expect(r.maxX - r.minX).toBeCloseTo(1);
    expect(r.maxZ - r.minZ).toBeCloseTo(2);
    expect(r.h).toBeCloseTo(1.4);
  });
});
