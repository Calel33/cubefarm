import { describe, expect, it } from 'vitest';
import { carRoutes, CAR_RANGE } from '../outside/cityLayout';
import { BALCONY, collide, HALF_W, outsideColliders, type Rect } from '../layout';
import { WALK_R } from '../walkways';
import { BUS, BUS_ROUTE, busCycle, busRun, callBus, carAlong, crossingClear, type BusRun } from './bus';
import { endLunch, LUNCH, lunchStage, lunchVisits, planLunch, roomForLunch, startLunch } from './lunchOut';
import { BUS_STEP, BUS_STOP, CROSSINGS, DOORS, EAT_SPOTS, inPark, kerbRects, onPlaza, ORDER_SPOT, PARK, plazaColliders, plazaProps, plazaWalks, PLAZA, TREE_SEAT, TRUCK_LINE } from './plaza';
import {
  dishAt,
  headlineAt,
  headlines,
  MENU_MINUTES,
  orderAt,
  pedestrianAt,
  pedestrianCap,
  PIGEONS,
  routes,
  spawnPedestrians,
  spawnPigeons,
  stepPedestrian,
  stepPigeons,
  truckState,
} from './streetRules';

const seq = (seed = 1) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
};

const blockedBy = (rects: Rect[], x: number, z: number, r = WALK_R) => rects.some((b) => x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r);

describe('the plaza', () => {
  const solid = [...plazaProps(), ...outsideColliders('lobby')];

  it('keeps every walk out here clear of its props', () => {
    for (const walk of plazaWalks()) {
      for (let i = 1; i < walk.length; i++) {
        const a = walk[i - 1];
        const b = walk[i];
        const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1);
        for (let k = 0; k <= n; k++) {
          const x = a.x + ((b.x - a.x) * k) / n;
          const z = a.z + ((b.z - a.z) * k) / n;
          if (Math.abs(x) < HALF_W + 0.5) continue; // the doorway itself: the lobby's own nav has it
          expect(blockedBy(solid, x, z), `(${x.toFixed(2)}, ${z.toFixed(2)}) on ${JSON.stringify(walk)}`).toBe(false);
        }
      }
    }
  });

  it('leaves room to stand at the truck, under the tree and at the bus stop', () => {
    for (const p of [ORDER_SPOT, TREE_SEAT.exit, BUS_STEP, ...TRUCK_LINE, ...EAT_SPOTS]) expect(blockedBy(solid, p.x, p.z)).toBe(false);
  });

  it('keeps you off the road', () => {
    const rects = plazaColliders();
    const p = collide(PLAZA.kerbX + 3, 0, rects);
    expect(p.x).toBeLessThanOrEqual(PLAZA.kerbX - WALK_R + 1e-6);
    const q = collide(0, -PLAZA.kerbZ - 0.1, kerbRects());
    expect(q.z).toBeGreaterThanOrEqual(-PLAZA.kerbZ - 1e-6);
  });

  it('has the bus stop on the east pavement, the doors on the patios', () => {
    expect(BUS_STOP.x).toBeGreaterThan(PLAZA.halfX - 1);
    expect(onPlaza(DOORS.west.x - 1.5, DOORS.west.z)).toBe(false); // the patio
    expect(onPlaza(-24, 4.5)).toBe(true);
    expect(onPlaza(0, 20)).toBe(true);
    expect(onPlaza(0, 0)).toBe(false);
    expect(onPlaza(40, 0)).toBe(false);
    expect(inPark((PARK.minX + PARK.maxX) / 2, (PARK.minZ + PARK.maxZ) / 2)).toBe(true);
    expect(inPark(0, 0)).toBe(false);
  });

  it('puts the crossings over the west road at the corners', () => {
    expect(CROSSINGS.map((c) => c.id)).toEqual(['nw', 'sw']);
    for (const c of CROSSINGS) expect(c.far).toBeLessThan(c.near);
    expect(BALCONY.maxZ).toBeLessThan(Math.abs(CROSSINGS[0].z));
  });
});

