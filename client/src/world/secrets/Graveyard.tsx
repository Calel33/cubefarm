// A little graveyard in the lobby's quiet corner (#266): a gravestone for each of the latest issues closed as not
// planned, across every floor ("RIP #192"). E on one says what it was.

import { memo, useMemo } from 'react';
import * as THREE from 'three';
import { useStore } from '../../store';
import { SANS } from '../draw';
import { useCanvasTexture, useInteractable } from '../interact';
import { Box, Cyl } from '../Toon';
import { GRAVES, graveSpot } from './room';

interface Grave {
  key: string;
  number: number;
  title: string;
  repo: string;
}

const Stone = memo(function Stone({ grave, i }: { grave: Grave; i: number }) {
  const p = graveSpot(i);
  const ref = useInteractable<THREE.Group>({ id: `grave:${grave.key}`, label: `🪦 RIP #${grave.number}`, action: { kind: 'secret', op: 'grave', id: `RIP #${grave.number} · ${grave.title} (${grave.repo}): closed as not planned` } }, 3);
  const tex = useCanvasTexture(
    256,
    256,
    (ctx) => {
      ctx.fillStyle = '#4a4e69';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 64px ${SANS}`;
      ctx.fillText('RIP', 128, 82);
      ctx.font = `700 54px ${SANS}`;
      ctx.fillText(`#${grave.number}`, 128, 160);
    },
    [grave.number],
  );
  return (
    <group ref={ref} position={[p.x, 0, p.z]} rotation={[0, Math.PI / 2 + ((i * 13) % 5 - 2) * 0.05, 0]}>
      <Box size={[0.42, 0.42, 0.1]} position={[0, 0.21, 0]} color="#adb5bd" outline />
      <Cyl r={0.21} h={0.1} position={[0, 0.42, 0]} rotation={[Math.PI / 2, 0, 0]} color="#adb5bd" outline />
      <Box size={[0.55, 0.05, 0.3]} position={[0, 0.025, 0.05]} color="#6a994e" shadow={false} />
      <mesh position={[0, 0.34, 0.052]}>
        <planeGeometry args={[0.36, 0.36]} />
        <meshBasicMaterial map={tex} transparent />
      </mesh>
    </group>
  );
});

export function Graveyard() {
  const repos = useStore((s) => s.repos);
  const graves = useMemo(
    () =>
      repos
        .flatMap((r) => (r.rip ?? []).map((g) => ({ key: `${r.id}#${g.number}`, number: g.number, title: g.title, repo: r.fullName.split('/').pop() ?? r.fullName })))
        .slice(0, GRAVES.max),
    [repos],
  );
  return (
    <group>
      {graves.map((g, i) => (
        <Stone key={g.key} grave={g} i={i} />
      ))}
    </group>
  );
}
