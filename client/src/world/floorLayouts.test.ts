import { afterEach, describe, expect, it } from 'vitest';
import { FLOOR_LAYOUTS, FLOOR_STYLES, type FloorLayout } from '../../../shared/floorLook';
import { reservedDecorRects } from './decor/decor';
import {
  DESK,
  DECOR_SLOT_AT,
  HALF_D,
  HALF_W,
  LAYOUTS,
  MAX_DESKS,
  QA_LAB,
  QA_RUG,
  STYLE_FLOOR,
  collide,
  decorSlots,
  deskPlace,
  deskPoint,
  layoutColliders,
  officeAnchors,
  officeColliders,
  officeLook,
  setOfficeLook,
  styleFeatureRect,
  surfaceAt,
  type Rect,
} from './layout';
import { CHAT_VENUES } from './socials';
import { DOG_R, dogPlaces } from './toys/dogPlaces';
import { clear } from './toys/roombaBrain';
import { findPath, spot, standable, walkways } from './walkways';

// Every desk layout (#265) keeps twelve desks and the QA lab, round the same named anchors, and people, the dog and
// the roomba can get everywhere they go in every one of them, whatever the style.

const overlaps = (a: Rect, b: Rect, pad = 0) => a.minX < b.maxX + pad && a.maxX > b.minX - pad && a.minZ < b.maxZ + pad && a.maxZ > b.minZ - pad;
const at = (x: number, z: number): Rect => ({ minX: x, maxX: x, minZ: z, maxZ: z });

afterEach(() => setOfficeLook({ layout: 'open', style: 'classic' }));

