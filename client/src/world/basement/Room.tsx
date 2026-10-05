import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { drawSign } from '../draw';
import { useCanvasTexture } from '../interact';
import { ELEVATOR, HALF_D, HALF_W, KEEPER, RACK_ROWS, RACK_SEGMENTS, TRAY, VENTS, WALL_H, WALL_T, segmentSide, segmentZ } from '../layout';
import { toon, toonMap } from '../materials';
import { Outlines } from '../Outlines';
import { boxesGeometry, merged, type BoxSpec } from '../shapes';
import type { RackRow } from './basementRules';
import { roomTime } from './roomClock';
import { mistMaterial } from './shaders';

// The server room itself: the raised floor's tiles (perforated ones in the cold aisles, the chilled air misting up
// through them), bare blue-grey walls with no windows and no side doors, a dark ceiling, the yellow cable trays over every
// row and down the central aisle from the keeper, and each row's floor label standing on its tray.

const WALL = '#3a4459';
const TILE = 0.6;

// Made once and kept (toonMap caches its material by key), like the other floors' textures.
const tiles = new Map<boolean, THREE.CanvasTexture>();

function tileTexture(perforated: boolean) {
  const made = tiles.get(perforated);
  if (made) return made;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const n = perforated ? 1 : 4;
  const s = 256 / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#a7b2c4' : '#9eaabd';
      ctx.fillRect(i * s, j * s, s, s);
      ctx.fillStyle = '#6d7890';
      ctx.fillRect(i * s, j * s, s, 4);
      ctx.fillRect(i * s, j * s, 4, s);
    }
  }
  if (perforated) {
    ctx.fillStyle = '#4a5568';
    for (let x = 24; x < 240; x += 18) for (let y = 24; y < 240; y += 18) ctx.fillRect(x, y, 7, 7);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (!perforated) tex.repeat.set((HALF_W * 2) / (TILE * 4), (HALF_D * 2) / (TILE * 4));
  tex.anisotropy = 8;
  tiles.set(perforated, tex);
  return tex;
}

function wallsGeometry() {
  const t = WALL_T;
  const { doorHalf, doorHeight } = ELEVATOR;
  const seg = HALF_W - doorHalf;
  return boxesGeometry([
    { size: [HALF_W * 2 + t * 2, WALL_H, t], at: [0, WALL_H / 2, -HALF_D - t / 2] },
    { size: [t, WALL_H, HALF_D * 2], at: [-HALF_W - t / 2, WALL_H / 2, 0] },
    { size: [t, WALL_H, HALF_D * 2], at: [HALF_W + t / 2, WALL_H / 2, 0] },
    { size: [seg, WALL_H, t], at: [-(doorHalf + seg / 2), WALL_H / 2, HALF_D + t / 2] },
    { size: [seg, WALL_H, t], at: [doorHalf + seg / 2, WALL_H / 2, HALF_D + t / 2] },
    { size: [doorHalf * 2, WALL_H - doorHeight, t], at: [0, (WALL_H + doorHeight) / 2, HALF_D + t / 2] },
  ]);
}

/** The trays over every segment, the spine down the central aisle and the crossings over it at each line. */
function traysGeometry() {
  const { y, w, h } = TRAY;
  const len = RACK_ROWS.out - RACK_ROWS.in + 0.2;
  const out: BoxSpec[] = [];
  for (let s = 0; s < RACK_SEGMENTS; s++) out.push({ size: [len, h, w], at: [segmentSide(s) * (RACK_ROWS.in + len / 2 - 0.1), y, segmentZ(s)] });
  for (const z of RACK_ROWS.zs) out.push({ size: [RACK_ROWS.in * 2, h, w], at: [0, y, z] });
  const z0 = RACK_ROWS.zs[RACK_ROWS.zs.length - 1];
  out.push({ size: [w, h, KEEPER.z - z0], at: [0, y + 0.01, (KEEPER.z + z0) / 2] });
  return boxesGeometry(out);
}

function ventsGeometry() {
  return merged(VENTS.map((v) => new THREE.PlaneGeometry(TILE, TILE).rotateX(-Math.PI / 2).translate(v.x, 0.004, v.z)));
}

/** The chilled air: a few puffs rising from each vent, all in one draw, moved in the shader. */
function Mist() {
  const mesh = useMemo(() => {
    const per = 3;
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(0.9, 0.9);
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    const seed = new Float32Array(VENTS.length * per * 4);
    VENTS.forEach((v, i) => {
      for (let k = 0; k < per; k++) {
        const o = (i * per + k) * 4;
        seed[o] = v.x + (k - 1) * 0.18;
        seed[o + 1] = v.z + ((k * 7) % 3) * 0.1 - 0.1;
        seed[o + 2] = (i * 0.37 + k / per) % 1;
        seed[o + 3] = 0.11 + ((i + k) % 4) * 0.02;
      }
    });
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = VENTS.length * per;
    const m = new THREE.Mesh(g, mistMaterial());
    m.frustumCulled = false;
    m.renderOrder = 2;
    return m;
  }, []);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    },
    [mesh],
  );
  useFrame(() => {
    (mesh.material as THREE.ShaderMaterial).uniforms.uTime.value = roomTime();
  });
  return <primitive object={mesh} />;
}

function RowLabel({ row }: { row: RackRow }) {
  const tex = useCanvasTexture(512, 96, (ctx) => {
    drawSign(ctx, 512, 96, [{ text: row.label, size: 44, color: '#f1f5ff' }], '#161c29');
    ctx.fillStyle = row.color;
    ctx.fillRect(0, 0, 18, 96);
  }, [row.label, row.color]);
  return (
    <mesh position={[segmentSide(row.segment) * (RACK_ROWS.in + 1.1), TRAY.y + 0.26, segmentZ(row.segment) + 0.05]}>
      <planeGeometry args={[1.9, 0.36]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

export function Room({ rows }: { rows: RackRow[] }) {
  const g = useMemo(() => ({ walls: wallsGeometry(), trays: traysGeometry(), vents: ventsGeometry() }), []);
  useEffect(() => () => Object.values(g).forEach((x) => x.dispose()), [g]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={toonMap('basement-floor', tileTexture(false))}>
        <planeGeometry args={[HALF_W * 2, HALF_D * 2]} />
      </mesh>
      <mesh geometry={g.vents} material={toonMap('basement-vent', tileTexture(true))} />
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, WALL_H, 0]} material={toon('#2a3346')}>
        <planeGeometry args={[HALF_W * 2, HALF_D * 2]} />
      </mesh>
      <mesh geometry={g.walls} material={toon(WALL)} />
      <mesh geometry={g.trays} material={toon('#d9a441')}>
        <Outlines thickness={0.018} color="#1f1d2b" />
      </mesh>
      {rows.map((r) => (
        <RowLabel key={r.segment} row={r} />
      ))}
      <Mist />
    </group>
  );
}
