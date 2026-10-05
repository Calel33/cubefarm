import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { reduceMotion } from '../../ui/a11y';
import { roundRect } from '../draw';
import { useCanvasTexture, useInteractable } from '../interact';
import { HALF_W, POWER_WALL } from '../layout';
import { glow } from '../materials';
import { Box, Cyl } from '../Toon';
import { meterReading } from './basementRules';
import { logRoom } from './roomLog';

// Claude's usage as the building's power meter, on the west wall: a big analogue gauge (green, amber, red), the wall
// display beside it (NORMAL, PACING until Tue 00:00, PAUSED) and, while the office paces itself, the big lever that
// resumes full speed (it asks first, as mission control's meter does). Painted only when the reading changes.

const ARC = (Math.PI * 3) / 4; // the dial sweeps from -135° to +135°
const LEVER_UP = 0.35;
const LEVER_DOWN = 2.3;
const TONE = { good: '#3ddc84', warn: '#ffb020', bad: '#ff4d4d' } as const;

function drawDial(ctx: CanvasRenderingContext2D, s: number) {
  const c = s / 2;
  ctx.fillStyle = '#10151f';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#eef2f8';
  ctx.beginPath();
  ctx.arc(c, c, c - 8, 0, Math.PI * 2);
  ctx.fill();
  const band = (a: number, b: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 34;
    ctx.beginPath();
    ctx.arc(c, c, c - 58, -Math.PI / 2 - ARC + a * 2 * ARC, -Math.PI / 2 - ARC + b * 2 * ARC);
    ctx.stroke();
  };
  band(0, 0.62, TONE.good);
  band(0.62, 0.88, TONE.warn);
  band(0.88, 1, TONE.bad);
  ctx.strokeStyle = '#1f1d2b';
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 - ARC + (i / 10) * 2 * ARC;
    ctx.lineWidth = i % 5 ? 4 : 8;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * (c - 30), c + Math.sin(a) * (c - 30));
    ctx.lineTo(c + Math.cos(a) * (c - (i % 5 ? 82 : 96)), c + Math.sin(a) * (c - (i % 5 ? 82 : 96)));
    ctx.stroke();
  }
  ctx.fillStyle = '#1f1d2b';
  ctx.textAlign = 'center';
  ctx.font = 'bold 40px "Nunito", system-ui, sans-serif';
  ctx.fillText('CLAUDE USAGE', c, c + 120);
  ctx.font = 'bold 30px "Nunito", system-ui, sans-serif';
  ctx.fillText('0', c - 150, c + 190);
  ctx.fillText('LIMIT', c + 140, c + 190);
}

function drawDisplay(ctx: CanvasRenderingContext2D, w: number, h: number, r: { headline: string; detail: string; limit: string; tone: keyof typeof TONE }, hint: string) {
  ctx.fillStyle = '#05080e';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = TONE[r.tone];
  ctx.lineWidth = 8;
  roundRect(ctx, 10, 10, w - 20, h - 20, 18);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#9aa6bd';
  ctx.font = 'bold 30px "Nunito", system-ui, sans-serif';
  ctx.fillText('POWER · CLAUDE USAGE', w / 2, 52);
  ctx.fillStyle = TONE[r.tone];
  ctx.font = 'bold 96px "Nunito", system-ui, sans-serif';
  ctx.fillText(r.headline, w / 2, 138);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px "Nunito", system-ui, sans-serif';
  ctx.fillText(r.detail, w / 2, 210);
  ctx.fillStyle = '#9aa6bd';
  ctx.font = '28px "Nunito", system-ui, sans-serif';
  ctx.fillText(r.limit, w / 2, 256);
  ctx.fillText(hint, w / 2, 292);
}

