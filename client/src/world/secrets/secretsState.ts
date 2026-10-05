// The secrets' state (#266): this player's duck hunt, the secret room's bookshelf, the easter eggs they've found and
// the polaroid wall, kept per browser (localStorage), plus what's on right now (disco, a spilled mug). Finding the
// last duck, opening the room and each egg tell the office, which unlocks its achievement for everyone.

import { create } from 'zustand';
import { api } from '../../api';
import { useStore } from '../../store';
import { addFound, canHint, cleanFound, duckById, DUCKS, DUCKS_TO_OPEN, foundLine } from './ducks';
import { cleanPolaroids, DISCO_MS, eggDef, isEggId, MOMENT_CAPTION, pinPolaroid, SPILL_MS, wantsPolaroid, type EggId, type Moment, type Polaroid } from './eggs';
import { shelfSlide, sparkle, splash, squeak } from './sounds';
import { HALF_D, MANAGER_DESK } from '../layout';
import { SECRET_SHELF } from './room';

const KEY = 'cubefarm:secrets';
const PHOTOS_KEY = 'cubefarm:polaroids';

interface Saved {
  found: readonly string[];
  hinted: readonly string[];
  open: boolean;
  eggs: readonly EggId[];
}

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    const found = cleanFound(raw?.found);
    return {
      found,
      hinted: cleanFound(raw?.hinted),
      open: raw?.open === true,
      eggs: Array.isArray(raw?.eggs) ? raw.eggs.filter(isEggId) : [],
    };
  } catch {
    return { found: [], hinted: [], open: false, eggs: [] };
  }
}

function loadPhotos(): Polaroid[] {
  try {
    return cleanPolaroids(JSON.parse(localStorage.getItem(PHOTOS_KEY) ?? 'null'));
  } catch {
    return [];
  }
}

export interface SecretsState extends Saved {
  polaroids: Polaroid[];
  /** Disco mode is on (the mirror ball is down). */
  disco: boolean;
  /** The manager's mug lies spilled on their desk. */
  spill: boolean;
  /** Which developer-commentary fact the plaque shows. */
  fact: number;
  /** It's 3:14 pm: a π on every whiteboard. */
  pi: boolean;
}

export const useSecrets = create<SecretsState>(() => ({ ...load(), polaroids: loadPhotos(), disco: false, spill: false, fact: 0, pi: false }));

function save() {
  const { found, hinted, open, eggs } = useSecrets.getState();
  try {
    localStorage.setItem(KEY, JSON.stringify({ found, hinted, open, eggs }));
  } catch {
    // storage may be unavailable (private mode): the hunt just won't survive a reload
  }
}

const toast = (text: string, level: 'info' | 'success' = 'success') => useStore.getState().pushToast(level, text);
/** Tell the office (achievements); a failure only costs the trophy. */
const report = (id: string) => void api.foundSecret(id).catch(() => undefined);

// ---------- the duck hunt ----------

/** Picks up a duck: a squeak, the count, and at five the bookshelf clicks open. */
export function findDuck(id: string) {
  const s = useSecrets.getState();
  const found = addFound(s.found, id);
  if (found === s.found) return;
  const d = duckById(id)!;
  squeak({ x: d.x, y: d.y, z: d.z });
  const opens = found.length >= DUCKS_TO_OPEN && !s.open;
  useSecrets.setState({ found: [...found], open: s.open || opens });
  save();
  toast(foundLine(found.length));
  if (opens) report('secret-room');
  if (found.length === DUCKS.length) report('duck-hunter');
}

/** Starts the hunt again: every duck goes back to its spot (the room stays as it is). */
export function resetHunt() {
  useSecrets.setState({ found: [], hinted: [] });
  save();
  toast('🦆 The ducks have all waddled back to their hiding places', 'info');
}

/** Unlocks a hidden duck's hint, if one is left to use. */
export function revealHint(id: string) {
  const s = useSecrets.getState();
  if (!canHint(s.found, s.hinted, id)) return false;
  useSecrets.setState({ hinted: [...s.hinted, id] });
  save();
  return true;
}

