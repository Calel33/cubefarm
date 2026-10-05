import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { reduceMotion } from '../../ui/a11y';
import { markBloom } from '../gfx/bloomMarks';
import { HALF_D, HALF_W, LOG_CRT, POWER_WALL, RACK, RACK_ROWS, WALL_H } from '../layout';
import { merged } from '../shapes';
import { roomLight } from './basementRules';
import { setMachineAlarm } from './machineSfx';
import { room, roomTime } from './roomClock';

// The server room's light: cool blue from strip lights over every aisle, a notch down while Claude's usage paces new
// work, and red emergency lighting with spinning beacons while it's paused. Eased in the frame loop on preallocated
// colours; the room's level is shared with the racks' LEDs and LCDs (room.ts). The scene's own background, fog and
// exposure are set here while the room is mounted, and put back after.

const COOL = { sky: new THREE.Color('#a9d4ff'), ground: new THREE.Color('#1b2233'), key: new THREE.Color('#dcecff'), strip: new THREE.Color('#d8ecff') };
const RED = { sky: new THREE.Color('#ff5a4a'), ground: new THREE.Color('#2a0c0c'), key: new THREE.Color('#ff7a6a'), strip: new THREE.Color('#ff3a2a') };

/** The strips: over each aisle in front of a line of racks, either side of the central aisle, and over the open floor. */
function stripsGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const zs = [...RACK_ROWS.zs.map((z) => z + RACK.d / 2 + 0.7), 7.4];
  for (const z of zs) for (const s of [-1, 1]) parts.push(new THREE.BoxGeometry(9, 0.05, 0.22).translate(s * 9, WALL_H - 0.04, z));
  parts.push(new THREE.BoxGeometry(0.22, 0.05, HALF_D * 2 - 4).translate(0, WALL_H - 0.04, -1));
  return merged(parts);
}

/** Where the emergency beacons hang: over the power wall and over the log CRT. */
const BEACONS: [number, number, number][] = [
  [-HALF_W + 0.25, WALL_H - 0.35, POWER_WALL.gauge.z],
  [HALF_W - 0.25, WALL_H - 0.35, LOG_CRT.z],
  [0, WALL_H - 0.35, -HALF_D + 0.25],
];

export function RoomLights() {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const beacons = useRef<THREE.Group>(null);
  const strips = useMemo(() => ({ geo: stripsGeometry(), mat: markBloom(new THREE.MeshBasicMaterial({ color: '#d8ecff', toneMapped: false })) }), []);
  const beaconMat = useMemo(() => markBloom(new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false, transparent: true, opacity: 0.85 })), []);
  const tmp = useMemo(() => new THREE.Color(), []);
  const usage = useStore((s) => s.usage.state);
  const target = useRef(roomLight(usage));
  target.current = roomLight(usage);
  useEffect(() => setMachineAlarm(usage === 'paused'), [usage]);

  useEffect(() => {
    const prev = { background: scene.background, fog: scene.fog, exposure: gl.toneMappingExposure };
    scene.background = new THREE.Color('#06090f');
    scene.fog = new THREE.Fog('#0a1220', 14, 42);
    gl.toneMappingExposure = 1;
    return () => {
      scene.background = prev.background;
      scene.fog = prev.fog;
      gl.toneMappingExposure = prev.exposure;
      setMachineAlarm(false);
      room.level = 1;
      room.emergency = 0;
    };
  }, [scene, gl]);
  useEffect(
    () => () => {
      strips.geo.dispose();
      strips.mat.dispose();
      beaconMat.dispose();
    },
    [strips, beaconMat],
  );

  useFrame((_, dt) => {
    const k = reduceMotion() ? 1 : 1 - Math.exp(-dt * 1.8);
    room.level += (target.current.level - room.level) * k;
    room.emergency += ((target.current.emergency ? 1 : 0) - room.emergency) * k;
    const e = room.emergency;
    const t = roomTime();
    // under the emergency lighting the red swells and falls with the alarm
    const swell = e > 0.01 ? 0.75 + 0.25 * Math.sin(t * 2) : 1;
    const L = room.level;
    if (hemi.current) {
      hemi.current.color.lerpColors(COOL.sky, RED.sky, e);
      hemi.current.groundColor.lerpColors(COOL.ground, RED.ground, e);
      hemi.current.intensity = 1.5 * L * swell;
    }
    if (amb.current) amb.current.intensity = 0.42 * L;
    if (key.current) {
      key.current.color.lerpColors(COOL.key, RED.key, e);
      key.current.intensity = 1.1 * L * (1 - 0.5 * e);
    }
    strips.mat.color.copy(tmp.lerpColors(COOL.strip, RED.strip, e)).multiplyScalar(L * (e > 0.5 ? swell * 0.7 : 1));
    const b = beacons.current;
    if (b) {
      b.visible = e > 0.05;
      if (b.visible && !reduceMotion()) for (const c of b.children) c.rotation.y = t * 3.2;
      beaconMat.opacity = 0.85 * e;
    }
  });

  return (
    <group>
      <hemisphereLight ref={hemi} args={['#a9d4ff', '#1b2233', 1.5]} />
      <ambientLight ref={amb} intensity={0.42} />
      <directionalLight ref={key} position={[4, 12, 6]} intensity={1.1} />
      <mesh geometry={strips.geo} material={strips.mat} />
      <group ref={beacons} visible={false}>
        {BEACONS.map((p) => (
          <group key={p.join()} position={p}>
            <mesh material={beaconMat} rotation={[0, 0, Math.PI / 2]} position={[0.25, 0, 0]}>
              <coneGeometry args={[0.22, 0.6, 12, 1, true]} />
            </mesh>
            <mesh material={beaconMat} rotation={[0, 0, -Math.PI / 2]} position={[-0.25, 0, 0]}>
              <coneGeometry args={[0.22, 0.6, 12, 1, true]} />
            </mesh>
            <mesh material={beaconMat}>
              <sphereGeometry args={[0.14, 12, 8]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
