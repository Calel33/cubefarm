import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useStore, type Focus } from '../../store';
import { useInteractable } from '../interact';
import { MAX_RACKS, RACK, TRAY } from '../layout';
import { toon } from '../materials';
import { inkMaterial } from '../Outlines';
import { merged } from '../shapes';
import {
  agentRackState,
  blinkHz,
  bumpRate,
  fanSpeed,
  newRate,
  powerAt,
  previewRackState,
  rackLive,
  rateAt,
  setPower,
  statusLed,
  type Power,
  type RackPlan,
  type RackState,
  type RackUnit,
  type Rate,
} from './basementRules';
import { lcdAtlas, LCD_COLS } from './lcdAtlas';
import { chatter, type MachineSource } from './machineSfx';
import { room, roomTime } from './roomClock';
import { logRoom } from './roomLog';
import { ledMaterial, lcdMaterial } from './shaders';

// Every rack in the room as a handful of instanced draws, however many there are: the cabinets (with their ink), the
// drive bays, the fans, the LCDs (one atlas), the LEDs and the cable drops from the trays to every live CLI. A rack's
// lights blink and spin down in the shaders (shaders.ts); here a state change rewrites only that rack's attributes, and
// the frame loop turns the fans and sets one uniform. Nothing is allocated per frame.

const LEDS = 8; // a status column of four, and four activity lights under the LCD
const BODY = '#2b3244';
const PREVIEW_BODY = '#34425e';
const ACTIVITY = new THREE.Color('#c8f6ff');
const INK_T = 0.018;

/** What the room remembers of each rack across plans (by its key), so a rack that moves along its row keeps its state. */
interface Track {
  state: RackState | null;
  live: boolean;
  cli: boolean;
  power: Power;
  rate: Rate;
  hz: number;
  sig: string;
  latest: number;
  angle: number;
}

const newTrack = (): Track => ({ state: null, live: false, cli: false, power: { from: 0, to: 0, t0: 0 }, rate: newRate(), hz: 0, sig: '', latest: -1, angle: Math.random() * 6 });

function fanGeometry() {
  const paint = (g: THREE.BufferGeometry, hex: string) => {
    const c = new THREE.Color(hex);
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(a, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  const parts = [paint(new THREE.CircleGeometry(1, 24), '#151a24')];
  for (let k = 0; k < 4; k++) parts.push(paint(new THREE.BoxGeometry(0.28, 0.82, 0.04).translate(0, 0.45, 0.03).rotateZ((k * Math.PI) / 2 + 0.2), '#8b97ad'));
  parts.push(paint(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12).rotateX(Math.PI / 2).translate(0, 0, 0.05), '#c7cfdc'));
  return merged(parts);
}

/** The door's drive bays and handle, for a full-height rack (a small one is squashed to its height). */
function bayGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) parts.push(new THREE.BoxGeometry(0.4, 0.07, 0.02).translate(0.03, 0.88 + k * 0.105, RACK.d / 2 + 0.01));
  parts.push(new THREE.BoxGeometry(0.03, 0.5, 0.03).translate(RACK.w / 2 - 0.05, 1.05, RACK.d / 2 + 0.015));
  return merged(parts);
}

const unitHeight = (u: RackUnit) => (u.kind === 'preview' ? RACK.small : RACK.h);
const fanY = (u: RackUnit) => (u.kind === 'preview' ? 0.3 : 0.48);
const fanR = (u: RackUnit) => (u.kind === 'preview' ? 0.12 : 0.17);

