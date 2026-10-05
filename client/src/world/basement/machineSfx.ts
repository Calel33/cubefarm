import { audio, createPanner, groupOutput, listenerAt, noise, recordSfx, setPannerPosition, tone } from '../../ui/sfx';
import { nearestRacks } from './basementRules';

// The server room's sound, all synthesized and bounded however many racks there are: a low room bed of air handling,
// and a small pool of fan-hum voices that follow the racks nearest you (quieter for idle ones, gone with a rack that
// spins down), hard-drive chatter from those racks on bursts of tool activity, and a slow alarm while Claude's usage is
// paused. Through the toys group (Settings → Sound), like the other machines in the office. Ticks 5 times a second off
// the frame loop; the room (Basement.tsx) hands it the racks.

/** How many racks you hear at once, and how many drive chatters may start a second. */
export const HUM_VOICES = 6;
const CHATTER_PER_S = 5;
const TICK_MS = 200;
const ALARM_EVERY_MS = 3200;

/** What the room tells the sound about rack i. */
export interface MachineSource {
  count(): number;
  spot(i: number): { x: number; z: number; h: number };
  /** 0 off to 1 spun up. */
  power(i: number): number;
  /** Idle racks hum quietly; racks with no session (or a preview stopped) are silent. */
  audible(i: number): boolean;
}

interface Voice {
  src: AudioBufferSourceNode;
  osc: OscillatorNode;
  gain: GainNode;
  panner: PannerNode;
  rack: number;
}

let source: MachineSource | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let quiet = false;
let alarmOn = false;
let lastAlarm = -Infinity;
let chatterBudget = 0;
let chatters = 0;
let master: GainNode | null = null;
let bed: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
const voices: Voice[] = [];
const nearest: number[] = [];
let hummed = false;

function buffer(ctx: AudioContext) {
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; // brown-ish: a fan's rush, not a hiss
    d[i] = last * 6;
  }
  return b;
}

function build() {
  const a = audio();
  const out = groupOutput('toys');
  if (!a || !out || master) return;
  const ctx = a.ctx;
  try {
    master = ctx.createGain();
    master.gain.value = quiet ? 0 : 1;
    master.connect(out);
    const noiseBuf = buffer(ctx);
    // the room's bed: the air handling, everywhere at once
    const bsrc = ctx.createBufferSource();
    bsrc.buffer = noiseBuf;
    bsrc.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const bgain = ctx.createGain();
    bgain.gain.value = 0.05;
    bsrc.connect(lp).connect(bgain).connect(master);
    bsrc.start();
    bed = { src: bsrc, gain: bgain };
    for (let i = 0; i < HUM_VOICES; i++) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const bq = ctx.createBiquadFilter();
      bq.type = 'bandpass';
      bq.frequency.value = 260 + i * 37;
      bq.Q.value = 1.4;
      const osc = ctx.createOscillator();
      osc.frequency.value = 96 + i * 4.5; // each fan's motor a little off the others, so they beat
      const og = ctx.createGain();
      og.gain.value = 0.25;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const panner = createPanner(ctx, { x: 0, y: 1, z: 0 });
      src.connect(bq).connect(gain);
      osc.connect(og).connect(gain);
      gain.connect(panner).connect(master);
      src.start(0, Math.random() * 1.5);
      osc.start();
      voices.push({ src, osc, gain, panner, rack: -1 });
    }
  } catch {
    // audio is optional
  }
}

