// Mods (docs/mods.md), what both sides agree on: the limits, the ids and keys, where an item can go, and the views the
// server's mod scanner (server/mods.ts) sends in the snapshot and the `mods` event. Mods are data and assets only:
// nothing in a mod is ever run.

/** What one mod, and all of them, may hold. */
export const MOD_LIMITS = {
  mods: 50,
  manifestBytes: 256 * 1024,
  /** A .glb model, self-contained. */
  modelBytes: 5 * 1024 * 1024,
  /** A PNG, JPG or WebP picture, and its longest side in pixels. */
  imageBytes: 2 * 1024 * 1024,
  imageSide: 2048,
  props: 24,
  posters: 24,
  songs: 12,
  themes: 4,
  shapes: 48,
  places: 32,
} as const;

/** A mod's folder name, and the id of everything in it: lowercase letters, digits, - and _. */
export const MOD_ID = /^[a-z0-9][a-z0-9_-]{0,47}$/;
export const isModId = (v: unknown): v is string => typeof v === 'string' && MOD_ID.test(v);

/** Everything a mod adds is known office-wide by its key, `mod:<mod>/<id>`. */
export type ModKey = `mod:${string}`;
const KEY = /^mod:([a-z0-9][a-z0-9_-]{0,47})\/([a-z0-9][a-z0-9_-]{0,47})$/;
export const modKey = (mod: string, id: string): ModKey => `mod:${mod}/${id}`;
export const isModKey = (v: unknown): v is ModKey => typeof v === 'string' && KEY.test(v);
/** The mod a key belongs to, or null. */
export const modOfKey = (key: string): string | null => KEY.exec(key)?.[1] ?? null;

export type ModKind = 'props' | 'posters' | 'songs' | 'themes';
export const MOD_KINDS: readonly ModKind[] = ['props', 'posters', 'songs', 'themes'];

export type ModFloor = 'lobby' | 'office';

/**
 * The named spots of the holiday themes (client/src/world/layout.ts decorSlots), or a family of them ending in `*`
 * (`desk-*`). layout.test.ts checks every slot matches.
 */
export const MOD_SLOT = /^(?:(?:desk|qa)-(?:\d{1,2}|\*)|corner-(?:nw|ne|se|sw|\*)|elevator-(?:w|e|\*)|balcony-(?:[ew]-[ns]|\*)|reception-(?:w|e|\*)|lobby-feature|patio|manager-desk|cabinet-top|banner)$/;

/**
 * Where an item goes: a named spot (on both kinds of floor that have it, or just `floor`), or a fixed point on every
 * office floor or in the lobby: x west (-) to east (+), z north (-) to south (+), y up (a poster's middle), turn in
 * degrees (0 faces south, into the room from the north wall; 90 faces east).
 */
export type ModPlace = { slot: string; floor?: ModFloor } | { floor: ModFloor; x: number; z: number; y?: number; turn?: number };

/** A prop built from simple shapes: size in metres (w, h, d; a sphere's w is its diameter), at its offset, turned in degrees. */
export interface ModShape {
  shape: 'box' | 'sphere' | 'cylinder' | 'cone';
  size: [number, number, number];
  at: [number, number, number];
  turn?: [number, number, number];
  color: string;
}

export interface ModPropView {
  key: ModKey;
  id: string;
  name: string;
  icon: string;
  /** The model's URL (a .glb, scaled to `height`), or null for one built from `shapes`. */
  model: string | null;
  shapes: ModShape[] | null;
  height: number;
  place: ModPlace[];
  /** Its footprint on the floor (w x d metres), solid to walk into; null to walk through it. */
  footprint: [number, number] | null;
}

export interface ModPosterView {
  key: ModKey;
  id: string;
  name: string;
  image: string;
  /** Size on the wall in metres (height from the picture's shape), and the picture's own pixels. */
  width: number;
  height: number;
  pixels: [number, number];
  frame: boolean;
  place: ModPlace[];
}

export type ModInstrument = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'keys' | 'pad';
export type ModWave = 'sine' | 'square' | 'sawtooth' | 'triangle';

interface ModSection {
  chords: number[];
  lead: string;
  bass?: string;
  comp?: string;
  drums?: { kick: string; snare: string; hat: string };
}

