import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { look } from './batch';
import { Part } from './Batched';
import { Outlines } from './Outlines';
import { ELEVATOR, HALF_D, HALF_W, SIDE_DOOR, SIDE_OPENINGS, SIDES, WALL_H, WALL_T, WINDOW, sideSign, type Side } from './layout';
import { drawGlass } from './draw';
import { shade, toon } from './materials';
import { boxesGeometry, merged, type BoxSpec } from './shapes';
import { STYLE_LOOKS, type StyleLook } from './floorStyles';
import { brickMaterial, floorTexture, worldUVs } from './styleTextures';
import { Box } from './Toon';
import { LampHalos } from './sky/lamps';
import { SunPatches } from './sky/SunPatches';

const INK = '#1f1d2b';

type FloorKind = 'office' | 'lobby';

let pane: THREE.MeshBasicMaterial | null = null;

/** See-through window glass (also the side doors'): lightly tinted, with a glint, no refraction. */
export function paneMaterial() {
  if (pane) return pane;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  drawGlass(c.getContext('2d')!, 256, 128);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  pane = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  return pane;
}

interface Opening {
  z0: number;
  z1: number;
  y0: number;
  y1: number;
}

/** A side wall's door and windows, south-going (by z). */
function openings(kind: FloorKind, side: Side): Opening[] {
  const { door, windows } = SIDE_OPENINGS[kind][side];
  const { w, h, y } = WINDOW;
  return [
    { z0: door - SIDE_DOOR.half, z1: door + SIDE_DOOR.half, y0: 0, y1: SIDE_DOOR.h },
    ...windows.map((z) => ({ z0: z - w / 2, z1: z + w / 2, y0: y - h / 2, y1: y + h / 2 })),
  ].sort((a, b) => a.z0 - b.z0);
}

/** Both side walls in pieces round their openings: full height between them, a strip under each window and over each one. */
function sideWalls(kind: FloorKind) {
  const t = WALL_T;
  const out: BoxSpec[] = [];
  for (const side of SIDES) {
    const x = sideSign(side) * (HALF_W + t / 2);
    let z = -HALF_D;
    for (const o of openings(kind, side)) {
      const mid = (o.z0 + o.z1) / 2;
      if (o.z0 > z) out.push({ size: [t, WALL_H, o.z0 - z], at: [x, WALL_H / 2, (z + o.z0) / 2] });
      if (o.y0 > 0) out.push({ size: [t, o.y0, o.z1 - o.z0], at: [x, o.y0 / 2, mid] });
      out.push({ size: [t, WALL_H - o.y1, o.z1 - o.z0], at: [x, (o.y1 + WALL_H) / 2, mid] });
      z = o.z1;
    }
    out.push({ size: [t, WALL_H, HALF_D - z], at: [x, WALL_H / 2, (z + HALF_D) / 2] });
  }
  return boxesGeometry(out);
}

/** The windows' frames, sills and middle mullions, and the door frames, through the wall so they show on both faces. */
function frames(kind: FloorKind) {
  const d = WALL_T + 0.06;
  const out: BoxSpec[] = [];
  for (const side of SIDES) {
    const x = sideSign(side) * (HALF_W + WALL_T / 2);
    for (const o of openings(kind, side)) {
      const z = (o.z0 + o.z1) / 2;
      const w = o.z1 - o.z0;
      const h = o.y1 - o.y0;
      if (o.y0 === 0) {
        // the door: a frame round the opening, set into the wall so it doesn't narrow the doorway
        out.push({ size: [d, 0.12, w + 0.24], at: [x, o.y1 + 0.06, z] });
        for (const zz of [o.z0 - 0.06, o.z1 + 0.06]) out.push({ size: [d, o.y1, 0.12], at: [x, o.y1 / 2, zz] });
        continue;
      }
      out.push({ size: [d, 0.1, w], at: [x, o.y1 - 0.05, z] });
      out.push({ size: [WALL_T + 0.22, 0.08, w + 0.2], at: [x, o.y0 + 0.02, z] });
      for (const zz of [o.z0 + 0.04, o.z1 - 0.04]) out.push({ size: [d, h, 0.08], at: [x, (o.y0 + o.y1) / 2, zz] });
      out.push({ size: [0.12, h, 0.07], at: [x, (o.y0 + o.y1) / 2, z] });
    }
  }
  return boxesGeometry(out);
}

/** One pane in the middle of each window. */
function panes(kind: FloorKind) {
  const { w, h, y } = WINDOW;
  return merged(
    SIDES.flatMap((side) =>
      SIDE_OPENINGS[kind][side].windows.map((z) => new THREE.PlaneGeometry(w, h).rotateY(Math.PI / 2).translate(sideSign(side) * (HALF_W + WALL_T / 2), y, z)),
    ),
  );
}

/** The walls' material: the style's paint, or its brick (on world-scaled UVs, worldUVs). */
const wallMaterial = (s: StyleLook) => (s.wallPattern === 'brick' ? brickMaterial(s.wall, s.wallDetail) : toon(s.wall));

/** The real windows in the side walls, with the walls round them and the side doors' frames. */
function SideWalls({ kind, style }: { kind: FloorKind; style: StyleLook }) {
  const walls = useMemo(() => worldUVs(sideWalls(kind)), [kind]);
  const frame = useMemo(() => frames(kind), [kind]);
  const glass = useMemo(() => panes(kind), [kind]);
  useEffect(() => () => [walls, frame, glass].forEach((g) => g.dispose()), [walls, frame, glass]);
  return (
    <group>
      <mesh geometry={walls} material={wallMaterial(style)} receiveShadow />
      <mesh geometry={frame} material={toon(style.accentTrim ? '#ffffff' : style.trim)}>
        <Outlines thickness={0.018} color={INK} />
      </mesh>
      <mesh geometry={glass} material={paneMaterial()} renderOrder={1} />
    </group>
  );
}

