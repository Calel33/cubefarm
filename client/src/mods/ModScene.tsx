import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ModPosterView, ModPropView, ModShape, ModThemeView } from '../../../shared/mods';
import { hashId } from '../world/appearance';
import { frameModel } from '../world/decor/models';
import { mergeParts, ramp, vertexToon, type Part } from '../world/decor/parts';
import { useTheme, useThemeRuntime, type CostumeProps } from '../world/themes/active';
import { costumeGeometry } from '../world/themes/kit/costumes';
import { paintedToonDouble } from '../world/themes/kit/geo';
import { Bunting, StringLights } from '../world/themes/kit/runs';
import { Tint } from '../world/themes/kit/Tint';
import type { Costume } from '../world/themes/themes';
import type { ModSceneProps } from './ModLayer';
import type { ModPlacement } from './placing';
import { modelStatus } from './status';

// The mods' lazy chunk (ModLayer.tsx loads it): props built from shapes (one instanced mesh per prop however many
// spots it fills), .glb models loaded once, made toon like the office and scaled to their height, posters in frames,
// and a mod theme's lights, bunting, tint and costumes. A model or picture that won't load shows a grey placeholder.

const deg = (d: number) => (d * Math.PI) / 180;
const PLACEHOLDER = new THREE.MeshToonMaterial({ color: '#adb5bd', gradientMap: ramp, transparent: true, opacity: 0.6 });

// ---------- shapes ----------

const UNIT: Record<ModShape['shape'], () => THREE.BufferGeometry> = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  sphere: () => new THREE.SphereGeometry(0.5, 16, 12),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
  cone: () => new THREE.ConeGeometry(0.5, 1, 16),
};

const shapeGeos = new Map<string, THREE.BufferGeometry>();

/** A shapes prop as one vertex-coloured geometry, built once per prop (and rebuilt if a reload changed it). */
function shapesGeometry(prop: ModPropView): THREE.BufferGeometry {
  const key = `${prop.key}|${JSON.stringify(prop.shapes)}`;
  let g = shapeGeos.get(key);
  if (!g) {
    const parts = (prop.shapes ?? []).map((s): Part => ({ geo: UNIT[s.shape](), color: s.color, at: s.at, rot: s.turn ? [deg(s.turn[0]), deg(s.turn[1]), deg(s.turn[2])] : undefined, scale: s.size }));
    g = mergeParts(parts);
    shapeGeos.set(key, g);
  }
  return g;
}

