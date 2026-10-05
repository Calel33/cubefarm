// Mods (docs/mods.md): the manager's own props, posters, jukebox songs and themes, from <SWARM_HOME>/mods/<mod>/. Data
// and assets only, never code: each folder's mod.json is checked against the schemas below, every file it names is
// resolved inside the mod's own folder (no `..`, no absolute paths, no links out) and checked for its size, its type and
// a picture's dimensions. A mod with any problem is skipped whole, its errors on the console's Mods page; the others
// load. Files are served only when a loaded manifest names them (GET /api/mods/:mod/files/*). Which mods are switched
// off is kept in <SWARM_HOME>/mods.json.
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  isModId,
  MOD_COSTUMES,
  MOD_ID,
  MOD_KINDS,
  MOD_LIMITS,
  MOD_SLOT,
  modKey,
  type ModKind,
  type ModPosterView,
  type ModPropView,
  type ModsView,
  type ModSongView,
  type ModThemeView,
  type ModView,
} from '../shared/mods.ts';
import type { ModThemeWindow } from '../shared/themes.ts';
import { HttpError } from './httpError.ts';

export const MANIFEST = 'mod.json';

// ---------- schemas ----------

const id = z.string().regex(MOD_ID, 'use lowercase letters, digits, - and _ (up to 48, starting with a letter or digit)');
const text = (max: number) => z.string().trim().min(1).max(max);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a colour like #ff8800');
const num = (min: number, max: number) => z.number().min(min).max(max);
const file = z.string().min(1).max(200);
const floor = z.enum(['lobby', 'office']);
const slot = z.string().regex(MOD_SLOT, 'not a spot the office has (see docs/mods.md: desk-*, reception-w, lobby-feature, …)');
const place = z.union([
  z.strictObject({ slot, floor: floor.optional() }),
  z.strictObject({ floor, x: num(-40, 40), z: num(-40, 40), y: num(0, 4).optional(), turn: num(-360, 360).optional() }),
]);
const places = z.array(place).max(MOD_LIMITS.places).default([]);
const vec = (min: number, max: number) => z.tuple([num(min, max), num(min, max), num(min, max)]);

const shape = z.strictObject({
  shape: z.enum(['box', 'sphere', 'cylinder', 'cone']),
  size: vec(0.01, 6),
  at: vec(-6, 6).default([0, 0, 0]),
  turn: vec(-360, 360).optional(),
  color,
});

const prop = z
  .strictObject({
    id,
    name: text(60),
    icon: z.string().max(8).default('🗿'),
    model: file.optional(),
    shapes: z.array(shape).min(1).max(MOD_LIMITS.shapes).optional(),
    height: num(0.05, 6).default(1),
    place: places,
    footprint: z.tuple([num(0.05, 6), num(0.05, 6)]).optional(),
  })
  .refine((p) => !!p.model !== !!p.shapes, 'give a prop either "model" (a .glb file) or "shapes", not both');

const poster = z.strictObject({
  id,
  name: text(60),
  image: file,
  width: num(0.2, 6).default(1),
  frame: z.boolean().default(true),
  place: places,
});

const pattern = z.string().max(4000);
const drums = z.strictObject({ kick: pattern, snare: pattern, hat: pattern });
const chords = z.array(z.int().min(1).max(7)).min(1).max(32);
const instrument = z.enum(['sine', 'square', 'sawtooth', 'triangle', 'keys', 'pad']);
const section = z.strictObject({ chords, lead: pattern, bass: pattern.optional(), comp: pattern.optional(), drums: drums.optional() });

