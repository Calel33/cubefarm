// Floor makeovers, the part both ends share: each office floor's interior style and desk layout, chosen by the manager
// (Floor settings → Style & layout) and saved with the floor. The client draws them (world/floorStyles.ts, layout.ts);
// the server keeps them per floor and checks what it's sent.

export const FLOOR_STYLES = ['classic', 'loft', 'scandi', 'neon', 'greenhouse', 'library'] as const;
export type FloorStyle = (typeof FLOOR_STYLES)[number];

export const FLOOR_LAYOUTS = ['open', 'pods', 'cubicles', 'benching'] as const;
export type FloorLayout = (typeof FLOOR_LAYOUTS)[number];

/** A new floor, and every floor saved before makeovers, looks as the office always has. */
export const DEFAULT_FLOOR_STYLE: FloorStyle = 'classic';
export const DEFAULT_FLOOR_LAYOUT: FloorLayout = 'open';

export const isFloorStyle = (v: unknown): v is FloorStyle => typeof v === 'string' && (FLOOR_STYLES as readonly string[]).includes(v);
export const isFloorLayout = (v: unknown): v is FloorLayout => typeof v === 'string' && (FLOOR_LAYOUTS as readonly string[]).includes(v);

/** For the console: each style's name, emoji and a few words on it. */
export const STYLE_INFO: Record<FloorStyle, { name: string; emoji: string; blurb: string }> = {
  classic: { name: 'Classic', emoji: '🏢', blurb: 'warm planks and cream walls' },
  loft: { name: 'Brick loft', emoji: '🧱', blurb: 'exposed brick, timber beams, Edison bulbs, concrete' },
  scandi: { name: 'Scandinavian', emoji: '🌿', blurb: 'pale wood, white walls, soft rugs, lots of plants' },
  neon: { name: 'Neon night', emoji: '🌆', blurb: 'dark walls, neon strips, a glossy floor, synthwave posters' },
  greenhouse: { name: 'Greenhouse', emoji: '🪴', blurb: 'a glass roof, hanging plants, vines and a little fountain' },
  library: { name: 'Library', emoji: '📚', blurb: 'wood panelling, bookshelves, green lamps, a fireplace' },
};

export const LAYOUT_INFO: Record<FloorLayout, { name: string; emoji: string; blurb: string }> = {
  open: { name: 'Open plan', emoji: '▦', blurb: 'three rows of four desks' },
  pods: { name: 'Pods', emoji: '❖', blurb: 'three clusters of four, facing each other' },
  cubicles: { name: 'Cubicle farm', emoji: '▤', blurb: 'low-walled cubicles with name cards' },
  benching: { name: 'Benching', emoji: '☰', blurb: 'two long shared tables' },
};

/**
 * A floor's style and layout as saved: anything unknown (an older or newer office, a hand-edited state file) falls
 * back to the default rather than failing to load.
 */
export function cleanFloorLook(v: { style?: unknown; layout?: unknown }): { style: FloorStyle; layout: FloorLayout } {
  return { style: isFloorStyle(v.style) ? v.style : DEFAULT_FLOOR_STYLE, layout: isFloorLayout(v.layout) ? v.layout : DEFAULT_FLOOR_LAYOUT };
}
