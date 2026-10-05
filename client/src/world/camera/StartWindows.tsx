import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CEO_ID } from '../../../../shared/types';
import { useStore } from '../../store';
import { markBloom } from '../gfx/bloomMarks';
import { effectiveTier, useGfx } from '../gfx/useGraphics';
import { ROOF, viewElevation } from '../layout';
import { merged } from '../shapes';
import { nightFactor } from '../sky/time';
import { dayTime } from '../sky/useDayTime';
import { ORBIT_TIER } from './cinemaPaths';
import { chipFor } from './overviewInfo';
import { facadeFloors, facadeWindows, floorActivity, isLit, litShare, paneColor, paneOpacity, silhouetteCount } from './windowLights';

// The tower's windows while the start screen orbits it and the intro flies in (CinemaCamera.tsx mounts this only then, so it
// costs nothing once you're in): each floor's windows lit by how busy its people are, brighter after dark, with tiny
// silhouettes walking past the lit ones (none on Low). Two instanced draw calls; windowLights.ts has the rules.

/** Each floor's [busy, team] as a string, so this re-renders only when someone starts or stops work. */
function activityKey(s: ReturnType<typeof useStore.getState>) {
  const counts = new Map<number, [number, number]>();
  const floorOf = new Map(s.repos.map((r) => [r.id, r.floor]));
  for (const a of Object.values(s.agents)) {
    const f = a.id === CEO_ID || a.role === 'ceo' ? 0 : floorOf.get(a.repoId ?? '');
    if (f === undefined) continue;
    const c = counts.get(f) ?? [0, 0];
    const chip = chipFor(a);
    if (chip !== 'idle' && chip !== 'error') c[0]++;
    c[1]++;
    counts.set(f, c);
  }
  return [...counts].sort((a, b) => a[0] - b[0]).map(([f, [b, t]]) => `${f}:${b}/${t}`).join(',');
}

function parseKey(key: string) {
  const out = new Map<number, { busy: number; team: number }>();
  for (const part of key.split(',')) {
    const m = /^(-?\d+):(\d+)\/(\d+)$/.exec(part);
    if (m) out.set(Number(m[1]), { busy: Number(m[2]), team: Number(m[3]) });
  }
  return out;
}

/** Someone seen through a window from the street: head and shoulders, from the sill up. */
const personGeometry = () => merged([new THREE.PlaneGeometry(0.44, 0.5).translate(0, 0.25, 0), new THREE.CircleGeometry(0.12, 14).translate(0, 0.64, 0)]);

/** What's lit right now, for the probe (window.__swarmCinema.state().windows). */
export const windowsShown = { panes: 0, lit: 0, silhouettes: 0, byFloor: {} as Record<number, { lit: number; panes: number }> };

const dummy = new THREE.Object3D();
const tint = new THREE.Color();
const rgb = [0, 0, 0];

/** Puts window `w`'s pane in place (or out of sight, scaled to nothing). */
function placePane(m: THREE.InstancedMesh, i: number, w: { x: number; y: number; z: number; w: number; h: number; rotY: number }, shown: boolean) {
  dummy.position.set(w.x, w.y, w.z);
  dummy.rotation.set(0, w.rotY, 0);
  dummy.scale.set(shown ? w.w : 0, shown ? w.h : 0, 1);
  dummy.updateMatrix();
  m.setMatrixAt(i, dummy.matrix);
}

