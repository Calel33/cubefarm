import { memo } from 'react';
import * as THREE from 'three';
import type { FloorStyle } from '../../../shared/floorLook';
import { look } from './batch';
import { Part } from './Batched';
import { STYLE_LOOKS } from './floorStyles';
import { useCanvasTexture } from './interact';
import { HALF_D, HALF_W, SIDE_OPENINGS, STYLE_FEATURE, WALL_H, WINDOW, type DeskPlace } from './layout';
import { Plant } from './Props';
import { CEILING_LIGHTS } from './Shell';
import { Ball, Box, Cyl } from './Toon';

// A style's props (#265): what dresses an office floor besides its walls, floor and ceiling (Shell.tsx). Everything
// stands where nothing else does in any layout: up under the ceiling, flat on the walls, and at the north wall's
// feature spot (layout.ts's STYLE_FEATURE, solid for every style but classic). Built from Toon.tsx's batched parts, so a
// style costs a few draw calls; glowing bits share glow looks. The tint is one hemisphere light.

type P = [number, number, number];

const FX = STYLE_FEATURE.x;
const WALL_Z = -HALF_D;
const CEIL = WALL_H;

// Glowing parts: one look per shape, drawn in the floor's glow batches.
const BULB = look(new THREE.SphereGeometry(0.075, 14, 10), { shading: 'glow' });
const NEON = look(new THREE.BoxGeometry(1, 0.05, 0.05), { shading: 'glow' });
const SCREEN = look(new THREE.PlaneGeometry(0.5, 0.42), { shading: 'glow' });
const FLAME = look(new THREE.ConeGeometry(0.16, 0.42, 10), { shading: 'glow' });
const WATER = look(new THREE.BoxGeometry(1, 1, 1), { shading: 'glow' });

/** A thin cord from the ceiling down to y. */
const Cord = ({ x, z, y }: { x: number; z: number; y: number }) => <Cyl r={0.012} h={CEIL - y} position={[x, (CEIL + y) / 2, z]} color="#2b2522" shadow={false} />;

/** Where the office floor's windows are, along each side wall: their middles' z. */
const WINDOWS = (['west', 'east'] as const).flatMap((side) => SIDE_OPENINGS.office[side].windows.map((z) => ({ x: (side === 'west' ? -1 : 1) * HALF_W, z })));

// ---------- brick loft ----------

function Loft() {
  return (
    <group>
      {/* timber beams across the room under the ceiling */}
      {[-9.5, -5.25, -1, 3.25, 7.5].map((z) => (
        <Box key={z} size={[HALF_W * 2, 0.3, 0.32]} position={[0, CEIL - 0.15, z]} color="#6b4a2f" outline shadow={false} />
      ))}
      {/* Edison bulbs on long cords where the ceiling panels would be */}
      {CEILING_LIGHTS.map(([x, , z]) => (
        <group key={`${x},${z}`}>
          <Cord x={x} z={z} y={2.75} />
          <Cyl r={0.04} h={0.08} position={[x, 2.72, z]} color="#3a3330" shadow={false} />
          <Part look={BULB} color="#ffb347" position={[x, 2.62, z]} scale={[1, 1.3, 1]} />
        </group>
      ))}
      {/* the feature: black steel shelving with crates, plants and a record player */}
      <group position={[FX, 0, WALL_Z + 0.3]}>
        {[-1.85, 1.85].map((x) => (
          <Box key={x} size={[0.06, 2.1, 0.5]} position={[x, 1.05, 0]} color="#22201f" outline />
        ))}
        {[0.35, 1.05, 1.75].map((y) => (
          <Box key={y} size={[3.8, 0.06, 0.5]} position={[0, y, 0]} color="#8a5a36" outline />
        ))}
        <Box size={[0.6, 0.38, 0.4]} position={[-1.3, 0.57, 0]} color="#b07d4f" outline />
        <Box size={[0.6, 0.38, 0.4]} position={[-0.6, 0.57, 0]} color="#a26f43" outline />
        <Box size={[0.55, 0.12, 0.4]} position={[0.9, 1.14, 0]} color="#2d2a28" outline />
        <Cyl r={0.17} h={0.015} position={[0.88, 1.21, 0]} color="#111111" shadow={false} />
        <Plant position={[1.4, 1.78, 0]} scale={0.45} pot="#3a3330" />
        <Plant position={[-1.3, 1.08, 0]} scale={0.4} pot="#6b4a2f" />
        {['#c44536', '#e0a458', '#4f6d7a', '#2d2a28', '#9c6644'].map((c, i) => (
          <Box key={c} size={[0.1, 0.36, 0.3]} position={[-0.6 + i * 0.13, 1.96, 0]} color={c} shadow={false} />
        ))}
      </group>
    </group>
  );
}