describe.each(FLOOR_LAYOUTS)('the %s layout', (layout: FloorLayout) => {
  const plan = LAYOUTS[layout];
  const mine = layoutColliders(layout);

  it('has twelve desks, inside the room, apart, each facing north or south', () => {
    expect(plan.desks).toHaveLength(MAX_DESKS);
    for (const d of plan.desks) {
      expect(Math.abs(d.x)).toBeLessThan(HALF_W - 2);
      expect(Math.abs(d.z)).toBeLessThan(HALF_D - 2);
      expect([0, Math.PI]).toContain(d.rotY);
    }
    for (let i = 0; i < MAX_DESKS; i++)
      for (let j = i + 1; j < MAX_DESKS; j++) expect(Math.hypot(plan.desks[i].x - plan.desks[j].x, plan.desks[i].z - plan.desks[j].z), `${i} ${j}`).toBeGreaterThan(DESK.d - 0.01);
  });

  it('keeps clear of every anchor, the QA lab, the decoration slots and the style feature', () => {
    // with room to walk round the solid ones; the QA lab's rug just mustn't go under a desk
    const fixed: [string, Rect, number][] = [
      ...Object.entries(officeAnchors()).map(([name, r]): [string, Rect, number] => [name, r, 0.6]),
      ['feature', styleFeatureRect(), 0.6],
      ['qa', QA_RUG, 0],
      ...reservedDecorRects().map((r, i): [string, Rect, number] => [`decor-${i}`, r, 0.6]),
    ];
    for (const r of mine) for (const [name, f, pad] of fixed) expect(overlaps(r, f, pad), `${name} ${JSON.stringify(r)}`).toBe(false);
    // the decoration rugs in front of the elevator and under the ping-pong table stay clear too
    for (const id of ['r-entry', 'r-lounge']) {
      const s = DECOR_SLOT_AT[id];
      for (const r of mine) expect(overlaps(r, { minX: s.x - s.w / 2, maxX: s.x + s.w / 2, minZ: s.z - s.d / 2, maxZ: s.z + s.d / 2 }), id).toBe(false);
    }
  });

  it('has every anchor in its colliders, in every style, and the feature only when styled', () => {
    for (const style of FLOOR_STYLES) {
      const all = officeColliders(layout, style);
      for (const [name, a] of Object.entries(officeAnchors())) expect(all, name).toContainEqual(a);
      expect(all.some((r) => JSON.stringify(r) === JSON.stringify(styleFeatureRect()))).toBe(style !== 'classic');
    }
  });

  it('gives every desk its decoration slot on the desk, turned with it', () => {
    const slots = decorSlots('office', layout);
    for (let s = 0; s < MAX_DESKS; s++) {
      const slot = slots.find((x) => x.id === `desk-${s}`)!;
      const d = deskPlace(s, layout);
      expect(Math.abs(slot.x - d.x)).toBeLessThan(DESK.w / 2);
      expect(Math.abs(slot.z - d.z)).toBeLessThan(DESK.d / 2);
      expect(slot.rotY).toBe(d.rotY);
    }
    expect(slots.filter((x) => x.id.startsWith('qa-'))).toHaveLength(QA_LAB.stations.length);
  });

  it.each(['classic', 'library'] as const)('people reach every desk and every spot from the elevator, in %s', (style) => {
    setOfficeLook({ layout, style });
    const w = walkways('office');
    expect(w.homes).toHaveLength(MAX_DESKS + QA_LAB.stations.length);
    const lift = spot(w, 'elevator')!;
    for (const h of w.homes) {
      expect(standable(w, h.x, h.z), h.id).toBe(true);
      expect(findPath(w, lift, h), h.id).not.toBeNull();
    }
    for (const s of w.spots) {
      expect(standable(w, s.x, s.z), s.id).toBe(true);
      expect(findPath(w, w.homes[0], s), s.id).not.toBeNull();
    }
    // the chats' venues have room round them
    for (const [name, v] of Object.entries(CHAT_VENUES)) expect(findPath(w, lift, v), name).not.toBeNull();
  });

  it('stands every desk up facing it, just behind its chair', () => {
    setOfficeLook({ layout, style: 'classic' });
    const w = walkways('office');
    for (let s = 0; s < MAX_DESKS; s++) {
      const h = spot(w, `desk-${s}`)!;
      const d = deskPlace(s, layout);
      const toDesk = Math.atan2(d.z - h.z, d.x - h.x);
      expect(Math.cos(toDesk - h.facing)).toBeCloseTo(1, 6);
      const chair = deskPoint(d, 0, 0.8);
      expect(Math.hypot(chair.x - h.x, chair.z - h.z)).toBeCloseTo(0.7, 6);
    }
  });

  it("gives the dog naps on the rugs it can get to", () => {
    setOfficeLook({ layout, style: 'scandi' });
    const p = dogPlaces('office');
    const naps = p.naps.filter((n) => n.id.startsWith('rug-'));
    expect(naps.length).toBeGreaterThan(0);
    for (const n of naps) {
      expect(clear(p.rects, n.x, n.z, DOG_R), n.id).toBe(true);
      expect(findPath(walkways('office'), p.door, n), n.id).not.toBeNull();
    }
  });

  it('lets the player walk the aisles: nothing pushes them off the paths people take', () => {
    setOfficeLook({ layout, style: 'neon' });
    const w = walkways('office');
    const rects = officeColliders();
    const lift = spot(w, 'elevator')!;
    for (const h of w.homes) {
      let from = { x: lift.x, z: lift.z };
      for (const p of findPath(w, lift, h)!) {
        for (let t = 0; t <= 1; t += 0.1) {
          const x = from.x + (p.x - from.x) * t;
          const z = from.z + (p.z - from.z) * t;
          const pushed = collide(x, z, rects);
          expect(Math.hypot(pushed.x - x, pushed.z - z), `${h.id} at ${x.toFixed(2)}, ${z.toFixed(2)}`).toBeLessThan(0.05);
        }
        from = p;
      }
    }
  });

  it('puts rugs underfoot where they lie, and the style floor elsewhere', () => {
    for (const r of plan.rugs) expect(surfaceAt('office', (r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, { layout, style: 'loft' })).toBe('rug');
    expect(surfaceAt('office', -13, -10.5, { layout, style: 'loft' })).toBe('concrete');
  });
});

describe('the office floor on screen', () => {
  it('starts out classic and open plan', () => {
    expect(officeLook()).toEqual({ layout: 'open', style: 'classic' });
  });

  it('places desks by the layout on screen unless told one', () => {
    setOfficeLook({ layout: 'pods', style: 'classic' });
    expect(deskPlace(0)).toEqual(LAYOUTS.pods.desks[0]);
    expect(deskPlace(0, 'open')).toEqual(LAYOUTS.open.desks[0]);
  });

  it('builds a walk grid for each look, and reuses it', () => {
    setOfficeLook({ layout: 'cubicles', style: 'classic' });
    const a = walkways('office');
    setOfficeLook({ layout: 'benching', style: 'classic' });
    const b = walkways('office');
    expect(b).not.toBe(a);
    setOfficeLook({ layout: 'cubicles', style: 'classic' });
    expect(walkways('office')).toBe(a);
  });

  it('sounds each style right underfoot, away from the rugs', () => {
    for (const style of FLOOR_STYLES) expect(surfaceAt('office', -13, -10.5, { layout: 'open', style })).toBe(STYLE_FLOOR[style]);
    expect(STYLE_FLOOR.classic).toBe('wood');
    expect(STYLE_FLOOR.loft).toBe('concrete');
    expect(STYLE_FLOOR.library).toBe('rug');
    expect(surfaceAt('office', 0, HALF_D + 1, { layout: 'open', style: 'library' })).toBe('cabin');
  });

  it("keeps the style feature off the roomba's dock and the walk to the cooler", () => {
    setOfficeLook({ layout: 'open', style: 'library' });
    const w = walkways('office');
    expect(overlaps(styleFeatureRect(), at(12.8, -11.5), 0.4)).toBe(false);
    expect(findPath(w, spot(w, 'board-done') ?? w.homes[0], spot(w, 'cooler')!)).not.toBeNull();
  });
});
