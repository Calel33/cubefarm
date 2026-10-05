import { describe, expect, it } from 'vitest';
import type { UsageView } from '../../../../shared/types';
import { RACK_SEGMENTS, RACKS_PER_SEGMENT, MAX_RACKS } from '../layout';
import {
  agentRackState,
  blinkHz,
  bumpRate,
  meterReading,
  nearestRacks,
  newRate,
  planRacks,
  powerAt,
  previewRackState,
  rackLive,
  rateAt,
  roomLight,
  segmentCounts,
  setPower,
  SPIN_DOWN,
  SPIN_UP,
  statusLed,
  type RackAgent,
  type RackRepo,
} from './basementRules';

const agent = (id: string, repoId: string, over: Partial<RackAgent> = {}): RackAgent => ({ id, name: id, repoId, role: 'dev', desk: 0, color: '#123456', status: 'idle', task: null, terminal: true, ...over });
const repo = (id: string, floor: number, over: Partial<RackRepo> = {}): RackRepo => ({ id, floor, fullName: `acme/${id}`, color: '#abcdef', preview: { status: 'unconfigured', port: 6300 + floor }, ...over });

describe('planRacks', () => {
  it('puts the CEO in the lobby row first, then each floor from the lowest, devs by desk, then QA, then previews', () => {
    const repos = [repo('b', 2, { preview: { status: 'running', port: 6302 } }), repo('a', 1)];
    const agents = [agent('ceo', '', { role: 'ceo' }), agent('d2', 'b', { desk: 1 }), agent('q1', 'b', { role: 'qa' }), agent('d1', 'b', { desk: 0 }), agent('x', 'a')];
    const plan = planRacks(agents, repos, [{ repoId: 'b', pr: 12, status: 'running', port: 6402 }]);
    expect(plan.rows.map((r) => r.label)).toEqual(['G · Lobby', '1 · a', '2 · b']);
    expect(plan.units.filter((u) => u.segment === 2).map((u) => u.label)).toEqual(['d1', 'd2', 'q1', ':6302', ':6402']);
    expect(plan.units.find((u) => u.key === 'preview:b:12')).toMatchObject({ kind: 'preview', pr: 12, repoId: 'b' });
    expect(plan.overflow).toBe(0);
  });

  it('carries a big floor on into the next segment, and counts what has no room', () => {
    const team = Array.from({ length: RACKS_PER_SEGMENT + 3 }, (_, i) => agent(`a${i}`, 'r', { desk: i }));
    const plan = planRacks(team, [repo('r', 1)], []);
    expect(plan.rows.map((r) => [r.label, r.count])).toEqual([
      ['1 · r', RACKS_PER_SEGMENT],
      ['1 · r (cont.)', 3],
    ]);
    expect(segmentCounts(plan).slice(0, 3)).toEqual([RACKS_PER_SEGMENT, 3, 0]);

    const floors = Array.from({ length: RACK_SEGMENTS + 2 }, (_, i) => repo(`f${i}`, i + 1));
    const many = floors.flatMap((r) => Array.from({ length: RACKS_PER_SEGMENT }, (_, i) => agent(`${r.id}-${i}`, r.id, { desk: i })));
    const full = planRacks(many, floors, []);
    expect(full.units).toHaveLength(MAX_RACKS);
    expect(full.overflow).toBe(2 * RACKS_PER_SEGMENT);
  });

  it('fits the big company (10 floors of 15 people, with their previews) without overflowing', () => {
    const floors = Array.from({ length: 10 }, (_, i) => repo(`f${i}`, i + 1, { preview: { status: 'running', port: 6301 + i } }));
    const people = floors.flatMap((r) => Array.from({ length: 15 }, (_, i) => agent(`${r.id}-${i}`, r.id, { desk: i, role: i >= 12 ? 'qa' : 'dev' })));
    const plan = planRacks([agent('ceo', '', { role: 'ceo' }), ...people], floors, []);
    expect(plan.overflow).toBe(0);
    expect(plan.units).toHaveLength(1 + 150 + 10);
    expect(plan.rows).toHaveLength(11);
  });

  it("keeps its key while nothing about the racks changes, and changes it when one does", () => {
    const a = planRacks([agent('x', 'r')], [repo('r', 1)], []);
    expect(planRacks([agent('x', 'r', { status: 'working' })], [repo('r', 1)], []).key).toBe(a.key);
    expect(planRacks([agent('x', 'r', { name: 'Ken' })], [repo('r', 1)], []).key).not.toBe(a.key);
  });
});

