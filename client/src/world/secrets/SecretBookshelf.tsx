// The secret bookshelf in the manager's office (#266): one book is a slightly different red and sticks out a little.
// Pull it (E or click) and the whole shelf slides west over its rails, opening the doorway to the secret room.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HALF_D } from '../layout';
import { useInteractable } from '../interact';
import { reduceMotion } from '../../ui/a11y';
import { box, model, vertexToon, type Part } from '../decor/parts';
import { LEVER_BOOK, SECRET_SHELF } from './room';
import { useSecrets } from './secretsState';

const S = SECRET_SHELF;
const COLORS = ['#457b9d', '#e63946', '#2a9d8f', '#f4a261', '#9b5de5', '#ffbe0b', '#06d6a0'];
const ROWS = [0.12, 0.66, 1.2, 1.74]; // the boards' tops
const PER_ROW = 5;
const bookX = (i: number) => -S.w / 2 + 0.2 + i * ((S.w - 0.4) / (PER_ROW - 1));

/** The odd book: a deeper red than its neighbours, pulled out a couple of centimetres. */
function LeverBook({ open }: { open: boolean }) {
  const ref = useInteractable<THREE.Group>(
    { id: 'secret-book', label: open ? '📕 Push the book back in' : '📕 One book sticks out a little. Pull it', action: { kind: 'secret', op: 'book' } },
    2.6,
  );
  const x = bookX(LEVER_BOOK.index);
  return (
    <group ref={ref} position={[x, ROWS[LEVER_BOOK.row] + 0.2, S.d / 2 - 0.12 + (open ? 0 : 0.05)]} rotation={[open ? 0 : 0.12, 0, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.15, 0.4, 0.3]} />
        <meshToonMaterial color="#a4161a" />
      </mesh>
      <mesh position={[0, 0.1, 0.152]}>
        <boxGeometry args={[0.1, 0.03, 0.005]} />
        <meshToonMaterial color="#ffd166" />
      </mesh>
    </group>
  );
}

/** The shelf and its books (all but the lever), in one mesh: a frame open at the front (+z). */
const shelfModel = () =>
  model('secret-shelf', () => {
    const wood = '#9c6644';
    const parts: Part[] = [
      box(S.w, S.h, 0.04, '#7f5539', [0, S.h / 2, -S.d / 2 + 0.02]),
      box(0.05, S.h, S.d, wood, [-S.w / 2 + 0.025, S.h / 2, 0]),
      box(0.05, S.h, S.d, wood, [S.w / 2 - 0.025, S.h / 2, 0]),
      box(S.w, 0.05, S.d, wood, [0, S.h - 0.025, 0]),
    ];
    ROWS.forEach((y, row) => {
      parts.push(box(S.w - 0.08, 0.04, S.d - 0.04, '#7f5539', [0, y - 0.02, 0.01]));
      for (let i = 0; i < PER_ROW; i++) {
        if (row === LEVER_BOOK.row && i === LEVER_BOOK.index) continue;
        const h = 0.34 + ((i + row) % 3) * 0.04;
        parts.push(box(0.14 + ((i * row) % 3) * 0.025, h, 0.3, COLORS[(i + row * 2) % COLORS.length], [bookX(i), y + h / 2, S.d / 2 - 0.17]));
      }
    });
    return parts;
  });

export function SecretBookshelf() {
  const open = useSecrets((s) => s.open);
  const group = useRef<THREE.Group>(null);
  const target = open ? S.x - S.slide : S.x;
  // where it stands when first drawn; after that the frame loop slides it, so a re-render never jumps it
  const start = useMemo((): [number, number, number] => [target, 0, -HALF_D + S.d / 2], []); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, dt) => {
    const g = group.current;
    if (!g || g.position.x === target) return;
    const step = reduceMotion() ? Infinity : dt * 1.4;
    const d = target - g.position.x;
    g.position.x = Math.abs(d) <= step ? target : g.position.x + Math.sign(d) * step;
  });
  return (
    <group ref={group} position={start}>
      <mesh geometry={shelfModel()} material={vertexToon} castShadow receiveShadow />
      <LeverBook open={open} />
    </group>
  );
}
