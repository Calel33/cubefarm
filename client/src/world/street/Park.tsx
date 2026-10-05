import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { coo, flutter, plink } from '../../ui/streetSfx';
import { leavePerch, perch, setPerch } from '../perch';
import { merged } from '../shapes';
import { Cyl } from '../Toon';
import { FOUNTAIN, PIGEON_HOME, TREE_SEAT } from './plaza';
import { spawnPigeons, stepPigeons, type Pigeon } from './streetRules';
import { useStreetOp, useStreetReport } from './streetOps';

// The pocket park's living parts (PlazaProps.tsx draws its lawn and tree): the fountain, its jet and the drops that
// arc off its top bowl into the basin, plinking now and then; the pigeons pecking between the tree and the fountain,
// who scatter in a flurry when you walk at them and drift back once you've gone; and sitting under the tree (a perch:
// your back to the trunk, looking across to the fountain). Two instanced meshes, updated in place.

const DROPS = 36;
const TOP = FOUNTAIN.jet + 0.35; // where the drops leave the top bowl
const WATER_Y = FOUNTAIN.rim - 0.06;
const STONE = '#d9d2c4';
const WATER = '#8fcbe6';

function pigeonGeometry() {
  const body = new THREE.SphereGeometry(0.11, 10, 8).scale(0.8, 0.75, 1.25).translate(0, 0.12, 0);
  const head = new THREE.SphereGeometry(0.06, 8, 6).translate(0, 0.22, -0.11);
  const tail = new THREE.BoxGeometry(0.08, 0.02, 0.12).translate(0, 0.12, 0.16);
  const wings = new THREE.BoxGeometry(0.34, 0.02, 0.14).translate(0, 0.15, 0.01);
  return merged([body, head, tail, wings]);
}

let seed = 11;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