const song = z.strictObject({
  id,
  title: text(60),
  artist: text(60).default('A mod'),
  station: z.enum(['all', 'focus']).optional(),
  bpm: num(40, 220),
  swing: num(0, 0.5).default(0),
  root: z.int().min(36).max(84),
  scale: z.enum(['major', 'minor', 'dorian', 'mixolydian']),
  chords,
  sevenths: z.boolean().optional(),
  ninths: z.boolean().optional(),
  lead: pattern,
  bass: pattern,
  comp: pattern,
  drums,
  sound: z.strictObject({ lead: instrument, bass: z.enum(['sine', 'square', 'sawtooth', 'triangle']), chord: instrument }),
  passes: z.int().min(1).max(8).default(3),
  color: color.default('#ff5d8f'),
  mood: z.enum(['lively', 'lofi', 'ambient', 'uplifting']).optional(),
  texture: z.strictObject({ crackle: z.boolean().optional(), warmth: num(200, 20000).optional(), wobble: z.boolean().optional(), softDrums: z.boolean().optional() }).optional(),
  sections: z.record(z.string().regex(/^[B-Z]$/, 'sections are B to Z'), section).optional(),
  form: z.string().regex(/^[A-Z]{1,16}$/, 'letters like AABA').optional(),
  arrangement: z.enum(['breakdown', 'build', 'sparse']).optional(),
});

const mmdd = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'a day like 10-31 (month-day)');
const costumes = z.array(z.enum(MOD_COSTUMES)).max(8).default([]);

const theme = z.strictObject({
  id,
  name: text(40),
  emoji: z.string().min(1).max(8).default('🎉'),
  dates: z.strictObject({ from: mmdd, to: mmdd }).nullable().default(null),
  decor: z.array(z.strictObject({ slots: slot, item: id, floor: floor.optional() })).max(MOD_LIMITS.places).default([]),
  lights: z.array(color).min(1).max(6).nullable().default(null),
  bunting: z.array(color).min(1).max(6).nullable().default(null),
  tint: z.strictObject({ color, amount: num(0, 0.4) }).default({ color: '#ffffff', amount: 0 }),
  sky: z.strictObject({ color, amount: num(0, 1), fog: num(0, 0.6).default(0) }).nullable().default(null),
  costumes: z.strictObject({ dev: costumes, qa: costumes, ceo: costumes }).default({ dev: [], qa: [], ceo: [] }),
  greetings: z.array(text(280)).max(8).default([]),
  playlist: z.array(id).max(8).default([]),
  confetti: z.strictObject({ colors: z.array(color).min(1).max(8), shape: z.enum(['paper', 'heart']) }).nullable().default(null),
});

export const manifestSchema = z.strictObject({
  $schema: z.string().optional(),
  name: text(60),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, 'a version like 1.0.0'),
  author: text(60),
  description: z.string().max(500).default(''),
  kinds: z.array(z.enum(MOD_KINDS as [ModKind, ...ModKind[]])).optional(),
  props: z.array(prop).max(MOD_LIMITS.props).default([]),
  posters: z.array(poster).max(MOD_LIMITS.posters).default([]),
  songs: z.array(song).max(MOD_LIMITS.songs).default([]),
  themes: z.array(theme).max(MOD_LIMITS.themes).default([]),
});
export type Manifest = z.infer<typeof manifestSchema>;

/** zod's issues as lines a person can act on: `props[0].model: …`. */
export function issueLines(error: z.ZodError): string[] {
  return error.issues.map((i) => {
    const where = i.path.map((p, n) => (typeof p === 'number' ? `[${p}]` : `${n ? '.' : ''}${String(p)}`)).join('');
    return `${where || 'mod.json'}: ${i.message}`;
  });
}

// ---------- songs ----------