describe('the bus', () => {
  const route = carRoutes()[BUS_ROUTE];
  const run: BusRun = { s: 0, stage: 'driving', next: 0, at: 0 };

  it('is a bus on the lane by our plaza', () => {
    expect(route.bus).toBe(true);
    expect(route.axis).toBe('z');
    expect(route.line - route.dir * 2).toBeGreaterThan(PLAZA.kerbX);
  });

  it('stops at the shelter every few minutes, its doors open a while', () => {
    const { cycle } = busCycle(route);
    expect(cycle).toBeGreaterThan(120);
    expect(cycle).toBeLessThan(300);
    let stopped = 0;
    let arrivals = 0;
    let was = '';
    for (let t = 0; t < cycle * 3; t += 0.25) {
      busRun(route, t, run);
      if (run.stage === 'stopped') {
        stopped += 0.25;
        expect(run.s).toBeCloseTo(BUS.stopAt, 5);
      }
      if (run.stage === 'stopped' && was !== 'stopped') arrivals++;
      was = run.stage;
      expect(Math.abs(run.s)).toBeLessThanOrEqual(CAR_RANGE);
    }
    expect(arrivals).toBe(3);
    expect(stopped).toBeCloseTo(BUS.dwell * 3, 0);
  });

  it('moves smoothly: never jumps or backs up', () => {
    let prev = busRun(route, 0, run).s;
    for (let t = 0.05; t < 400; t += 0.05) {
      const s = busRun(route, t, run).s;
      let ds = (s - prev) * route.dir;
      if (ds < -CAR_RANGE) ds += CAR_RANGE * 2;
      expect(ds).toBeGreaterThanOrEqual(-1e-6);
      expect(ds).toBeLessThan(route.speed * 0.05 + 1e-3);
      prev = s;
    }
  });

  it('comes when called', () => {
    callBus(route, 50, 5);
    expect(busRun(route, 50, run).next).toBeCloseTo(5, 3);
    expect(busRun(route, 55.1, run).stage).toBe('stopped');
  });
});

describe('the crossings', () => {
  const all = carRoutes();
  const c = CROSSINGS[0];

  it('are red while a car is coming and green once the road is clear', () => {
    const west = all.filter((r) => r.axis === 'z' && r.line === c.road);
    expect(west.length).toBeGreaterThan(0);
    let green = 0;
    let red = 0;
    for (let t = 0; t < 300; t += 0.5) {
      const clear = crossingClear(all, c, t, carAlong);
      if (clear) {
        green++;
        // nobody on the stripes during the next few seconds
        for (const r of west) for (let k = 0; k < 6; k += 0.5) expect(Math.abs(carAlong(r, t + k) - c.z)).toBeGreaterThan(r.len / 2);
      } else red++;
    }
    expect(green).toBeGreaterThan(0);
    expect(red).toBeGreaterThan(0);
  });
});

describe('people walking by', () => {
  const rs = routes();
  const at = { x: 0, z: 0, heading: 0 };

  it('walk loops along the pavements, some of them over the crossings', () => {
    expect(rs.some((r) => r.cross.some(Boolean))).toBe(true);
    for (const r of rs) {
      expect(r.cross.length).toBe(r.pts.length);
      for (const p of r.pts) expect(Math.abs(p.x) > PLAZA.halfX || Math.abs(p.z) > PLAZA.halfZ).toBe(true);
    }
  });

  it('are capped, and skipped on Low', () => {
    expect(pedestrianCap('low')).toBe(0);
    expect(pedestrianCap('medium')).toBeLessThan(pedestrianCap('high'));
    expect(pedestrianCap('high')).toBeLessThanOrEqual(16);
  });

  it('wait at the kerb for a green light, then cross', () => {
    const r = rs[2];
    const p = spawnPedestrians(1, [r], () => 0)[0];
    expect(r.cross[p.leg]).toBe('nw');
    expect(p.d).toBe(0);
    for (let i = 0; i < 20; i++) stepPedestrian(p, r, 0.1, () => false, null, at);
    expect(p.walking).toBe(false);
    expect(p.d).toBe(0);
    stepPedestrian(p, r, 0.1, () => true, null, at);
    expect(p.crossing).toBe(true);
    // once over, a red light doesn't stop them halfway
    for (let i = 0; i < 20; i++) stepPedestrian(p, r, 0.1, () => false, null, at);
    expect(p.d).toBeGreaterThan(1);
  });

  it('stop for the player in their way, then squeeze past', () => {
    const r = rs[0];
    const p = spawnPedestrians(1, [r], () => 0.1)[0];
    pedestrianAt(p, r, at);
    const player = { x: at.x - Math.sin(at.heading) * 0.6, z: at.z - Math.cos(at.heading) * 0.6 };
    const d0 = p.d;
    stepPedestrian(p, r, 0.1, () => true, player, at);
    expect(p.walking).toBe(false);
    expect(p.d).toBe(d0);
    for (let i = 0; i < 60; i++) stepPedestrian(p, r, 0.1, () => true, player, at);
    expect(p.d).toBeGreaterThan(d0);
  });

  it('go round and round without stopping when nothing is in their way', () => {
    const p = spawnPedestrians(4, rs, seq(3));
    for (let i = 0; i < 3000; i++) p.forEach((x) => stepPedestrian(x, rs[x.route], 0.1, () => true, null, at));
    for (const x of p) expect(x.walking).toBe(true);
  });
});

