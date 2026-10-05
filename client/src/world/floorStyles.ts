// Floor makeovers (#265): each interior style as data. Shell.tsx paints the walls, floor and ceiling from it,
// StyleDressing.tsx stands up its props (on the ceiling, the walls and the north wall's feature spot, layout.ts's
// STYLE_FEATURE), and layout.ts's STYLE_FLOOR says what footsteps sound like on it. Pure: no three.js.

import type { FloorStyle } from '../../../shared/floorLook';
import type { Surface } from './layout';
import { STYLE_FLOOR } from './layout';

/** How the floor is drawn: planks, poured concrete, square tiles (glossy, with `shine`) or wall-to-wall carpet. */
export type FloorPattern = 'planks' | 'concrete' | 'tiles' | 'carpet';
/** How the walls are drawn: plain paint, brick, or wood panelling below a painted band. */
export type WallPattern = 'plain' | 'brick' | 'panelling';

export interface StyleLook {
  wall: string;
  wallPattern: WallPattern;
  /** Mortar between bricks, or the panelling's wood below the dado rail. */
  wallDetail: string;
  floor: string;
  floorPattern: FloorPattern;
  ceiling: string;
  /** The ceiling lights' panels: their colour sets the room's light. */
  lamp: string;
  /** Pendants (StyleDressing.tsx) hang where the ceiling panels would. */
  pendants: boolean;
  /** A cartoon sheen on the floor's tiles. */
  gloss: boolean;
  /** A hemisphere light over the floor in the style's tint (sky colour, ground colour, intensity); none for classic. */
  tint: [string, string, number] | null;
  /** The skirting and the accent stripe round the walls take the floor's accent colour; false: the style's own trim. */
  accentTrim: boolean;
  trim: string;
  /** What the desks' rugs are, mixed with the floor's accent colour (0: all accent, 1: all this). */
  rug: string;
  rugMix: number;
  /** Footsteps between the rugs (layout.ts). */
  surface: Surface;
}

export const STYLE_LOOKS: Record<FloorStyle, StyleLook> = {
  classic: {
    wall: '#fbf3e4',
    wallPattern: 'plain',
    wallDetail: '#fbf3e4',
    floor: '#d9b48a',
    floorPattern: 'planks',
    ceiling: '#f3efe6',
    lamp: '#fffbe8',
    pendants: false,
    gloss: false,
    tint: null,
    accentTrim: true,
    trim: '#ffffff',
    rug: '#ffffff',
    rugMix: 0,
    surface: STYLE_FLOOR.classic,
  },
  loft: {
    wall: '#a8533c',
    wallPattern: 'brick',
    wallDetail: '#d9c7b0',
    floor: '#9a9893',
    floorPattern: 'concrete',
    ceiling: '#3b3633',
    lamp: '#ffc46b',
    pendants: true,
    gloss: false,
    tint: ['#ffd29a', '#6b4a35', 0.25],
    accentTrim: false,
    trim: '#2b2522',
    rug: '#7a5c45',
    rugMix: 0.55,
    surface: STYLE_FLOOR.loft,
  },
  scandi: {
    wall: '#fbfbf8',
    wallPattern: 'plain',
    wallDetail: '#fbfbf8',
    floor: '#ead8bd',
    floorPattern: 'planks',
    ceiling: '#ffffff',
    lamp: '#ffffff',
    pendants: false,
    gloss: false,
    tint: ['#f2f7ff', '#d8cbb4', 0.2],
    accentTrim: false,
    trim: '#e4ddd2',
    rug: '#f1ece4',
    rugMix: 0.7,
    surface: STYLE_FLOOR.scandi,
  },
  neon: {
    wall: '#2a2140',
    wallPattern: 'plain',
    wallDetail: '#2a2140',
    floor: '#1b1730',
    floorPattern: 'tiles',
    ceiling: '#141022',
    lamp: '#c9b6ff',
    pendants: false,
    gloss: true,
    tint: ['#ff5ecb', '#3a2fff', 0.35],
    accentTrim: false,
    trim: '#ff3fbf',
    rug: '#312654',
    rugMix: 0.6,
    surface: STYLE_FLOOR.neon,
  },
  greenhouse: {
    wall: '#e8f1e4',
    wallPattern: 'plain',
    wallDetail: '#e8f1e4',
    floor: '#c98b62',
    floorPattern: 'tiles',
    ceiling: '#dfeee6',
    lamp: '#f6fff0',
    pendants: false,
    gloss: false,
    tint: ['#e9ffe0', '#7da36a', 0.3],
    accentTrim: false,
    trim: '#4f7a4a',
    rug: '#a7c98f',
    rugMix: 0.55,
    surface: STYLE_FLOOR.greenhouse,
  },
  library: {
    wall: '#e9dcc0',
    wallPattern: 'panelling',
    wallDetail: '#6b4429',
    floor: '#6e2f2c',
    floorPattern: 'carpet',
    ceiling: '#efe3c8',
    lamp: '#ffe2a8',
    pendants: true,
    gloss: false,
    tint: ['#ffe0a6', '#5a3622', 0.25],
    accentTrim: false,
    trim: '#4a2e1c',
    rug: '#8a3b36',
    rugMix: 0.7,
    surface: STYLE_FLOOR.library,
  },
};

/** The style's look (an unknown id, from an older office, is classic). */
export const styleLook = (style: FloorStyle | undefined): StyleLook => STYLE_LOOKS[style ?? 'classic'] ?? STYLE_LOOKS.classic;