const NOTE = /^(?:[1-9][',]*|\.|-|x)$/;

/** A pattern's tokens (bar lines dropped), or the first one that isn't a note, rest or hold. */
function tokens(line: string): { n: number; bad: string | null } {
  const toks = line.split(/\s+/).filter((t) => t && t !== '|');
  return { n: toks.length, bad: toks.find((t) => !NOTE.test(t)) ?? null };
}

/** What's wrong with a song's patterns (jukeboxSongs.ts compileSong would throw on them), as lines. */
export function songProblems(s: z.infer<typeof song>): string[] {
  const out: string[] = [];
  const form = s.form ?? 'A';
  const check = (where: string, line: string, steps: number) => {
    const t = tokens(line);
    if (t.bad) out.push(`${where}: "${t.bad}" isn't a note (1-9 with ' or , for octaves), . (rest) or - (hold)`);
    else if (t.n !== steps) out.push(`${where} has ${t.n} steps, not ${steps}`);
  };
  for (const name of new Set(form)) {
    const sec = name === 'A' ? s : s.sections?.[name];
    if (!sec) {
      out.push(`form "${form}" plays section ${name}, which the song doesn't have`);
      continue;
    }
    const where = name === 'A' ? '' : ` (section ${name})`;
    check(`lead${where}`, sec.lead, sec.chords.length * 8);
    const d = sec.drums ?? s.drums;
    check(`bass${where}`, sec.bass ?? s.bass, 8);
    check(`comp${where}`, sec.comp ?? s.comp, 8);
    for (const k of ['kick', 'snare', 'hat'] as const) check(`drums.${k}${where}`, d[k], 8);
  }
  return out;
}

// ---------- files ----------

export type AssetKind = 'model' | 'image';
export const ASSET_TYPES: Record<string, { kind: AssetKind; mime: string }> = {
  '.glb': { kind: 'model', mime: 'model/gltf-binary' },
  '.png': { kind: 'image', mime: 'image/png' },
  '.jpg': { kind: 'image', mime: 'image/jpeg' },
  '.jpeg': { kind: 'image', mime: 'image/jpeg' },
  '.webp': { kind: 'image', mime: 'image/webp' },
};

/** Whether `file` is inside `dir` (not `dir` itself): path.relative, so it's case-blind on Windows. */
export function isInside(dir: string, file: string): boolean {
  const rel = path.relative(dir, file);
  return rel !== '' && rel.split(/[\\/]/)[0] !== '..' && !path.isAbsolute(rel);
}

/**
 * A manifest's file name, made safe: a relative path with forward slashes and no `.` or `..` parts, or an error. Drive
 * letters, leading slashes, backslash-rooted and UNC paths are all absolute here, whatever the OS.
 */
export function cleanAssetPath(name: string): { rel: string } | { error: string } {
  if (name.includes('\0')) return { error: 'has a NUL character' };
  const parts = name.split(/[\\/]+/);
  if (/^[a-zA-Z]:/.test(name) || /^[\\/]/.test(name) || path.isAbsolute(name)) return { error: 'must be a path inside the mod\'s folder, not an absolute path' };
  if (parts.includes('..')) return { error: 'must stay inside the mod\'s folder (no "..")' };
  const rel = parts.filter((p) => p && p !== '.').join('/');
  if (!rel) return { error: 'is empty' };
  return { rel };
}

export interface ResolvedAsset {
  rel: string;
  /** The real path (links followed), checked to be inside the mod's real folder. */
  real: string;
  mime: string;
  kind: AssetKind;
  size: number;
  mtimeMs: number;
}

/** Resolves a manifest's file inside `modDir` and checks where it really is, its type and size; or an error. */
export async function resolveAsset(modDir: string, name: string, want: AssetKind): Promise<ResolvedAsset | { error: string }> {
  const clean = cleanAssetPath(name);
  if ('error' in clean) return clean;
  const type = ASSET_TYPES[path.extname(clean.rel).toLowerCase()];
  if (!type || type.kind !== want) return { error: want === 'model' ? 'must be a .glb file' : 'must be a .png, .jpg or .webp picture' };
  const full = path.resolve(modDir, clean.rel);
  if (!isInside(modDir, full)) return { error: "must stay inside the mod's folder" };
  let real: string;
  let realDir: string;
  try {
    [real, realDir] = await Promise.all([fs.realpath(full), fs.realpath(modDir)]);
  } catch {
    return { error: 'not found' };
  }
  if (!isInside(realDir, real)) return { error: "points outside the mod's folder (a link?)" };
  const st = await fs.stat(real);
  if (!st.isFile()) return { error: 'is not a file' };
  const max = want === 'model' ? MOD_LIMITS.modelBytes : MOD_LIMITS.imageBytes;
  if (st.size > max) return { error: `is ${mb(st.size)}; the most a ${want === 'model' ? 'model' : 'picture'} may be is ${mb(max)}` };
  return { rel: clean.rel, real, mime: type.mime, kind: want, size: st.size, mtimeMs: st.mtimeMs };
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 1024 * 1024 ? 2 : 1)} MB`;

// ---------- pictures and models ----------

export interface ImageInfo {
  type: 'png' | 'jpeg' | 'webp';
  width: number;
  height: number;
}

/** A PNG's, JPEG's or WebP's type and size in pixels from its header, or null when it's none of them. */
export function imageInfo(b: Buffer): ImageInfo | null {
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a && b.toString('latin1', 12, 16) === 'IHDR') {
    return { type: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      if (m === 0xff) {
        i++;
        continue;
      }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
        i += 2;
        continue;
      }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { type: 'jpeg', width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
  }
  if (b.length >= 30 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const chunk = b.toString('latin1', 12, 16);
    if (chunk === 'VP8 ') return { type: 'webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const [b0, b1, b2, b3] = [b[21], b[22], b[23], b[24]];
      return { type: 'webp', width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
    }
    if (chunk === 'VP8X') return { type: 'webp', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  }
  return null;
}

/** What's wrong with a picture for a mod (its type against its name, its size in pixels), or null. */
export function imageProblem(b: Buffer, mime: string): string | null {
  const info = imageInfo(b);
  if (!info || `image/${info.type}` !== mime) return `isn't a readable ${mime.slice(6).toUpperCase()} picture`;
  if (info.width < 1 || info.height < 1) return 'has no pixels';
  const max = MOD_LIMITS.imageSide;
  if (info.width > max || info.height > max) return `is ${info.width}×${info.height} pixels; the most is ${max}×${max}`;
  return null;
}

