// Where the switched-on mods' props and posters stand on a floor (docs/mods.md), the pure side: their named spots
// (the holiday themes' slots, layout.ts decorSlots) or fixed points, a mod theme's decorations while it's on, and the
// solid footprints the player bumps into. ModScene.tsx draws them; Game.tsx adds the colliders.
import type { ModFloor, ModPlace, ModPosterView, ModPropView, ModThemeView, ModView } from '../../../shared/mods';
import type { ThemeId } from '../../../shared/themes';
import { footprint } from '../world/decor/decor';
import { decorSlots, type Rect } from '../world/layout';
import { placeDecor } from '../world/themes/themes';

export type ModItem = { kind: 'prop'; prop: ModPropView } | { kind: 'poster'; poster: ModPosterView };

export interface ModPlacement {
  item: ModItem;
  x: number;
  y: number;
  z: number;
  rotY: number;
  /** Where it came from: `slot:<id>`, or `at:<n>` for a fixed point. */
  where: string;
}

/** Posters hang with their middle this high when a fixed point doesn't say. */
export const POSTER_Y = 1.7;

const matches = (pattern: string, id: string) => (pattern.endsWith('*') ? id.startsWith(pattern.slice(0, -1)) : id === pattern);
const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Everything the mods put on a floor kind: each item's own places, then the mod theme's decorations (`theme`, while
 * it's on). A named spot holds one thing: a holiday theme's decoration there (`holiday`) or the first mod to claim it.
 */
export function modPlacements(mods: readonly ModView[], kind: ModFloor, theme: ModThemeView | null = null, holiday: ThemeId | null = null): ModPlacement[] {
  const slots = decorSlots(kind);
  const taken = new Set(placeDecor(holiday, kind).map((d) => d.slot.id));
  const out: ModPlacement[] = [];
  const items = new Map<string, ModItem>();
  for (const m of mods) {
    for (const prop of m.props) items.set(prop.key, { kind: 'prop', prop });
    for (const poster of m.posters) items.set(poster.key, { kind: 'poster', poster });
  }
  const put = (item: ModItem, p: ModPlace, n: number) => {
    const h = item.kind === 'poster' ? item.poster.height : 0;
    if ('slot' in p) {
      if (p.floor && p.floor !== kind) return;
      for (const s of slots) {
        if (!matches(p.slot, s.id) || taken.has(s.id)) continue;
        taken.add(s.id);
        out.push({ item, x: s.x, y: s.y + h / 2, z: s.z, rotY: s.rotY, where: `slot:${s.id}` });
      }
      return;
    }
    if (p.floor !== kind) return;
    out.push({ item, x: p.x, y: p.y ?? (item.kind === 'poster' ? POSTER_Y : 0), z: p.z, rotY: rad(p.turn ?? 0), where: `at:${n}` });
  };
  for (const item of items.values()) (item.kind === 'prop' ? item.prop.place : item.poster.place).forEach((p, n) => put(item, p, n));
  if (theme) {
    for (const d of theme.decor) {
      const item = items.get(d.item);
      if (item) put(item, { slot: d.slots, floor: d.floor }, 0);
    }
  }
  return out;
}

/** The solid ones' footprints, for the player's colliders: props with a footprint standing on the floor. */
export function modColliders(placed: readonly ModPlacement[]): Rect[] {
  return placed.flatMap(({ item, x, y, z, rotY }) => {
    if (item.kind !== 'prop' || !item.prop.footprint || y > 0.3) return [];
    const [w, d] = item.prop.footprint;
    return [footprint(x, z, w, d, rotY, y + item.prop.height)];
  });
}
