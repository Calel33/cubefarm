import { api } from '../../api';
import { useStore } from '../../store';
import { BASEMENT } from '../layout';
import { agentRackState, meterReading, planRacks, previewRackState, roomLight, segmentCounts, type RackPlan } from './basementRules';

// The basement's state outside its lazily loaded room (Basement.tsx): the rack plan from the store (Game.tsx's colliders
// need it before the room loads), and window.__swarmBasement for QA and Playwright. Tiny, so floors that never go
// down pay nothing for it.

type S = ReturnType<typeof useStore.getState>;

let last: { agents: S['agents']; repos: S['repos']; previews: S['prPreviews']; plan: RackPlan } | null = null;

/** The racks for the office as it is now (worked out again only when agents, floors or PR previews change). */
export function basementPlan(s: S = useStore.getState()): RackPlan {
  if (last && last.agents === s.agents && last.repos === s.repos && last.previews === s.prPreviews) return last.plan;
  const plan = planRacks(Object.values(s.agents), s.repos, Object.values(s.prPreviews));
  last = { agents: s.agents, repos: s.repos, previews: s.prPreviews, plan };
  return plan;
}

/** How many racks stand in each segment while you're in the basement ('' elsewhere), as a string a selector can compare. */
export const basementRowsKey = (s: S) => (s.floor === BASEMENT ? segmentCounts(basementPlan(s)).join(',') : '');

let details: (() => Record<string, unknown>) | null = null;

/** The mounted room reports its live side (each rack's power and blink rate, the sound's voices) to the probe. */
export function mountBasement(report: () => Record<string, unknown>) {
  details = report;
  return () => {
    if (details === report) details = null;
  };
}

const probe = {
  /** You're in the basement and it's mounted. */
  get here() {
    return details !== null;
  },
  /** Every rack: what it is, where, its state, and (while mounted) its power, blink rate and fan speed. */
  get racks() {
    const s = useStore.getState();
    const live = (details?.().racks ?? {}) as Record<string, unknown>;
    return basementPlan(s).units.map((u) => {
      const a = u.agentId ? s.agents[u.agentId] : null;
      const preview = u.kind === 'preview' ? (u.pr === null ? s.repos.find((r) => r.id === u.repoId)?.preview.status : s.prPreviews[`${u.repoId}#${u.pr}`]?.status) : null;
      const state = a ? agentRackState(a) : previewRackState(preview ?? 'stopped');
      return { key: u.key, kind: u.kind, label: u.label, floor: u.floor, segment: u.segment, slot: u.slot, x: u.x, z: u.z, state, ...(live[u.key] as object | undefined) };
    });
  },
  /** The rows: each segment's floor label and how many racks it holds. */
  get rows() {
    const p = basementPlan();
    return { rows: p.rows, overflow: p.overflow };
  },
  /** The power wall: Claude's usage as the gauge and display read it, and the room's lights. */
  get meter() {
    const u = useStore.getState().usage;
    return { ...meterReading(u, Date.now()), lights: roomLight(u.state), lever: u.state === 'pacing' ? 'ready' : u.state === 'paused' ? 'locked' : 'resting' };
  },
  /** Everything else the mounted room reports: the keeper's cables, the log, the sound's voices, the lights as drawn. */
  get live() {
    return details?.() ?? null;
  },
  /** Rides the elevator down to the basement (or to floor `n`). */
  go(n: number = BASEMENT) {
    useStore.getState().goToFloor(n);
  },
  /** E on an agent's rack: opens their terminal. */
  open(agentId: string) {
    useStore.getState().openOverlay({ kind: 'terminal', agentId });
  },
  /** In the demo, Claude's usage on demand: 'warning' paces new work, 'limit' pauses it for 3 minutes. */
  simulate(kind: 'warning' | 'limit') {
    return api.simulateUsage(kind);
  },
};

if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__swarmBasement = probe;