/**
 * What's wrong with a .glb (binary glTF 2.0), or null: its header, its JSON chunk, and that it's self-contained, so the
 * browser never fetches another file for it (buffers and images inside it, or data: URIs).
 */
export function glbProblem(b: Buffer): string | null {
  if (b.length < 20 || b.readUInt32LE(0) !== 0x46546c67) return "isn't a .glb file (binary glTF)";
  if (b.readUInt32LE(4) !== 2) return 'is not glTF 2.0';
  if (b.readUInt32LE(8) !== b.length) return 'is cut short or has extra bytes (its header says another length)';
  const jsonLen = b.readUInt32LE(12);
  if (b.readUInt32LE(16) !== 0x4e4f534a || 20 + jsonLen > b.length) return 'has no JSON chunk';
  let gltf: { asset?: { version?: unknown }; buffers?: { uri?: unknown }[]; images?: { uri?: unknown }[] };
  try {
    gltf = JSON.parse(b.toString('utf8', 20, 20 + jsonLen));
  } catch {
    return 'has a broken JSON chunk';
  }
  if (!gltf || typeof gltf !== 'object' || typeof gltf.asset?.version !== 'string' || !gltf.asset.version.startsWith('2')) return 'is not glTF 2.0';
  const external = [...(gltf.buffers ?? []), ...(gltf.images ?? [])].some((x) => x && typeof x === 'object' && typeof x.uri === 'string' && !x.uri.startsWith('data:'));
  if (external) return 'refers to other files; export it as one self-contained .glb';
  let at = 20 + jsonLen;
  while (at < b.length) {
    if (at + 8 > b.length) return 'has a broken chunk';
    const len = b.readUInt32LE(at);
    at += 8 + len;
    if (at > b.length) return 'has a chunk longer than the file';
  }
  return null;
}

// ---------- one mod ----------

export interface LoadedMod {
  view: ModView;
  /** Its files by their clean relative path. */
  files: Map<string, ResolvedAsset>;
}

const urlOf = (mod: string, a: ResolvedAsset) => `/api/mods/${encodeURIComponent(mod)}/files/${a.rel.split('/').map(encodeURIComponent).join('/')}?v=${Math.round(a.mtimeMs)}`;

const blank = (id: string, errors: string[]): ModView => ({ id, name: id, version: '', author: '', description: '', kinds: [], enabled: true, ok: false, errors, props: [], posters: [], songs: [], themes: [] });

