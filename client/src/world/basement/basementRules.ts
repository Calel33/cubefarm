// The basement server room's pure decisions (no three.js, so they're unit tested): which racks stand where (one per
// agent's session, grouped in rows by floor, and a small one per preview server), what state each is in and how its
// lights look, how fast its activity lights blink for the output it's producing, how its fans spin up and down, and how
// Claude's usage reads on the power wall and in the room's lights.

import type { AgentStatus, AgentTask, PreviewStatus, UsageView } from '../../../../shared/types';
import { clock } from '../../../../shared/usage';
import { RACK_SEGMENTS, RACKS_PER_SEGMENT, rackSpot } from '../layout';

// ---------- what's in the room ----------

/** What the plan needs of an agent (the store's Agent has it all). */
export interface RackAgent {
  id: string;
  name: string;
  repoId: string;
  role: 'dev' | 'qa' | 'ceo';
  desk: number;
  color: string;
  status: AgentStatus;
  task: AgentTask | null;
  terminal: boolean;
}

/** What it needs of a floor: its number, name, colour and main preview. */
export interface RackRepo {
  id: string;
  floor: number;
  fullName: string;
  color: string;
  preview: { status: PreviewStatus; port: number };
}

export interface RackPreview {
  repoId: string;
  pr: number;
  status: PreviewStatus;
  port: number;
}

export type RackKind = 'agent' | 'preview';

/** One rack: an agent's session, or a preview server (pr null: the floor's main preview). */
export interface RackUnit {
  /** Stable across plans: 'agent:<id>' or 'preview:<repoId>:<pr|main>'. */
  key: string;
  kind: RackKind;
  agentId: string | null;
  repoId: string | null;
  pr: number | null;
  /** What its LCD says: the agent's name, or the preview's port. */
  label: string;
  color: string;
  floor: number;
  segment: number;
  slot: number;
  x: number;
  z: number;
}

/** A segment of racks with its floor's label ("3 · cubefarm", "3 · cubefarm (cont.)"). */
export interface RackRow {
  segment: number;
  floor: number;
  label: string;
  color: string;
  count: number;
}

export interface RackPlan {
  units: RackUnit[];
  rows: RackRow[];
  /** Racks that found no room (beyond MAX_RACKS). */
  overflow: number;
  /** Changes whenever a rack moves, comes or goes, or a label or colour changes: what the instanced meshes rebuild on. */
  key: string;
}

const LOBBY_COLOR = '#ff8a5b';

/** The previews worth a rack: anything but a floor with nothing to run. */
const previewShows = (s: PreviewStatus) => s !== 'unconfigured';

/**
 * Racks in rows by floor: the CEO's (the lobby, G) first, then each floor from the lowest, nearest the elevator first.
 * In a floor's row, its developers by desk, then its QA testers, then its main preview and its PR previews. A floor
 * with more racks than a segment holds carries on in the next one.
 */
export function planRacks(agents: readonly RackAgent[], repos: readonly RackRepo[], previews: readonly RackPreview[]): RackPlan {
  const groups: { floor: number; name: string; color: string; units: Omit<RackUnit, 'segment' | 'slot' | 'x' | 'z'>[] }[] = [];
  const agentUnit = (a: RackAgent, floor: number) => ({ key: `agent:${a.id}`, kind: 'agent' as const, agentId: a.id, repoId: a.repoId || null, pr: null, label: a.name, color: a.color, floor });
  const ceo = agents.filter((a) => a.role === 'ceo');
  if (ceo.length) groups.push({ floor: 0, name: 'Lobby', color: LOBBY_COLOR, units: ceo.map((a) => agentUnit(a, 0)) });
  for (const r of [...repos].sort((a, b) => a.floor - b.floor)) {
    const team = agents.filter((a) => a.repoId === r.id && a.role !== 'ceo');
    const byDesk = (role: 'dev' | 'qa') =>
      team
        .filter((a) => a.role === role)
        .sort((a, b) => a.desk - b.desk || a.id.localeCompare(b.id))
        .map((a) => agentUnit(a, r.floor));
    const units: (typeof groups)[number]['units'] = [...byDesk('dev'), ...byDesk('qa')];
    const preview = (pr: number | null, port: number) => ({ key: `preview:${r.id}:${pr ?? 'main'}`, kind: 'preview' as const, agentId: null, repoId: r.id, pr, label: `:${port}`, color: r.color, floor: r.floor });
    if (previewShows(r.preview.status)) units.push(preview(null, r.preview.port));
    for (const p of previews.filter((p) => p.repoId === r.id).sort((a, b) => a.pr - b.pr)) units.push(preview(p.pr, p.port));
    if (units.length) groups.push({ floor: r.floor, name: r.fullName.split('/').pop() ?? r.fullName, color: r.color, units });
  }

  const units: RackUnit[] = [];
  const rows: RackRow[] = [];
  let segment = 0;
  let overflow = 0;
  for (const g of groups) {
    for (let i = 0; i < g.units.length; i += RACKS_PER_SEGMENT) {
      const chunk = g.units.slice(i, i + RACKS_PER_SEGMENT);
      if (segment >= RACK_SEGMENTS) {
        overflow += chunk.length;
        continue;
      }
      const tag = g.floor === 0 ? 'G' : String(g.floor);
      rows.push({ segment, floor: g.floor, label: `${tag} · ${g.name}${i ? ' (cont.)' : ''}`, color: g.color, count: chunk.length });
      chunk.forEach((u, slot) => units.push({ ...u, segment, slot, ...rackSpot(segment, slot) }));
      segment++;
    }
  }
  const key = units.map((u) => `${u.key}@${u.segment}.${u.slot}:${u.label}:${u.color}`).join('|') + `#${rows.map((r) => r.label).join('|')}`;
  return { units, rows, overflow, key };
}