function focusFor(u: RackUnit, name: string, state: RackState): Focus {
  if (u.kind === 'agent' && u.agentId) return { id: `rack:${u.key}`, label: `${name}'s terminal (${state === 'idle' ? 'idle' : state})`, action: { kind: 'terminal', agentId: u.agentId } };
  return { id: `rack:${u.key}`, label: `Preview ${u.label}${u.pr ? ` · PR #${u.pr}` : ' · main'}: open the app`, action: { kind: 'app', repoId: u.repoId ?? '', pr: u.pr } };
}

export interface RackReport {
  racks: Record<string, { power: number; hz: number; fan: number; cable: boolean }>;
  liveClis: number;
  lcdPaints: number;
}

/** The racks of `plan`. `source` is filled in for the room's sound; `report` for the probe. */
export function Racks({ plan, source, report, onClis }: { plan: RackPlan; source: { current: MachineSource | null }; report: { current: (() => RackReport) | null }; onClis: (n: number) => void }) {
  const tracks = useRef(new Map<string, Track>());
  const units = useRef<RackUnit[]>([]);

  const parts = useMemo(() => {
    const white = () => (toon('#ffffff') as THREE.MeshToonMaterial).clone();
    const bodyGeo = new THREE.BoxGeometry(RACK.w, 1, RACK.d).translate(0, 0.5, 0);
    const body = new THREE.InstancedMesh(bodyGeo, white(), MAX_RACKS);
    const inkGeo = toCreasedNormals(bodyGeo, Math.PI);
    const ink = new THREE.InstancedMesh(inkGeo, inkMaterial(INK_T), MAX_RACKS);
    ink.instanceMatrix = body.instanceMatrix; // the outline follows the cabinets exactly
    const bays = new THREE.InstancedMesh(bayGeometry(), toon('#4a5670'), MAX_RACKS);
    const fanMat = white();
    fanMat.vertexColors = true;
    const fans = new THREE.InstancedMesh(fanGeometry(), fanMat, MAX_RACKS);
    const atlas = lcdAtlas();
    const lcdGeo = new THREE.PlaneGeometry(0.44, 0.11);
    lcdGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(MAX_RACKS * 2), 2));
    lcdGeo.setAttribute('aPower', new THREE.InstancedBufferAttribute(new Float32Array(MAX_RACKS * 3), 3));
    const lcd = new THREE.InstancedMesh(lcdGeo, lcdMaterial(atlas.texture, LCD_COLS, Math.ceil(MAX_RACKS / LCD_COLS)), MAX_RACKS);
    const ledGeo = new THREE.PlaneGeometry(0.038, 0.038);
    ledGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(MAX_RACKS * LEDS * 3), 3));
    ledGeo.setAttribute('aBlink', new THREE.InstancedBufferAttribute(new Float32Array(MAX_RACKS * LEDS * 4), 4));
    ledGeo.setAttribute('aPower', new THREE.InstancedBufferAttribute(new Float32Array(MAX_RACKS * LEDS * 3), 3));
    const leds = new THREE.InstancedMesh(ledGeo, ledMaterial(), MAX_RACKS * LEDS);
    const drops = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 1, 0.035), white(), MAX_RACKS);
    for (const m of [body, drops]) {
      for (let i = 0; i < MAX_RACKS; i++) m.setColorAt(i, new THREE.Color(BODY)); // makes instanceColor before the first draw
    }
    for (const m of [body, ink, bays, fans, lcd, leds, drops]) {
      m.count = 0;
      m.castShadow = false;
      m.receiveShadow = false;
    }
    return { body, ink, bays, fans, lcd, leds, drops, atlas, m4: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color() };
  }, []);

  useEffect(
    () => () => {
      for (const m of [parts.body, parts.ink, parts.bays, parts.fans, parts.lcd, parts.leds, parts.drops]) {
        m.geometry.dispose();
        if (m !== parts.ink && m !== parts.bays) (m.material as THREE.Material).dispose();
        m.dispose();
      }
      parts.atlas.dispose();
    },
    [parts],
  );

  // ---------- writing a rack's attributes ----------

  const place = (m: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rz = 0) => {
    const { m4, q, e, p, s } = parts;
    e.set(0, 0, rz);
    q.setFromEuler(e);
    m4.compose(p.set(x, y, z), q, s.set(sx, sy, sz));
    m.setMatrixAt(i, m4);
  };

  /** The rack's lights for its state and activity (only what changed is uploaded). */
  const writeLights = (i: number, t: Track) => {
    const g = parts.leds.geometry;
    const color = g.attributes.aColor as THREE.InstancedBufferAttribute;
    const blink = g.attributes.aBlink as THREE.InstancedBufferAttribute;
    const power = g.attributes.aPower as THREE.InstancedBufferAttribute;
    const st = statusLed(t.state ?? 'idle');
    parts.c.set(st.color);
    for (let j = 0; j < LEDS; j++) {
      const k = i * LEDS + j;
      const act = j >= 4;
      const c = act ? ACTIVITY : parts.c;
      color.setXYZ(k, c.r, c.g, c.b);
      if (act) blink.setXYZW(k, t.hz, (j - 4) * 0.29 + i * 0.137, 0.4, 0);
      else blink.setXYZW(k, st.hz, i * 0.07, 0.55, st.floor);
      power.setXYZ(k, t.power.from, t.power.to, t.power.t0);
    }
    const lp = parts.lcd.geometry.attributes.aPower as THREE.InstancedBufferAttribute;
    lp.setXYZ(i, t.power.from, t.power.to, t.power.t0);
    for (const a of [color, blink, power, lp]) a.needsUpdate = true;
  };

  const writeDrop = (i: number, u: RackUnit, t: Track, color: string) => {
    const h = unitHeight(u);
    const len = TRAY.y - h;
    place(parts.drops, i, u.x + 0.17, h + len / 2, u.z, 1, t.cli ? len : 0.0001, 1);
    parts.drops.setColorAt(i, parts.c.set(color));
    parts.drops.instanceMatrix.needsUpdate = true;
    if (parts.drops.instanceColor) parts.drops.instanceColor.needsUpdate = true;
  };

  // ---------- reading the office ----------

  const now = () => roomTime();

  /** Brings every rack's state up to date with the store; returns how many CLIs are live (for the keeper). */
  const refresh = (s = useStore.getState(), quietly = false) => {
    const t = now();
    let clis = 0;
    units.current.forEach((u, i) => {
      const tr = tracks.current.get(u.key)!;
      const a = u.agentId ? s.agents[u.agentId] : null;
      const status = u.kind === 'preview' ? (u.pr === null ? s.repos.find((r) => r.id === u.repoId)?.preview.status : s.prPreviews[`${u.repoId}#${u.pr}`]?.status) : null;
      const state = a ? agentRackState(a) : previewRackState(status ?? 'stopped');
      const live = rackLive(state);
      const cli = !!a && live && a.terminal;
      if (cli) clis++;
      let changed = state !== tr.state;
      if (changed && tr.state !== null && !quietly && u.kind === 'agent') {
        const where = u.floor === 0 ? 'G' : `F${u.floor}`;
        if (state === 'error') logRoom(`${where} ${u.label}: session error`, 'bad');
        else if (live && !tr.live) logRoom(`${where} ${u.label}: session up (${state})`, 'good');
        else if (!live && tr.live) logRoom(`${where} ${u.label}: session ended, spinning down`);
        else if (live) logRoom(`${where} ${u.label}: ${state}`);
      }
      if (setPower(tr.power, live ? 1 : 0, t)) changed = true;
      // output: a new tool or activity, a new turn, a new latest line (the basement watches everyone's)
      if (a) {
        const sig = `${a.activity?.kind ?? ''}|${a.activity?.detail ?? ''}|${a.currentTool ?? ''}|${a.turns}`;
        const latest = s.latest[a.id]?.id ?? -1;
        if (tr.sig && (sig !== tr.sig || latest !== tr.latest) && live) {
          bumpRate(tr.rate, t);
          chatter(i);
        }
        tr.sig = sig;
        tr.latest = latest;
      }
      const hz = blinkHz(live, rateAt(tr.rate, t));
      if (Math.abs(hz - tr.hz) > 0.3 || (hz === 0) !== (tr.hz === 0)) {
        tr.hz = hz;
        changed = true;
      }
      tr.state = state;
      tr.live = live;
      if (cli !== tr.cli) {
        tr.cli = cli;
        writeDrop(i, u, tr, a?.color ?? '#7a869c');
      }
      if (changed) writeLights(i, tr);
    });
    onClis(clis);
  };

  // ---------- (re)building on a new plan ----------

  useEffect(() => {
    const s = useStore.getState();
    const seen = new Set<string>();
    units.current = plan.units;
    const n = plan.units.length;
    plan.units.forEach((u, i) => {
      seen.add(u.key);
      let tr = tracks.current.get(u.key);
      if (!tr) {
        tr = newTrack();
        tracks.current.set(u.key, tr);
      }
      const h = unitHeight(u);
      const front = u.z + RACK.d / 2;
      place(parts.body, i, u.x, 0, u.z, 1, h, 1);
      parts.body.setColorAt(i, parts.c.set(u.kind === 'preview' ? PREVIEW_BODY : BODY));
      place(parts.bays, i, u.x, 0, u.z, 1, h / RACK.h, 1);
      place(parts.fans, i, u.x + 0.04, fanY(u), front + 0.012, fanR(u), fanR(u), 1, tr.angle);
      place(parts.lcd, i, u.x, h - 0.2, front + 0.006);
      (parts.lcd.geometry.attributes.aCell as THREE.InstancedBufferAttribute).setXY(i, i % LCD_COLS, Math.floor(i / LCD_COLS));
      parts.atlas.paint(i, u.label, u.color, u.kind === 'preview');
      for (let j = 0; j < LEDS; j++) {
        const act = j >= 4;
        place(parts.leds, i * LEDS + j, act ? u.x - 0.105 + (j - 4) * 0.07 : u.x - 0.215, act ? h - 0.33 : h - 0.33 - j * 0.07, front + 0.008);
      }
      tr.state = null;
    });
    for (const k of [...tracks.current.keys()]) if (!seen.has(k)) tracks.current.delete(k);
    parts.atlas.flush();
    for (const m of [parts.body, parts.ink, parts.bays, parts.fans, parts.lcd, parts.drops]) m.count = n;
    parts.leds.count = n * LEDS;
    for (const m of [parts.body, parts.bays, parts.fans, parts.lcd, parts.leds, parts.drops]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
    parts.ink.computeBoundingSphere();
    if (parts.body.instanceColor) parts.body.instanceColor.needsUpdate = true;
    (parts.lcd.geometry.attributes.aCell as THREE.InstancedBufferAttribute).needsUpdate = true;
    // the first pass after a (re)plan writes every rack; racks already up don't spin up again
    refresh(s, true);
    plan.units.forEach((u, i) => {
      const tr = tracks.current.get(u.key)!;
      writeLights(i, tr);
      writeDrop(i, u, tr, (u.agentId && s.agents[u.agentId]?.color) || '#7a869c');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.key]);

  // The store's changes (a few a second at most for agents): only the racks' own inputs are looked at.
  useEffect(() => {
    let prev = useStore.getState();
    return useStore.subscribe((s) => {
      if (s.agents === prev.agents && s.latest === prev.latest && s.repos === prev.repos && s.prPreviews === prev.prPreviews) return;
      prev = s;
      refresh(s);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- each frame ----------

  const lastDecay = useRef(0);
  useFrame((_, dt) => {
    const t = now();
    (parts.leds.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    (parts.leds.material as THREE.ShaderMaterial).uniforms.uLevel.value = room.level;
    (parts.lcd.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    (parts.lcd.material as THREE.ShaderMaterial).uniforms.uLevel.value = room.level;
    // activity dies away: the blink slows as a session goes quiet
    if (t - lastDecay.current > 1) {
      lastDecay.current = t;
      refresh(undefined, true);
    }
    const list = units.current;
    const step = Math.min(dt, 0.1) * Math.PI * 2;
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      const tr = tracks.current.get(u.key);
      if (!tr) continue;
      const p = powerAt(tr.power, t);
      if (p <= 0) continue;
      tr.angle = (tr.angle + fanSpeed(p, rateAt(tr.rate, t)) * step) % (Math.PI * 2);
      place(parts.fans, i, u.x + 0.04, fanY(u), u.z + RACK.d / 2 + 0.012, fanR(u), fanR(u), 1, tr.angle);
    }
    parts.fans.instanceMatrix.needsUpdate = true;
  });

  // ---------- for the sound, the probe and E ----------

  useEffect(() => {
    const spot = { x: 0, z: 0, h: 0 };
    source.current = {
      count: () => units.current.length,
      spot: (i) => {
        const u = units.current[i];
        spot.x = u.x;
        spot.z = u.z;
        spot.h = unitHeight(u);
        return spot;
      },
      power: (i) => {
        const tr = tracks.current.get(units.current[i]?.key ?? '');
        return tr ? powerAt(tr.power, now()) : 0;
      },
      audible: (i) => {
        const tr = tracks.current.get(units.current[i]?.key ?? '');
        return !!tr && (tr.live || tr.state === 'idle' || powerAt(tr.power, now()) > 0);
      },
    };
    report.current = () => {
      const t = now();
      const racks: RackReport['racks'] = {};
      let liveClis = 0;
      for (const u of units.current) {
        const tr = tracks.current.get(u.key);
        if (!tr) continue;
        const p = powerAt(tr.power, t);
        if (tr.cli) liveClis++;
        racks[u.key] = { power: Math.round(p * 100) / 100, hz: Math.round(tr.hz * 10) / 10, fan: Math.round(fanSpeed(p, rateAt(tr.rate, t)) * 10) / 10, cable: tr.cli };
      }
      return { racks, liveClis, lcdPaints: parts.atlas.paints() };
    };
    return () => {
      source.current = null;
      report.current = null;
    };
  }, [parts, source, report]);

  const pick = useMemo(
    () => (point: THREE.Vector3): Focus | null => {
      let best: RackUnit | null = null;
      let bd = Infinity;
      for (const u of units.current) {
        const d = Math.abs(u.x - point.x) + Math.abs(u.z - point.z) * 0.5;
        if (d < bd) {
          bd = d;
          best = u;
        }
      }
      if (!best) return null;
      const s = useStore.getState();
      const a = best.agentId ? s.agents[best.agentId] : null;
      return focusFor(best, a?.name ?? best.label, tracks.current.get(best.key)?.state ?? 'idle');
    },
    [],
  );
  const root = useInteractable<THREE.Group>({ id: 'racks', label: 'A server rack', action: { kind: 'floorList' } }, 3.2, pick);

  return (
    <group>
      <group ref={root}>
        <primitive object={parts.body} />
        <primitive object={parts.bays} />
        <primitive object={parts.lcd} />
      </group>
      <primitive object={parts.ink} />
      <primitive object={parts.fans} />
      <primitive object={parts.leds} />
      <primitive object={parts.drops} />
    </group>
  );
}