/** Reads and checks one mod's folder: its manifest and every file it names. Any problem skips the whole mod. */
export async function loadMod(dir: string, id: string): Promise<LoadedMod> {
  const files = new Map<string, ResolvedAsset>();
  if (!isModId(id)) return { view: blank(id, [`The folder name "${id}" can't be a mod's id: use lowercase letters, digits, - and _`]), files };
  const manifestFile = await resolveManifest(dir);
  if ('error' in manifestFile) return { view: blank(id, [manifestFile.error]), files };
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(manifestFile.real, 'utf8'));
  } catch (err) {
    return { view: blank(id, [`mod.json isn't valid JSON: ${(err as Error).message}`]), files };
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) return { view: blank(id, issueLines(parsed.error)), files };
  const m = parsed.data;
  const errors: string[] = [];
  const view: ModView = { ...blank(id, errors), name: m.name, version: m.version, author: m.author, description: m.description, ok: false };

  const dupes = (kind: string, list: { id: string }[]) => {
    const seen = new Set<string>();
    for (const x of list) {
      if (seen.has(x.id)) errors.push(`${kind}: "${x.id}" is used twice`);
      seen.add(x.id);
    }
  };
  dupes('props and posters', [...m.props, ...m.posters]);
  dupes('songs', m.songs);
  dupes('themes', m.themes);

  const asset = async (where: string, name: string, kind: AssetKind) => {
    const a = await resolveAsset(dir, name, kind);
    if ('error' in a) {
      errors.push(`${where}: "${name}" ${a.error}`);
      return null;
    }
    const buf = await fs.readFile(a.real);
    const problem = kind === 'model' ? glbProblem(buf) : imageProblem(buf, a.mime);
    if (problem) {
      errors.push(`${where}: "${name}" ${problem}`);
      return null;
    }
    files.set(a.rel, a);
    return { a, buf };
  };

  for (const [i, p] of m.props.entries()) {
    const got = p.model ? await asset(`props[${i}].model`, p.model, 'model') : null;
    const v: ModPropView = {
      key: modKey(id, p.id),
      id: p.id,
      name: p.name,
      icon: p.icon,
      model: got ? urlOf(id, got.a) : null,
      shapes: p.shapes ?? null,
      height: p.height,
      place: p.place,
      footprint: p.footprint ?? null,
    };
    view.props.push(v);
  }
  for (const [i, p] of m.posters.entries()) {
    const got = await asset(`posters[${i}].image`, p.image, 'image');
    const info = got ? imageInfo(got.buf) : null;
    if (!got || !info) continue;
    view.posters.push({
      key: modKey(id, p.id),
      id: p.id,
      name: p.name,
      image: urlOf(id, got.a),
      width: p.width,
      height: Math.round(((p.width * info.height) / info.width) * 1000) / 1000,
      pixels: [info.width, info.height],
      frame: p.frame,
      place: p.place,
    } satisfies ModPosterView);
  }
  for (const [i, s] of m.songs.entries()) {
    for (const line of songProblems(s)) errors.push(`songs[${i}] ("${s.id}"): ${line}`);
    const { station, ...data } = s;
    const focus = s.mood === 'lofi' || s.mood === 'ambient';
    view.songs.push({ key: modKey(id, s.id), id: s.id, title: s.title, station: station ?? (focus ? 'focus' : 'all'), song: { ...data, id: modKey(id, s.id) } } satisfies ModSongView);
  }
  const items = new Set([...m.props, ...m.posters].map((x) => x.id));
  const songs = new Set(m.songs.map((s) => s.id));
  for (const [i, t] of m.themes.entries()) {
    for (const d of t.decor) if (!items.has(d.item)) errors.push(`themes[${i}].decor: there's no prop or poster "${d.item}" in this mod`);
    for (const s of t.playlist) if (!songs.has(s)) errors.push(`themes[${i}].playlist: there's no song "${s}" in this mod`);
    view.themes.push({
      key: modKey(id, t.id),
      id: t.id,
      name: t.name,
      emoji: t.emoji,
      dates: t.dates,
      decor: t.decor.map((d) => ({ slots: d.slots, item: modKey(id, d.item), ...(d.floor && { floor: d.floor }) })),
      lights: t.lights,
      bunting: t.bunting,
      tint: t.tint,
      sky: t.sky ? { color: t.sky.color, amount: t.sky.amount, fog: t.sky.fog } : null,
      costumes: t.costumes,
      greetings: t.greetings,
      playlist: t.playlist.map((s) => modKey(id, s)),
      confetti: t.confetti,
    } satisfies ModThemeView);
  }

  view.kinds = MOD_KINDS.filter((k) => m[k].length > 0);
  if (m.kinds) {
    const said = new Set(m.kinds);
    for (const k of view.kinds) if (!said.has(k)) errors.push(`kinds: the mod has ${k} but "kinds" doesn't list them`);
    for (const k of said) if (!view.kinds.includes(k)) errors.push(`kinds: lists ${k}, but the mod has none`);
  }
  if (!view.kinds.length) errors.push('The mod adds nothing: give it props, posters, songs or themes');
  view.ok = errors.length === 0;
  if (!view.ok) {
    files.clear();
    return { view: { ...view, props: [], posters: [], songs: [], themes: [] }, files };
  }
  return { view, files };
}