/** How many racks stand in each segment, for the colliders. */
export const segmentCounts = (plan: RackPlan) => Array.from({ length: RACK_SEGMENTS }, (_, s) => plan.rows.find((r) => r.segment === s)?.count ?? 0);

// ---------- each rack's state ----------

export type RackState = 'working' | 'qa' | 'fixing' | 'preparing' | 'error' | 'idle';

/** An agent's rack: green working, blue testing, amber fixing a PR, red on an error, dim idle (or done, or stopped). */
export function agentRackState(a: Pick<RackAgent, 'role' | 'status' | 'task'>): RackState {
  if (a.status === 'error') return 'error';
  if (a.status === 'preparing') return 'preparing';
  if (a.status !== 'working') return 'idle';
  if (a.task === 'qa' || a.role === 'qa') return 'qa';
  return a.task === 'fix' ? 'fixing' : 'working';
}

/** A preview server's rack: green while it serves, starting up while it installs or starts, red on an error. */
export function previewRackState(s: PreviewStatus): RackState {
  if (s === 'running') return 'working';
  if (s === 'error') return 'error';
  return s === 'preparing' || s === 'installing' || s === 'starting' ? 'preparing' : 'idle';
}

/** A session (or a server) is running: its fans spin and its lights are up. */
export const rackLive = (s: RackState) => s !== 'idle' && s !== 'error';

/** Each state's LED colour. */
export const STATE_COLOR: Record<RackState, string> = {
  working: '#3ddc84',
  qa: '#4ea8ff',
  fixing: '#ffb020',
  preparing: '#3ddc84',
  error: '#ff4d4d',
  idle: '#5a6478',
};

/** The status column's look: its colour, how fast it blinks (0 steady) and how bright it stays powered down. */
export function statusLed(s: RackState): { color: string; hz: number; floor: number } {
  if (s === 'error') return { color: STATE_COLOR.error, hz: 1.1, floor: 1 }; // an error blinks, live or not
  if (s === 'preparing') return { color: STATE_COLOR.preparing, hz: 2.2, floor: 0.15 };
  return { color: STATE_COLOR[s], hz: 0, floor: s === 'idle' ? 0.22 : 0.15 };
}

// ---------- activity: how fast the lights blink ----------

/** An output rate: events a second, decaying with a half-life of RATE_HALF_LIFE seconds. */
export interface Rate {
  value: number;
  at: number;
}

export const RATE_HALF_LIFE = 5;

export const newRate = (): Rate => ({ value: 0, at: 0 });

/** The rate at time `now` (seconds). */
export function rateAt(r: Rate, now: number): number {
  const dt = Math.max(0, now - r.at);
  return r.value * Math.pow(0.5, dt / RATE_HALF_LIFE);
}

/** One more burst of output (a new terminal line, a new tool) at `now` (seconds). Mutates and returns `r`. */
export function bumpRate(r: Rate, now: number, n = 1): Rate {
  r.value = rateAt(r, now) + (n * Math.LN2) / RATE_HALF_LIFE;
  r.at = now;
  return r;
}

