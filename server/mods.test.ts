import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MOD_LIMITS, type ModsView } from '../shared/mods.ts';
import { cleanAssetPath, glbProblem, imageInfo, imageProblem, isInside, loadMod, manifestSchema, ModManager, resolveAsset, songProblems } from './mods.ts';

const EXAMPLE = path.resolve(import.meta.dirname, '..', 'examples', 'mods', 'hello-mod');

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cubefarm-mods-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true, maxRetries: 3 });
});

// ---------- tiny files ----------

function png(w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'latin1');
  ihdr.writeUInt32BE(w, 8);
  ihdr.writeUInt32BE(h, 12);
  ihdr[16] = 8;
  ihdr[17] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, zlib.deflateSync(Buffer.alloc(4))]);
}

function jpeg(w: number, h: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, h >> 8, h & 0xff, w >> 8, w & 0xff, 0x01, 0x01, 0x11, 0x00]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}

function webpX(w: number, h: number): Buffer {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(22, 4);
  b.write('WEBP', 8, 'latin1');
  b.write('VP8X', 12, 'latin1');
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
}

function glb(json: unknown, bin = Buffer.alloc(0)): Buffer {
  let j = Buffer.from(JSON.stringify(json));
  j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 0x20)]);
  const parts = [Buffer.alloc(12), Buffer.alloc(8), j];
  if (bin.length) parts.push(Buffer.alloc(8), bin);
  const total = parts.reduce((n, p) => n + p.length, 0);
  parts[0].writeUInt32LE(0x46546c67, 0);
  parts[0].writeUInt32LE(2, 4);
  parts[0].writeUInt32LE(total, 8);
  parts[1].writeUInt32LE(j.length, 0);
  parts[1].writeUInt32LE(0x4e4f534a, 4);
  if (bin.length) {
    parts[3].writeUInt32LE(bin.length, 0);
    parts[3].writeUInt32LE(0x004e4942, 4);
  }
  return Buffer.concat(parts);
}

const GOOD_GLB = glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }] }, Buffer.alloc(4));

const manifest = (extra: Record<string, unknown> = {}) => ({ name: 'Test mod', version: '1.0.0', author: 'QA', ...extra });

async function writeMod(dir: string, m: unknown, files: Record<string, Buffer> = {}) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'mod.json'), typeof m === 'string' ? m : JSON.stringify(m));
  for (const [name, data] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await fs.writeFile(path.join(dir, name), data);
  }
}

const poster = (image: string) => ({ posters: [{ id: 'p', name: 'Poster', image, place: [{ floor: 'lobby', x: 1, z: 1 }] }] });

// ---------- the manifest ----------

describe('manifestSchema', () => {
  it('takes the example mod and fills in defaults', async () => {
    const raw = JSON.parse(await fs.readFile(path.join(EXAMPLE, 'mod.json'), 'utf8'));
    const r = manifestSchema.safeParse(raw);
    expect(r.success).toBe(true);
    expect(r.data!.props[1].height).toBe(1);
    expect(r.data!.themes[0].sky).toBe(null);
  });

  it('refuses bad manifests with the field at fault', () => {
    const bad = (m: unknown) => {
      const r = manifestSchema.safeParse(m);
      expect(r.success).toBe(false);
      return r.error!.issues.map((i) => i.path.join('.')).join(' ');
    };
    expect(bad({})).toMatch(/name/);
    expect(bad(manifest({ version: 'one' }))).toMatch(/version/);
    expect(bad(manifest({ props: [{ id: 'Bad Id', name: 'x', shapes: [{ shape: 'box', size: [1, 1, 1], color: '#fff000' }] }] }))).toMatch(/props.0.id/);
    expect(bad(manifest({ props: [{ id: 'both', name: 'x', model: 'a.glb', shapes: [{ shape: 'box', size: [1, 1, 1], color: '#fff000' }] }] }))).toMatch(/props.0/);
    expect(bad(manifest({ posters: [{ id: 'p', name: 'x', image: 'a.png', place: [{ slot: 'the-moon' }] }] }))).toMatch(/posters.0.place.0/);
    expect(bad(manifest({ themes: [{ id: 't', name: 'x', dates: { from: '13-01', to: '01-01' } }] }))).toMatch(/themes.0.dates.from/);
    expect(bad(manifest({ themes: [{ id: 't', name: 'x', costumes: { dev: ['jetpack'] } }] }))).toMatch(/themes.0.costumes.dev.0/);
    expect(bad(manifest({ script: 'alert(1)' }))).toBe(''); // unknown keys (no code, ever) are refused at the top
  });
});