export function PowerWall() {
  const usage = useStore((s) => s.usage);
  // the clock on the display ("until 14:03") is worked out again each minute, not each frame
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000));
  useEffect(() => {
    const t = setInterval(() => setMinute(Math.floor(Date.now() / 60_000)), 15_000);
    return () => clearInterval(t);
  }, []);
  const r = meterReading(usage, minute * 60_000);
  const hint = r.state === 'pacing' ? 'Pull the lever to resume full speed' : r.state === 'paused' ? "A pause at the limit can't be cleared early" : 'New work starts at full speed';

  const prev = useRef(r.state);
  useEffect(() => {
    if (prev.current === r.state) return;
    prev.current = r.state;
    logRoom(`power: ${r.headline.toLowerCase()} ${r.state === 'normal' ? '' : r.detail}`.trim(), r.state === 'paused' ? 'bad' : r.state === 'pacing' ? 'info' : 'good');
  }, [r.state, r.headline, r.detail]);

  const dial = useCanvasTexture(512, 512, (ctx) => drawDial(ctx, 512), []);
  const display = useCanvasTexture(640, 320, (ctx) => drawDisplay(ctx, 640, 320, r, hint), [r.headline, r.detail, r.limit, r.tone, hint]);

  const needle = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  // the lever stands up ready while the office paces (or is paused); pulled, it rests down
  const leverAt = r.state === 'normal' ? LEVER_DOWN : LEVER_UP;
  const target = useRef({ needle: r.needle, lever: leverAt });
  target.current = { needle: r.needle, lever: leverAt };
  useFrame((_, dt) => {
    const k = reduceMotion() ? 1 : 1 - Math.exp(-dt * 2.5);
    const n = needle.current;
    if (n) n.rotation.z += (ARC - target.current.needle * 2 * ARC - n.rotation.z) * k;
    const a = arm.current;
    if (a) a.rotation.x += (target.current.lever - a.rotation.x) * (reduceMotion() ? 1 : 1 - Math.exp(-dt * 6));
  });

  const meterRef = useInteractable<THREE.Group>({ id: 'power-meter', label: `Claude usage: ${r.state} · open it in the console`, action: { kind: 'manager', tab: 'ops', card: 'usage' } }, 6);
  const leverRef = useInteractable<THREE.Group>(
    r.state === 'pacing'
      ? { id: 'power-lever', label: 'Pull the lever: resume full speed', action: { kind: 'resume' } }
      : { id: 'power-lever', label: r.state === 'paused' ? "The lever's locked: paused at the limit" : 'The lever rests: running at full speed', action: { kind: 'manager', tab: 'ops', card: 'usage' } },
    3,
  );

  const { gauge, display: disp, lever } = POWER_WALL;
  return (
    // the wall faces east: local +z points into the room
    <group position={[-HALF_W, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
      <group ref={meterRef}>
        <group position={[-gauge.z, gauge.y, 0]}>
          <Cyl r={gauge.r + 0.09} h={0.12} position={[0, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]} color="#59657d" outline seg={40} />
          <mesh position={[0, 0, 0.125]}>
            <circleGeometry args={[gauge.r, 48]} />
            <meshBasicMaterial map={dial} toneMapped={false} />
          </mesh>
          <group ref={needle} position={[0, 0, 0.14]} rotation={[0, 0, ARC]}>
            <mesh position={[0, gauge.r * 0.38, 0]} material={glow('#ff5a36')}>
              <boxGeometry args={[0.05, gauge.r * 0.8, 0.02]} />
            </mesh>
          </group>
          <Cyl r={0.08} h={0.06} position={[0, 0, 0.16]} rotation={[Math.PI / 2, 0, 0]} color="#1f1d2b" />
        </group>
        <group position={[-disp.z, disp.y, 0]}>
          <Box size={[disp.w + 0.14, disp.h + 0.14, 0.08]} position={[0, 0, 0.04]} color="#2b3244" outline />
          <mesh position={[0, 0, 0.085]}>
            <planeGeometry args={[disp.w, disp.h]} />
            <meshBasicMaterial map={display} toneMapped={false} />
          </mesh>
        </group>
      </group>
      <group ref={leverRef} position={[-lever.z, lever.y, 0]}>
        <Box size={[lever.w, lever.h, lever.d * 0.5]} position={[0, 0, lever.d * 0.25]} color="#c0392b" outline />
        <Box size={[lever.w * 0.7, 0.16, 0.02]} position={[0, lever.h / 2 - 0.14, lever.d * 0.5 + 0.01]} color="#f5f0e6" />
        <group ref={arm} position={[0, -0.1, lever.d * 0.5]} rotation={[leverAt, 0, 0]}>
          <Cyl r={0.04} h={0.62} position={[0, 0.31, 0]} color="#c7cfdc" outline />
          <Cyl r={0.06} h={0.42} position={[0, 0.64, 0]} rotation={[0, 0, Math.PI / 2]} color="#1f1d2b" outline />
        </group>
        <Box size={[0.22, 0.22, 0.12]} position={[0, -0.1, lever.d * 0.5 + 0.02]} color="#59657d" outline />
      </group>
    </group>
  );
}
