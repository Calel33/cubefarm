import { memo } from 'react';
import type { FloorLayout } from '../../../shared/floorLook';
import type { Agent } from '../store';
import { drawSign } from './draw';
import { useCanvasTexture } from './interact';
import { CUBICLE, LAYOUTS, PARTITION, deskPoint, type DeskPlace } from './layout';
import { shade } from './materials';
import { Box } from './Toon';

// The cubicle farm's low walls (#265): partitions from layout.ts (the colliders are the same rects), fabric panels in
// the floor's accent colour on a grey frame, and a name card on each cubicle's front post with whoever sits there.

/** One cubicle's name card, clipped to the top of its west wall's front end, facing the aisle. */
const NameCard = memo(function NameCard({ desk, name, accent }: { desk: DeskPlace; name: string | null; accent: string }) {
  const tex = useCanvasTexture(256, 96, (ctx) => drawSign(ctx, 256, 96, [{ text: name ?? 'vacant', size: name ? 40 : 34, color: name ? '#2d3142' : '#9a9cab', weight: 700 }], '#fffdf5'), [name]);
  const p = deskPoint(desk, -CUBICLE.w / 2 + 0.27, CUBICLE.front - 0.03);
  return (
    <group position={[p.x, PARTITION.h + 0.1, p.z]} rotation={[0, desk.rotY, 0]}>
      <Box size={[0.5, 0.2, 0.02]} position={[0, 0, -0.012]} color={accent} shadow={false} />
      <mesh>
        <planeGeometry args={[0.46, 0.17]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
});

export const Cubicles = memo(function Cubicles({ layout, accent, devBySlot }: { layout: FloorLayout; accent: string; devBySlot: Map<number, Agent> }) {
  const plan = LAYOUTS[layout];
  if (!plan.partitions.length) return null;
  const fabric = shade(accent, 0.35);
  return (
    <group>
      {plan.partitions.map((r, i) => {
        const w = r.maxX - r.minX;
        const d = r.maxZ - r.minZ;
        const h = r.h ?? PARTITION.h;
        const cx = (r.minX + r.maxX) / 2;
        const cz = (r.minZ + r.maxZ) / 2;
        return (
          <group key={i}>
            <Box size={[w, h - 0.06, d]} position={[cx, (h - 0.06) / 2, cz]} color={fabric} outline />
            <Box size={[w + 0.02, 0.06, d + 0.02]} position={[cx, h - 0.03, cz]} color="#8d99ae" outline shadow={false} />
          </group>
        );
      })}
      {layout === 'cubicles' && plan.desks.map((d, slot) => <NameCard key={slot} desk={d} name={devBySlot.get(slot)?.name ?? null} accent={accent} />)}
    </group>
  );
});