describe('songProblems', () => {
  const base = {
    id: 's',
    title: 'S',
    artist: 'A',
    bpm: 100,
    swing: 0,
    root: 60,
    scale: 'major' as const,
    chords: [1, 4],
    lead: '1 - 2 - 3 - 4 - | 5 - 4 - 3 - 2 -',
    bass: '1 . 1 . 1 . 1 .',
    comp: 'x . x . x . x .',
    drums: { kick: 'x . . . x . . .', snare: '. . x . . . x .', hat: 'x x x x x x x x' },
    sound: { lead: 'square' as const, bass: 'sine' as const, chord: 'keys' as const },
    passes: 2,
    color: '#ffffff',
  };
  it('passes a song the jukebox can play', () => expect(songProblems(base)).toEqual([]));
  it('finds a short bar, a bad note and a missing section', () => {
    expect(songProblems({ ...base, lead: '1 - 2 -' })[0]).toMatch(/lead has 4 steps, not 16/);
    expect(songProblems({ ...base, bass: '1 . 1 . 1 . 1 q' })[0]).toMatch(/"q" isn't a note/);
    expect(songProblems({ ...base, form: 'AB' })[0]).toMatch(/section B/);
  });
});

// ---------- paths ----------

describe('cleanAssetPath and isInside', () => {
  it('keeps relative paths inside, tidied', () => {
    expect(cleanAssetPath('./img//poster.png')).toEqual({ rel: 'img/poster.png' });
    expect(cleanAssetPath('img\\poster.png')).toEqual({ rel: 'img/poster.png' });
  });
  it('refuses ../, absolute, drive, UNC and NUL paths', () => {
    for (const p of ['../secret.png', 'img/../../secret.png', '..\\secret.png', '/etc/passwd', '\\\\server\\share\\a.png', 'C:\\Windows\\a.png', 'c:a.png', 'a\0.png']) {
      expect(cleanAssetPath(p), p).toHaveProperty('error');
    }
  });
  it('isInside', () => {
    const d = path.resolve('/mods/a');
    expect(isInside(d, path.join(d, 'x.png'))).toBe(true);
    expect(isInside(d, path.join(d, '..x.png'))).toBe(true);
    expect(isInside(d, d)).toBe(false);
    expect(isInside(d, path.resolve('/mods/ab/x.png'))).toBe(false);
    expect(isInside(d, path.resolve('/mods/a/../b/x.png'))).toBe(false);
  });
});

describe('resolveAsset', () => {
  it('finds a file inside the mod, with its type and size', async () => {
    const dir = path.join(tmp, 'm');
    await writeMod(dir, {}, { 'img/a.png': png(4, 4) });
    const a = await resolveAsset(dir, 'img/a.png', 'image');
    expect(a).toMatchObject({ rel: 'img/a.png', mime: 'image/png', kind: 'image' });
  });

  it('refuses traversal, absolute paths and the wrong kind of file', async () => {
    const dir = path.join(tmp, 'm');
    await writeMod(dir, {}, { 'a.png': png(4, 4) });
    await fs.writeFile(path.join(tmp, 'secret.png'), png(4, 4));
    expect(await resolveAsset(dir, '../secret.png', 'image')).toHaveProperty('error');
    expect(await resolveAsset(dir, path.join(tmp, 'secret.png'), 'image')).toHaveProperty('error');
    expect(await resolveAsset(dir, 'a.png', 'model')).toEqual({ error: 'must be a .glb file' });
    expect(await resolveAsset(dir, 'missing.png', 'image')).toEqual({ error: 'not found' });
  });

  it('refuses a link that leads out of the mod', async () => {
    const dir = path.join(tmp, 'm');
    const outside = path.join(tmp, 'outside');
    await writeMod(dir, {});
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'secret.png'), png(4, 4));
    // a junction needs no special rights on Windows; elsewhere it's an ordinary directory link
    await fs.symlink(outside, path.join(dir, 'img'), 'junction');
    expect(await resolveAsset(dir, 'img/secret.png', 'image')).toEqual({ error: "points outside the mod's folder (a link?)" });
  });

  it('refuses files over the size limit', async () => {
    const dir = path.join(tmp, 'm');
    await writeMod(dir, {}, { 'big.png': Buffer.alloc(MOD_LIMITS.imageBytes + 1), 'big.glb': Buffer.alloc(MOD_LIMITS.modelBytes + 1) });
    expect((await resolveAsset(dir, 'big.png', 'image')) as { error: string }).toHaveProperty('error', expect.stringMatching(/the most a picture may be is 2\.0 MB/));
    expect((await resolveAsset(dir, 'big.glb', 'model')) as { error: string }).toHaveProperty('error', expect.stringMatching(/5\.0 MB/));
  });
});