export function Park() {
  const geo = useMemo(() => ({ drop: new THREE.SphereGeometry(0.045, 6, 5), pigeon: pigeonGeometry(), jet: new THREE.CylinderGeometry(0.05, 0.09, 0.5, 8, 1, true) }), []);
  const mats = useMemo(
    () => ({
      drop: new THREE.MeshBasicMaterial({ color: '#d6f1ff', transparent: true, opacity: 0.85, toneMapped: false }),
      jet: new THREE.MeshBasicMaterial({ color: '#d6f1ff', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
      pigeon: new THREE.MeshToonMaterial({ color: '#ffffff' }),
    }),
    [],
  );
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    },
    [geo, mats],
  );
  const drops = useRef<THREE.InstancedMesh>(null);
  const birds = useRef<THREE.InstancedMesh>(null);
  const jet = useRef<THREE.Mesh>(null);
  const flock = useMemo<Pigeon[]>(() => spawnPigeons(rand), []);
  const run = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), v: new THREE.Vector3(), s: new THREE.Vector3(), last: { x: 0, z: 0 }, speed: 0, scatters: 0, wrap: new Float32Array(DROPS), coo: 4 }), []);
  const player = useMemo(() => ({ x: 0, z: 0, speed: 0 }), []);

  // each pigeon its own grey
  useEffect(() => {
    const m = birds.current;
    if (!m) return;
    const c = new THREE.Color();
    flock.forEach((_, i) => m.setColorAt(i, c.setHSL(0.62, 0.06, 0.48 + ((i * 37) % 10) / 50)));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [flock]);

  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = performance.now() / 1000;
    const quiet = !!useStore.getState().overlay || !!useStore.getState().travel;

    // the drops: each on its own arc from the top bowl's lip down into the basin
    const d = drops.current;
    if (d) {
      for (let i = 0; i < DROPS; i++) {
        const k = (t * 0.8 + i / DROPS + (i % 3) * 0.13) % 1;
        if (k < run.wrap[i] && !quiet && i % 4 === 0) plink({ x: FOUNTAIN.x, y: WATER_Y, z: FOUNTAIN.z });
        run.wrap[i] = k;
        const a = (i / DROPS) * Math.PI * 2;
        const r = 0.55 + k * 0.85;
        run.m.makeTranslation(FOUNTAIN.x + Math.cos(a) * r, Math.max(WATER_Y, TOP + 0.9 * k - 2.2 * k * k), FOUNTAIN.z + Math.sin(a) * r);
        d.setMatrixAt(i, run.m);
      }
      d.instanceMatrix.needsUpdate = true;
    }
    if (jet.current) jet.current.scale.y = 1 + Math.sin(t * 7) * 0.08;

    // the pigeons: how fast you're walking, from where you were a frame ago
    const moved = Math.hypot(camera.position.x - run.last.x, camera.position.z - run.last.z);
    run.speed += ((dt > 0 ? moved / dt : 0) - run.speed) * Math.min(1, dt * 8);
    run.last.x = camera.position.x;
    run.last.z = camera.position.z;
    player.x = camera.position.x;
    player.z = camera.position.z;
    player.speed = moved > 2 ? 0 : run.speed; // a teleport isn't a charge at them
    const n = stepPigeons(flock, dt, player, rand);
    if (n > 0) {
      run.scatters++;
      if (!quiet) flutter({ x: PIGEON_HOME.x, y: 0.5, z: PIGEON_HOME.z }, n);
    }
    run.coo -= dt;
    if (run.coo <= 0) {
      run.coo = 6 + Math.random() * 10;
      const b = flock[Math.floor(Math.random() * flock.length)];
      if (b.state === 'peck' && !quiet) coo({ x: b.x, y: 0.2, z: b.z });
    }
    const m = birds.current;
    if (m) {
      for (let i = 0; i < flock.length; i++) {
        const b = flock[i];
        const flying = b.state === 'fly' || b.state === 'back';
        // pecking: the head bobs down now and then; flying: the wings flap
        const bob = flying ? 0 : Math.max(0, Math.sin(t * 3 + i * 1.7)) * 0.35;
        run.e.set(bob, b.heading, flying ? Math.sin(t * 30 + i) * 0.25 : 0, 'YXZ');
        run.q.setFromEuler(run.e);
        const wing = flying ? 1 + Math.abs(Math.sin(t * 28 + i)) * 0.8 : 0.55;
        run.s.set(wing, 1, 1);
        run.v.set(b.x, b.y, b.z);
        run.m.compose(run.v, run.q, run.s);
        m.setMatrixAt(i, run.m);
      }
      m.instanceMatrix.needsUpdate = true;
    }
  });

  useStreetOp('sit', () => {
    if (perch()?.id === 'street-tree') return void leavePerch();
    setPerch({
      id: 'street-tree',
      x: TREE_SEAT.x,
      y: TREE_SEAT.eye,
      z: TREE_SEAT.z,
      tilt: 0.04,
      look: 1,
      minPitch: -0.9,
      maxPitch: 1.2,
      exit: TREE_SEAT.exit,
      yaw: -Math.PI / 2, // east, across the park to the fountain
      pitch: 0,
      onLeave: () => undefined,
    });
  });
  useStreetReport('pigeons', () => ({
    count: flock.length,
    pecking: flock.filter((b) => b.state === 'peck').length,
    flying: flock.filter((b) => b.state === 'fly' || b.state === 'back').length,
    away: flock.filter((b) => b.state === 'away').length,
    scatters: run.scatters,
  }));
  useStreetReport('fountain', () => ({ x: FOUNTAIN.x, z: FOUNTAIN.z, drops: DROPS }));

  return (
    <group>
      {/* the basin, its water, the column and the bowl on top */}
      <Cyl r={FOUNTAIN.r} h={FOUNTAIN.rim} position={[FOUNTAIN.x, FOUNTAIN.rim / 2, FOUNTAIN.z]} color={STONE} outline seg={28} />
      <Cyl r={FOUNTAIN.r - 0.18} h={0.02} position={[FOUNTAIN.x, WATER_Y, FOUNTAIN.z]} color={WATER} shadow={false} seg={28} />
      <Cyl r={0.2} rTop={0.16} h={FOUNTAIN.jet} position={[FOUNTAIN.x, FOUNTAIN.jet / 2, FOUNTAIN.z]} color={STONE} />
      <Cyl r={0.3} rTop={0.6} h={0.25} position={[FOUNTAIN.x, FOUNTAIN.jet + 0.12, FOUNTAIN.z]} color={STONE} outline />
      <Cyl r={0.52} h={0.02} position={[FOUNTAIN.x, FOUNTAIN.jet + 0.24, FOUNTAIN.z]} color={WATER} shadow={false} />
      <mesh ref={jet} geometry={geo.jet} material={mats.jet} position={[FOUNTAIN.x, FOUNTAIN.jet + 0.5, FOUNTAIN.z]} />
      <instancedMesh ref={drops} args={[geo.drop, mats.drop, DROPS]} frustumCulled={false} />
      <instancedMesh ref={birds} args={[geo.pigeon, mats.pigeon, flock.length]} frustumCulled={false} castShadow />
    </group>
  );
}
