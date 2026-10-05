import * as THREE from 'three';
import { markBloom } from '../gfx/bloomMarks';
import { SPIN_DOWN, SPIN_UP } from './basementRules';

// The server room's own materials, so its hundreds of lights cost one uniform a frame: every rack's LEDs blink, its LCD
// dims and both spin down in the shader from per-instance attributes (basementRules.ts's powerAt, the same sums), set
// only when a rack's state changes. uTime is the room's clock in seconds; uLevel is the room's light (pacing dims it).

/** The power ramp, as basementRules.ts's powerAt: aPower = (from, to, t0). */
const POWER = /* glsl */ `
  attribute vec3 aPower;
  uniform float uTime;
  float powerNow() {
    float dur = aPower.y > aPower.x ? ${SPIN_UP.toFixed(2)} : ${SPIN_DOWN.toFixed(2)};
    return mix(aPower.x, aPower.y, clamp((uTime - aPower.z) / dur, 0.0, 1.0));
  }
`;

/**
 * The LEDs: aColor (linear), aBlink = (hz, phase, duty, floor). A light is lit by its rack's power, at least `floor`
 * (an error's red stays lit with the rack off), and blinks at hz (0: steady).
 */
export function ledMaterial() {
  return markBloom(
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uLevel: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute vec4 aBlink;
        uniform float uLevel;
        ${POWER}
        varying vec3 vColor;
        void main() {
          float on = aBlink.x > 0.0 ? step(fract(uTime * aBlink.x + aBlink.y), aBlink.z) : 1.0;
          float lit = max(aBlink.w, powerNow()) * on;
          vColor = aColor * (0.06 + 0.94 * lit) * (0.55 + 0.45 * uLevel);
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor, 1.0);
          #include <colorspace_fragment>
        }`,
      toneMapped: false,
    }),
  );
}

/** The racks' LCDs: one atlas (lcdAtlas.ts), aCell = its cell's (column, row); the backlight dims as a rack spins down. */
export function lcdMaterial(map: THREE.Texture, cols: number, rows: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLevel: { value: 1 }, uMap: { value: map }, uGrid: { value: new THREE.Vector2(cols, rows) } },
    vertexShader: /* glsl */ `
      attribute vec2 aCell;
      uniform vec2 uGrid;
      ${POWER}
      varying vec2 vUv;
      varying float vLit;
      void main() {
        vUv = vec2((aCell.x + uv.x) / uGrid.x, 1.0 - (aCell.y + 1.0 - uv.y) / uGrid.y);
        vLit = 0.3 + 0.7 * powerNow();
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uLevel;
      varying vec2 vUv;
      varying float vLit;
      void main() {
        vec4 c = texture2D(uMap, vUv);
        gl_FragColor = vec4(c.rgb * vLit * (0.6 + 0.4 * uLevel), 1.0);
        #include <colorspace_fragment>
      }`,
    toneMapped: false,
  });
}

/** The chilled air coming up through the vents: soft round puffs, each rising and fading on its own loop (aSeed = x, z, phase, speed). */
export function mistMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#cfe8ff') } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime;
      varying vec2 vUv;
      varying float vAlpha;
      void main() {
        float t = fract(uTime * aSeed.w + aSeed.z);
        vec3 at = vec3(aSeed.x + sin(t * 6.0 + aSeed.z * 9.0) * 0.12, 0.08 + t * 1.5, aSeed.y);
        vec4 mv = modelViewMatrix * vec4(at, 1.0);
        mv.xy += position.xy * (0.35 + 0.65 * t);
        vUv = uv;
        vAlpha = sin(3.14159 * t) * 0.22;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vAlpha;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = vAlpha * smoothstep(1.0, 0.1, d);
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
}
