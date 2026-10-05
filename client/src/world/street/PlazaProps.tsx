import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { drawSign, roundRect, SANS, wrap } from '../draw';
import { useCanvasTexture, useInteractable } from '../interact';
import { merged } from '../shapes';
import { paneMaterial } from '../Shell';
import { balconyBulb, lampsOn } from '../sky/lamps';
import { nightFactor } from '../sky/time';
import { dayTime } from '../sky/useDayTime';
import { Ball, Box, Cyl } from '../Toon';
import { weather } from '../weather/weatherState';
import { BENCH, BENCHES, BIG_TREE, BUS_STOP, KIOSK, LAMP, LAMPS, NAME_SIGN, PARK, PLANTER, PUDDLES, TREE_PLANTERS, type Bench } from './plaza';
import { headlineAt, headlines } from './streetRules';
import { useStreetReport } from './streetOps';

// The plaza's furniture (plaza.ts says where): benches, trees in planters, the building's name on a low wall by the
// avenue, the newsstand and its headline, the bus shelter, the park's grass and big tree, and the street lamps that come
// on at dusk with a pool of light under each. Puddles shine on the paving while it's wet. The boxy parts are Toon.tsx's,
// drawn as instanced batches with the lobby's; the lamps and puddles are a few merged meshes.

const WOOD = '#c9905a';
const IRON = '#495057';
const TERRACOTTA = '#e07a5f';
const LEAVES = ['#52b788', '#40916c', '#74c69d'];

function PlazaBench({ b }: { b: Bench }) {
  const rot = -(b.facing + Math.PI / 2); // built facing -z, its back at +z
  return (
    <group position={[b.x, 0, b.z]} rotation={[0, rot, 0]}>
      <Box size={[BENCH.l, 0.08, BENCH.w - 0.1]} position={[0, 0.46, -0.02]} color={WOOD} outline />
      <Box size={[BENCH.l, 0.34, 0.07]} position={[0, 0.72, BENCH.w / 2 - 0.06]} rotation={[-0.12, 0, 0]} color={WOOD} outline />
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.07, 0.44, BENCH.w - 0.12]} position={[s * (BENCH.l / 2 - 0.15), 0.22, 0]} color={IRON} />
      ))}
    </group>
  );
}

function PlanterTree({ x, z, i }: { x: number; z: number; i: number }) {
  return (
    <group position={[x, 0, z]}>
      <Box size={[PLANTER.w, PLANTER.h, PLANTER.w]} position={[0, PLANTER.h / 2, 0]} color={TERRACOTTA} outline />
      <Box size={[PLANTER.w - 0.12, 0.04, PLANTER.w - 0.12]} position={[0, PLANTER.h + 0.01, 0]} color="#6b4a33" shadow={false} />
      <Cyl r={0.1} h={1.6} position={[0, PLANTER.h + 0.8, 0]} color="#7a5a3c" />
      <Ball r={0.85} position={[0, PLANTER.h + 2.05, 0]} color={LEAVES[i % LEAVES.length]} outline />
      <Ball r={0.55} position={[0.45, PLANTER.h + 1.75, 0.3]} color={LEAVES[(i + 1) % LEAVES.length]} />
    </group>
  );
}

/** The building's name on a low wall by the avenue, on both faces: one towards the street, one towards the door. */
function NameSign() {
  const company = useStore((s) => s.settings.companyName) || 'cubefarm';
  const tex = useCanvasTexture(
    1024,
    192,
    (ctx) => {
      ctx.clearRect(0, 0, 1024, 192);
      ctx.fillStyle = '#fff4e0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${company.length > 14 ? 88 : 124}px ${SANS}`;
      ctx.fillText(company, 512, 92, 980);
    },
    [company],
  );
  const s = NAME_SIGN;
  return (
    <group position={[s.x, 0, s.z]}>
      <Box size={[s.t, s.h, s.len]} position={[0, s.h / 2, 0]} color="#3d405b" outline />
      <Box size={[s.t + 0.12, 0.08, s.len + 0.12]} position={[0, s.h + 0.04, 0]} color="#e3d5b8" />
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (s.t / 2 + 0.005), s.h / 2, 0]} rotation={[0, (side * Math.PI) / 2, 0]}>
          <planeGeometry args={[s.len - 0.4, ((s.len - 0.4) * 192) / 1024]} />
          <meshBasicMaterial map={tex} transparent toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** The newsstand: a little booth with magazines out front and the day's headline on a board facing the avenue. */