// ---------- pictures and models ----------

describe('imageInfo and imageProblem', () => {
  it('reads PNG, JPEG and WebP sizes', () => {
    expect(imageInfo(png(400, 520))).toEqual({ type: 'png', width: 400, height: 520 });
    expect(imageInfo(jpeg(640, 480))).toEqual({ type: 'jpeg', width: 640, height: 480 });
    expect(imageInfo(webpX(300, 200))).toEqual({ type: 'webp', width: 300, height: 200 });
    expect(imageInfo(Buffer.from('<svg/>'))).toBe(null);
  });
  it('refuses pictures too big, empty, or not what their name says', () => {
    expect(imageProblem(png(4096, 100), 'image/png')).toMatch(/4096×100 pixels; the most is 2048×2048/);
    expect(imageProblem(png(0, 10), 'image/png')).toMatch(/no pixels/);
    expect(imageProblem(jpeg(10, 10), 'image/png')).toMatch(/readable PNG/);
    expect(imageProblem(png(2048, 2048), 'image/png')).toBe(null);
  });
});

describe('glbProblem', () => {
  it('passes a self-contained glTF 2.0 binary and the example mascot', async () => {
    expect(glbProblem(GOOD_GLB)).toBe(null);
    expect(glbProblem(await fs.readFile(path.join(EXAMPLE, 'mascot.glb')))).toBe(null);
  });
  it('handles malformed models', () => {
    expect(glbProblem(Buffer.from('not a model at all'))).toMatch(/isn't a .glb/);
    expect(glbProblem(GOOD_GLB.subarray(0, GOOD_GLB.length - 2))).toMatch(/cut short/);
    const v1 = Buffer.from(GOOD_GLB);
    v1.writeUInt32LE(1, 4);
    expect(glbProblem(v1)).toMatch(/2\.0/);
    const json = glb({ asset: { version: '2.0' } });
    json.write('{{{', 20, 'utf8');
    expect(glbProblem(json)).toMatch(/broken JSON/);
    expect(glbProblem(glb({ asset: { version: '2.0' }, buffers: [{ uri: '../../secret.bin', byteLength: 4 }] }))).toMatch(/self-contained/);
    expect(glbProblem(glb({ asset: { version: '2.0' }, images: [{ uri: 'http://example.com/x.png' }] }))).toMatch(/self-contained/);
    const longChunk = glb({ asset: { version: '2.0' } }, Buffer.alloc(8));
    longChunk.writeUInt32LE(9999, longChunk.length - 16);
    expect(glbProblem(longChunk)).toMatch(/chunk/);
  });
});

// ---------- loading ----------

describe('loadMod', () => {
  it('loads the example mod: a poster, a GLB statue, a song and a theme', async () => {
    const { view, files } = await loadMod(EXAMPLE, 'hello-mod');
    expect(view.errors).toEqual([]);
    expect(view.ok).toBe(true);
    expect(view.kinds).toEqual(['props', 'posters', 'songs', 'themes']);
    expect(view.props[0]).toMatchObject({ key: 'mod:hello-mod/mascot', model: expect.stringMatching(/^\/api\/mods\/hello-mod\/files\/mascot\.glb\?v=\d+$/) });
    expect(view.posters[0]).toMatchObject({ pixels: [400, 520], width: 1, height: 1.3 });
    expect(view.songs[0]).toMatchObject({ key: 'mod:hello-mod/hello-world-hop', station: 'all', song: { id: 'mod:hello-mod/hello-world-hop' } });
    expect(view.themes[0]).toMatchObject({ key: 'mod:hello-mod/mod-week', playlist: ['mod:hello-mod/hello-world-hop'], decor: expect.arrayContaining([{ slots: 'desk-*', item: 'mod:hello-mod/mini-cube' }]) });
    expect([...files.keys()].sort()).toEqual(['mascot.glb', 'poster.png']);
  });

  it('skips a mod whole, with clear errors, for bad JSON, a big picture, a traversal path or a broken model', async () => {
    const cases: [string, unknown, Record<string, Buffer>, RegExp][] = [
      ['json', '{ "name": ', {}, /isn't valid JSON/],
      ['big', manifest(poster('big.png')), { 'big.png': png(5000, 5000) }, /5000×5000 pixels/],
      ['trav', manifest(poster('../../secret.png')), {}, /no "\.\."/],
      ['abs', manifest(poster(path.join(tmp, 'secret.png'))), {}, /absolute/],
      ['glb', manifest({ props: [{ id: 'x', name: 'X', model: 'x.glb' }] }), { 'x.glb': Buffer.from('nope') }, /isn't a \.glb/],
      ['ref', manifest({ themes: [{ id: 't', name: 'T', decor: [{ slots: 'desk-*', item: 'ghost' }] }] }), {}, /no prop or poster "ghost"/],
      ['dup', manifest({ props: [1, 2].map(() => ({ id: 'a', name: 'A', shapes: [{ shape: 'box', size: [1, 1, 1], color: '#ffffff' }] })) }), {}, /"a" is used twice/],
      ['empty', manifest(), {}, /adds nothing/],
    ];
    for (const [name, m, files, err] of cases) {
      const dir = path.join(tmp, name);
      await writeMod(dir, m, files);
      const loaded = await loadMod(dir, name);
      expect(loaded.view.ok, name).toBe(false);
      expect(loaded.view.errors.join('\n'), name).toMatch(err);
      expect(loaded.view.posters, name).toEqual([]);
      expect(loaded.files.size, name).toBe(0);
    }
  });

  it('refuses a folder name that is not an id, and a folder without mod.json', async () => {
    expect((await loadMod(path.join(tmp, 'Bad Name'), 'Bad Name')).view.errors[0]).toMatch(/can't be a mod's id/);
    await fs.mkdir(path.join(tmp, 'none'));
    expect((await loadMod(path.join(tmp, 'none'), 'none')).view.errors).toEqual(['No mod.json in the folder']);
  });
});

describe('ModManager', () => {
  async function manager() {
    const views: ModsView[] = [];
    const m = new ModManager({ dir: path.join(tmp, 'mods'), stateFile: path.join(tmp, 'mods.json'), exampleDir: EXAMPLE, changed: (v) => views.push(v), log: () => undefined });
    await m.init();
    return { m, views };
  }

  it('copies the example in, loads it beside a broken mod, and serves only what its manifest names', async () => {
    const { m } = await manager();
    expect(m.current().example).toBe('hello-mod');
    await writeMod(path.join(tmp, 'mods', 'broken'), '{ nope');
    await fs.writeFile(path.join(tmp, 'mods', 'hello-secret.txt'), 'secret');
    const view = await m.installExample();
    expect(view.example).toBe(null);
    expect(view.mods.map((x) => [x.id, x.ok])).toEqual([
      ['broken', false],
      ['hello-mod', true],
    ]);
    expect(m.themeWindows().map((t) => t.key)).toEqual(['mod:hello-mod/mod-week']);
    expect(await m.file('hello-mod', 'poster.png')).toMatchObject({ mime: 'image/png' });
    expect(await m.file('hello-mod', './poster.png')).toMatchObject({ mime: 'image/png' });
    for (const p of ['mod.json', '../hello-secret.txt', '../broken/mod.json', '..\\hello-secret.txt', path.join(tmp, 'mods', 'hello-secret.txt')]) expect(await m.file('hello-mod', p), p).toBe(null);
    expect(await m.file('broken', 'mod.json')).toBe(null);
    await expect(m.installExample()).rejects.toThrow(/already/);
  });

  it('checks a file again when it is served: one gone or grown past the limit since loading is not', async () => {
    const { m } = await manager();
    await m.installExample();
    const dir = path.join(tmp, 'mods', 'hello-mod');
    await fs.rm(path.join(dir, 'mascot.glb'));
    expect(await m.file('hello-mod', 'mascot.glb')).toBe(null);
    await fs.writeFile(path.join(dir, 'poster.png'), Buffer.alloc(MOD_LIMITS.imageBytes + 1));
    expect(await m.file('hello-mod', 'poster.png')).toBe(null);
  });

  it('remembers a mod switched off, and lists a link in the folder as a problem', async () => {
    const first = await manager();
    await first.m.installExample();
    await first.m.setEnabled('hello-mod', false);
    expect(first.m.themeWindows()).toEqual([]);
    expect(first.views.at(-1)!.mods[0].enabled).toBe(false);
    await expect(first.m.setEnabled('nope', true)).rejects.toThrow(/no mod "nope"/);
    await fs.symlink(EXAMPLE, path.join(tmp, 'mods', 'linked'), 'junction');
    const again = await manager();
    expect(again.m.current().mods.map((x) => [x.id, x.enabled])).toEqual([['hello-mod', false]]);
    expect(again.m.current().errors.join()).toMatch(/linked: a link/);
  });
});
