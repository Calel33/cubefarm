import { useMemo } from 'react';
import * as THREE from 'three';
import { IDEA_KIND_ICON, wallIdeas, type IdeaView } from '../../../shared/ideas';
import { useStore, type Focus } from '../store';
import { useKeyName } from '../ui/controls';
import { roundRect, SANS, wrap } from './draw';
import { HALF_D } from './layout';
import { boardToCanvas, cardAt, cardRect, headerH, type WallGrid } from './ideaWallLayout';
import { useCanvasTexture, useInteractable, type Pick } from './interact';
import { Box } from './Toon';

// The idea wall (#269): a corkboard of the manager's ideas as index cards in their colour, a big one in the lobby
// (every idea) and a small one on each floor (that floor's). E on the board pins a new idea there; E on a card shows
// its story. Cards change as the CEO works the wall: 📌 and the issue once planned, a 🎉 sticker once it ships, soft
// grey when declined.

const CORK = '#c9a26b';
const FRAME = '#8d5a3b';

/** Each floor's wall: which ideas its cards show now, newest first (for the __swarmIdeas probe). */
const walls: Record<number, string[]> = {};

function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, idea: IdeaView) {
  const declined = idea.status === 'declined';
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  roundRect(ctx, x + 4, y + 5, w, h, 6);
  ctx.fill();
  ctx.fillStyle = declined ? '#e3e1dc' : '#fffdf5';
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.fillStyle = declined ? '#b9b5ad' : idea.color;
  ctx.fillRect(x, y + 6, w, Math.max(8, h * 0.07));
  // the pin
  ctx.fillStyle = declined ? '#9a958c' : '#e63946';
  ctx.beginPath();
  ctx.arc(x + w / 2, y + 10, Math.max(6, w * 0.035), 0, Math.PI * 2);
  ctx.fill();
  const size = Math.max(14, Math.round(h * 0.135));
  ctx.font = `600 ${size}px ${SANS}`;
  ctx.fillStyle = declined ? '#8a867f' : '#2d3142';
  ctx.textBaseline = 'top';
  const lines = wrap(ctx, `${IDEA_KIND_ICON[idea.kind]} ${idea.text}`, w - 20, Math.max(1, Math.floor((h * 0.55) / (size * 1.2))));
  lines.forEach((l, i) => ctx.fillText(l, x + 10, y + h * 0.16 + i * size * 1.2));
  // the status along the bottom
  const foot = Math.max(12, Math.round(h * 0.1));
  ctx.font = `600 ${foot}px ${SANS}`;
  ctx.textBaseline = 'middle';
  const fy = y + h - foot * 0.9;
  if (idea.status === 'planned') {
    const label = `📌 ${idea.links.map((l) => `#${l.number}`).join(' ')}`;
    const lw = ctx.measureText(label).width + 14;
    ctx.fillStyle = '#ffe066';
    roundRect(ctx, x + 8, fy - foot * 0.7, lw, foot * 1.4, foot * 0.7);
    ctx.fill();
    ctx.fillStyle = '#5c4400';
    ctx.fillText(label, x + 15, fy);
  } else if (idea.status === 'declined') {
    ctx.fillStyle = '#7a766f';
    ctx.fillText('🚫 declined', x + 10, fy);
  } else if (idea.status !== 'shipped') {
    ctx.fillStyle = '#6c7086';
    ctx.fillText(idea.status === 'new' ? '🆕 new' : '👀 seen by the CEO', x + 10, fy);
  }
  if (idea.status !== 'shipped') {
    ctx.fillStyle = declined ? '#9a958c' : '#6c7086';
    ctx.textAlign = 'right';
    ctx.font = `500 ${Math.round(foot * 0.9)}px ${SANS}`;
    ctx.fillText(idea.by, x + w - 10, fy);
    ctx.textAlign = 'left';
  } else {
    // the 🎉 sticker, slapped on at an angle
    const r = Math.min(w, h) * 0.15;
    ctx.translate(x + w - r * 1.1, y + h - r * 1.1);
    ctx.rotate(-0.25);
    ctx.fillStyle = '#7CFFB2';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a9d8f';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = `${Math.round(r * 1.1)}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText('🎉', 0, 0);
  }
  ctx.restore();
}