function ShapesProp({ prop, at }: { prop: ModPropView; at: ModPlacement[] }) {
  const geo = shapesGeometry(prop);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    at.forEach((p, i) => {
      o.position.set(p.x, p.y, p.z);
      o.rotation.set(0, p.rotY, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [at]);
  return <instancedMesh key={at.length} ref={ref} args={[geo, vertexToon, at.length]} castShadow receiveShadow />;
}

// ---------- models ----------

const loader = new GLTFLoader();
const models = new Map<string, Promise<THREE.Object3D>>();

/** A model's materials as toon ones, so it's shaded like everything else in the office. */
function toonify(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const swap = (m: THREE.Material) => {
      const src = m as THREE.MeshStandardMaterial;
      const out = new THREE.MeshToonMaterial({
        color: src.color ?? new THREE.Color('#ffffff'),
        map: src.map ?? null,
        gradientMap: ramp,
        vertexColors: src.vertexColors,
        transparent: src.transparent,
        opacity: src.opacity,
        alphaTest: src.alphaTest,
        side: src.side,
        emissive: src.emissive ?? new THREE.Color('#000000'),
        emissiveMap: src.emissiveMap ?? null,
      });
      m.dispose();
      return out;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
}

/** A .glb, loaded once per URL and height: toon, scaled to `height`, standing on y 0 and centred on its spot. */
function loadModel(url: string, height: number): Promise<THREE.Object3D> {
  const key = `${url}|${height}`;
  let p = models.get(key);
  if (!p) {
    modelStatus[url] = 'loading';
    p = loader.loadAsync(url).then((gltf) => {
      const root = gltf.scene;
      toonify(root);
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      if (!(size.y > 0) || !Number.isFinite(size.y)) throw new Error('the model has no height');
      root.scale.multiplyScalar(height / size.y);
      root.updateMatrixWorld(true);
      box.setFromObject(root);
      const c = box.getCenter(new THREE.Vector3());
      root.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
      const group = new THREE.Group();
      group.add(root);
      modelStatus[url] = 'loaded';
      return group;
    });
    p.catch((err) => {
      modelStatus[url] = 'failed';
      console.warn(`mod model ${url} failed to load`, err);
    });
    models.set(key, p);
  }
  return p;
}

function Placeholder({ w, h, d }: { w: number; h: number; d: number }) {
  return (
    <mesh position={[0, h / 2, 0]} material={PLACEHOLDER}>
      <boxGeometry args={[w, h, d]} />
    </mesh>
  );
}

function ModelProp({ prop, at }: { prop: ModPropView; at: ModPlacement }) {
  const [obj, setObj] = useState<THREE.Object3D | 'failed' | null>(null);
  useEffect(() => {
    let live = true;
    loadModel(prop.model!, prop.height).then(
      (o) => live && setObj(o.clone(true)),
      () => live && setObj('failed'),
    );
    return () => {
      live = false;
    };
  }, [prop.model, prop.height]);
  const [w, d] = prop.footprint ?? [0.5, 0.5];
  return (
    <group position={[at.x, at.y, at.z]} rotation={[0, at.rotY, 0]}>
      {obj === 'failed' ? <Placeholder w={w} h={prop.height} d={d} /> : obj ? <primitive object={obj} /> : null}
    </group>
  );
}

// ---------- posters ----------

const textures = new Map<string, Promise<THREE.Texture>>();

function loadTexture(url: string): Promise<THREE.Texture> {
  let p = textures.get(url);
  if (!p) {
    p = new THREE.TextureLoader().loadAsync(url).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    });
    p.catch((err) => console.warn(`mod picture ${url} failed to load`, err));
    textures.set(url, p);
  }
  return p;
}

function Poster({ poster, at }: { poster: ModPosterView; at: ModPlacement }) {
  const [tex, setTex] = useState<THREE.Texture | 'failed' | null>(null);
  useEffect(() => {
    let live = true;
    loadTexture(poster.image).then(
      (t) => live && setTex(t),
      () => live && setTex('failed'),
    );
    return () => {
      live = false;
    };
  }, [poster.image]);
  const { width: w, height: h, frame } = poster;
  const inset = frame ? 0.1 : 0;
  return (
    <group position={[at.x, at.y, at.z]} rotation={[0, at.rotY, 0]}>
      {frame && <mesh geometry={frameModel(w, h)} material={vertexToon} />}
      <mesh position={[0, 0, frame ? 0.047 : 0.01]} material={tex === 'failed' || !tex ? PLACEHOLDER : undefined}>
        <planeGeometry args={[w - inset, h - inset]} />
        {tex && tex !== 'failed' && <meshToonMaterial map={tex} gradientMap={ramp} />}
      </mesh>
    </group>
  );
}

// ---------- a mod theme ----------

/** One person's costume from the mod theme on now: picked from their id, the same in every browser. */
function ModCostume({ agent, look, part }: CostumeProps) {
  const theme = useTheme((s) => s.mod);
  const list = theme?.costumes[agent.role] ?? [];
  if (!theme || !list.length) return null;
  const c: Costume = list[hashId(`${theme.key}:${agent.id}`) % list.length];
  const geo = costumeGeometry(c, part, look, hashId(agent.id));
  return geo ? <mesh geometry={geo} material={paintedToonDouble()} castShadow /> : null;
}

function ModTheme({ theme, kind }: { theme: ModThemeView; kind: ModSceneProps['kind'] }) {
  const tint = useMemo(() => ({ tint: theme.tint, sky: theme.sky ?? undefined }), [theme]);
  const costumes = theme.costumes.dev.length + theme.costumes.qa.length + theme.costumes.ceo.length > 0;
  useEffect(() => {
    useThemeRuntime.setState({ status: `${theme.emoji} ${theme.name}`, ...(costumes && { costume: ModCostume }) });
    return () => {
      const rt = useThemeRuntime.getState();
      useThemeRuntime.setState({ status: null, costume: rt.costume === ModCostume ? null : rt.costume });
    };
  }, [theme, costumes]);
  return (
    <>
      <Tint def={tint} />
      {kind !== 'roof' && theme.lights && <StringLights kind={kind} colors={theme.lights} />}
      {kind !== 'roof' && theme.bunting && <Bunting kind={kind} colors={theme.bunting} />}
    </>
  );
}

// ---------- the floor ----------

export default function ModScene({ kind, placed, theme }: ModSceneProps) {
  const groups = useMemo(() => {
    const shapes = new Map<string, { prop: ModPropView; at: ModPlacement[] }>();
    const single: ModPlacement[] = [];
    for (const p of placed) {
      if (p.item.kind === 'prop' && !p.item.prop.model) {
        const g = shapes.get(p.item.prop.key) ?? { prop: p.item.prop, at: [] };
        g.at.push(p);
        shapes.set(p.item.prop.key, g);
      } else single.push(p);
    }
    return { shapes: [...shapes.values()], single };
  }, [placed]);
  return (
    <group name="mods">
      {groups.shapes.map((g) => (
        <ShapesProp key={g.prop.key} prop={g.prop} at={g.at} />
      ))}
      {groups.single.map((p) =>
        p.item.kind === 'prop' ? <ModelProp key={`${p.item.prop.key}@${p.where}`} prop={p.item.prop} at={p} /> : <Poster key={`${p.item.poster.key}@${p.where}`} poster={p.item.poster} at={p} />,
      )}
      {theme && <ModTheme key={theme.key} theme={theme} kind={kind} />}
    </group>
  );
}