// ---------- plants (Scandinavian, greenhouse) ----------

/** A pot hanging from the ceiling with leaves trailing over its rim. */
function HangingPlant({ x, z, y = 2.65, pot = '#ffffff', leaf = '#52b788', vine = 0 }: { x: number; z: number; y?: number; pot?: string; leaf?: string; vine?: number }) {
  return (
    <group>
      <Cord x={x} z={z} y={y + 0.2} />
      <Cyl r={0.17} rTop={0.2} h={0.24} position={[x, y, z]} color={pot} outline shadow={false} />
      <Ball r={0.2} position={[x, y + 0.18, z]} color={leaf} outline shadow={false} />
      <Ball r={0.13} position={[x + 0.16, y + 0.05, z + 0.05]} color="#40916c" shadow={false} />
      <Ball r={0.12} position={[x - 0.15, y + 0.02, z - 0.06]} color="#74c69d" shadow={false} />
      {Array.from({ length: vine }, (_, i) => (
        <Ball key={i} r={0.07} position={[x + (i % 2 ? 0.12 : -0.1), y - 0.18 - i * 0.14, z]} color={i % 2 ? '#40916c' : '#52b788'} shadow={false} />
      ))}
    </group>
  );
}

/** Little pots along each window's sill. */
function SillPots() {
  return (
    <>
      {WINDOWS.flatMap(({ x, z }) =>
        [-1.2, 0.3, 1.4].map((dz, i) => (
          <group key={`${x},${z},${i}`} position={[x - Math.sign(x) * 0.06, WINDOW.y - WINDOW.h / 2 + 0.06, z + dz]}>
            <Cyl r={0.07} rTop={0.08} h={0.12} position={[0, 0.06, 0]} color={['#ffffff', '#e9dfd1', '#c9ada7'][i]} outline shadow={false} />
            <Ball r={0.1} position={[0, 0.17, 0]} color={['#52b788', '#74c69d', '#40916c'][i]} shadow={false} />
          </group>
        )),
      )}
    </>
  );
}

function Scandi() {
  return (
    <group>
      {WINDOWS.map(({ x, z }) => (
        <HangingPlant key={`${x},${z}`} x={x - Math.sign(x) * 0.7} z={z + 1.6} vine={2} />
      ))}
      <SillPots />
      {/* the feature: a low white sideboard full of plants, a tall one at either end */}
      <group position={[FX, 0, WALL_Z + 0.3]}>
        <Box size={[2.9, 0.7, 0.45]} position={[0, 0.35, 0]} color="#f4f1ea" outline />
        {[-0.95, 0, 0.95].map((x) => (
          <Box key={x} size={[0.9, 0.02, 0.01]} position={[x, 0.45, 0.23]} color="#c9b79c" shadow={false} />
        ))}
        {[-1.1, -0.45, 0.25, 0.95].map((x, i) => (
          <group key={x} position={[x, 0.7, 0]}>
            <Cyl r={0.1} rTop={0.12} h={0.18} position={[0, 0.09, 0]} color={['#ffffff', '#d8cbb4', '#ffffff', '#b8c4bb'][i]} outline shadow={false} />
            <Ball r={0.16 + (i % 2) * 0.06} position={[0, 0.3 + (i % 2) * 0.06, 0]} color={['#52b788', '#74c69d', '#40916c', '#95d5b2'][i]} outline shadow={false} />
          </group>
        ))}
        <Plant position={[-1.75, 0, 0]} scale={1.15} pot="#ffffff" />
        <Plant position={[1.75, 0, 0]} scale={1.3} pot="#d8cbb4" />
      </group>
    </group>
  );
}

