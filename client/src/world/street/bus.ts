// The bus that stops outside (#264), as pure timing: one of the city's two buses (outside/cityLayout.ts's route 2, on the
// east road's lane next to our plaza) brakes into the stop by the east pavement every other lap, waits with its doors
// open, and pulls away. Its position is a function of the clock, like every car's, so City.tsx draws it and Street.tsx
// reads its stage from the same numbers. Also the zebra crossings' lights: green while no car will reach the stripes
// before someone could get across.

import { CAR_RANGE, LANE, type CarRoute } from '../outside/cityLayout';
import type { Crossing } from './plaza';

/** carRoutes()'s index of the bus that stops at our stop: the east road's southbound lane, next to the plaza. */
export const BUS_ROUTE = 2;

export const BUS = {
  /** Where its middle stops (z, along the east road), level with the shelter. */
  stopAt: -4,
  /** Metres it brakes over coming in, and speeds up over pulling away. */
  brake: 14,
  /** Seconds at the stop, doors open. */
  dwell: 12,
  /** It stops once every this many laps of its route (a lap is about 86 s): a bus every few minutes. */
  laps: 2,
  /** Seconds from the office opening until the first bus starts braking in. */
  first: 30,
};

export type BusStage = 'driving' | 'arriving' | 'stopped' | 'leaving';

export interface BusRun {
  /** Where it is along its road (z for the east road), wrapped like every car. */
  s: number;
  stage: BusStage;
  /** Seconds until it next stands at the stop (0 while it's there). */
  next: number;
  /** Seconds into its stop (only while stopped). */
  at: number;
}

const LOOP = CAR_RANGE * 2;

/** The bus's whole timetable: one lap with a stop, the rest without, seconds. */
export function busCycle(route: Pick<CarRoute, 'speed'>) {
  const tb = (2 * BUS.brake) / route.speed;
  return { tb, cycle: 2 * tb + BUS.dwell + (BUS.laps * LOOP - 2 * BUS.brake) / route.speed };
}

let shift = 0;

/** QA: bring the next bus in `seconds` from `time` (the clock City.tsx uses). */
export function callBus(route: Pick<CarRoute, 'speed'>, time: number, seconds = 5) {
  const { tb, cycle } = busCycle(route);
  const u = cycleTime(route, time);
  shift += (((cycle - seconds + tb - u) % cycle) + cycle) % cycle;
}

function cycleTime(route: Pick<CarRoute, 'speed'>, time: number) {
  const { cycle } = busCycle(route);
  return (((time + shift + cycle - BUS.first) % cycle) + cycle) % cycle;
}

/** Where the bus is at `time` seconds and what it's doing, written into `out` (it runs every frame). */
export function busRun(route: Pick<CarRoute, 'speed' | 'dir'>, time: number, out: BusRun): BusRun {
  const v = route.speed;
  const { tb, cycle } = busCycle(route);
  const u = cycleTime(route, time);
  const b = BUS.brake;
  let d: number; // metres past where it starts braking
  if (u < tb) {
    d = v * u - (v / (2 * tb)) * u * u;
    out.stage = 'arriving';
  } else if (u < tb + BUS.dwell) {
    d = b;
    out.stage = 'stopped';
  } else if (u < 2 * tb + BUS.dwell) {
    const w = u - tb - BUS.dwell;
    d = b + (v / (2 * tb)) * w * w;
    out.stage = 'leaving';
  } else {
    d = 2 * b + v * (u - 2 * tb - BUS.dwell);
    out.stage = 'driving';
  }
  out.next = out.stage === 'stopped' ? 0 : u < tb ? tb - u : cycle - u + tb;
  out.at = out.stage === 'stopped' ? u - tb : 0;
  const s = BUS.stopAt + route.dir * (d - b);
  out.s = ((((s + CAR_RANGE) % LOOP) + LOOP) % LOOP) - CAR_RANGE;
  return out;
}

/** The bus's pose for City.tsx, like carPose: x and z of its middle, and its yaw. */
export function busPose(route: CarRoute, time: number, run: BusRun, out: { x: number; z: number; yaw: number }) {
  busRun(route, time, run);
  if (route.axis === 'z') {
    out.x = route.line - route.dir * LANE;
    out.z = run.s;
    out.yaw = route.dir > 0 ? 0 : Math.PI;
  } else {
    out.x = run.s;
    out.z = route.line + route.dir * LANE;
    out.yaw = route.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  return out;
}

// ---------- the crossings' lights ----------

/** Seconds someone needs to get over a crossing, with a little to spare: the light's green only if that's clear. */
export const CROSS_SECONDS = 8;

/**
 * Whether no car on the road `c` crosses will be on its stripes for the next `horizon` seconds, given where each is
 * along its road at `time` (`along(route, time)`, carPose's s). Cars never stop; the people wait for them.
 */
export function crossingClear(routes: readonly CarRoute[], c: Crossing, time: number, along: (r: CarRoute, time: number) => number, horizon = CROSS_SECONDS) {
  for (const r of routes) {
    if (r.axis !== 'z' || r.line !== c.road) continue;
    const reach = r.len / 2 + 1.5; // half the car, and the stripes' half width
    // metres until its middle reaches the crossing, going its way round the loop
    const ahead = ((((c.z - along(r, time)) * r.dir) % LOOP) + LOOP) % LOOP;
    if (ahead < r.speed * horizon + reach || ahead > LOOP - reach) return false;
  }
  return true;
}

/** Where a car is along its road at `time`: carPose's s, without the rest of the pose. */
export function carAlong(r: Pick<CarRoute, 'start' | 'dir' | 'speed'>, time: number) {
  return ((((r.start + CAR_RANGE + r.dir * r.speed * time) % LOOP) + LOOP) % LOOP) - CAR_RANGE;
}