// ---------- the bookshelf ----------

/** Pulls the odd book: the bookshelf slides aside (or back). */
export function pullBook() {
  const s = useSecrets.getState();
  const open = !s.open;
  useSecrets.setState({ open });
  save();
  shelfSlide({ x: SECRET_SHELF.x, y: 1, z: -HALF_D + 0.3 });
  if (open) {
    toast('📕 Click… the bookshelf slides aside. A secret room!');
    report('secret-room');
  }
}

/** The plaque's next fact. */
export const nextFact = () => useSecrets.setState((s) => ({ fact: s.fact + 1 }));

// ---------- easter eggs ----------

/** Notes an egg as found by this player (the first time: a sparkle, a toast and the office's achievement). */
export function eggFound(id: EggId) {
  const s = useSecrets.getState();
  if (s.eggs.includes(id)) return;
  useSecrets.setState({ eggs: [...s.eggs, id] });
  save();
  sparkle();
  const def = eggDef(id);
  toast(`🥚 Easter egg found: ${def.name} (${s.eggs.length + 1} of 5)`);
  report(def.achievement);
}

/** performance.now() until which everyone dances (read every frame by Character.tsx: no store, no allocation). */
let discoUntil = 0;
let discoTimer: ReturnType<typeof setTimeout> | undefined;
export const discoOn = (now: number) => now < discoUntil;

/** Disco mode for DISCO_MS: the mirror ball comes down and everyone dances. */
export function startDisco() {
  discoUntil = performance.now() + DISCO_MS;
  useSecrets.setState({ disco: true });
  clearTimeout(discoTimer);
  discoTimer = setTimeout(stopDisco, DISCO_MS);
  toast(eggDef('disco').found);
  eggFound('disco');
}

export function stopDisco() {
  discoUntil = 0;
  clearTimeout(discoTimer);
  useSecrets.setState({ disco: false });
}

let spillTimer: ReturnType<typeof setTimeout> | undefined;
/** The manager's mug tips over for SPILL_MS, then somebody tidies up. */
export function spillMug() {
  useSecrets.setState({ spill: true });
  splash({ x: MANAGER_DESK.x + 0.9, y: 0.86, z: MANAGER_DESK.z + 0.1 });
  clearTimeout(spillTimer);
  spillTimer = setTimeout(() => useSecrets.setState({ spill: false }), SPILL_MS);
  toast(eggDef('spill').found, 'info');
  eggFound('spill');
}

/** Agents waving back (agent id -> performance.now() until): Character.tsx reads it every frame. */
const waves = new Map<string, number>();
export const wavingBack = (id: string, now: number) => (waves.get(id) ?? 0) > now;
export function waveBack(id: string, seconds = 4) {
  waves.set(id, performance.now() + seconds * 1000);
}

// ---------- polaroids ----------

let camera: ((w: number, h: number) => string | null) | null = null;
/** The office's camera for polaroids (Polaroids.tsx sets it inside the canvas): a small JPEG of the view, or null. */
export function setPolaroidCamera(fn: typeof camera) {
  camera = fn;
}

/** A memorable moment: a polaroid for the secret room's wall, if this one earns one. */
export function snapMoment(moment: Moment, now = Date.now()) {
  const s = useSecrets.getState();
  if (!wantsPolaroid(s.polaroids, moment, now)) return;
  let image: string | null = null;
  try {
    image = camera?.(240, 180) ?? null;
  } catch {
    image = null;
  }
  const polaroids = pinPolaroid(s.polaroids, { moment, at: now, caption: MOMENT_CAPTION[moment], image });
  useSecrets.setState({ polaroids });
  try {
    localStorage.setItem(PHOTOS_KEY, JSON.stringify(polaroids));
  } catch {
    // too big or no storage: the wall keeps them until the page reloads
  }
}