// ---------- greenhouse ----------

function Greenhouse() {
  // the glass roof's frame: green glazing bars under the ceiling
  const bars: { size: P; at: P }[] = [
    ...[-9, -6, -3, 0, 3, 6, 9].map((z): { size: P; at: P } => ({ size: [HALF_W * 2, 0.07, 0.09], at: [0, CEIL - 0.04, z] })),
    ...[-12, -8, -4, 0, 4, 8, 12].map((x): { size: P; at: P } => ({ size: [0.09, 0.07, HALF_D * 2], at: [x, CEIL - 0.04, 0] })),
  ];
  // vines along the top of the side and south walls, with a few strands hanging down
  const vines: P[] = [];
  for (let z = -11.4; z <= 11.4; z += 0.75) for (const x of [-HALF_W + 0.1, HALF_W - 0.1]) vines.push([x, CEIL - 0.25 - (Math.round(z * 4) % 3 === 0 ? 0.35 : 0), z]);
  for (let x = -15.4; x <= 15.4; x += 0.75) if (Math.abs(x) > 1.8) vines.push([x, CEIL - 0.25 - (Math.round(x * 4) % 3 === 0 ? 0.3 : 0), HALF_D - 0.1]);
  return (
    <group>
      {bars.map((b, i) => (
        <Box key={i} size={b.size} position={b.at} color="#4f7a4a" shadow={false} />
      ))}
      {vines.map((p, i) => (
        <Ball key={i} r={0.13} position={p} color={i % 3 === 0 ? '#40916c' : i % 3 === 1 ? '#52b788' : '#74c69d'} shadow={false} />
      ))}
      {[...WINDOWS.map(({ x, z }) => ({ x: x - Math.sign(x) * 0.8, z: z + 1.6 })), { x: -6, z: 9.8 }, { x: 6, z: 9.8 }, { x: -3, z: -9.6 }, { x: 3, z: -9.6 }].map(({ x, z }) => (
        <HangingPlant key={`${x},${z}`} x={x} z={z} y={2.75} pot="#c98b62" vine={4} />
      ))}
      <SillPots />
      {/* the feature: a little wall fountain, its spout over a stone trough, ferns either side */}
      <group position={[FX, 0, WALL_Z + 0.3]}>
        <Box size={[2.3, 0.5, 0.55]} position={[0, 0.25, 0]} color="#b8b2a7" outline />
        <Part look={WATER} color="#7fd1e8" position={[0, 0.48, 0]} scale={[2.1, 0.02, 0.42]} />
        <Box size={[0.9, 1.3, 0.08]} position={[0, 1.15, -0.25]} color="#a49e93" outline />
        <Ball r={0.13} position={[0, 1.45, -0.17]} color="#7d776d" outline />
        <Part look={WATER} color="#a8e4f2" position={[0, 0.98, -0.07]} scale={[0.06, 0.95, 0.04]} />
        <Plant position={[-1.6, 0, 0]} scale={0.95} pot="#c98b62" />
        <Plant position={[1.6, 0, 0]} scale={1.1} pot="#c98b62" />
      </group>
    </group>
  );
}

// ---------- neon night ----------