// Every light's panel is the same shape: one batch draws them all (Batched.tsx).
const PANEL = look(new THREE.PlaneGeometry(1.25, 0.38), { shading: 'glowNight' });

function CeilingLight({ position, panel }: { position: [number, number, number]; panel: string }) {
  return (
    <group position={position}>
      <Box size={[1.4, 0.06, 0.5]} position={[0, 0, 0]} color="#e9ecef" shadow={false} />
      <Part look={PANEL} color={panel} position={[0, -0.035, 0]} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

/** Where the ceiling lights hang (and a style's pendants instead, StyleDressing.tsx). */
export const CEILING_LIGHTS: [number, number, number][] = [];
for (let x = -12; x <= 12; x += 6) for (let z = -8; z <= 8; z += 5.5) CEILING_LIGHTS.push([x, WALL_H - 0.04, z]);

/**
 * A floor's walls, floor, ceiling and lights. `style` is an office floor's interior style (floorStyles.ts); `floorColor`
 * overrides its floor's colour (the lobby's).
 */
export function Shell({ kind, accent, floorColor, style = STYLE_LOOKS.classic }: { kind: FloorKind; accent: string; floorColor?: string; style?: StyleLook }) {
  const wall = wallMaterial(style);
  const t = 0.3;
  const { doorHalf, doorHeight } = ELEVATOR;
  const lights = CEILING_LIGHTS;
  const floorTex = floorTexture(style.floorPattern, floorColor ?? style.floor, style.gloss);
  // the north wall and the south wall either side of (and over) the elevator, on world UVs for brick
  const solid = useMemo(() => {
    const south = HALF_W - doorHalf;
    return [
      worldUVs(new THREE.BoxGeometry(HALF_W * 2 + t * 2, WALL_H, t).translate(0, WALL_H / 2, -HALF_D - t / 2)),
      ...[-1, 1].map((s) => worldUVs(new THREE.BoxGeometry(south, WALL_H, t).translate(s * (doorHalf + south / 2), WALL_H / 2, HALF_D + t / 2))),
      worldUVs(new THREE.BoxGeometry(doorHalf * 2, WALL_H - doorHeight, t).translate(0, (WALL_H + doorHeight) / 2, HALF_D + t / 2)),
    ];
  }, [doorHalf, doorHeight]);
  useEffect(() => () => solid.forEach((g) => g.dispose()), [solid]);

  const southSeg = HALF_W - doorHalf;
  // the side walls' skirting and stripe stop at their doors
  const sideTrim = SIDES.flatMap((side) => {
    const s = sideSign(side);
    const door = SIDE_OPENINGS[kind][side].door;
    return [
      [-HALF_D, door - SIDE_DOOR.half - 0.12],
      [door + SIDE_DOOR.half + 0.12, HALF_D],
    ].map(([z0, z1]) => ({ p: [s * (HALF_W - 0.02), 0, (z0 + z1) / 2] as const, r: (-s * Math.PI) / 2, w: z1 - z0 }));
  });
  return (
    <group>
      {/* floor + ceiling */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[HALF_W * 2, HALF_D * 2]} />
        <meshToonMaterial map={floorTex} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, WALL_H, 0]} material={toon(style.ceiling)}>
        <planeGeometry args={[HALF_W * 2, HALF_D * 2]} />
      </mesh>
      {!style.pendants && lights.map((p) => <CeilingLight key={p.join()} position={p} panel={style.lamp} />)}
      <LampHalos positions={lights} />
      <SunPatches kind={kind} />

      {/* walls */}
      {solid.map((g, i) => (
        <mesh key={i} geometry={g} material={wall} receiveShadow={i < 3} />
      ))}
      <SideWalls kind={kind} style={style} />

      {/* skirting + accent stripe */}
      {[
        { p: [0, 0, -HALF_D + 0.02] as const, r: 0, w: HALF_W * 2 },
        ...sideTrim,
        { p: [-(doorHalf + southSeg / 2), 0, HALF_D - 0.02] as const, r: Math.PI, w: southSeg },
        { p: [doorHalf + southSeg / 2, 0, HALF_D - 0.02] as const, r: Math.PI, w: southSeg },
      ].map(({ p, r, w }, i) => (
        <group key={i} position={[p[0], 0, p[2]]} rotation={[0, r, 0]}>
          <mesh position={[0, 0.06, 0]} material={toon(style.accentTrim ? shade(accent, -0.2) : style.trim)}>
            <boxGeometry args={[w, 0.12, 0.04]} />
          </mesh>
          {style.wallPattern === 'panelling' ? (
            // wood panelling up to a dado rail, the floor's accent colour along the rail
            <>
              <mesh position={[0, 0.58, 0.005]} material={toon(style.wallDetail)}>
                <boxGeometry args={[w, 1.04, 0.03]} />
              </mesh>
              <mesh position={[0, 1.12, 0.01]} material={toon(accent)}>
                <boxGeometry args={[w, 0.07, 0.05]} />
              </mesh>
            </>
          ) : (
            <mesh position={[0, 0.95, 0]} material={toon(style.accentTrim ? accent : style.trim)}>
              <boxGeometry args={[w, 0.12, 0.03]} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}
