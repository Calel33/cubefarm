// The secret room (#266), its own lazy chunk, built only while the bookshelf is open: a cosy lounge behind the
// manager's office with the rubber-duck shelf, an arcade cabinet (the phone's games), a lava lamp, a wall of polaroids
// of the office's memorable moments, and a developer commentary plaque. Layout in room.ts.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HALF_D, WALL_H } from '../layout';
import { glow } from '../materials';
import { roundRect, SANS, wrap } from '../draw';
import { useCanvasTexture, useInteractable } from '../interact';
import { Couch } from '../Props';
import { boxesGeometry } from '../shapes';
import { box, cone, cyl, model, vertexToon, type Part } from '../decor/parts';
import { useKeyName } from '../../ui/controls';
import { reduceMotion } from '../../ui/a11y';
import { DuckModel } from './HiddenDucks';
import { DUCKS } from './ducks';
import { COMMENTARY, type Polaroid } from './eggs';
import { ARCADE, DUCK_SHELF, LAVA, PLAQUE, POLAROIDS, SECRET_DOOR, SECRET_ROOM, SOFA, polaroidSpot, shelfSpot } from './room';
import { useSecrets } from './secretsState';

const R = SECRET_ROOM;
const MID_X = (R.minX + R.maxX) / 2;
const MID_Z = (R.minZ + R.maxZ) / 2;
const WALL_IN = '#3d5a80';

/** The room's walls (west, east, north, and the doorway's frame on the building's wall), floor slab and roof. */
function shellGeometry() {
  const t = R.t;
  const n = -HALF_D - 0.3; // the building's north wall, outer face
  return boxesGeometry([
    { size: [t, WALL_H, n - R.minZ + t], at: [R.minX - t / 2, WALL_H / 2, (n + R.minZ - t) / 2] },
    { size: [t, WALL_H, n - R.minZ + t], at: [R.maxX + t / 2, WALL_H / 2, (n + R.minZ - t) / 2] },
    { size: [R.maxX - R.minX + 2 * t, WALL_H, t], at: [MID_X, WALL_H / 2, R.minZ - t / 2] },
    { size: [R.maxX - R.minX + 2 * t, t, n - R.minZ + 2 * t], at: [MID_X, WALL_H + t / 2, (n + R.minZ) / 2] },
  ]);
}

const trimModel = () =>
  model('secret-trim', () => {
    const n = -HALF_D - 0.3;
    const d = SECRET_DOOR;
    return [
      // skirting round the walls, a picture rail, and the doorway's frame on the room's side
      box(0.04, 0.14, n - R.minZ, '#e0c097', [R.minX + 0.02, 0.07, (n + R.minZ) / 2]),
      box(0.04, 0.14, n - R.minZ, '#e0c097', [R.maxX - 0.02, 0.07, (n + R.minZ) / 2]),
      box(R.maxX - R.minX, 0.14, 0.04, '#e0c097', [MID_X, 0.07, R.minZ + 0.02]),
      box(0.04, 0.06, n - R.minZ, '#e0c097', [R.minX + 0.02, 2.75, (n + R.minZ) / 2]),
      box(0.04, 0.06, n - R.minZ, '#e0c097', [R.maxX - 0.02, 2.75, (n + R.minZ) / 2]),
      box(R.maxX - R.minX, 0.06, 0.04, '#e0c097', [MID_X, 2.75, R.minZ + 0.02]),
      box(0.12, d.h, 0.08, '#8d5a3b', [d.minX - 0.06, d.h / 2, n - 0.03]),
      box(0.12, d.h, 0.08, '#8d5a3b', [d.maxX + 0.06, d.h / 2, n - 0.03]),
      box(d.maxX - d.minX + 0.24, 0.12, 0.08, '#8d5a3b', [(d.minX + d.maxX) / 2, d.h + 0.06, n - 0.03]),
    ];
  });

/** The duck shelf against the west wall, open to the east: four boards on two uprights. */
const duckShelfModel = () =>
  model('secret-duck-shelf', () => {
    const S = DUCK_SHELF;
    const wood = '#8d5a3b';
    const parts: Part[] = [
      box(0.04, S.h, S.l, '#6f4530', [-S.w / 2 + 0.02, S.h / 2, 0]),
      box(S.w, S.h, 0.05, wood, [0, S.h / 2, -S.l / 2 + 0.025]),
      box(S.w, S.h, 0.05, wood, [0, S.h / 2, S.l / 2 - 0.025]),
    ];
    for (let row = 0; row < S.rows; row++) parts.push(box(S.w, 0.04, S.l - 0.05, '#b08968', [0, 0.4 + row * 0.5, 0]));
    return parts;
  });

