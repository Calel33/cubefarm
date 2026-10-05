// The rubber ducks still hidden where you are (#266): E or a click picks one up. Found ones leave the world for the
// shelf in the secret room. Built from Toon parts, so a floor's ducks are a few instances in its batches.

import { memo } from 'react';
import * as THREE from 'three';
import { useInteractable } from '../interact';
import { Ball, Box } from '../Toon';
import { DUCK_RANGE, ducksIn, type Duck, type DuckPlace } from './ducks';
import { useSecrets } from './secretsState';

/** A little rubber duck facing +z, sitting at its origin, about 0.2 m tall. */
export function DuckModel({ color }: { color: string }) {
  return (
    <>
      <Ball r={0.075} scale={[1, 0.75, 1.25]} position={[0, 0.06, 0]} color={color} outline />
      <Ball r={0.05} position={[0, 0.15, 0.045]} color={color} outline />
      <Box size={[0.05, 0.018, 0.045]} position={[0, 0.145, 0.105]} color="#ff7b00" shadow={false} />
      <Ball r={0.012} position={[0.03, 0.17, 0.08]} color="#1f1d2b" shadow={false} />
      <Ball r={0.012} position={[-0.03, 0.17, 0.08]} color="#1f1d2b" shadow={false} />
      <Ball r={0.03} position={[0, 0.1, -0.09]} color={color} />
    </>
  );
}

const HiddenDuck = memo(function HiddenDuck({ duck }: { duck: Duck }) {
  const ref = useInteractable<THREE.Group>({ id: `duck:${duck.id}`, label: '🦆 A rubber duck! Pick it up', action: { kind: 'secret', op: 'duck', id: duck.id } }, DUCK_RANGE);
  return (
    <group ref={ref} position={[duck.x, duck.y, duck.z]} rotation={[0, duck.rotY, 0]}>
      <DuckModel color={duck.color} />
      {/* a duck is small: aim anywhere near it */}
      <mesh position={[0, 0.11, 0]} visible={false}>
        <boxGeometry args={[0.34, 0.3, 0.38]} />
      </mesh>
    </group>
  );
});

export function Ducks({ place }: { place: DuckPlace }) {
  const found = useSecrets((s) => s.found);
  return (
    <group>
      {ducksIn(place)
        .filter((d) => !found.includes(d.id))
        .map((d) => (
          <HiddenDuck key={d.id} duck={d} />
        ))}
    </group>
  );
}