function Newsstand() {
  const repos = useStore((s) => s.repos);
  const agents = useStore((s) => s.agents);
  const company = useStore((s) => s.settings.companyName) || 'cubefarm';
  const list = useMemo(() => headlines(repos, Object.values(agents), Date.now(), company), [repos, agents, company]);
  // a fresh look every few seconds: the headline moves on by the clock
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 4000);
    return () => clearInterval(t);
  }, []);
  const headline = headlineAt(list, Date.now());
  const tex = useCanvasTexture(
    640,
    256,
    (ctx) => {
      drawSign(ctx, 640, 256, [], '#fffaf0');
      ctx.fillStyle = '#1f1d2b';
      ctx.fillRect(0, 0, 640, 62);
      ctx.fillStyle = '#fffaf0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 40px ${SANS}`;
      ctx.fillText('THE DAILY STANDUP', 320, 33);
      ctx.fillStyle = '#1f1d2b';
      ctx.font = `700 46px ${SANS}`;
      const lines = wrap(ctx, headline.toUpperCase(), 600, 3);
      lines.forEach((l, i) => ctx.fillText(l, 320, 156 + (i - (lines.length - 1) / 2) * 52));
    },
    [headline],
  );
  const k = KIOSK;
  const ref = useInteractable<THREE.Group>({ id: 'street:news', label: '📰 Read the headline', action: { kind: 'street', op: 'read' } }, 3.5);
  useStreetReport('headline', () => headline);
  return (
    <group position={[k.x, 0, k.z]} ref={ref}>
      <Box size={[k.w, k.h - 0.2, k.d]} position={[0, (k.h - 0.2) / 2, 0]} color="#2a9d8f" outline />
      <Box size={[k.w + 0.5, 0.12, k.d + 0.6]} position={[0, k.h - 0.1, -0.1]} color="#e76f51" outline />
      <Box size={[k.w - 0.1, 0.08, 0.4]} position={[0, 1.0, -k.d / 2 - 0.2]} color={WOOD} />
      {['#ffd166', '#ef476f', '#118ab2', '#06d6a0'].map((c, i) => (
        <Box key={c} size={[0.3, 0.4, 0.04]} position={[-0.6 + i * 0.4, 0.55, -k.d / 2 - 0.03]} rotation={[0.15, 0, 0]} color={c} shadow={false} />
      ))}
      <mesh position={[0, 1.75, -k.d / 2 - 0.01]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[1.6, 0.64]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** The bus shelter: a glass back to the plaza, a roof, a bench, and the stop's sign on its pole by the kerb. */
function BusShelter() {
  const s = BUS_STOP;
  const back = s.x - s.depth / 2;
  const tex = useCanvasTexture(
    256,
    256,
    (ctx) => {
      ctx.clearRect(0, 0, 256, 256);
      ctx.fillStyle = '#e63946';
      ctx.beginPath();
      ctx.arc(128, 128, 124, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, 20, 98, 216, 60, 10);
      ctx.fill();
      ctx.fillStyle = '#1f1d2b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 52px ${SANS}`;
      ctx.fillText('BUS', 128, 130);
    },
    [],
  );
  return (
    <group>
      <mesh position={[back, s.h / 2 + 0.1, s.z]} rotation={[0, Math.PI / 2, 0]} material={paneMaterial()} renderOrder={1}>
        <planeGeometry args={[s.len, s.h - 0.3]} />
      </mesh>
      <Box size={[0.08, s.h, 0.08]} position={[back, s.h / 2, s.z - s.len / 2]} color={IRON} />
      <Box size={[0.08, s.h, 0.08]} position={[back, s.h / 2, s.z + s.len / 2]} color={IRON} />
      <Box size={[0.08, s.h, 0.08]} position={[back + s.depth, s.h / 2, s.z - s.len / 2]} color={IRON} />
      <Box size={[0.08, s.h, 0.08]} position={[back + s.depth, s.h / 2, s.z + s.len / 2]} color={IRON} />
      <Box size={[s.depth + 0.3, 0.1, s.len + 0.3]} position={[back + s.depth / 2, s.h + 0.05, s.z]} color="#3a86ff" outline />
      <Box size={[0.45, 0.08, s.len - 0.6]} position={[back + 0.4, 0.46, s.z]} color={WOOD} outline />
      <Box size={[0.06, 0.46, 0.06]} position={[back + 0.4, 0.23, s.z - s.len / 2 + 0.5]} color={IRON} />
      <Box size={[0.06, 0.46, 0.06]} position={[back + 0.4, 0.23, s.z + s.len / 2 - 0.5]} color={IRON} />
      <group position={[back + s.depth + 0.4, 0, s.z - s.len / 2 - 0.5]}>
        <Cyl r={0.05} h={2.6} position={[0, 1.3, 0]} color={IRON} />
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.03, 2.5, 0]} rotation={[0, (side * Math.PI) / 2, 0]}>
            <circleGeometry args={[0.3, 24]} />
            <meshBasicMaterial map={tex} transparent toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** The park: its lawn, a flower border and the big tree you can sit under (E: Park.tsx's perch). */
function ParkGround() {
  const w = PARK.maxX - PARK.minX;
  const d = PARK.maxZ - PARK.minZ;
  const ref = useInteractable<THREE.Group>({ id: 'street:tree', label: '🌳 Sit under the tree', action: { kind: 'street', op: 'sit' } }, 3);
  return (
    <group>
      <Box size={[w, 0.05, d]} position={[(PARK.minX + PARK.maxX) / 2, 0.025, (PARK.minZ + PARK.maxZ) / 2]} color="#8fc46a" shadow={false} />
      <group position={[BIG_TREE.x, 0, BIG_TREE.z]} ref={ref}>
        <Cyl r={BIG_TREE.trunk} rTop={BIG_TREE.trunk * 0.7} h={2.8} position={[0, 1.4, 0]} color="#7a5a3c" outline />
        <Ball r={2.1} position={[0, 4.1, 0]} color="#52b788" outline />
        <Ball r={1.5} position={[1.3, 3.6, 0.7]} color="#40916c" />
        <Ball r={1.4} position={[-1.2, 3.7, -0.8]} color="#74c69d" />
        <Ball r={1.2} position={[0.3, 3.4, -1.5]} color="#40916c" />
      </group>
      {Array.from({ length: 9 }, (_, i) => (
        <Ball key={i} r={0.12} position={[PARK.minX + 1 + i * 2.2, 0.1, PARK.maxZ - 0.35]} color={['#ff8fab', '#ffd166', '#cdb4db'][i % 3]} shadow={false} />
      ))}
    </group>
  );
}

// ---------- lamps ----------

const POOL = 6;

function poolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Street lamps: poles and heads in one mesh, the bulbs in another (lit with the balcony bulbs at dusk), and pools of light. */
function Lamps() {
  const geo = useMemo(() => {
    const poles: THREE.BufferGeometry[] = [];
    const bulbs: THREE.BufferGeometry[] = [];
    for (const p of LAMPS) {
      poles.push(new THREE.CylinderGeometry(LAMP.r, LAMP.r * 1.4, LAMP.h, 8).translate(p.x, LAMP.h / 2, p.z));
      poles.push(new THREE.CylinderGeometry(0.22, 0.3, 0.12, 10).translate(p.x, LAMP.h + 0.06, p.z));
      poles.push(new THREE.ConeGeometry(0.34, 0.26, 10).translate(p.x, LAMP.h + 0.4, p.z));
      bulbs.push(new THREE.SphereGeometry(0.17, 12, 8).translate(p.x, LAMP.h + 0.2, p.z));
    }
    return { poles: merged(poles), bulbs: merged(bulbs), pool: new THREE.PlaneGeometry(POOL, POOL).rotateX(-Math.PI / 2) };
  }, []);
  const mats = useMemo(
    () => ({
      pole: new THREE.MeshToonMaterial({ color: '#2b2d42' }),
      pool: new THREE.MeshBasicMaterial({ map: poolTexture(), color: '#ffcf85', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    }),
    [],
  );
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
      mats.pool.map?.dispose();
      Object.values(mats).forEach((m) => m.dispose());
    },
    [geo, mats],
  );
  const pools = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = pools.current;
    if (!m) return;
    const mat = new THREE.Matrix4();
    LAMPS.forEach((p, i) => m.setMatrixAt(i, mat.makeTranslation(p.x, 0.03, p.z)));
    m.instanceMatrix.needsUpdate = true;
  }, []);
  useFrame(() => {
    const on = lampsOn();
    mats.pool.opacity = on * 0.42;
    if (pools.current) pools.current.visible = on > 0.01;
  });
  useStreetReport('lamps', () => Math.round(lampsOn() * 100) / 100);
  return (
    <group>
      <mesh geometry={geo.poles} material={mats.pole} castShadow />
      <mesh geometry={geo.bulbs} material={balconyBulb} />
      <instancedMesh ref={pools} args={[geo.pool, mats.pool, LAMPS.length]} frustumCulled={false} renderOrder={2} />
    </group>
  );
}

// ---------- puddles ----------

const PUDDLE_DAY = new THREE.Color('#b8cde6');
const PUDDLE_NIGHT = new THREE.Color('#3b4a6b');

/** Puddles on the paving while it's wet: the sky's colour (lamplight at night) shining back, fading as it dries. */
function Puddles() {
  const geo = useMemo(() => merged(PUDDLES.map((p) => new THREE.CircleGeometry(1, 24).scale(p.rx, p.rz, 1).rotateX(-Math.PI / 2).translate(p.x, 0.015, p.z))), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: PUDDLE_DAY.clone(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const wet = weather.active ? Math.max(weather.wet, weather.mix.rain * 0.8) * (1 - weather.snow) : 0;
    if (mesh.current) mesh.current.visible = wet > 0.02;
    if (wet <= 0.02) return;
    mat.opacity = wet * 0.55;
    mat.color.lerpColors(PUDDLE_DAY, PUDDLE_NIGHT, nightFactor(dayTime.t)).lerp(glowColor, lampsOn() * 0.25);
  });
  useStreetReport('wet', () => (weather.active ? Math.round(weather.wet * 100) / 100 : 0));
  return <mesh ref={mesh} geometry={geo} material={mat} renderOrder={2} visible={false} />;
}
const glowColor = new THREE.Color('#ffcf85');

export function PlazaProps() {
  return (
    <group>
      {BENCHES.map((b, i) => (
        <PlazaBench key={i} b={b} />
      ))}
      {TREE_PLANTERS.map((p, i) => (
        <PlanterTree key={i} x={p.x} z={p.z} i={i} />
      ))}
      <NameSign />
      <Newsstand />
      <BusShelter />
      <ParkGround />
      <Lamps />
      <Puddles />
    </group>
  );
}