function DuckShelf() {
  const found = useSecrets((s) => s.found);
  const tex = useCanvasTexture(
    512,
    128,
    (ctx) => {
      roundRect(ctx, 0, 0, 512, 128, 24);
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
      ctx.fillStyle = '#5c3d2e';
      ctx.font = `700 60px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`🦆 ${found.length} / ${DUCKS.length}`, 256, 68);
    },
    [found.length],
  );
  return (
    <group>
      <mesh geometry={duckShelfModel()} material={vertexToon} position={[DUCK_SHELF.x, 0, DUCK_SHELF.z]} castShadow receiveShadow />
      {DUCKS.map((d, i) => {
        if (!found.includes(d.id)) return null;
        const p = shelfSpot(i);
        return (
          <group key={d.id} position={[p.x, p.y, p.z]} rotation={[0, Math.PI / 2, 0]}>
            <DuckModel color={d.color} />
          </group>
        );
      })}
      <mesh position={[R.minX + 0.03, DUCK_SHELF.h + 0.32, DUCK_SHELF.z]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1.2, 0.3]} />
        <meshBasicMaterial map={tex} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

const arcadeModel = () =>
  model('secret-arcade', () => [
    box(0.06, ARCADE.h, ARCADE.d, '#023e8a', [-ARCADE.w / 2 + 0.03, ARCADE.h / 2, 0]),
    box(0.06, ARCADE.h, ARCADE.d, '#023e8a', [ARCADE.w / 2 - 0.03, ARCADE.h / 2, 0]),
    box(ARCADE.w - 0.12, 0.95, ARCADE.d - 0.15, '#0077b6', [0, 0.475, -0.05]),
    box(ARCADE.w - 0.12, 0.9, 0.12, '#1f1d2b', [0, 1.4, -0.3]),
    box(ARCADE.w - 0.12, 0.06, 0.36, '#03045e', [0, 1.0, 0.12], [0.35, 0, 0]),
    box(ARCADE.w - 0.12, 0.22, 0.42, '#ff006e', [0, ARCADE.h - 0.11, -0.12]),
    cyl(0.012, 0.012, 0.1, '#adb5bd', [-0.15, 1.08, 0.16]),
    cyl(0.035, 0.035, 0.05, '#e63946', [-0.15, 1.14, 0.16]),
    cyl(0.03, 0.03, 0.02, '#ffd166', [0.05, 1.05, 0.15], [0.35, 0, 0]),
    cyl(0.03, 0.03, 0.02, '#06d6a0', [0.14, 1.06, 0.12], [0.35, 0, 0]),
    box(0.2, 0.08, 0.02, '#ffd166', [0, 0.55, 0.26]),
  ]);

/** The arcade: the phone's games on a big screen (E opens them). The screen's attract mode blinks. */
function Arcade() {
  const use = useKeyName('interact');
  const ref = useInteractable<THREE.Group>({ id: 'secret-arcade', label: '🕹️ Play the arcade (the phone’s games, big)', action: { kind: 'secret', op: 'arcade' } }, 2.8);
  const screen = useCanvasTexture(
    320,
    240,
    (ctx) => {
      ctx.fillStyle = '#03071e';
      ctx.fillRect(0, 0, 320, 240);
      ctx.textAlign = 'center';
      ctx.font = `700 26px monospace`;
      ctx.fillStyle = '#ffd166';
      ctx.fillText('SECRET ARCADE', 160, 42);
      ctx.font = `700 20px monospace`;
      ['CUBETRIS', 'CABLE SNAKE', 'DESK PET'].forEach((t, i) => {
        ctx.fillStyle = ['#7CFFB2', '#4cc9f0', '#f15bb5'][i];
        ctx.fillText(t, 160, 96 + i * 32);
      });
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 18px monospace`;
      ctx.fillText(`INSERT DUCK · PRESS ${use}`, 160, 214);
    },
    [use],
  );
  return (
    <group ref={ref} position={[ARCADE.x, 0, ARCADE.z]}>
      <mesh geometry={arcadeModel()} material={vertexToon} castShadow receiveShadow />
      <mesh position={[0, 1.36, -0.235]} rotation={[-0.12, 0, 0]}>
        <planeGeometry args={[0.6, 0.45]} />
        <meshBasicMaterial map={screen} toneMapped={false} />
      </mesh>
    </group>
  );
}