async function resolveManifest(dir: string): Promise<{ real: string } | { error: string }> {
  const full = path.join(dir, MANIFEST);
  try {
    const [real, realDir] = await Promise.all([fs.realpath(full), fs.realpath(dir)]);
    if (!isInside(realDir, real)) return { error: "mod.json points outside the mod's folder (a link?)" };
    const st = await fs.stat(real);
    if (!st.isFile()) return { error: 'mod.json is not a file' };
    if (st.size > MOD_LIMITS.manifestBytes) return { error: `mod.json is ${mb(st.size)}; the most is ${mb(MOD_LIMITS.manifestBytes)}` };
    return { real };
  } catch {
    return { error: 'No mod.json in the folder' };
  }
}

// ---------- the mods folder ----------

export interface ModManagerOptions {
  /** <SWARM_HOME>/mods */
  dir: string;
  /** Where the switched-off mods are remembered. */
  stateFile: string;
  /** The example mod shipped with the office (examples/mods/<name>), or null. */
  exampleDir: string | null;
  changed: (view: ModsView) => void;
  log: (line: string) => void;
}

export class ModManager {
  private view: ModsView;
  private files = new Map<string, Map<string, ResolvedAsset>>();
  private disabled = new Set<string>();
  private scanning: Promise<ModsView> | null = null;

  constructor(private opts: ModManagerOptions) {
    this.view = { dir: opts.dir, mods: [], scannedAt: 0, errors: [], example: null };
  }

  async init() {
    try {
      const raw = JSON.parse(await fs.readFile(this.opts.stateFile, 'utf8')) as { disabled?: unknown };
      if (Array.isArray(raw.disabled)) this.disabled = new Set(raw.disabled.filter(isModId));
    } catch {
      // none switched off yet
    }
    await this.scan();
  }

  current(): ModsView {
    return this.view;
  }

  /** The switched-on themes, for the theme engine (shared/themes.ts resolveTheme) and the CEO's greeting. */
  themeWindows(): ModThemeWindow[] {
    return this.view.mods.filter((m) => m.ok && m.enabled).flatMap((m) => m.themes.map((t) => ({ key: t.key, dates: t.dates, greetings: t.greetings })));
  }

  /** Reads the folder again (Reload mods). One scan at a time; one bad mod never stops the others. */
  scan(): Promise<ModsView> {
    this.scanning ??= this.doScan().finally(() => (this.scanning = null));
    return this.scanning;
  }