function drawWall(ctx: CanvasRenderingContext2D, g: WallGrid, floor: number, ideas: IdeaView[], use: string) {
  ctx.fillStyle = CORK;
  ctx.fillRect(0, 0, g.w, g.h);
  // cork speckles, the same every time
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = 'rgba(90,60,30,0.18)';
  for (let i = 0; i < (g.w * g.h) / 900; i++) ctx.fillRect(rnd() * g.w, rnd() * g.h, 2 + rnd() * 3, 2 + rnd() * 3);
  const hh = headerH(g);
  ctx.fillStyle = 'rgba(45,49,66,0.85)';
  ctx.fillRect(0, 0, g.w, hh);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffe066';
  ctx.font = `700 ${Math.round(hh * 0.5)}px ${SANS}`;
  ctx.fillText(floor ? '💡 Ideas' : '💡 The idea wall', 18, hh / 2);
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 ${Math.round(hh * 0.32)}px ${SANS}`;
  ctx.textAlign = 'right';
  ctx.fillText(`Press ${use} to pin an idea`, g.w - 18, hh / 2);
  ctx.textAlign = 'left';
  ideas.forEach((idea, i) => {
    const r = cardRect(g, i);
    if (r) drawCard(ctx, r.x, r.y, r.w, r.h, idea);
  });
  if (!ideas.length) {
    const r = cardRect(g, 0)!;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 3;
    roundRect(ctx, r.x, r.y, r.w, r.h, 8);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${Math.round(r.h * 0.17)}px ${SANS}`;
    ctx.textBaseline = 'top';
    wrap(ctx, `＋ Press ${use} to pin your first idea`, r.w - 24, 3).forEach((l, i) => ctx.fillText(l, r.x + 12, r.y + r.h * 0.22 + i * r.h * 0.21));
  }
}

const local = new THREE.Vector3();

/** A corkboard on a wall: `position` its middle, `rotationY` turning its face (local +z) to the room. */
export function IdeaWall({ floor, position, rotationY, size, grid }: { floor: number; position: [number, number, number]; rotationY: number; size: [number, number]; grid: WallGrid }) {
  const use = useKeyName('interact');
  const all = useStore((s) => s.ideas);
  const ideas = useMemo(() => wallIdeas(all, floor, grid.cols * grid.rows), [all, floor, grid]);
  walls[floor] = ideas.map((i) => i.id);
  const signature = JSON.stringify(ideas.map((i) => [i.id, i.text, i.kind, i.color, i.by, i.status, i.links.map((l) => l.number), i.pr]));
  const tex = useCanvasTexture(grid.w, grid.h, (ctx) => drawWall(ctx, grid, floor, ideas, use), [signature, use, floor]);
  const pick = useMemo<Pick>(() => {
    const cache = new Map<string, Focus>();
    return (point, root) => {
      root.worldToLocal(local.copy(point));
      const { u, v } = boardToCanvas(grid, size, local.x, local.y);
      const id = walls[floor]?.[cardAt(grid, u, v)];
      const idea = id ? useStore.getState().ideas.find((i) => i.id === id) : null;
      if (!idea) return null;
      const key = `${idea.id}:${idea.status}`;
      let f = cache.get(key);
      if (!f) {
        f = { id: `idea:${idea.id}`, label: `Read the idea: ${idea.text.length > 40 ? `${idea.text.slice(0, 39)}…` : idea.text}`, action: { kind: 'idea', id: idea.id } };
        cache.set(key, f);
      }
      return f;
    };
  }, [grid, size, floor]);
  const ref = useInteractable<THREE.Group>({ id: `ideas-${floor}`, label: 'Pin an idea on the idea wall', action: { kind: 'ideaPin', floor } }, floor ? 4 : 5, pick);
  return (
    <group ref={ref} position={position} rotation={[0, rotationY, 0]}>
      <Box size={[size[0] + 0.16, size[1] + 0.16, 0.06]} position={[0, 0, -0.035]} color={FRAME} outline shadow={false} />
      <mesh position={[0, 0, 0.002]}>
        <planeGeometry args={size} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

// The lobby's big wall on the south wall's quiet east end, by the sofa; each floor's small one on the north wall
// between the whiteboard's plant and the "ship it" sign.
const LOBBY_GRID: WallGrid = { w: 1200, h: 680, cols: 4, rows: 3 };
const FLOOR_GRID: WallGrid = { w: 780, h: 600, cols: 3, rows: 2 };
const LOBBY_AT: [number, number, number] = [13, 1.95, HALF_D - 0.04];
const FLOOR_AT: [number, number, number] = [7.55, 2.3, -HALF_D + 0.04];
const LOBBY_SIZE: [number, number] = [3, 1.7];
const FLOOR_SIZE: [number, number] = [1.7, 1.3];

export function LobbyIdeaWall() {
  return <IdeaWall floor={0} position={LOBBY_AT} rotationY={Math.PI} size={LOBBY_SIZE} grid={LOBBY_GRID} />;
}

export function FloorIdeaWall({ floor }: { floor: number }) {
  return <IdeaWall floor={floor} position={FLOOR_AT} rotationY={0} size={FLOOR_SIZE} grid={FLOOR_GRID} />;
}

// __swarmIdeas: the ideas, what each wall shows, and the panels, for tests and QA.
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__swarmIdeas = {
    get ideas() {
      return useStore.getState().ideas;
    },
    walls,
    pin: (floor = useStore.getState().floor) => useStore.getState().openOverlay({ kind: 'ideaPin', floor: Math.max(0, floor) }),
    open: (id: string) => useStore.getState().openOverlay({ kind: 'idea', id }),
  };
}