export function StartWindows() {
  const floor = useStore((s) => s.floor);
  const top = useStore((s) => s.repos.reduce((m, r) => Math.max(m, r.floor), 0));
  const key = useStore(activityKey);
  const tier = useGfx((s) => effectiveTier(s));
  const perWindow = ORBIT_TIER[tier].silhouettes;

  const windows = useMemo(() => facadeWindows(facadeFloors(floor === ROOF ? -1 : floor, top)), [floor, top]);
  // which windows are lit, and who walks past which
  const plan = useMemo(() => {
    const activity = parseKey(key);
    const lit: boolean[] = [];
    const level: number[] = [];
    const walkers: { win: number; phase: number; speed: number }[] = [];
    const seen = new Map<number, number>();
    const byFloor = new Map<number, number[]>();
    windows.forEach((w, i) => {
      const n = seen.get(w.floor) ?? 0;
      seen.set(w.floor, n + 1);
      const a = activity.get(w.floor) ?? { busy: 0, team: 0 };
      const act = floorActivity(a.busy, a.team);
      const on = isLit(w.floor, n, litShare(act, a.team));
      lit.push(on);
      level.push(act);
      if (on) byFloor.set(w.floor, [...(byFloor.get(w.floor) ?? []), i]);
    });
    for (const [f, wins] of byFloor) {
      const a = activity.get(f) ?? { busy: 0, team: 0 };
      const n = silhouetteCount(a.busy, wins.length, perWindow);
      for (let k = 0; k < n; k++) walkers.push({ win: wins[k % wins.length], phase: (k * 2.39 + f) % (Math.PI * 2), speed: 0.25 + ((k * 0.37 + f * 0.11) % 0.3) });
    }
    windowsShown.panes = windows.length;
    windowsShown.lit = lit.filter(Boolean).length;
    windowsShown.silhouettes = walkers.length;
    windowsShown.byFloor = {};
    windows.forEach((w, i) => {
      const f = (windowsShown.byFloor[w.floor] ??= { lit: 0, panes: 0 });
      f.panes++;
      if (lit[i]) f.lit++;
    });
    return { lit, level, walkers };
  }, [windows, key, perWindow]);

  const glow = useRef<THREE.InstancedMesh>(null);
  const lastNight = useRef(-1);
  const people = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => ({ pane: new THREE.PlaneGeometry(1, 1), person: personGeometry() }), []);
  const mats = useMemo(
    () => ({
      glow: markBloom(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, toneMapped: false }), 'night'),
      person: new THREE.MeshBasicMaterial({ color: '#2a2238', transparent: true, opacity: 0.82, depthWrite: false }),
    }),
    [],
  );
  useEffect(
    () => () => {
      geo.pane.dispose();
      geo.person.dispose();
      mats.glow.dispose();
      mats.person.dispose();
    },
    [geo, mats],
  );

  // the panes: placed once per layout
  useLayoutEffect(() => {
    const m = glow.current;
    if (!m) return;
    windows.forEach((w, i) => {
      placePane(m, i, w, false);
      m.setColorAt(i, tint.setRGB(0, 0, 0));
    });
    m.count = windows.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    lastNight.current = -1;
  }, [windows]);

  useEffect(() => {
    lastNight.current = -1;
  }, [plan]);

  useFrame(({ clock }) => {
    const m = glow.current;
    if (m) {
      // the lights: redone when the plan changes or the sky has moved on a little
      const night = nightFactor(dayTime.t);
      if (Math.abs(night - lastNight.current) > 0.02) {
        lastNight.current = night;
        for (let i = 0; i < windows.length; i++) {
          const shown = paneColor(plan.lit[i], plan.level[i], night, rgb);
          placePane(m, i, windows[i], shown);
          // a little variety from window to window
          const k = plan.lit[i] ? 0.88 + 0.24 * ((i * 0.618) % 1) : 1;
          m.setColorAt(i, tint.setRGB(rgb[0] * k, rgb[1] * k, rgb[2] * k));
        }
        mats.glow.opacity = paneOpacity(night);
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
    const p = people.current;
    if (!p) return;
    const t = clock.elapsedTime;
    plan.walkers.forEach((wk, i) => {
      const w = windows[wk.win];
      const along = Math.sin(t * wk.speed + wk.phase) * Math.max(0, w.w / 2 - 0.35);
      const c = Math.cos(w.rotY);
      const s = Math.sin(w.rotY);
      dummy.position.set(w.x + along * c + s * 0.012, w.y - w.h / 2, w.z - along * s + c * 0.012);
      dummy.rotation.set(0, w.rotY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      p.setMatrixAt(i, dummy.matrix);
    });
    p.count = plan.walkers.length;
    p.instanceMatrix.needsUpdate = true;
  });

  const cap = Math.max(1, windows.length * 2);
  return (
    <group position={[0, -viewElevation(floor, top), 0]}>
      <instancedMesh key={`g${windows.length}`} ref={glow} args={[geo.pane, mats.glow, Math.max(1, windows.length)]} frustumCulled={false} renderOrder={2} />
      <instancedMesh key={`p${cap}`} ref={people} args={[geo.person, mats.person, cap]} frustumCulled={false} renderOrder={3} />
    </group>
  );
}
