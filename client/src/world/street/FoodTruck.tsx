import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { griddleHiss, orderBell, paperRustle, sizzle } from '../../ui/streetSfx';
import { roundRect, SANS } from '../draw';
import { useCanvasTexture, useInteractable } from '../interact';
import { Ball, Box, Cyl } from '../Toon';
import { TRUCK } from './plaza';
import { DISHES, dishAt, MENU, menuChangesIn, orderAt, truckLabel, truckState, type Dish, type Truck, type TruckState } from './streetRules';
import { useStreetOp, useStreetReport } from './streetOps';

// The food truck on the plaza (streetRules.ts has its menu and orders): a yellow van with its hatch open on the side
// facing the building, a chef in the window, a menu board, a sign on the roof and steam from the griddle's vent. The
// menu rotates through tacos, bao and gelato; E at the hatch orders whatever's on, it sizzles a moment, the bell rings
// and it's in your hands, to eat a bite at a time (HeldFood.tsx). It sizzles away quietly whenever you're near.

const BODY = '#ffd166';
const STRIPE = '#ef476f';
const PUFFS = 10;
const RISE = 2.4; // seconds a puff takes to rise and fade
const HATCH = { x: TRUCK.x + TRUCK.w / 2, y: 1.75, z: TRUCK.hatchZ };
const AT = { x: HATCH.x, y: 1.3, z: HATCH.z };
const VENT = { x: TRUCK.x - 0.3, y: TRUCK.h, z: TRUCK.hatchZ + 0.4 };
let foodSeq = 1;