describe('rack states', () => {
  it('lights green working, blue testing, amber fixing, red on an error, dim idle', () => {
    expect(agentRackState({ role: 'dev', status: 'working', task: 'issue' })).toBe('working');
    expect(agentRackState({ role: 'qa', status: 'working', task: 'qa' })).toBe('qa');
    expect(agentRackState({ role: 'dev', status: 'working', task: 'fix' })).toBe('fixing');
    expect(agentRackState({ role: 'dev', status: 'error', task: 'issue' })).toBe('error');
    expect(agentRackState({ role: 'dev', status: 'done', task: null })).toBe('idle');
    expect(previewRackState('running')).toBe('working');
    expect(previewRackState('installing')).toBe('preparing');
    expect(previewRackState('stopped')).toBe('idle');
    expect(rackLive('error')).toBe(false);
    expect(rackLive('preparing')).toBe(true);
    expect(statusLed('error')).toMatchObject({ hz: 1.1, floor: 1 });
    expect(statusLed('working').hz).toBe(0);
  });
});

describe('activity', () => {
  it('blinks faster with output and slows again as it goes quiet', () => {
    const r = newRate();
    for (let i = 0; i < 10; i++) bumpRate(r, i * 0.5);
    const busy = rateAt(r, 5);
    expect(busy).toBeGreaterThan(0.5);
    expect(rateAt(r, 30)).toBeLessThan(busy / 10);
    expect(blinkHz(true, busy)).toBeGreaterThan(blinkHz(true, 0));
    expect(blinkHz(true, 100)).toBe(14);
    expect(blinkHz(false, busy)).toBe(0);
  });
});

describe('spinning up and down', () => {
  it('ramps from wherever it is', () => {
    const p = { from: 0, to: 0, t0: 0 };
    expect(setPower(p, 1, 10)).toBe(true);
    expect(setPower(p, 1, 10.1)).toBe(false);
    expect(powerAt(p, 10 + SPIN_UP / 2)).toBeCloseTo(0.5);
    expect(powerAt(p, 20)).toBe(1);
    setPower(p, 0, 20);
    expect(powerAt(p, 20 + SPIN_DOWN / 2)).toBeCloseTo(0.5);
    setPower(p, 1, 20 + SPIN_DOWN / 2); // back up halfway down: no jump
    expect(powerAt(p, 20 + SPIN_DOWN / 2)).toBeCloseTo(0.5);
  });
});

describe('the power meter', () => {
  const now = new Date(2026, 9, 5, 12, 0).getTime();
  const usage = (state: UsageView['state'], over: Partial<UsageView> = {}): UsageView => ({ state, until: null, warning: null, ...over });

  it('reads normal, pacing until a time, and paused', () => {
    expect(meterReading(usage('normal'), now)).toMatchObject({ tone: 'good', headline: 'NORMAL' });
    const until = new Date(2026, 9, 6, 0, 0).getTime();
    const pacing = meterReading(usage('pacing', { until, warning: { limit: 'weekly limit', pct: 91, resetsAt: until, at: now } }), now);
    expect(pacing).toMatchObject({ tone: 'warn', headline: 'PACING', limit: 'weekly limit · 91%' });
    expect(pacing.detail).toMatch(/^until Tue 00:00$/);
    expect(pacing.needle).toBeCloseTo(0.91);
    expect(meterReading(usage('paused', { until: now + 60_000 }), now)).toMatchObject({ tone: 'bad', headline: 'PAUSED', needle: 1, detail: 'until 12:01' });
  });

  it('dims the room a notch while pacing, and goes to emergency lighting while paused', () => {
    expect(roomLight('normal')).toEqual({ level: 1, emergency: false });
    expect(roomLight('pacing').level).toBeLessThan(1);
    expect(roomLight('paused').emergency).toBe(true);
  });
});

describe('nearestRacks', () => {
  it('picks the n nearest audible racks, nearest first', () => {
    const spots = [0, 5, 1, 9, 2].map((x) => ({ x, z: 0 }));
    expect(nearestRacks(spots.length, (i) => spots[i], () => true, 0, 0, 3)).toEqual([0, 2, 4]);
    expect(nearestRacks(spots.length, (i) => spots[i], (i) => i !== 2, 0, 0, 2)).toEqual([0, 4]);
  });
});
