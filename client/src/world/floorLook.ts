// Floor makeovers on screen (#265): which style and layout an office floor shows (its own, saved with the floor, or
// ?style= / ?layout= for QA, or a preview from window.__swarmFloorStyle), and a note of a layout change on the floor
// you're on, so the errand director has everyone stand up and walk from their old desk to their new one. Pure but for
// the override's store; window.__swarmFloorStyle is in floorStyleProbe.ts.

import { create } from 'zustand';
import { cleanFloorLook, isFloorLayout, isFloorStyle, type FloorLayout, type FloorStyle } from '../../../shared/floorLook';

export interface OfficeLook {
  style: FloorStyle;
  layout: FloorLayout;
}

/** Overrides of every office floor's look, from the address bar or the probe; unset ones follow the floor. */
export interface LookOverride {
  style?: FloorStyle;
  layout?: FloorLayout;
}

/** What ?style= and ?layout= ask for (unknown values are ignored). */
export function overrideFrom(search: string): LookOverride {
  const q = new URLSearchParams(search);
  const style = q.get('style');
  const layout = q.get('layout');
  return { ...(isFloorStyle(style) ? { style } : {}), ...(isFloorLayout(layout) ? { layout } : {}) };
}

/** A floor's look: its own (an older office's floors have none: classic, open plan), overridden where asked. */
export function lookFor(repo: { style?: unknown; layout?: unknown }, over: LookOverride): OfficeLook {
  const own = cleanFloorLook(repo);
  return { style: over.style ?? own.style, layout: over.layout ?? own.layout };
}

export const useLookOverride = create<{ over: LookOverride }>(() => ({ over: typeof location !== 'undefined' ? overrideFrom(location.search) : {} }));

// ---------- moving desks ----------

let last: { repoId: string; layout: FloorLayout } | null = null;
const moves = new Map<string, FloorLayout>();

/**
 * Called with the office floor on screen and its layout as it's drawn: when the floor stays the same and its layout
 * changes, remembers the layout people were sitting in. Arriving on a floor (whatever happened there meanwhile) doesn't.
 */
export function noteLayout(repoId: string, layout: FloorLayout) {
  if (last && last.repoId === repoId && last.layout !== layout) moves.set(repoId, last.layout);
  last = { repoId, layout };
}

/** The layout this floor's people were just sitting in, if it changed under them; asked once (by the errand director). */
export function takeLayoutMove(repoId: string): FloorLayout | undefined {
  const from = moves.get(repoId);
  moves.delete(repoId);
  return from;
}
