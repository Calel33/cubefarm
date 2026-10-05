import { Component, lazy, Suspense, useMemo, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { activeMods, type ModThemeView } from '../../../shared/mods';
import { useStore } from '../store';
import { useTheme } from '../world/themes/active';
import { modPlacements, type ModPlacement } from './placing';
import { modelStatus } from './status';

// The mods in the 3D view (docs/mods.md): their props and posters on the floor you're on, and a mod's theme while it's
// on. The drawing is a lazy chunk (ModScene.tsx), loaded only once a switched-on mod has something to show, so an
// office without mods downloads none of it.

const ModScene = lazy(() => import('./ModScene'));

export type ModFloorKind = 'office' | 'lobby' | 'roof';

/** What the switched-on mods put on this floor kind (nothing on the roof), kept in step with Settings and the mods. */
export function useModPlacements(kind: ModFloorKind): ModPlacement[] {
  const mods = useStore((s) => s.mods);
  const theme = useTheme((s) => s.mod);
  const holiday = useTheme((s) => s.id);
  return useMemo(() => (kind === 'roof' ? [] : modPlacements(activeMods(mods), kind, theme, holiday)), [kind, mods, theme, holiday]);
}

/** A mod that fails to draw leaves the office as it is. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('a mod failed to draw', err);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

let shown: { kind: ModFloorKind; placed: ModPlacement[] } = { kind: 'lobby', placed: [] };
let camera: THREE.Camera | null = null;

export interface ModSceneProps {
  kind: ModFloorKind;
  placed: ModPlacement[];
  theme: ModThemeView | null;
}

export function ModLayer({ kind, placed }: { kind: ModFloorKind; placed: ModPlacement[] }) {
  const theme = useTheme((s) => s.mod);
  camera = useThree((s) => s.camera);
  shown = { kind, placed };
  if (!placed.length && !theme) return null;
  // a reload of the mods brings new items: drawing them afresh after a failure
  const key = useStore.getState().mods.scannedAt;
  return (
    <Quiet key={key}>
      <Suspense fallback={null}>
        <ModScene kind={kind} placed={placed} theme={theme} />
      </Suspense>
    </Quiet>
  );
}

// window.__swarmMods: what the mods put on this floor, how their models loaded, and here(): where you stand, as a mod's
// fixed point (x, z and the turn that faces you), for placing a poster or a prop.
if (typeof window !== 'undefined' && !Object.getOwnPropertyDescriptor(window, '__swarmMods')) {
  Object.defineProperty(window, '__swarmMods', {
    value: {
      get mods() {
        return useStore.getState().mods.mods.map((m) => ({ id: m.id, ok: m.ok, enabled: m.enabled, errors: m.errors }));
      },
      get theme() {
        return useTheme.getState().mod?.key ?? null;
      },
      get placed() {
        return shown.placed.map((p) => ({ key: p.item.kind === 'prop' ? p.item.prop.key : p.item.poster.key, kind: p.item.kind, where: p.where, x: p.x, y: p.y, z: p.z }));
      },
      get models() {
        return { ...modelStatus };
      },
      here() {
        if (!camera) return null;
        const f = { x: 0, y: 0, z: -1 };
        const e = camera.matrixWorld.elements;
        f.x = -e[8];
        f.z = -e[10];
        const turn = Math.round((Math.atan2(-f.x, -f.z) * 180) / Math.PI);
        const r = (n: number) => Math.round(n * 100) / 100;
        return { floor: shown.kind, x: r(camera.position.x), z: r(camera.position.z), turn };
      },
    },
    enumerable: false,
  });
}