function tick() {
  build();
  const a = audio();
  if (!a || !master || !source) return;
  const now = a.ctx.currentTime;
  chatterBudget = Math.min(CHATTER_PER_S, chatterBudget + (CHATTER_PER_S * TICK_MS) / 1000);
  const ear = listenerAt();
  const src = source;
  const n = src.count();
  nearestRacks(n, src.spot, src.audible, ear.x, ear.z, HUM_VOICES, nearest);
  let live = 0;
  for (let i = 0; i < n; i++) if (src.power(i) > 0.5) live++;
  bed?.gain.gain.setTargetAtTime(quiet ? 0 : 0.03 + Math.min(0.05, live * 0.002), now, 0.4);
  // keep a voice on the rack it already follows, so a hum doesn't jump about as you walk
  for (const v of voices) if (!nearest.includes(v.rack)) v.rack = -1;
  for (const r of nearest) {
    if (voices.some((v) => v.rack === r)) continue;
    const free = voices.find((v) => v.rack === -1);
    if (free) free.rack = r;
  }
  for (const v of voices) {
    if (v.rack < 0 || v.rack >= n) {
      v.gain.gain.setTargetAtTime(0, now, 0.3);
      continue;
    }
    const s = src.spot(v.rack);
    setPannerPosition(v.panner, s.x, s.h * 0.4, s.z);
    const p = src.power(v.rack);
    v.gain.gain.setTargetAtTime(0.012 + 0.05 * p, now, 0.35);
  }
  if (!hummed && live > 0) {
    hummed = true;
    recordSfx('machines:hum', { group: 'toys', peak: 0.05, played: !quiet });
  }
  if (alarmOn && !quiet && performance.now() - lastAlarm > ALARM_EVERY_MS) {
    lastAlarm = performance.now();
    // slow and low: a whoop rising and falling, more ship's klaxon than smoke detector
    tone({ name: 'basement:alarm', group: 'alerts', freq: 330, to: 520, type: 'triangle', dur: 0.9, peak: 0.07, attack: 0.08 });
    tone({ name: 'basement:alarm', group: 'alerts', freq: 520, to: 300, type: 'triangle', at: 0.95, dur: 1.1, peak: 0.06, attack: 0.05 });
  }
}

/** The room came into view: its racks start humming. */
export function startMachines(src: MachineSource) {
  source = src;
  if (!timer) timer = setInterval(tick, TICK_MS);
  tick();
}

/** The room's gone: everything stops and lets go of its nodes. */
export function stopMachines() {
  if (timer) clearInterval(timer);
  timer = null;
  source = null;
  alarmOn = false;
  hummed = false;
  for (const v of voices) {
    try {
      v.src.stop();
      v.osc.stop();
      v.panner.disconnect();
    } catch {
      // already stopped
    }
  }
  voices.length = 0;
  try {
    bed?.src.stop();
    master?.disconnect();
  } catch {
    // already stopped
  }
  bed = null;
  master = null;
}

/** Behind a panel, the phone or the elevator's doors (or with the view paused) the machines go quiet. */
export function setMachinesQuiet(q: boolean) {
  quiet = q;
  const a = audio();
  if (a && master) master.gain.setTargetAtTime(q ? 0 : 1, a.ctx.currentTime, 0.15);
}

/** The emergency alarm while Claude's usage is paused. */
export function setMachineAlarm(on: boolean) {
  alarmOn = on;
}

/** A burst of tool activity on rack i: its drives chatter, if it's one you can hear and the budget allows. */
export function chatter(i: number) {
  if (quiet || !source || chatterBudget < 1 || !voices.some((v) => v.rack === i)) return;
  chatterBudget -= 1;
  chatters++;
  const s = source.spot(i);
  const pos = { x: s.x, y: s.h * 0.6, z: s.z };
  const clicks = 3 + Math.floor(Math.random() * 4);
  for (let k = 0; k < clicks; k++) {
    noise({ name: 'machines:disk', group: 'toys', pos, at: k * (0.035 + Math.random() * 0.05), dur: 0.018, peak: 0.05, filter: 'highpass', freq: 2600 + Math.random() * 1500, q: 0.8, attack: 0.001 });
  }
}

/** For the probe: which racks the hum voices follow, and how many chatters have played. */
export const machineReport = () => ({ voices: voices.length, following: voices.map((v) => v.rack), chatters, alarm: alarmOn, quiet });