function MenuBoard({ dish }: { dish: Dish }) {
  const tex = useCanvasTexture(
    384,
    352,
    (ctx) => {
      roundRect(ctx, 0, 0, 384, 352, 26);
      ctx.fillStyle = '#2b2d42';
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd166';
      ctx.font = `700 40px ${SANS}`;
      ctx.fillText('MENU', 192, 40);
      DISHES.forEach((d, i) => {
        const y = 110 + i * 82;
        const on = d === dish;
        if (on) {
          roundRect(ctx, 16, y - 34, 352, 68, 14);
          ctx.fillStyle = '#ef476f';
          ctx.fill();
        }
        ctx.fillStyle = on ? '#ffffff' : '#adb5bd';
        ctx.font = `700 ${on ? 40 : 34}px ${SANS}`;
        ctx.fillText(`${MENU[d].emoji} ${MENU[d].name}`, 192, y - (on ? 6 : 0));
        if (on) {
          ctx.font = `500 18px ${SANS}`;
          ctx.fillText('NOW SERVING · free today', 192, y + 22);
        }
      });
    },
    [dish],
  );
  return (
    <mesh position={[TRUCK.x + TRUCK.w / 2 + 0.01, 1.85, TRUCK.hatchZ + 1.75]} rotation={[0, Math.PI / 2, 0]}>
      <planeGeometry args={[1.1, 1.0]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

function RoofSign() {
  const tex = useCanvasTexture(
    512,
    96,
    (ctx) => {
      roundRect(ctx, 0, 0, 512, 96, 20);
      ctx.fillStyle = STRIPE;
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 60px ${SANS}`;
      ctx.fillText('STREET EATS', 256, 52);
    },
    [],
  );
  return (
    <group position={[TRUCK.x, TRUCK.h + 0.32, TRUCK.z + 0.6]}>
      <Box size={[0.08, 0.5, 2.7]} color="#ffffff" />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.045, 0, 0]} rotation={[0, (s * Math.PI) / 2, 0]}>
          <planeGeometry args={[2.6, 0.48]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

export function FoodTruck() {
  const [dish, setDish] = useState<Dish>(() => dishAt(Date.now()));
  const [state, setState] = useState<TruckState>('open');
  const truck = useRef<Truck>({ since: null, dish });
  const run = useMemo(() => ({ crackle: 0, m: new THREE.Matrix4(), orders: 0, served: [] as Dish[] }), []);
  const puff = useMemo(() => new THREE.SphereGeometry(0.16, 10, 8), []);
  const smoke = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f1f3f5', transparent: true, opacity: 0.3, depthWrite: false }), []);
  useEffect(
    () => () => {
      puff.dispose();
      smoke.dispose();
    },
    [puff, smoke],
  );
  const steam = useRef<THREE.InstancedMesh>(null);
  const ref = useInteractable<THREE.Group>({ id: 'street:truck', label: truckLabel(state, dish), action: { kind: 'street', op: 'order' } }, 3.2);

  useFrame(({ camera }) => {
    const t = performance.now() / 1000;
    const s = useStore.getState();
    const now = Date.now();
    const on = dishAt(now);
    if (on !== dish) setDish(on);
    const st = truckState(truck.current, t);
    if (st !== state) setState(st);
    if (st === 'ready') {
      // order up: into your hands, in its paper
      const d = truck.current.dish;
      truck.current = { since: null, dish: d };
      setState('open');
      orderBell(AT);
      paperRustle(AT);
      run.served.push(d);
      if (run.served.length > 5) run.served.shift();
      if (!useStore.getState().held) s.setHeld({ kind: 'food', id: `food-${foodSeq++}`, dish: d, bites: MENU[d].bites });
    }
    // the griddle crackles away, busier while an order's on; quiet behind a panel or in the lift
    const near = camera.position.distanceToSquared(steamAt) < 16 * 16;
    if (near && !s.overlay && !s.travel && t >= run.crackle) {
      const busy = st === 'cooking';
      sizzle(AT, busy ? 1 : 0.35);
      run.crackle = t + (busy ? 0.07 + Math.random() * 0.12 : 0.35 + Math.random() * 0.7);
    }
    const m = steam.current;
    if (m) {
      const k0 = st === 'cooking' ? 1 : 0.55;
      for (let i = 0; i < PUFFS; i++) {
        const k = (t / RISE + i / PUFFS) % 1;
        const size = (0.4 + k * 1.8) * (i / PUFFS < k0 ? 1 : 0);
        run.m.makeScale(size, size, size).setPosition(VENT.x + Math.sin(i * 2.1 + t * 0.6) * 0.15 * k, VENT.y + 0.2 + k * 1.9, VENT.z + k * k * 0.8);
        m.setMatrixAt(i, run.m);
      }
      m.instanceMatrix.needsUpdate = true;
      smoke.opacity = 0.28 * (1 - 0.3 * Math.sin(t * 0.7) ** 2);
    }
  });

  useStreetOp('order', () => {
    const s = useStore.getState();
    const t = performance.now() / 1000;
    const d = dishAt(Date.now());
    const { op, truck: next } = orderAt(truck.current, t, d, s.held !== null);
    if (op === 'full') {
      s.pushToast('info', s.held?.kind === 'food' ? `${MENU[s.held.dish].emoji} One at a time: eat that first (E)` : '🙌 Your hands are full');
      return;
    }
    if (op === 'busy') return;
    truck.current = next;
    run.orders++;
    setState('cooking');
    griddleHiss(AT);
    s.pushToast('info', `${MENU[d].emoji} ${MENU[d].name} coming right up (on the house)`);
  });
  useStreetReport('truck', () => ({
    dish: dishAt(Date.now()),
    next: menuChangesIn(Date.now()),
    state: truckState(truck.current, performance.now() / 1000),
    orders: run.orders,
    served: [...run.served],
  }));

  const x = TRUCK.x;
  const z = TRUCK.z;
  const w = TRUCK.w;
  const l = TRUCK.l;
  const north = z - l / 2;
  return (
    <group>
      {/* the box body behind the cab, the cab at the north end with its windscreen */}
      <Box size={[w, 2.5, l - 1.5]} position={[x, 0.55 + 1.25, north + 1.5 + (l - 1.5) / 2]} color={BODY} outline />
      <Box size={[w + 0.02, 0.22, l - 1.5]} position={[x, 0.9, north + 1.5 + (l - 1.5) / 2]} color={STRIPE} shadow={false} />
      <Box size={[w - 0.1, 1.55, 1.5]} position={[x, 0.55 + 0.78, north + 0.75]} color={BODY} outline />
      <Box size={[w - 0.3, 0.6, 0.05]} position={[x, 1.65, north - 0.01]} color="#2b4a6b" shadow={false} />
      {[north + 0.8, z + l / 2 - 0.9].flatMap((wz) =>
        [-1, 1].map((sx) => <Cyl key={`${wz}${sx}`} r={0.42} h={0.3} position={[x + sx * (w / 2 - 0.1), 0.42, wz]} rotation={[0, 0, Math.PI / 2]} color="#2b2d42" />),
      )}
      {/* the hatch, its awning and counter, and the chef inside */}
      <group ref={ref}>
        <Box size={[0.04, 1.0, 1.8]} position={[HATCH.x + 0.005, HATCH.y, HATCH.z]} color="#3d2c22" shadow={false} />
        <Box size={[0.95, 0.06, 2.2]} position={[HATCH.x + 0.42, 2.42, HATCH.z]} rotation={[0, 0, -0.22]} color={STRIPE} outline />
        <Box size={[0.4, 0.06, 1.9]} position={[HATCH.x + 0.2, 1.22, HATCH.z]} color="#adb5bd" outline />
        <Box size={[0.3, 0.42, 0.5]} position={[HATCH.x - 0.12, 1.5, HATCH.z + 0.25]} color="#ffffff" shadow={false} />
        <Ball r={0.19} position={[HATCH.x - 0.1, 1.9, HATCH.z + 0.25]} color="#f4c7a1" />
        <Cyl r={0.16} rTop={0.21} h={0.24} position={[HATCH.x - 0.1, 2.17, HATCH.z + 0.25]} color="#ffffff" />
        <Cyl r={0.06} rTop={0.08} h={0.12} position={[HATCH.x + 0.25, 1.31, HATCH.z - 0.6]} color="#d62828" />
        <Cyl r={0.06} rTop={0.08} h={0.12} position={[HATCH.x + 0.25, 1.31, HATCH.z - 0.4]} color="#ffc93c" />
      </group>
      <Cyl r={0.12} h={0.3} position={[VENT.x, VENT.y + 0.15, VENT.z]} color="#adb5bd" />
      <MenuBoard dish={dish} />
      <RoofSign />
      <instancedMesh ref={steam} args={[puff, smoke, PUFFS]} frustumCulled={false} renderOrder={3} />
    </group>
  );
}

const steamAt = new THREE.Vector3(AT.x, 1.6, AT.z);