describe('the pigeons', () => {
  it('peck about and scatter when you walk at them, then come back once you leave', () => {
    const rand = seq(7);
    const flock = spawnPigeons(rand);
    expect(flock.length).toBe(PIGEONS.count);
    const far = { x: 0, z: 0, speed: 0 };
    for (let i = 0; i < 50; i++) expect(stepPigeons(flock, 0.1, far, rand)).toBe(0);
    const b = flock[0];
    const n = stepPigeons(flock, 0.1, { x: b.x + 1, z: b.z, speed: 3.6 }, rand);
    expect(n).toBeGreaterThan(0);
    expect(flock.some((p) => p.state === 'fly')).toBe(true);
    for (let i = 0; i < 10; i++) stepPigeons(flock, 0.1, far, rand);
    expect(Math.max(...flock.map((p) => p.y))).toBeGreaterThan(1);
    for (let i = 0; i < 400; i++) stepPigeons(flock, 0.1, far, rand);
    expect(flock.every((p) => p.state === 'peck')).toBe(true);
  });

  it("don't mind you standing still a little way off", () => {
    const rand = seq(9);
    const flock = spawnPigeons(rand);
    const b = flock[0];
    expect(stepPigeons(flock, 0.1, { x: b.x + 1.5, z: b.z, speed: 0 }, rand)).toBe(0);
  });
});

describe('the food truck', () => {
  it('rotates its menu every few minutes', () => {
    const minute = 60000;
    expect(dishAt(0)).toBe('taco');
    expect(dishAt(MENU_MINUTES * minute)).toBe('bao');
    expect(dishAt(2 * MENU_MINUTES * minute + 1)).toBe('gelato');
    expect(dishAt(3 * MENU_MINUTES * minute)).toBe('taco');
  });

  it('takes one order at a time, and not with your hands full', () => {
    const open = { since: null, dish: 'taco' as const };
    expect(orderAt(open, 1, 'bao', true).op).toBe('full');
    const { op, truck } = orderAt(open, 1, 'bao', false);
    expect(op).toBe('order');
    expect(truck.dish).toBe('bao');
    expect(truckState(truck, 1.5)).toBe('cooking');
    expect(orderAt(truck, 1.5, 'bao', false).op).toBe('busy');
    expect(truckState(truck, 10)).toBe('ready');
  });
});

describe('the newsstand', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const merged = (h: number) => ({ state: 'MERGED', mergedAt: new Date(now - h * 3600e3).toISOString() });

  it("leads with what each floor shipped today", () => {
    const list = headlines(
      [
        { floor: 2, pulls: [merged(1), merged(2), merged(30), { state: 'OPEN', mergedAt: null }], issues: [1, 2] },
        { floor: 1, pulls: [merged(3)], issues: [] },
      ],
      [{ status: 'working' }, { status: 'idle' }],
      now,
    );
    expect(list[0]).toBe('Floor 1 ships 1 feature');
    expect(list[1]).toBe('Floor 2 ships 2 features');
    expect(list).toContain('Floor 2: 1 PR up for review');
    expect(list).toContain('1 agent hard at work at cubefarm');
    expect(list).toContain('2 issues on the whiteboards');
  });

  it('has something to say on a quiet day, and rotates', () => {
    expect(headlines([], [], now, 'Acme')).toEqual(["Quiet day at Acme: the coffee's on"]);
    expect(headlineAt(['a', 'b'], 0)).toBe('a');
    expect(headlineAt(['a', 'b'], 12000)).toBe('b');
  });
});

describe('lunch out', () => {
  it('lets two out at once, each at their own place in line and their own spot to eat', () => {
    const now = 1e6;
    const a = planLunch([], 'a', now, 0.2)!;
    const b = planLunch([a], 'b', now, 0.2)!;
    expect(a.line).not.toBe(b.line);
    expect(a.eat).not.toBe(b.eat);
    expect(planLunch([a, b], 'c', now, 0.5)).toBeNull();
    expect(planLunch([a], 'a', now, 0.5)).toBeNull();
    expect(roomForLunch([a, b], 'c', b.leave + LUNCH.ride * 1000 + 1)).toBe(true);
    expect(lunchStage(a, now)).toBe('riding');
    expect(lunchStage(a, a.arrive)).toBe('out');
    expect(lunchStage(a, a.leave)).toBe('back');
    expect(a.leave - a.arrive).toBeGreaterThanOrEqual(LUNCH.stay[0] * 1000);
  });

  it('forgets visits once they are over', () => {
    const v = planLunch([], 'x', 0, 0.5)!;
    startLunch(v);
    expect(lunchVisits(1).map((l) => l.id)).toEqual(['x']);
    expect(lunchVisits(v.leave + LUNCH.ride * 1000 + 1)).toEqual([]);
    startLunch(v);
    endLunch('x');
    expect(lunchVisits(1)).toEqual([]);
  });
});
