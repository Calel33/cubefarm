import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { busArrives, busDoors, busLeaves, crossingChirp } from '../../ui/streetSfx';
import { effectiveTier, useGfx } from '../gfx/useGraphics';
import { carRoutes } from '../outside/cityLayout';
import { nextWaypoint } from '../errands';
import { BUS_ROUTE, busCycle, busRun, callBus, carAlong, crossingClear, type BusRun, type BusStage } from './bus';
import { BUS_STEP, BUS_STOP, busWalkIn, CROSSINGS, crossingPole, type Crossing } from './plaza';
import { streetWalkers } from './streetState';
import { pedestrianCap, routes, spawnPedestrians, stepPedestrian, type Pedestrian } from './streetRules';
import { useStreetOp, useStreetReport } from './streetOps';

// The people walking by on the pavements round the block (streetRules.ts walks them): simple instanced figures, a body
// and a head each, some going over the zebra crossings at the corners when their light is green (the lights, on poles
// at both kerbs, go red whenever a car will reach the stripes before anyone could get across). As many as the graphics
// tier allows, none on Low. And the bus (bus.ts times it; City.tsx draws it): its brakes, its doors, and now and then
// a new face stepping off it and walking into the lobby by the east door. Three draw calls, all moved in place.

const BODY_COLOURS = ['#e76f51', '#2a9d8f', '#e9c46a', '#264653', '#8ecae6', '#ffb4a2', '#6d597a', '#90be6d', '#f4a261', '#577590'];
const SKIN = ['#f4c7a1', '#d8a47f', '#a5714e', '#7a4e2d', '#ffe0bd'];
const PASSENGER_CHANCE = 0.6;
const RED_ON = '#ff4d4d';
const RED_OFF = '#4a2424';
const GREEN_ON = '#4dff88';
const GREEN_OFF = '#21402c';

interface Passenger {
  on: boolean;
  path: { x: number; z: number }[];
  wp: number;
  x: number;
  z: number;
  heading: number;
  look: number;
  walked: number;
}

