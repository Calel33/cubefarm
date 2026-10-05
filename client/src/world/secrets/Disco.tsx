// Disco mode (#266), its own lazy chunk, mounted only while it's on: a mirror ball comes down from the ceiling and
// spins, coloured beams sweep the room and spots on the floor pulse to the jukebox's beat (120 bpm when it's off).
// No lights are added (a new light recompiles every material): the beams and spots are glowing see-through meshes.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { musicTime, nowPlaying } from '../../ui/music';
import { reduceMotion } from '../../ui/a11y';
import { beatAt, beatPulse } from '../jukeboxSongs';
import { WALL_H } from '../layout';
import { DISCO_MS } from './eggs';

const COLORS = ['#ff006e', '#3a86ff', '#ffbe0b', '#8338ec', '#06d6a0', '#fb5607'];

/** Where the ball hangs on each kind of floor: over the middle of the room (the lobby's rug, the roof's decking). */
const SPOT = { office: { x: 0, z: 1, top: WALL_H }, lobby: { x: 3, z: 3, top: WALL_H }, roof: { x: 8, z: 1.5, top: 4.2 } } as const;

function beatNow(): number {
  const t = nowPlaying();
  const sec = musicTime();
  return t && sec !== null ? beatAt(t, sec) : performance.now() / 500;
}

export default function Disco({ kind }: { kind: 'office' | 'lobby' | 'roof' }) {
  const at = SPOT[kind];
  const ball = useRef<THREE.Group>(null);
  const beams = useRef<THREE.Group>(null);
  const spots = useRef<(THREE.Mesh | null)[]>([]);
  const started = useRef(performance.now());
  const facets = useMemo(() => new THREE.IcosahedronGeometry(0.32, 1), []);
  // a beam's tip at the ball, opening downwards
  const beam = useMemo(() => new THREE.ConeGeometry(0.7, 6, 12, 1, true).translate(0, -3, 0), []);
  const mats = useMemo(
    () => COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })),
    [],
  );
  const spotMats = useMemo(
    () => COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })),
    [],
  );
  useEffect(() => () => [facets, beam, ...mats, ...spotMats].forEach((x) => x.dispose()), [facets, beam, mats, spotMats]);
  useFrame((_, dt) => {
    const now = performance.now();
    const life = (now - started.current) / 1000;
    const left = (DISCO_MS - (now - started.current)) / 1000;
    // down over two seconds, back up over the last two
    const drop = Math.min(1, life / 2, Math.max(0, left / 2));
    const still = reduceMotion();
    const pulse = beatPulse(beatNow());
    if (ball.current) {
      ball.current.position.y = at.top - 0.2 - drop * 0.9;
      if (!still) ball.current.rotation.y += dt * 1.2;
    }
    if (beams.current) {
      beams.current.position.y = at.top - 0.2 - drop * 0.9;
      if (!still) beams.current.rotation.y -= dt * 0.6;
      beams.current.visible = drop > 0.5;
    }
    for (let i = 0; i < spots.current.length; i++) {
      const s = spots.current[i];
      if (!s) continue;
      const a = (i / spots.current.length) * Math.PI * 2 + (still ? 0 : life * 0.5);
      const r = 2.2 + (i % 2) * 1.6;
      s.position.x = Math.cos(a) * r;
      s.position.z = Math.sin(a) * r;
      const k = 0.7 + pulse * 0.6;
      s.scale.set(k, k, k);
      (s.material as THREE.MeshBasicMaterial).opacity = drop * (0.25 + pulse * 0.45);
    }
  });
  return (
    <group position={[at.x, 0, at.z]}>
      <mesh position={[0, at.top - 0.1, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.2 + 0.9, 4]} />
        <meshBasicMaterial color="#adb5bd" />
      </mesh>
      <group ref={ball} position={[0, at.top, 0]}>
        <mesh geometry={facets}>
          <meshStandardMaterial color="#e9ecef" metalness={1} roughness={0.15} flatShading emissive="#6c757d" emissiveIntensity={0.6} />
        </mesh>
      </group>
      <group ref={beams} position={[0, at.top, 0]}>
        {COLORS.map((c, i) => (
          <mesh key={c} geometry={beam} material={mats[i]} rotation={[0.55, (i / COLORS.length) * Math.PI * 2, 0, 'YXZ']} />
        ))}
      </group>
      {COLORS.map((c, i) => (
        <mesh key={c} ref={(m) => void (spots.current[i] = m)} material={spotMats[i]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.6, 20]} />
        </mesh>
      ))}
    </group>
  );
}
