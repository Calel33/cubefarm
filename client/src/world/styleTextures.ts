// The floor makeovers' canvas textures (#265): floors (planks, concrete, tiles, carpet) and brick walls, drawn once per
// pattern and colour and shared by every floor that uses them, with world-scaled UVs for the walls so bricks keep
// their size on every piece of wall.

import * as THREE from 'three';
import type { FloorPattern } from './floorStyles';
import { shade, toonMap } from './materials';

const textures = new Map<string, THREE.CanvasTexture>();

function canvasTexture(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, n: number) => void, repeat: [number, number]) {
  let tex = textures.get(key);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.anisotropy = 8;
  textures.set(key, tex);
  return tex;
}

/** A tiny, repeatable pseudo-random sequence, so a texture is the same every time it's drawn. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Cartoon wood planks (the classic office's, unchanged). */
function planks(ctx: CanvasRenderingContext2D, n: number, color: string) {
  const plankH = 64;
  for (let row = 0; row < n / plankH; row++) {
    const offset = (row * 173) % n;
    for (let x = -offset; x < n; x += 256) {
      const v = ((row * 7 + Math.floor((x + offset) / 256) * 3) % 5) * 0.012 - 0.024;
      ctx.fillStyle = shade(color, v);
      ctx.fillRect(x, row * plankH, 256, plankH);
      ctx.fillStyle = shade(color, -0.1);
      ctx.fillRect(x, row * plankH, 3, plankH);
      ctx.fillStyle = shade(color, v - 0.035);
      for (let g = 0; g < 3; g++) ctx.fillRect(x + 30 + g * 70, row * plankH + 18 + g * 12, 60, 2);
    }
    ctx.fillStyle = shade(color, -0.12);
    ctx.fillRect(0, row * plankH, n, 3);
  }
}

/** Poured concrete: soft blotches, speckles and a saw cut every slab. */
function concrete(ctx: CanvasRenderingContext2D, n: number, color: string) {
  const r = seeded(7);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, n, n);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = shade(color, (r() - 0.5) * 0.08);
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(r() * n, r() * n, 20 + r() * 60, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = shade(color, r() < 0.5 ? -0.18 : 0.12);
    ctx.fillRect(r() * n, r() * n, 2, 2);
  }
  ctx.fillStyle = shade(color, -0.22);
  ctx.fillRect(0, 0, n, 3);
  ctx.fillRect(0, 0, 3, n);
}

/** Square tiles with a light grout, and a sheen across each (the neon floor's gloss, the greenhouse's terracotta). */
function tiles(ctx: CanvasRenderingContext2D, n: number, color: string, glossy: boolean) {
  const t = n / 4;
  ctx.fillStyle = glossy ? shade(color, 0.25) : shade(color, 0.18);
  ctx.fillRect(0, 0, n, n);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const v = (((x * 3 + y * 5) % 4) - 1.5) * 0.02;
      ctx.fillStyle = shade(color, v);
      ctx.fillRect(x * t + 3, y * t + 3, t - 6, t - 6);
      if (glossy) {
        // a cartoon highlight: a pale diagonal stripe across the tile
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.beginPath();
        ctx.moveTo(x * t + t * 0.15, y * t + t * 0.85);
        ctx.lineTo(x * t + t * 0.35, y * t + t * 0.85);
        ctx.lineTo(x * t + t * 0.85, y * t + t * 0.35);
        ctx.lineTo(x * t + t * 0.85, y * t + t * 0.15);
        ctx.fill();
      }
    }
}

/** Wall-to-wall carpet: a fine weave and a faint diamond pattern. */
function carpet(ctx: CanvasRenderingContext2D, n: number, color: string) {
  const r = seeded(11);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, n, n);
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = shade(color, (r() - 0.5) * 0.12);
    ctx.fillRect(r() * n, r() * n, 2, 2);
  }
  ctx.strokeStyle = shade(color, 0.12);
  ctx.lineWidth = 3;
  const d = n / 4;
  for (let i = -4; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * d, 0);
    ctx.lineTo(i * d + n, n);
    ctx.moveTo(i * d, n);
    ctx.lineTo(i * d + n, 0);
    ctx.stroke();
  }
}

/** The floor's texture for a pattern and colour, repeated over the whole 32 x 24 m floor. */
export function floorTexture(pattern: FloorPattern, color: string, glossy = false) {
  return canvasTexture(
    `floor|${pattern}|${color}|${+glossy}`,
    512,
    (ctx, n) => {
      if (pattern === 'planks') planks(ctx, n, color);
      else if (pattern === 'concrete') concrete(ctx, n, color);
      else if (pattern === 'tiles') tiles(ctx, n, color, glossy);
      else carpet(ctx, n, color);
    },
    pattern === 'planks' ? [8, 6] : pattern === 'concrete' ? [4, 3] : pattern === 'tiles' ? [12, 9] : [10, 7.5],
  );
}

/** Metres of wall one repeat of the brick texture covers. */
const BRICK_TILE = 1.6;

/** Brick, white-ish mortar between: a shared material for every brick wall (its geometry needs worldUVs). */
export function brickMaterial(brick: string, mortar: string) {
  const tex = canvasTexture(
    `brick|${brick}|${mortar}`,
    256,
    (ctx, n) => {
      const r = seeded(3);
      ctx.fillStyle = mortar;
      ctx.fillRect(0, 0, n, n);
      const rows = 8;
      const h = n / rows;
      const w = n / 4;
      for (let row = 0; row < rows; row++) {
        const off = row % 2 ? w / 2 : 0;
        for (let x = -off; x < n; x += w) {
          ctx.fillStyle = shade(brick, (r() - 0.5) * 0.16);
          ctx.fillRect(x + 3, row * h + 3, w - 6, h - 6);
        }
      }
    },
    [1, 1],
  );
  return toonMap(`brick|${brick}|${mortar}`, tex);
}

/**
 * Sets a box-made geometry's UVs from where each face is in the room (BRICK_TILE metres a repeat), so a texture keeps
 * its scale across wall pieces of every size. Returns the geometry.
 */
export function worldUVs(g: THREE.BufferGeometry, tile = BRICK_TILE) {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const nz = Math.abs(nor.getZ(i));
    const ny = Math.abs(nor.getY(i));
    const [u, v] = ny > nx && ny > nz ? [pos.getX(i), pos.getZ(i)] : nx > nz ? [pos.getZ(i), pos.getY(i)] : [pos.getX(i), pos.getY(i)];
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
