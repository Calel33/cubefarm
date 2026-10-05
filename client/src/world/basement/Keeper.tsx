import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { drawSign } from '../draw';
import { useCanvasTexture } from '../interact';
import { KEEPER, RACK_ROWS, TRAY } from '../layout';
import { markBloom } from '../gfx/bloomMarks';
import { Box } from '../Toon';
import { room, roomTime } from './roomClock';

// The terminal keeper (server/ptyHost.ts), the process that holds every agent's CLI: a big unit in the middle of the
// floor with a glowing core that pulses with how many CLIs it holds, its count on screens front and back, and the
// bundle of cables up into the spine tray that thickens with every live CLI (each rack's own drop is Racks.tsx's).

const { x, z, w, d, h } = KEEPER;

export function Keeper({ clis }: { clis: number }) {
  const screen = useCanvasTexture(
    512,
    192,
    (ctx) =>
      drawSign(
        ctx,
        512,
        192,
        [
          { text: 'TERMINAL KEEPER', size: 40, color: '#8dffb8' },
          { text: 'ptyHost', size: 28, color: '#9ad7ff' },
          { text: `${clis} live CLI${clis === 1 ? '' : 's'}`, size: 40, color: clis ? '#ffffff' : '#7a869c' },
        ],
        '#0b1a14',
      ),
    [clis],
  );
  const core = useMemo(() => markBloom(new THREE.MeshBasicMaterial({ color: '#4ea8ff', toneMapped: false })), []);
  useEffect(() => () => core.dispose(), [core]);
  const bundle = useRef<THREE.Mesh>(null);
  const live = useRef(clis);
  live.current = clis;
  const base = useMemo(() => new THREE.Color('#4ea8ff'), []);

  useFrame(() => {
    const t = roomTime();
    const n = live.current;
    const pulse = n ? 0.65 + 0.35 * Math.sin(t * (1.5 + Math.min(4, n * 0.08))) : 0.15;
    core.color.copy(base).multiplyScalar(pulse * (0.5 + 0.5 * room.level));
    if (bundle.current) {
      const k = 0.04 + 0.012 * Math.sqrt(n);
      bundle.current.scale.set(k, k, 1);
      bundle.current.visible = n > 0;
    }
  });

  const z0 = RACK_ROWS.zs[RACK_ROWS.zs.length - 1];
  return (
    <group>
      <Box size={[w, h - 0.1, d]} position={[x, (h - 0.1) / 2, z]} color="#20283a" outline />
      <Box size={[w + 0.1, 0.1, d + 0.1]} position={[x, h - 0.05, z]} color="#4ea8ff" outline />
      <Box size={[w + 0.06, 0.12, d + 0.06]} position={[x, 0.06, z]} color="#141a26" />
      {/* the core: a glowing column through a window in each side */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[x + (s * w) / 2 + s * 0.006, 0.95, z]} rotation={[0, (s * Math.PI) / 2, 0]} material={core}>
          <planeGeometry args={[0.5, 1.2]} />
        </mesh>
      ))}
      {[1, -1].map((s) => (
        <mesh key={s} position={[x, 1.55, z + (s * d) / 2 + s * 0.006]} rotation={[0, s < 0 ? Math.PI : 0, 0]}>
          <planeGeometry args={[2.1, 0.79]} />
          <meshBasicMaterial map={screen} toneMapped={false} />
        </mesh>
      ))}
      {/* ports along the front, under the screen */}
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[x - 0.98 + i * 0.28, 0.85, z + d / 2 + 0.006]} material={core}>
          <planeGeometry args={[0.14, 0.08]} />
        </mesh>
      ))}
      {/* the riser up to the spine tray, and the bundle along it */}
      <Box size={[0.32, TRAY.y - h + 0.04, 0.32]} position={[x, (h + TRAY.y) / 2, z]} color="#2b3244" />
      <mesh ref={bundle} position={[x, TRAY.y + 0.06, (z + z0) / 2]}>
        <boxGeometry args={[1, 1, z - z0]} />
        <meshToonMaterial color="#1c2230" />
      </mesh>
    </group>
  );
}
