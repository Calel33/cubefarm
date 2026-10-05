import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { Outlines } from '../Outlines';
import { toon } from '../materials';
import { sipPose } from '../toys/sipping';
import { FIRST_PERSON } from '../viewTags';
import { MENU, type Dish } from './streetRules';

// Lunch from the food truck in your hands, held like the roof's sausage (roof/HeldSausage.tsx): at the lower right of the
// view, raised to your mouth for each bite (sipping.ts times them), a little smaller after every one.

const VIEW = { x: 0.17, y: -0.15, z: -0.42, tilt: -0.3, turn: 0.4 };
const MOUTH = { x: 0.03, y: -0.06, z: -0.24, tilt: -0.05, turn: 0.2 };
const INK = '#1f1d2b';

function Taco() {
  return (
    <group>
      {/* the folded shell, side on: half a short tube pointing at you, its fold underneath */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.075, 0.075, 0.06, 18, 1, true, Math.PI * 1.5, Math.PI]} />
        <meshToonMaterial color="#f2c14e" side={THREE.DoubleSide} />
        <Outlines thickness={0.004} color={INK} />
      </mesh>
      {[
        ['#80ed99', -0.045, 0.012],
        ['#c1121f', -0.012, 0.004],
        ['#ffd166', 0.02, 0.01],
        ['#80ed99', 0.05, 0.006],
      ].map(([c, x, y], i) => (
        <mesh key={i} position={[x as number, y as number, 0]} material={toon(c as string)}>
          <sphereGeometry args={[0.022, 8, 6]} />
        </mesh>
      ))}
    </group>
  );
}

function Bao() {
  return (
    <group>
      <mesh scale={[1, 0.55, 0.85]} material={toon('#fdf6ec')}>
        <sphereGeometry args={[0.075, 14, 10]} />
        <Outlines thickness={0.004} color={INK} />
      </mesh>
      <mesh position={[0, 0.002, 0.03]} material={toon('#9c4a2a')}>
        <boxGeometry args={[0.11, 0.022, 0.05]} />
      </mesh>
      <mesh position={[0.02, 0.016, 0.05]} material={toon('#52b788')}>
        <boxGeometry args={[0.05, 0.008, 0.02]} />
      </mesh>
    </group>
  );
}

function Gelato() {
  return (
    <group>
      <mesh position={[0, -0.06, 0]} rotation={[Math.PI, 0, 0]} material={toon('#d4a373')}>
        <coneGeometry args={[0.045, 0.14, 12]} />
        <Outlines thickness={0.004} color={INK} />
      </mesh>
      <mesh position={[0, 0.03, 0]} material={toon('#b5e48c')}>
        <sphereGeometry args={[0.05, 12, 9]} />
        <Outlines thickness={0.004} color={INK} />
      </mesh>
      <mesh position={[0.008, 0.085, 0]} material={toon('#fefae0')}>
        <sphereGeometry args={[0.042, 12, 9]} />
        <Outlines thickness={0.004} color={INK} />
      </mesh>
    </group>
  );
}

const LOOKS: Record<Dish, () => React.JSX.Element> = { taco: Taco, bao: Bao, gelato: Gelato };

export function HeldFood() {
  const held = useStore((s) => (s.held?.kind === 'food' ? s.held : null));
  const root = useRef<THREE.Group>(null);
  const hand = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    const r = root.current;
    const h = hand.current;
    if (!r || !h) return;
    r.position.copy(camera.position);
    r.quaternion.copy(camera.quaternion);
    const k = sipPose.lift;
    const t = performance.now() / 1000;
    h.position.set(VIEW.x + (MOUTH.x - VIEW.x) * k, VIEW.y + (MOUTH.y - VIEW.y) * k + Math.sin(t * 1.6) * 0.003 * (1 - k), VIEW.z + (MOUTH.z - VIEW.z) * k);
    h.rotation.set(VIEW.tilt + (MOUTH.tilt - VIEW.tilt) * k, VIEW.turn + (MOUTH.turn - VIEW.turn) * k, 0, 'YXZ');
  });
  if (!held) return null;
  const Look = LOOKS[held.dish];
  // smaller after every bite
  const left = 0.45 + 0.55 * (held.bites / MENU[held.dish].bites);
  return (
    <group ref={root} userData={FIRST_PERSON}>
      <group ref={hand}>
        <group scale={0.85 * left}>
          <Look />
        </group>
      </group>
    </group>
  );
}
