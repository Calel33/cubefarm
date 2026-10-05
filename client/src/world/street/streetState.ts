import { useStore } from '../../store';
import { leavePerch, perch } from '../perch';
import type { Pt } from '../toys/roombaBrain';
import { lunchVisits } from './lunchOut';
import { onPlaza } from './plaza';

// The street's state outside its lazily loaded scene (Street.tsx): the handler for E on its things, the people out on
// the plaza heading in through a door (Outside.tsx opens it for them), and window.__swarmStreet for QA and Playwright.
// Tiny, so floors that never see the street pay nothing for it.

/** People out on the plaza walking in (a passenger off the bus, someone back from lunch): their doors open for them. */
export const streetWalkers: Pt[] = [];

let handler: ((op: string) => void) | null = null;
let details: (() => Record<string, unknown>) | null = null;
let placer: ((x: number, z: number, yaw: number, pitch: number) => void) | null = null;

/** The mounted street takes E on its things (`op`: 'order', 'sit', 'read') and reports to the probe. */
export function mountStreet(act: (op: string) => void, report: () => Record<string, unknown>) {
  handler = act;
  details = report;
  return () => {
    if (handler !== act) return;
    handler = null;
    details = null;
    streetWalkers.length = 0;
  };
}

/** E (or a click) on one of the street's things. */
export const streetAction = (op: string) => handler?.(op);

/** Player.tsx: how to stand the player somewhere (the probe's `stand`, for QA and screenshots). */
export function setPlayerPlacer(fn: typeof placer) {
  placer = fn;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

const probe = {
  /** You're in the lobby, with the street mounted round it. */
  get here() {
    return details !== null;
  },
  /** Everything the mounted street reports: you, the people walking by, the bus, the truck, the pigeons, the lamps. */
  get live() {
    return details?.() ?? null;
  },
  /** What you're holding (food from the truck: { kind: 'food', dish, bites }). */
  get held() {
    return useStore.getState().held;
  },
  /** Who is out for lunch (whichever floor you're on). */
  get lunch() {
    return lunchVisits().map((v) => ({ ...v, in: Math.round((v.arrive - Date.now()) / 1000), for: Math.round((v.leave - Date.now()) / 1000) }));
  },
  /** Whether you're sitting under the park's tree. */
  get sitting() {
    return perch()?.id === 'street-tree';
  },
  /** Stands you at (x, z) in the lobby or out on the plaza, looking yawDeg (0 north, 90 west) and pitchDeg up. */
  stand(x: number, z: number, yawDeg = 0, pitchDeg = 0) {
    if (useStore.getState().floor !== 0) return false;
    leavePerch();
    placer?.(x, z, rad(yawDeg), rad(pitchDeg));
    return true;
  },
  /** Whether (x, z) is out on the plaza. */
  onPlaza,
  /** E at the truck's hatch: an order of whatever's on. */
  order() {
    streetAction('order');
  },
  /** Sits under the tree, as E on it does. */
  sit() {
    streetAction('sit');
  },
  /** Gets up from under the tree. */
  standUp() {
    leavePerch();
  },
  /** The next bus pulls in `seconds` from now. */
  callBus(seconds = 5) {
    streetAction(`bus:${seconds}`);
  },
  /** Sends `agentId` (someone free) out for lunch now, `seconds` long; works in the lobby only. */
  lunchOut(agentId: string, seconds?: number) {
    streetAction(`lunch:${agentId}:${seconds ?? ''}`);
  },
};

if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__swarmStreet = probe;