/** The activity lights' blink rate (Hz) for a session's output rate: a slow tick while it thinks, racing while it works. */
export function blinkHz(live: boolean, rate: number): number {
  if (!live) return 0;
  return Math.min(14, 1.2 + 2.4 * rate);
}

// ---------- spinning up and down ----------

/** How long (s) a rack takes to spin up when its session starts, and to wind down when it ends. */
export const SPIN_UP = 0.8;
export const SPIN_DOWN = 4;

/** A rack's power, ramping from `from` to `to` (0 off, 1 on) since `t0` (seconds): the shaders work it out the same way. */
export interface Power {
  from: number;
  to: number;
  t0: number;
}

export function powerAt(p: Power, t: number): number {
  const dur = p.to > p.from ? SPIN_UP : SPIN_DOWN;
  const k = Math.min(1, Math.max(0, (t - p.t0) / dur));
  return p.from + (p.to - p.from) * k;
}

/** Turns a rack on (1) or off (0) at `t`, from wherever it is now. Mutates and returns `p`; false when nothing changed. */
export function setPower(p: Power, to: number, t: number): boolean {
  if (p.to === to) return false;
  p.from = powerAt(p, t);
  p.to = to;
  p.t0 = t;
  return true;
}

/** A fan's speed (turns a second) at power `power`, a little faster the busier its session is. */
export const fanSpeed = (power: number, rate: number) => power * (2.2 + Math.min(2.5, rate * 0.6));

// ---------- Claude's usage: the power wall and the room's lights ----------

export interface MeterReading {
  state: UsageView['state'];
  /** The gauge's needle, 0 (empty) to 1 (at the limit). */
  needle: number;
  tone: 'good' | 'warn' | 'bad';
  headline: string;
  /** "until Tue 00:00", or the last warning's limit. */
  detail: string;
  limit: string;
}

/** How the gauge and wall display read: the last warning's fill where Claude gave one, else where the state sits. */
export function meterReading(u: UsageView, now: number): MeterReading {
  const pct = u.warning?.pct ?? null;
  const filled = pct === null ? null : Math.min(1, Math.max(0, pct / 100));
  const limit = u.warning ? `${u.warning.limit ?? "Claude's usage"}${pct === null ? '' : ` · ${pct}%`}` : 'No usage warnings';
  const until = u.until !== null ? `until ${clock(u.until, now)}` : '';
  if (u.state === 'paused') return { state: 'paused', needle: 1, tone: 'bad', headline: 'PAUSED', detail: until || 'at the limit', limit };
  if (u.state === 'pacing') return { state: 'pacing', needle: Math.max(0.72, filled ?? 0.82), tone: 'warn', headline: 'PACING', detail: until || 'pacing new work', limit };
  return { state: 'normal', needle: Math.min(0.6, filled ?? 0.35), tone: 'good', headline: 'NORMAL', detail: 'full speed', limit };
}

/** The room's lighting for a usage state: full, a notch down while pacing, red emergency lighting while paused. */
export function roomLight(state: UsageView['state']): { level: number; emergency: boolean } {
  if (state === 'paused') return { level: 0.5, emergency: true };
  return { level: state === 'pacing' ? 0.72 : 1, emergency: false };
}

// ---------- sound: which racks you hear ----------

const dist: number[] = [];

/**
 * The `n` racks (of `count`, at spot(i)) nearest (x, z) that make a sound (live, or idle and humming quietly), as
 * indexes, nearest first. `out` is reused so a tick allocates nothing once it's grown.
 */
export function nearestRacks(count: number, spot: (i: number) => { x: number; z: number }, audible: (i: number) => boolean, x: number, z: number, n: number, out: number[] = []): number[] {
  out.length = 0;
  const d = dist;
  d.length = 0;
  for (let i = 0; i < count; i++) {
    if (!audible(i)) continue;
    const s = spot(i);
    const di = (s.x - x) ** 2 + (s.z - z) ** 2;
    let k = out.length;
    while (k > 0 && d[k - 1] > di) k--;
    if (k >= n) continue;
    out.splice(k, 0, i);
    d.splice(k, 0, di);
    if (out.length > n) {
      out.pop();
      d.pop();
    }
  }
  return out;
}