/** A jukebox song in the playlist's own format (client/src/world/jukeboxSongs.ts Song), its id being its key. */
export interface ModSongData {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  swing: number;
  root: number;
  scale: 'major' | 'minor' | 'dorian' | 'mixolydian';
  chords: number[];
  sevenths?: boolean;
  ninths?: boolean;
  lead: string;
  bass: string;
  comp: string;
  drums: { kick: string; snare: string; hat: string };
  sound: { lead: ModInstrument; bass: ModWave; chord: ModInstrument };
  passes: number;
  color: string;
  mood?: 'lively' | 'lofi' | 'ambient' | 'uplifting';
  texture?: { crackle?: boolean; warmth?: number; wobble?: boolean; softDrums?: boolean };
  sections?: Record<string, ModSection>;
  form?: string;
  arrangement?: 'breakdown' | 'build' | 'sparse';
}

export interface ModSongView {
  key: ModKey;
  id: string;
  title: string;
  /** all: it takes turns with the usual songs on the All station; focus: on Focus and All. */
  station: 'all' | 'focus';
  song: ModSongData;
}

/** The costumes a mod theme can hand out (the holiday themes' own, client/src/world/themes/themes.ts). */
export const MOD_COSTUMES = [
  'witchHat',
  'pumpkinHead',
  'vampire',
  'ghost',
  'catEars',
  'skeleton',
  'deerstalker',
  'crown',
  'santaHat',
  'antlers',
  'uglySweater',
  'partyHat',
  'heartBoppers',
  'bunnyEars',
] as const;
export type ModCostume = (typeof MOD_COSTUMES)[number];

/** A mod theme's days each year, month-day to month-day (both included; 12-30 to 01-02 crosses the new year). */
export interface ModDates {
  from: string;
  to: string;
}

export interface ModThemeView {
  key: ModKey;
  id: string;
  name: string;
  emoji: string;
  /** null: only when Settings → Themes forces it. */
  dates: ModDates | null;
  /** Which of this mod's props and posters (by key) go in which named spots while it's on. */
  decor: { slots: string; item: ModKey; floor?: ModFloor }[];
  lights: string[] | null;
  bunting: string[] | null;
  tint: { color: string; amount: number };
  sky: { color: string; amount: number; fog: number } | null;
  costumes: { dev: ModCostume[]; qa: ModCostume[]; ceo: ModCostume[] };
  /** The CEO's phone greeting, one a day while it's on (`{name}`: the manager's). */
  greetings: string[];
  /** Song keys, played before the usual playlist. */
  playlist: ModKey[];
  confetti: { colors: string[]; shape: 'paper' | 'heart' } | null;
}

export interface ModView {
  /** Its folder's name. */
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  kinds: ModKind[];
  enabled: boolean;
  /** Loaded: false when it has errors, and then nothing of it is used. */
  ok: boolean;
  errors: string[];
  props: ModPropView[];
  posters: ModPosterView[];
  songs: ModSongView[];
  themes: ModThemeView[];
}

export interface ModsView {
  /** The mods folder, to show (the office never opens it). */
  dir: string;
  mods: ModView[];
  /** When the folder was last read. */
  scannedAt: number;
  /** Folder-level problems (too many mods, an unreadable folder). */
  errors: string[];
  /** The example mod's folder name, when it can be copied in (it isn't there yet). */
  example: string | null;
}

export const EMPTY_MODS: ModsView = { dir: '', mods: [], scannedAt: 0, errors: [], example: null };

/** The mods that are loaded and switched on. */
export const activeMods = (v: ModsView | undefined): ModView[] => (v?.mods ?? []).filter((m) => m.ok && m.enabled);

// ---------- dates ----------

const md = (s: string) => {
  const [m, d] = s.split('-').map(Number);
  return m * 100 + d;
};

/** Whether the local date falls in a mod theme's days. */
export function inModDates(dates: ModDates, date: Date): boolean {
  const now = (date.getMonth() + 1) * 100 + date.getDate();
  const from = md(dates.from);
  const to = md(dates.to);
  return from <= to ? now >= from && now <= to : now >= from || now <= to;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayName = (s: string) => {
  const [m, d] = s.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};

/** A theme's days in words, like Settings → Themes shows the holidays': "1–7 Oct", or "only when forced on". */
export function modDatesLabel(dates: ModDates | null): string {
  if (!dates) return 'only when forced on';
  if (dates.from === dates.to) return dayName(dates.from);
  return `${dayName(dates.from)}–${dayName(dates.to)}`;
}
