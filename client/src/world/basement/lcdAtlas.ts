import * as THREE from 'three';
import { MAX_RACKS } from '../layout';

// Every rack's little LCD in one texture: a cell per rack, painted only when what that rack shows changes (a new
// teammate, a rename, a rack moving along its row), never per frame. The racks' LCD mesh (Racks.tsx) picks its cell.

export const LCD_COLS = 8;
export const LCD_ROWS = Math.ceil(MAX_RACKS / LCD_COLS);
const CW = 128;
const CH = 32;

export interface LcdAtlas {
  texture: THREE.CanvasTexture;
  /** Paints cell i (if it changed) with a label and a colour swatch. Call flush() after a batch of these. */
  paint(i: number, label: string, color: string, small: boolean): void;
  /** Uploads the texture if any cell changed. */
  flush(): void;
  /** How many times a cell was painted, for the probe. */
  paints(): number;
  dispose(): void;
}

export function lcdAtlas(): LcdAtlas {
  const canvas = document.createElement('canvas');
  canvas.width = CW * LCD_COLS;
  canvas.height = CH * LCD_ROWS;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0b1a14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const shown: string[] = [];
  let dirty = false;
  let count = 0;
  return {
    texture,
    paint(i, label, color, small) {
      const key = `${label}|${color}|${small}`;
      if (shown[i] === key) return;
      shown[i] = key;
      dirty = true;
      count++;
      const x = (i % LCD_COLS) * CW;
      const y = Math.floor(i / LCD_COLS) * CH;
      ctx.fillStyle = '#0b1a14';
      ctx.fillRect(x, y, CW, CH);
      ctx.fillStyle = color;
      ctx.fillRect(x + 4, y + 5, 10, CH - 10);
      ctx.fillStyle = small ? '#9ad7ff' : '#8dffb8';
      ctx.font = `bold ${small ? 20 : 19}px "Nunito", system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      let text = label;
      while (text.length > 1 && ctx.measureText(text).width > CW - 24) text = text.slice(0, -1);
      ctx.fillText(text === label ? label : `${text.slice(0, -1)}…`, x + 20, y + CH / 2 + 1);
    },
    flush() {
      if (!dirty) return;
      dirty = false;
      texture.needsUpdate = true;
    },
    paints: () => count,
    dispose: () => texture.dispose(),
  };
}