/** A synthwave poster: a striped sunset over a grid. */
function Poster({ position, rotationY, w, h }: { position: P; rotationY: number; w: number; h: number }) {
  const tex = useCanvasTexture(256, Math.round((256 * h) / w), (ctx) => {
    const W = 256;
    const H = Math.round((256 * h) / w);
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#120a2e');
    sky.addColorStop(0.6, '#7b2ff7');
    sky.addColorStop(1, '#ff3fbf');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const sun = ctx.createLinearGradient(0, H * 0.25, 0, H * 0.62);
    sun.addColorStop(0, '#ffe66d');
    sun.addColorStop(1, '#ff4f8b');
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.48, W * 0.3, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#120a2e';
    for (let i = 0; i < 5; i++) ctx.fillRect(0, H * (0.36 + i * 0.026), W, 2 + i);
    ctx.fillStyle = '#120a2e';
    ctx.fillRect(0, H * 0.62, W, H * 0.38);
    ctx.strokeStyle = '#2de2e6';
    ctx.lineWidth = 2;
    for (let i = -8; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + i * 12, H * 0.62);
      ctx.lineTo(W / 2 + i * 60, H);
      ctx.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const y = H * 0.62 + (H * 0.38 * (i * i)) / 25;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#ff3fbf';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, W - 8, H - 8);
  }, []);
  return (
    <mesh position={position} rotation={[0, rotationY, 0]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

function Neon() {
  const y = CEIL - 0.22;
  const strips: { at: P; len: number; rotY: number; color: string }[] = [
    { at: [0, y, WALL_Z + 0.06], len: HALF_W * 2 - 0.4, rotY: 0, color: '#ff3fbf' },
    { at: [-(1.4 + 14.6) / 2 - 0.2, y, HALF_D - 0.06], len: 14.4, rotY: 0, color: '#ff3fbf' },
    { at: [(1.4 + 14.6) / 2 + 0.2, y, HALF_D - 0.06], len: 14.4, rotY: 0, color: '#ff3fbf' },
    { at: [-HALF_W + 0.06, y, 0], len: HALF_D * 2 - 0.4, rotY: Math.PI / 2, color: '#2de2e6' },
    { at: [HALF_W - 0.06, y, 0], len: HALF_D * 2 - 0.4, rotY: Math.PI / 2, color: '#2de2e6' },
    { at: [0, 0.2, WALL_Z + 0.05], len: HALF_W * 2 - 0.4, rotY: 0, color: '#2de2e6' },
  ];
  return (
    <group>
      {strips.map((s, i) => (
        <Part key={i} look={NEON} color={s.color} position={s.at} rotation={[0, s.rotY, 0]} scale={[s.len, 1, 1]} />
      ))}
      <Poster position={[-HALF_W + 0.03, 2.05, -11.3]} rotationY={Math.PI / 2} w={1.0} h={1.4} />
      <Poster position={[HALF_W - 0.03, 2.2, -11.1]} rotationY={-Math.PI / 2} w={1.2} h={1.6} />
      {/* the feature: two arcade cabinets either side of the "ship it" sign */}
      {[-1.55, 1.6].map((x, i) => (
        <group key={x} position={[FX + x, 0, WALL_Z + 0.3]}>
          <Box size={[0.7, 1.75, 0.55]} position={[0, 0.875, 0]} color={i ? '#3a2fff' : '#ff3fbf'} outline />
          <Box size={[0.62, 0.12, 0.25]} position={[0, 0.98, 0.32]} color="#1b1730" outline />
          <Part look={SCREEN} color={i ? '#2de2e6' : '#ffe66d'} position={[0, 1.35, 0.281]} />
          <Ball r={0.035} position={[-0.15, 1.06, 0.38]} color="#ff4f8b" shadow={false} />
          <Ball r={0.035} position={[0.12, 1.06, 0.38]} color="#2de2e6" shadow={false} />
        </group>
      ))}
    </group>
  );
}

// ---------- library ----------

/** A wooden bookcase full of books. */
function Bookcase({ x, w }: { x: number; w: number }) {
  const colors = ['#7b2d26', '#2f4f3a', '#b08d57', '#3d405b', '#8c5a3c', '#5a3d5c', '#a44a3f'];
  const n = Math.floor((w - 0.1) / 0.11);
  return (
    <group position={[x, 0, WALL_Z + 0.22]}>
      <Box size={[w, 2.25, 0.42]} position={[0, 1.125, 0]} color="#5c3a21" outline />
      {[0.3, 0.85, 1.4, 1.95].map((y, row) => (
        <group key={y}>
          <Box size={[w - 0.08, 0.03, 0.36]} position={[0, y - 0.2, 0.04]} color="#4a2e1c" shadow={false} />
          {Array.from({ length: n }, (_, i) => (
            <Box key={i} size={[0.09, 0.3 + ((i + row) % 3) * 0.04, 0.28]} position={[-w / 2 + 0.1 + i * 0.11, y - 0.03 + ((i + row) % 3) * 0.02, 0.08]} color={colors[(i * 3 + row) % colors.length]} shadow={false} />
          ))}
        </group>
      ))}
    </group>
  );
}

/** A banker's lamp hanging over a desk: a green glass shade, its bulb lit underneath. */
function GreenLamp({ x, z }: { x: number; z: number }) {
  return (
    <group>
      <Cord x={x} z={z} y={2.35} />
      <Cyl r={0.06} rTop={0.24} h={0.18} rotation={[Math.PI, 0, 0]} position={[x, 2.28, z]} color="#1f6f43" outline shadow={false} />
      <Part look={BULB} color="#ffe2a8" position={[x, 2.2, z]} />
    </group>
  );
}

function Library({ desks }: { desks: DeskPlace[] }) {
  return (
    <group>
      {desks.map((d, i) => (
        <GreenLamp key={i} x={d.x} z={d.z} />
      ))}
      {CEILING_LIGHTS.filter(([x, , z]) => Math.abs(x) > 11 || z > 7).map(([x, , z]) => (
        <GreenLamp key={`${x},${z}`} x={x} z={z} />
      ))}
      <Bookcase x={FX - 1.55} w={1.0} />
      <Bookcase x={FX + 1.55} w={1.0} />
      {/* the fireplace: a stone surround, its fire glowing, a mantel under the "ship it" sign */}
      <group position={[FX, 0, WALL_Z + 0.22]}>
        <Box size={[1.9, 1.12, 0.44]} position={[0, 0.56, 0]} color="#8d7b68" outline />
        <Box size={[1.1, 0.75, 0.1]} position={[0, 0.42, 0.18]} color="#1d1512" />
        <Box size={[2.1, 0.08, 0.52]} position={[0, 1.16, 0.02]} color="#4a2e1c" outline />
        <Box size={[1.3, 0.06, 0.3]} position={[0, 0.03, 0.36]} color="#6b5a4a" />
        <Box size={[0.6, 0.1, 0.12]} position={[0, 0.1, 0.18]} color="#5c3a21" shadow={false} />
        {[-0.18, 0, 0.18].map((x, i) => (
          <Part key={x} look={FLAME} color={['#ff8c42', '#ffd166', '#ff6b35'][i]} position={[x, 0.3 + (i === 1 ? 0.04 : 0), 0.2]} scale={[1, i === 1 ? 1.2 : 0.9, 1]} />
        ))}
        <Cyl r={0.05} h={0.22} position={[-0.75, 1.31, 0]} color="#d4af37" outline shadow={false} />
        <Cyl r={0.05} h={0.22} position={[0.75, 1.31, 0]} color="#d4af37" outline shadow={false} />
      </group>
    </group>
  );
}

/** An office floor's style: its props and its tint. Nothing for classic. */
export const StyleDressing = memo(function StyleDressing({ style, desks }: { style: FloorStyle; desks: DeskPlace[] }) {
  const tint = STYLE_LOOKS[style].tint;
  return (
    <group>
      {tint && <hemisphereLight args={tint} />}
      {style === 'loft' && <Loft />}
      {style === 'scandi' && <Scandi />}
      {style === 'greenhouse' && <Greenhouse />}
      {style === 'neon' && <Neon />}
      {style === 'library' && <Library desks={desks} />}
    </group>
  );
});