const lampModel = () =>
  model('secret-lava-base', () => [
    cyl(0.25, 0.28, LAVA.table, '#6f4530', [0, LAVA.table / 2, 0]),
    cone(0.11, 0.16, '#c0c0c0', [0, LAVA.table + 0.08, 0]),
    cyl(0.05, 0.11, 0.08, '#c0c0c0', [0, LAVA.table + 0.62, 0]),
  ]);

/** The lava lamp: three warm blobs rising and sinking in a glowing glass. */
function LavaLamp() {
  const blobs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    if (reduceMotion()) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < blobs.current.length; i++) {
      const b = blobs.current[i];
      if (!b) continue;
      const k = (Math.sin(t * (0.35 + i * 0.13) + i * 2.1) + 1) / 2;
      b.position.y = LAVA.table + 0.2 + k * 0.3;
      b.scale.y = 1 + Math.sin(t * 0.9 + i) * 0.25;
    }
  });
  const blobMat = useMemo(() => glow('#ff5d8f'), []);
  return (
    <group position={[LAVA.x, 0, LAVA.z]}>
      <mesh geometry={lampModel()} material={vertexToon} castShadow />
      <mesh position={[0, LAVA.table + 0.4, 0]}>
        <cylinderGeometry args={[0.055, 0.1, 0.44, 16]} />
        <meshBasicMaterial color="#ffb703" transparent opacity={0.55} toneMapped={false} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(m) => void (blobs.current[i] = m)} position={[(i - 1) * 0.015, LAVA.table + 0.3, 0]} material={blobMat}>
          <sphereGeometry args={[0.032 + i * 0.006, 10, 8]} />
        </mesh>
      ))}
    </group>
  );
}

// ---------- the polaroid wall ----------

const PX = 420; // canvas pixels a metre
const WALL_W = POLAROIDS.cols * POLAROIDS.w + (POLAROIDS.cols - 1) * POLAROIDS.gap;
const WALL_H_M = POLAROIDS.rows * POLAROIDS.h + (POLAROIDS.rows - 1) * POLAROIDS.gap;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawWall(ctx: CanvasRenderingContext2D, photos: readonly Polaroid[], images: (HTMLImageElement | null)[]) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);
  const slots = POLAROIDS.cols * POLAROIDS.rows;
  for (let i = 0; i < slots; i++) {
    const s = polaroidSpot(i);
    const cx = (s.x - POLAROIDS.x + WALL_W / 2) * PX;
    const cy = (WALL_H_M / 2 - (s.y - POLAROIDS.y)) * PX;
    const w = POLAROIDS.w * PX;
    const h = POLAROIDS.h * PX;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(((i * 37) % 9 - 4) * 0.012);
    const p = photos[i];
    ctx.fillStyle = p ? '#fffdf7' : 'rgba(255,253,247,0.25)';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = p ? 10 : 0;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.shadowBlur = 0;
    const pad = w * 0.07;
    const iw = w - pad * 2;
    const ih = iw * 0.75;
    ctx.fillStyle = '#22223b';
    ctx.fillRect(-w / 2 + pad, -h / 2 + pad, iw, ih);
    const img = images[i];
    if (img) ctx.drawImage(img, -w / 2 + pad, -h / 2 + pad, iw, ih);
    else {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = `600 ${Math.round(w * 0.16)}px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('📷', 0, -h / 2 + pad + ih / 2);
    }
    ctx.fillStyle = '#2b2d42';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.round(w * 0.072)}px ${SANS}`;
    const cap = p ? p.caption : 'waiting for a moment…';
    ctx.fillText(cap, 0, h / 2 - pad * 2.2, iw);
    if (p) {
      ctx.font = `500 ${Math.round(w * 0.055)}px ${SANS}`;
      ctx.fillStyle = '#6c757d';
      ctx.fillText(new Date(p.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }), 0, h / 2 - pad * 0.9, iw);
    }
    ctx.restore();
  }
}