export function Passersby() {
  const tier = useGfx((s) => effectiveTier(s));
  const cap = pedestrianCap(tier);
  const rs = useMemo(routes, []);
  const cars = useMemo(carRoutes, []);
  const bus = cars[BUS_ROUTE];
  const people = useMemo<Pedestrian[]>(() => {
    let seed = 5;
    return spawnPedestrians(cap, rs, () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    });
  }, [cap, rs]);
  const slots = cap + 1; // the last one's the bus passenger
  const geo = useMemo(() => ({ body: new THREE.CapsuleGeometry(0.22, 0.75, 4, 10).translate(0, 0.62, 0), head: new THREE.SphereGeometry(0.17, 12, 9) }), []);
  const mats = useMemo(
    () => ({
      body: new THREE.MeshToonMaterial({ color: '#ffffff' }),
      head: new THREE.MeshToonMaterial({ color: '#ffffff' }),
      pole: new THREE.MeshToonMaterial({ color: '#2b2d42' }),
    }),
    [],
  );
  // each crossing's two lamps (both its poles show the same): red, and the green walking man
  const lamps = useMemo(
    () =>
      Object.fromEntries(CROSSINGS.map((c) => [c.id, { red: new THREE.MeshBasicMaterial({ color: RED_ON, toneMapped: false }), green: new THREE.MeshBasicMaterial({ color: GREEN_OFF, toneMapped: false }) }])) as Record<
        Crossing['id'],
        { red: THREE.MeshBasicMaterial; green: THREE.MeshBasicMaterial }
      >,
    [],
  );
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
      Object.values(lamps).forEach((l) => [l.red, l.green].forEach((m) => m.dispose()));
    },
    [geo, mats, lamps],
  );
  const bodies = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const run = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      at: { x: 0, z: 0, heading: 0 },
      bus: { s: 0, stage: 'driving', next: 0, at: 0 } as BusRun,
      was: '' as BusStage | '',
      arrivals: 0,
      dropped: 0,
      green: { nw: false, sw: false } as Record<Crossing['id'], boolean>,
      time: 0,
      player: { x: 0, z: 0 },
      color: new THREE.Color(),
    }),
    [],
  );
  const passenger = useMemo<Passenger>(() => ({ on: false, path: [], wp: 0, x: 0, z: 0, heading: 0, look: 0, walked: 0 }), []);
  const walker = useMemo(() => ({ x: 0, z: 0 }), []);

  // everyone's own colours, set once
  useEffect(() => {
    const b = bodies.current;
    const h = heads.current;
    if (!b || !h) return;
    const c = new THREE.Color();
    for (let i = 0; i < slots; i++) {
      const look = i < people.length ? people[i].look : 7;
      b.setColorAt(i, c.set(BODY_COLOURS[look % BODY_COLOURS.length]));
      h.setColorAt(i, c.set(SKIN[Math.floor(look / 10) % SKIN.length]));
    }
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
    if (h.instanceColor) h.instanceColor.needsUpdate = true;
  }, [people, slots]);

  useEffect(
    () => () => {
      const i = streetWalkers.indexOf(walker);
      if (i >= 0) streetWalkers.splice(i, 1);
    },
    [walker],
  );

  const green = (id: Crossing['id']) => run.green[id];
  const place = (i: number, x: number, z: number, heading: number, bob: number, show: boolean) => {
    const b = bodies.current;
    const h = heads.current;
    if (!b || !h) return;
    if (!show) {
      run.m.makeScale(0, 0, 0);
      b.setMatrixAt(i, run.m);
      h.setMatrixAt(i, run.m);
      return;
    }
    run.m.makeRotationY(heading).setPosition(x, bob, z);
    b.setMatrixAt(i, run.m);
    run.m.makeTranslation(x, 1.42 + bob, z);
    h.setMatrixAt(i, run.m);
  };

  useFrame(({ clock, camera }, delta) => {
    const dt = Math.min(delta, 0.1);
    const time = clock.elapsedTime;
    run.time = time;
    const s = useStore.getState();
    const quiet = !!s.overlay || !!s.travel;

    // the crossings' lights
    for (const c of CROSSINGS) {
      const g = crossingClear(cars, c, time, carAlong);
      if (g !== run.green[c.id]) {
        if (g && !quiet) crossingChirp({ x: crossingPole(c, 'near').x, y: 2.2, z: crossingPole(c, 'near').z });
        lamps[c.id].green.color.set(g ? GREEN_ON : GREEN_OFF);
        lamps[c.id].red.color.set(g ? RED_OFF : RED_ON);
      }
      run.green[c.id] = g;
    }

    // the bus at its stop: brakes, doors, and sometimes someone getting off
    busRun(bus, time, run.bus);
    const stage = run.bus.stage;
    if (stage !== run.was && run.was) {
      const at = { x: BUS_STOP.x + 3.5, y: 1.2, z: run.bus.s };
      if (stage === 'arriving' && !quiet) busArrives(at);
      if (stage === 'stopped') {
        run.arrivals++;
        if (!quiet) busDoors(at, true);
        if (!passenger.on && Math.random() < PASSENGER_CHANCE) {
          passenger.on = true;
          passenger.path = busWalkIn();
          passenger.wp = 0;
          passenger.x = BUS_STEP.x;
          passenger.z = BUS_STEP.z;
          passenger.walked = 0;
          passenger.look = Math.floor(Math.random() * 1000);
          run.dropped++;
          bodies.current?.setColorAt(slots - 1, run.color.set(BODY_COLOURS[passenger.look % BODY_COLOURS.length]));
          if (bodies.current?.instanceColor) bodies.current.instanceColor.needsUpdate = true;
          if (!streetWalkers.includes(walker)) streetWalkers.push(walker);
        }
      }
      if (stage === 'leaving') {
        if (!quiet) {
          busDoors(at, false);
          busLeaves(at);
        }
      }
    }
    run.was = stage;

    const player = run.player;
    player.x = camera.position.x;
    player.z = camera.position.z;
    const t = performance.now() / 1000;
    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      const at = stepPedestrian(p, rs[p.route], dt, green, player, run.at);
      const bob = p.walking ? Math.abs(Math.sin(t * 5.5 * p.speed + i)) * 0.05 : 0;
      place(i, at.x, at.z, at.heading, bob, true);
    }

    // the passenger off the bus, to the east door and in
    if (passenger.on) {
      passenger.wp = nextWaypoint(passenger.path, passenger.wp, passenger);
      const goal = passenger.path[passenger.wp];
      const dx = goal.x - passenger.x;
      const dz = goal.z - passenger.z;
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, 1.25 * dt);
      if (d > 1e-3) {
        passenger.x += (dx / d) * step;
        passenger.z += (dz / d) * step;
        passenger.heading = Math.atan2(-dx, -dz);
      }
      passenger.walked += dt;
      walker.x = passenger.x;
      walker.z = passenger.z;
      const done = (passenger.wp === passenger.path.length - 1 && d < 0.1) || passenger.walked > 60;
      if (done) {
        passenger.on = false;
        const k = streetWalkers.indexOf(walker);
        if (k >= 0) streetWalkers.splice(k, 1);
      }
      place(slots - 1, passenger.x, passenger.z, passenger.heading, Math.abs(Math.sin(t * 7)) * 0.05, passenger.on);
    } else place(slots - 1, 0, 0, 0, 0, false);

    if (bodies.current) bodies.current.instanceMatrix.needsUpdate = true;
    if (heads.current) heads.current.instanceMatrix.needsUpdate = true;
  });

  useStreetOp('bus', (arg) => callBus(bus, run.time, Number(arg) || 5));
  useStreetReport('bus', () => ({ stage: run.bus.stage, z: Math.round(run.bus.s * 10) / 10, next: Math.round(run.bus.next), every: Math.round(busCycle(bus).cycle), arrivals: run.arrivals, dropped: run.dropped, passenger: passenger.on ? { x: Math.round(passenger.x * 10) / 10, z: Math.round(passenger.z * 10) / 10 } : null }));
  useStreetReport('pedestrians', () => ({ cap, count: people.length, walking: people.filter((p) => p.walking).length, waiting: people.filter((p) => !p.walking).length, crossing: people.filter((p) => p.crossing).length, tier }));
  useStreetReport('crossings', () => ({ ...run.green }));

  return (
    <group>
      <instancedMesh key={`b${slots}`} ref={bodies} args={[geo.body, mats.body, slots]} frustumCulled={false} castShadow />
      <instancedMesh key={`h${slots}`} ref={heads} args={[geo.head, mats.head, slots]} frustumCulled={false} />
      {CROSSINGS.flatMap((c) =>
        (['near', 'far'] as const).map((end) => {
          const p = crossingPole(c, end);
          const face = end === 'near' ? Math.PI / 2 : -Math.PI / 2; // each light faces across the road, at the far kerb
          return (
            <group key={`${c.id}${end}`} position={[p.x, 0, p.z]} rotation={[0, face, 0]}>
              <mesh position={[0, 1.2, 0]} material={mats.pole}>
                <cylinderGeometry args={[0.05, 0.06, 2.4, 8]} />
              </mesh>
              <mesh position={[0, 2.35, 0]} material={mats.pole}>
                <boxGeometry args={[0.26, 0.5, 0.2]} />
              </mesh>
              <mesh position={[0, 2.47, -0.105]} rotation={[0, Math.PI, 0]} material={lamps[c.id].red}>
                <circleGeometry args={[0.08, 12]} />
              </mesh>
              <mesh position={[0, 2.23, -0.105]} rotation={[0, Math.PI, 0]} material={lamps[c.id].green}>
                <circleGeometry args={[0.08, 12]} />
              </mesh>
            </group>
          );
        }),
      )}
    </group>
  );
}
