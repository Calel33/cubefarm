// π o'clock (#266): at 3:14 pm a big π sticker appears in the corner of every whiteboard (KanbanBoard.tsx).

import { SANS } from '../draw';
import { useCanvasTexture } from '../interact';
import { useSecrets } from './secretsState';

export function PiSticker({ position }: { position: [number, number, number] }) {
  const pi = useSecrets((s) => s.pi);
  return pi ? <Sticker position={position} /> : null;
}

function Sticker({ position }: { position: [number, number, number] }) {
  const tex = useCanvasTexture(
    256,
    256,
    (ctx) => {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(128, 128, 118, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e63946';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 180px ${SANS}`;
      ctx.fillText('π', 128, 136);
    },
    [],
  );
  return (
    <mesh position={position} rotation={[0, 0, 0.12]}>
      <planeGeometry args={[0.7, 0.7]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} />
    </mesh>
  );
}