/** The polaroids: the newest top left. Photos are drawn on the main thread (they're images, not the paint worker's). */
function PolaroidWall() {
  const photos = useSecrets((s) => s.polaroids);
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = Math.round(WALL_W * PX);
    c.height = Math.round(WALL_H_M * PX);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => {
    let alive = true;
    const ctx = (tex.image as HTMLCanvasElement).getContext('2d');
    if (!ctx) return;
    drawWall(ctx, photos, []);
    tex.needsUpdate = true;
    void Promise.all(photos.map((p) => (p.image ? loadImage(p.image) : Promise.resolve(null)))).then((images) => {
      if (!alive) return;
      drawWall(ctx, photos, images);
      tex.needsUpdate = true;
    });
    return () => {
      alive = false;
    };
  }, [photos, tex]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[POLAROIDS.x, POLAROIDS.y, R.minZ + 0.02]}>
      <planeGeometry args={[WALL_W, WALL_H_M]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} />
    </mesh>
  );
}

/** The developer commentary plaque: a fun fact about how cubefarm works; E for the next. */
function Plaque() {
  const use = useKeyName('interact');
  const fact = useSecrets((s) => s.fact);
  const ref = useInteractable<THREE.Group>({ id: 'secret-plaque', label: '💡 Developer commentary: the next fun fact', action: { kind: 'secret', op: 'plaque' } }, 3);
  const text = COMMENTARY[fact % COMMENTARY.length];
  const tex = useCanvasTexture(
    640,
    440,
    (ctx) => {
      roundRect(ctx, 0, 0, 640, 440, 28);
      ctx.fillStyle = '#b08d57';
      ctx.fill();
      roundRect(ctx, 16, 16, 608, 408, 20);
      ctx.fillStyle = '#2b2118';
      ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.font = `700 40px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🎙️ Developer commentary', 320, 70);
      ctx.fillStyle = '#f8f1e5';
      ctx.font = `500 32px ${SANS}`;
      wrap(ctx, text, 540, 5).forEach((line, i) => ctx.fillText(line, 320, 150 + i * 44));
      ctx.fillStyle = '#c9b38a';
      ctx.font = `600 24px ${SANS}`;
      ctx.fillText(`${(fact % COMMENTARY.length) + 1} / ${COMMENTARY.length} · ${use} for the next`, 320, 395);
    },
    [text, use, fact],
  );
  return (
    <group ref={ref} position={[R.maxX - 0.03, PLAQUE.y, PLAQUE.z]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh>
        <planeGeometry args={[PLAQUE.w, PLAQUE.h]} />
        <meshBasicMaterial map={tex} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

export default function SecretRoom() {
  const shell = useMemo(shellGeometry, []);
  useEffect(() => () => shell.dispose(), [shell]);
  return (
    <group>
      {/* the walls don't cast shadows: the sun lights the room like the lobby, through its ceiling */}
      <mesh geometry={shell} receiveShadow>
        <meshToonMaterial color={WALL_IN} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[MID_X, 0.002, (R.minZ - HALF_D - 0.3) / 2]} receiveShadow>
        <planeGeometry args={[R.maxX - R.minX, -HALF_D - 0.3 - R.minZ]} />
        <meshToonMaterial color="#6b4f3a" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[MID_X + 0.6, 0.006, MID_Z - 0.2]} receiveShadow>
        <planeGeometry args={[3.6, 2.6]} />
        <meshToonMaterial color="#e76f51" />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[MID_X, WALL_H - 0.01, MID_Z]}>
        <planeGeometry args={[R.maxX - R.minX, -HALF_D - 0.3 - R.minZ]} />
        <meshToonMaterial color="#2b2d42" />
      </mesh>
      <mesh position={[MID_X, WALL_H - 0.05, MID_Z]} rotation={[Math.PI / 2, 0, 0]} material={glow('#ffe8a3')}>
        <circleGeometry args={[0.35, 20]} />
      </mesh>
      <mesh geometry={trimModel()} material={vertexToon} />
      <DuckShelf />
      <Arcade />
      <LavaLamp />
      <PolaroidWall />
      <Plaque />
      <group position={[SOFA.x, 0, SOFA.z]} scale={[SOFA.w / 3, 1, SOFA.d / 1]}>
        <Couch position={[0, 0, 0]} color="#9d4edd" />
      </group>
    </group>
  );
}