  private async doScan(): Promise<ModsView> {
    const errors: string[] = [];
    const mods: ModView[] = [];
    const files = new Map<string, Map<string, ResolvedAsset>>();
    let names: string[] = [];
    try {
      await fs.mkdir(this.opts.dir, { recursive: true });
      const entries = await fs.readdir(this.opts.dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isSymbolicLink()) errors.push(`${e.name}: a link, not a folder; copy the mod's folder in instead`);
        else if (e.isDirectory() && !e.name.startsWith('.')) names.push(e.name);
      }
    } catch (err) {
      errors.push(`Can't read the mods folder: ${(err as Error).message}`);
    }
    names.sort();
    if (names.length > MOD_LIMITS.mods) {
      errors.push(`${names.length} mods; only the first ${MOD_LIMITS.mods} (by name) are loaded`);
      names = names.slice(0, MOD_LIMITS.mods);
    }
    for (const name of names) {
      let loaded: LoadedMod;
      try {
        loaded = await loadMod(path.join(this.opts.dir, name), name);
      } catch (err) {
        loaded = { view: blank(name, [`Couldn't be read: ${(err as Error).message}`]), files: new Map() };
      }
      loaded.view.enabled = !this.disabled.has(name);
      mods.push(loaded.view);
      if (loaded.view.ok) files.set(name, loaded.files);
    }
    this.files = files;
    this.view = { dir: this.opts.dir, mods, scannedAt: Date.now(), errors, example: await this.exampleName() };
    const bad = mods.filter((m) => !m.ok);
    if (mods.length || errors.length) {
      this.opts.log(`  🧩 mods: ${mods.length - bad.length} loaded${bad.length ? `, ${bad.length} skipped (${bad.map((m) => `${m.id}: ${m.errors[0]}`).join('; ')})` : ''}`);
    }
    this.opts.changed(this.view);
    return this.view;
  }

  /** Switches a mod on or off, remembered across restarts. */
  async setEnabled(id: string, on: boolean): Promise<ModsView> {
    const mod = this.view.mods.find((m) => m.id === id);
    if (!mod) throw new HttpError(404, `There's no mod "${id}" in the mods folder`);
    if (on) this.disabled.delete(id);
    else this.disabled.add(id);
    await this.saveState();
    this.view = { ...this.view, mods: this.view.mods.map((m) => (m.id === id ? { ...m, enabled: on } : m)) };
    this.opts.changed(this.view);
    return this.view;
  }

  /** Copies the example mod into the mods folder (never over one already there), then reloads. */
  async installExample(): Promise<ModsView> {
    const name = await this.exampleName();
    if (!name || !this.opts.exampleDir) throw new HttpError(409, 'The example mod is already in your mods folder');
    await fs.cp(this.opts.exampleDir, path.join(this.opts.dir, name), { recursive: true, errorOnExist: true, force: false });
    return this.scan();
  }

  /** A loaded mod's file, by the path its manifest named; null for anything else. Checked again: it may have moved. */
  async file(mod: string, rel: string): Promise<ResolvedAsset | null> {
    const clean = cleanAssetPath(rel);
    if ('error' in clean) return null;
    const a = this.files.get(mod)?.get(clean.rel);
    if (!a) return null;
    try {
      const [real, realDir] = await Promise.all([fs.realpath(a.real), fs.realpath(path.join(this.opts.dir, mod))]);
      const st = await fs.stat(real);
      const max = a.kind === 'model' ? MOD_LIMITS.modelBytes : MOD_LIMITS.imageBytes;
      if (!isInside(realDir, real) || !st.isFile() || st.size > max) return null;
      return { ...a, real, size: st.size };
    } catch {
      return null;
    }
  }

  private async exampleName(): Promise<string | null> {
    const src = this.opts.exampleDir;
    if (!src) return null;
    const name = path.basename(src);
    try {
      await fs.access(path.join(src, MANIFEST));
    } catch {
      return null;
    }
    try {
      await fs.access(path.join(this.opts.dir, name));
      return null;
    } catch {
      return name;
    }
  }

  private async saveState() {
    await fs.mkdir(path.dirname(this.opts.stateFile), { recursive: true });
    const tmp = `${this.opts.stateFile}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ disabled: [...this.disabled].sort() }, null, 2));
    await fs.rename(tmp, this.opts.stateFile);
  }
}
