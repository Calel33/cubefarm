import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useStore } from '../../store';
import { useCanvasTexture } from '../interact';
import { HALF_W, LOG_CRT } from '../layout';
import { Box } from '../Toon';
import { onRoomLog, roomLog } from './roomLog';

// The wall CRT on the east wall: the office's log in green phosphor, scrolling as lines come. System lines only: the
// floors' ticker (what the office already shows on each floor, "Ken opened PR #212") and the room's own (sessions up,
// ended or failing, the power meter's changes), never anything out of a terminal. Painted only when a line arrives.

const ROWS = 12;
const TONE = { good: '#8dffb8', bad: '#ff8a7a', info: '#c8f6ff' } as const;
const hhmm = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** The log's last lines, oldest first, as they're shown. */
export function logLines(ticker: { repoId: string; at: number; text: string; tone: 'good' | 'bad' | 'info' }[], floors: Map<string, number>, room: readonly { at: number; text: string; tone: 'good' | 'bad' | 'info' }[]) {
  const all = [
    ...ticker.slice(-ROWS).map((t) => ({ at: t.at, tone: t.tone, text: `F${floors.get(t.repoId) ?? '?'} ${t.text}` })),
    ...room.slice(-ROWS).map((r) => ({ at: r.at, tone: r.tone, text: r.text })),
  ].sort((a, b) => a.at - b.at);
  return all.slice(-ROWS).map((l) => ({ text: `${hhmm(l.at)} ${l.text}`, tone: l.tone }));
}

export function LogCrt() {
  const ticker = useStore((s) => s.ticker);
  const repos = useStore((s) => s.repos);
  const [version, setVersion] = useState(0);
  useEffect(() => onRoomLog(() => setVersion((v) => v + 1)), []);
  const floors = useMemo(() => new Map(repos.map((r) => [r.id, r.floor])), [repos]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lines = useMemo(() => logLines(ticker, floors, roomLog()), [ticker, floors, version]);
  const key = lines.map((l) => l.text).join('\n');

  const screen = useCanvasTexture(
    640,
    480,
    (ctx) => {
      ctx.fillStyle = '#04120b';
      ctx.fillRect(0, 0, 640, 480);
      ctx.font = 'bold 22px "JetBrains Mono", ui-monospace, monospace';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#4fd38b';
      ctx.fillText('OFFICE LOG · system lines', 18, 12);
      lines.forEach((l, i) => {
        ctx.fillStyle = TONE[l.tone];
        let text = l.text;
        while (text.length > 4 && ctx.measureText(text).width > 604) text = text.slice(0, -2);
        ctx.fillText(text === l.text ? text : `${text}…`, 18, 50 + i * 35);
      });
      if (!lines.length) {
        ctx.fillStyle = '#2f7a52';
        ctx.fillText('waiting for the office…', 18, 50);
      }
      // scanlines
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      for (let y = 0; y < 480; y += 4) ctx.fillRect(0, y, 640, 2);
      ctx.fillStyle = '#8dffb8';
      ctx.fillRect(18, 50 + Math.min(lines.length, ROWS - 1) * 35 + 26, 14, 4); // the cursor
    },
    [key],
  );

  const { z, desk, w, h, depth } = LOG_CRT;
  return (
    // on the east wall, facing west: local +z points into the room
    <group position={[HALF_W, 0, z]} rotation={[0, -Math.PI / 2, 0]}>
      <Box size={[desk.w, desk.h, desk.d]} position={[0, desk.h / 2, desk.d / 2]} color="#59657d" outline />
      <Box size={[w + 0.2, h + 0.2, depth]} position={[0, desk.h + (h + 0.2) / 2, desk.d / 2 - 0.05]} color="#d8d0bc" outline />
      <Box size={[w - 0.2, h - 0.2, 0.25]} position={[0, desk.h + (h + 0.2) / 2, desk.d / 2 - depth / 2 - 0.15]} color="#c7bea8" />
      <mesh position={[0, desk.h + (h + 0.2) / 2, desk.d / 2 - 0.05 + depth / 2 + 0.006]}>
        <planeGeometry args={[w, h * 0.92]} />
        <meshBasicMaterial map={screen} toneMapped={false} side={THREE.FrontSide} />
      </mesh>
      <Box size={[0.5, 0.05, 0.22]} position={[0.3, desk.h + 0.025, desk.d - 0.2]} color="#2b3244" />
    </group>
  );
}
