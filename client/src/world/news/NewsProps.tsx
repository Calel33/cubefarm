// Company news in the building (#268): the folded Gazette (each floor's coffee table, the lobby's reception desk; E
// opens it), the radio on the reception desk (E reads the morning bulletin, or stops it) and the headline strip on
// the desk's front, the lobby's newsstand.
import { useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { useStore } from '../../store';
import { radioPlaying, radioVersion, subscribeRadio } from '../../ui/radio';
import { useCanvasTexture, useInteractable } from '../interact';
import { glow } from '../materials';
import { Box, Cyl } from '../Toon';
import { drawHeadlineStrip, drawPaper } from './drawNews';

/** The newest edition's headline (the daily first). */
function useHeadline() {
  return useStore((s) => (s.news.editions.find((e) => e.kind === 'daily') ?? s.news.editions[0])?.headline ?? null);
}

/** A folded newspaper lying on a table; `where` names it for the crosshair. */
export function Newspaper({ position, rotationY = 0, where }: { position: [number, number, number]; rotationY?: number; where: string }) {
  const company = useStore((s) => s.settings.companyName) || 'cubefarm';
  const headline = useHeadline();
  const ref = useInteractable<THREE.Group>({ id: `gazette-${where}`, label: 'Read the Gazette', action: { kind: 'gazette' } }, 2.8);
  const tex = useCanvasTexture(512, 360, (ctx) => drawPaper(ctx, 512, 360, company, headline ?? ''), [company, headline]);
  return (
    <group ref={ref} position={position} rotation={[0, rotationY, 0]}>
      <Box size={[0.44, 0.014, 0.31]} position={[0, 0.007, 0]} color="#e9e2cf" outline />
      <Box size={[0.42, 0.006, 0.29]} position={[0.012, 0.017, -0.006]} color="#ddd5bf" shadow={false} />
      <mesh position={[0.012, 0.0205, -0.006]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.4, 0.28]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** The reception desk's radio: a little retro set with a dial that glows while it plays. */
export function Radio({ position }: { position: [number, number, number] }) {
  useSyncExternalStore(subscribeRadio, radioVersion);
  const on = !!radioPlaying();
  const ref = useInteractable<THREE.Group>({ id: 'radio', label: on ? 'Turn the radio off' : 'Hear the morning news on the radio', action: { kind: 'radio' } }, 3);
  return (
    <group ref={ref} position={position} rotation={[0, 0.25, 0]}>
      <Box size={[0.4, 0.22, 0.16]} position={[0, 0.11, 0]} color="#d1495b" outline />
      <Box size={[0.42, 0.03, 0.18]} position={[0, 0.235, 0]} color="#8d5a3b" outline />
      <mesh position={[-0.08, 0.11, 0.081]}>
        <circleGeometry args={[0.07, 20]} />
        <meshBasicMaterial color="#3d2b1f" />
      </mesh>
      {on ? (
        <mesh position={[0.11, 0.13, 0.081]} material={glow('#ffd166')}>
          <planeGeometry args={[0.13, 0.06]} />
        </mesh>
      ) : (
        <mesh position={[0.11, 0.13, 0.081]}>
          <planeGeometry args={[0.13, 0.06]} />
          <meshBasicMaterial color="#f4eedf" />
        </mesh>
      )}
      <Cyl r={0.018} h={0.02} position={[0.08, 0.06, 0.085]} color="#2b2d42" />
      <Cyl r={0.018} h={0.02} position={[0.14, 0.06, 0.085]} color="#2b2d42" />
      <group position={[0.15, 0.25, -0.04]} rotation={[0, 0, -0.5]}>
        <Cyl r={0.005} h={0.3} position={[0, 0.15, 0]} color="#adb5bd" />
      </group>
    </group>
  );
}

/** The newsstand: today's headline along the front of the reception desk (`width` metres wide, facing +z). */
export function HeadlineStrip({ position, width }: { position: [number, number, number]; width: number }) {
  const headline = useHeadline();
  const px = [1600, 120] as const;
  const tex = useCanvasTexture(px[0], px[1], (ctx) => drawHeadlineStrip(ctx, px[0], px[1], headline), [headline]);
  return (
    <mesh position={position}>
      <planeGeometry args={[width, (width * px[1]) / px[0]]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}
