import { describe, expect, it } from 'vitest';
import { angleDelta } from '../body';
import { BALCONY_OUT, EYE_HEIGHT, HALF_D, HALF_W, ROOF, SIDE_OPENINGS, WALL_T } from '../layout';
import { CITY, CORRIDOR_HALF, cityLayout } from '../outside/cityLayout';
import { newOrbit, newPose, orbitPose } from './cameraMath';
import {
  BANK,
  FLYOVER_S,
  GLIDE_S,
  ORBIT_TIER,
  RECEPTION_SPOT,
  RIDE,
  SAFE,
  SCREENSAVER,
  START_ORBIT,
  cardFraming,
  distanceAt,
  flightPose,
  flyoverFlight,
  glidePose,
  clearOfCity,
  idleDue,
  introPlan,
  mayIdle,
  newCinePose,
  pointAt,
  rideCounter,
  rideTiming,
  samplePath,
  sameLocalDay,
  screensaverPose,
  screensaverStart,
  startFov,
  startOrbit,
  storeyLabel,
  type CinePose,
} from './cinemaPaths';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();

/** The start orbit's pose `angle` radians round, as a cinematic pose. */
function orbitAt(angle: number, floor = 0, top = 3): CinePose {
  const o = startOrbit(floor, top, angle, startFov(floor, top, 16 / 9), newOrbit());
  return { ...orbitPose(o, newPose()), roll: 0 };
}

describe('introPlan', () => {
  const now = at(2026, 9, 5, 9);
  it('flies in to reception on the first visit of the day', () => {
    expect(introPlan({ lastVisit: null, now, skipIntro: false, reduced: false })).toEqual({ motion: 'flyover', dest: 'reception' });
    expect(introPlan({ lastVisit: at(2026, 9, 4, 23), now, skipIntro: false, reduced: false })).toEqual({ motion: 'flyover', dest: 'reception' });
  });
  it('glides to where you left off on a repeat visit, or with Skip intro', () => {
    expect(introPlan({ lastVisit: at(2026, 9, 5, 8), now, skipIntro: false, reduced: false })).toEqual({ motion: 'glide', dest: 'saved' });
    expect(introPlan({ lastVisit: null, now, skipIntro: true, reduced: false })).toEqual({ motion: 'glide', dest: 'saved' });
  });
  it('fades instead of flying with reduced motion, keeping the destination', () => {
    expect(introPlan({ lastVisit: null, now, skipIntro: false, reduced: true })).toEqual({ motion: 'fade', dest: 'reception' });
    expect(introPlan({ lastVisit: now - 1000, now, skipIntro: false, reduced: true })).toEqual({ motion: 'fade', dest: 'saved' });
  });
  it('compares local calendar days', () => {
    expect(sameLocalDay(at(2026, 0, 1, 0), at(2026, 0, 1, 23))).toBe(true);
    expect(sameLocalDay(at(2026, 0, 1, 23), at(2026, 0, 2, 0))).toBe(false);
    expect(sameLocalDay(at(2025, 0, 1), at(2026, 0, 1))).toBe(false);
  });
});

describe('the start orbit', () => {
  it('knows where the city is clear: the plaza and its streets, and everything above the roofs', () => {
    expect(SAFE.x).toBeLessThanOrEqual(CITY.homeHalfX + 2 * CORRIDOR_HALF);
    expect(SAFE.z).toBeLessThanOrEqual(CITY.homeHalfZ + 2 * CORRIDOR_HALF);
    const city = cityLayout();
    for (const b of [...city.buildings, ...city.boxes, ...city.cylinders, ...city.cones]) {
      const near = Math.hypot(Math.max(0, Math.abs(b.x) - b.w / 2), Math.max(0, Math.abs(b.z) - b.d / 2));
      if (near < START_ORBIT.dist + 10) expect(b.y + b.h).toBeLessThan(SAFE.skyline);
    }
  });
  it('stays clear of the city and outside the tower, all the way round, on any floor', () => {
    for (const [floor, top] of [
      [0, 1],
      [0, 10],
      [6, 10],
    ]) {
      for (let a = 0; a < Math.PI * 2; a += 0.1) {
        const p = orbitAt(a, floor, top);
        expect(clearOfCity(p.x, p.y + floor * 4.2, p.z)).toBe(true);
        expect(Math.hypot(p.x, p.z)).toBeGreaterThan(BALCONY_OUT + 10);
      }
    }
  });
  it('widens its view for a tall tower, within limits', () => {
    const short = startFov(0, 1, 16 / 9);
    const tall = startFov(0, 10, 16 / 9);
    expect(tall).toBeGreaterThan(short);
    expect(short).toBeGreaterThanOrEqual(START_ORBIT.minFov);
    expect(tall).toBeLessThanOrEqual(START_ORBIT.maxFov);
  });
  it('looks at the tower from whichever floor you are on', () => {
    const low = startOrbit(0, 5, 0, 50, newOrbit());
    const high = startOrbit(5, 5, 0, 50, newOrbit());
    expect(low.fy - high.fy).toBeCloseTo(5 * 4.2, 5);
  });
  it('sits the tower right of the start card on a wide screen', () => {
    const plain = cardFraming(50, 16 / 9, false);
    expect(plain).toEqual({ fitAspect: 16 / 9, yaw: 0 });
    const wide = cardFraming(50, 16 / 9, true);
    expect(wide.fitAspect).toBeLessThan(16 / 9);
    expect(wide.yaw).toBeGreaterThan(0); // turned left, so the tower is to the right
    expect(startFov(0, 4, wide.fitAspect)).toBeGreaterThanOrEqual(startFov(0, 4, 16 / 9));
  });
  it('turns slower on Low and draws no silhouettes there', () => {
    expect(ORBIT_TIER.low.speed).toBeLessThan(ORBIT_TIER.medium.speed);
    expect(ORBIT_TIER.low.silhouettes).toBe(0);
    expect(ORBIT_TIER.high.silhouettes).toBeGreaterThanOrEqual(ORBIT_TIER.medium.silhouettes);
  });
});

describe('splines and timing', () => {
  it('passes through every control point', () => {
    const pts = [
      [0, 0, 0],
      [10, 2, 0],
      [10, 2, 10],
      [0, 5, 12],
    ] as const;
    const path = samplePath(pts, 16);
    pts.forEach((p, i) => {
      const k = path.at[i];
      expect(path.xs[k]).toBeCloseTo(p[0], 6);
      expect(path.ys[k]).toBeCloseTo(p[1], 6);
      expect(path.zs[k]).toBeCloseTo(p[2], 6);
    });
    expect(path.length).toBeGreaterThan(10 + 10 + 10);
    const end = pointAt(path, path.length + 5);
    expect([end.x, end.y, end.z].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 5, 12]);
  });
  it('never backs up, and starts and stops at rest', () => {
    const knots = [
      { t: 0, d: 0 },
      { t: 2, d: 80 },
      { t: 3, d: 84 },
      { t: 5, d: 100 },
    ];
    let last = -1;
    for (let t = 0; t <= 5; t += 0.01) {
      const d = distanceAt(knots, t);
      expect(d).toBeGreaterThanOrEqual(last - 1e-9);
      last = d;
    }
    expect(distanceAt(knots, 0.01) - distanceAt(knots, 0)).toBeLessThan(0.05);
    expect(distanceAt(knots, 5) - distanceAt(knots, 4.99)).toBeLessThan(0.05);
    for (const k of knots) expect(distanceAt(knots, k.t)).toBeCloseTo(k.d, 6);
  });
});

describe('the flyover', () => {
  const fov = 72;
  const focus = { x: 0, y: 6, z: 0 };

  it('takes 4 to 6 seconds and ends in first person at reception', () => {
    for (const a of [0, 1, 2, 3, 4, 5, 6]) {
      const f = flyoverFlight(orbitAt(a), focus, fov);
      expect(f.duration).toBeGreaterThanOrEqual(FLYOVER_S.min);
      expect(f.duration).toBeLessThanOrEqual(FLYOVER_S.max);
      const end = flightPose(f, f.duration, newCinePose());
      expect(end.x).toBeCloseTo(RECEPTION_SPOT.x, 5);
      expect(end.z).toBeCloseTo(RECEPTION_SPOT.z, 5);
      expect(end.y).toBeCloseTo(EYE_HEIGHT, 5);
      expect(end.yaw).toBeCloseTo(RECEPTION_SPOT.yaw, 5);
      expect(end.pitch).toBeCloseTo(RECEPTION_SPOT.pitch, 5);
      expect(end.fov).toBeCloseTo(fov, 5);
      expect(end.near).toBeCloseTo(0.05, 5);
      expect(end.roll).toBeCloseTo(0, 5);
    }
  });

  it('starts exactly where the orbit was, with no jump', () => {
    const from = orbitAt(2.2);
    const f = flyoverFlight(from, focus, fov);
    const p = flightPose(f, 0, newCinePose());
    for (const k of ['x', 'y', 'z', 'yaw', 'pitch', 'fov'] as const) expect(p[k]).toBeCloseTo(from[k], 5);
    const q = flightPose(f, 1 / 60, newCinePose());
    expect(Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z)).toBeLessThan(0.2);
  });

  it('goes through the side door facing the camera, at walking height and walking pace', () => {
    for (const [a, side] of [
      [1.2, 'east'],
      [-1.2, 'west'],
      [Math.PI - 1.2, 'east'], // round the back
    ] as const) {
      const f = flyoverFlight(orbitAt(a), focus, fov);
      expect(f.side).toBe(side);
      const s = side === 'east' ? 1 : -1;
      const door = pointAt(f.path, f.door);
      expect(door.x).toBeCloseTo(s * (HALF_W + WALL_T / 2), 5);
      expect(door.z).toBeCloseTo(SIDE_OPENINGS.lobby[side].door, 5);
      expect(door.y).toBeCloseTo(EYE_HEIGHT, 5);
      // a little before and after the doorway it's still inside the opening (0.9 m either side, 2.5 m tall)
      for (const dd of [-0.4, 0.4]) {
        const p = pointAt(f.path, f.door + dd);
        expect(Math.abs(p.z - SIDE_OPENINGS.lobby[side].door)).toBeLessThan(0.75);
        expect(p.y).toBeLessThan(2.3);
      }
      // slow through the door: a few metres a second, not a blur
      const tDoor = f.knots[2].t;
      const v = (distanceAt(f.knots, tDoor + 0.05) - distanceAt(f.knots, tDoor - 0.05)) / 0.1;
      expect(v).toBeGreaterThan(2);
      expect(v).toBeLessThan(10);
    }
  });

  it('never flies through the city round the plaza', () => {
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const f = flyoverFlight(orbitAt(a), focus, fov);
      for (let d = 0; d < f.path.length; d += 0.5) {
        const p = pointAt(f.path, d);
        expect(clearOfCity(p.x, p.y, p.z), `at ${d.toFixed(1)} m from bearing ${a.toFixed(1)}`).toBe(true);
        expect(p.y).toBeGreaterThan(1);
      }
    }
  });

  it('never cuts through the tower on its way round', () => {
    for (let a = 0; a < Math.PI * 2; a += 0.4) {
      const f = flyoverFlight(orbitAt(a), focus, fov);
      for (let d = 0; d < f.door - 0.5; d += 0.5) {
        const p = pointAt(f.path, d);
        const inside = Math.abs(p.x) < HALF_W + WALL_T + 0.2 && Math.abs(p.z) < HALF_D + WALL_T + 0.2 && p.y > -0.1;
        expect(inside, `at ${d.toFixed(1)} m from bearing ${a.toFixed(1)}`).toBe(false);
      }
    }
  });

  it('banks a little into its turns, never more than the limit', () => {
    const f = flyoverFlight(orbitAt(3), focus, fov);
    let most = 0;
    for (let t = 0; t <= f.duration; t += 0.05) most = Math.max(most, Math.abs(flightPose(f, t, newCinePose()).roll));
    expect(most).toBeGreaterThan(0.01);
    expect(most).toBeLessThanOrEqual(BANK + 1e-9);
  });

  it('turns smoothly: no sudden swings of the view', () => {
    const f = flyoverFlight(orbitAt(0.7), focus, fov);
    let prev = flightPose(f, 0, newCinePose());
    for (let t = 1 / 60; t <= f.duration; t += 1 / 60) {
      const p = flightPose(f, t, newCinePose());
      expect(Math.abs(angleDelta(prev.yaw, p.yaw))).toBeLessThan(0.12);
      expect(Math.abs(p.pitch - prev.pitch)).toBeLessThan(0.12);
      prev = p;
    }
  });
});

describe('the glide', () => {
  it('goes from one pose to the other, eased', () => {
    const a: CinePose = { ...newCinePose(), x: 0, y: 20, z: 30, fov: 50 };
    const b: CinePose = { ...newCinePose(), x: 4, y: EYE_HEIGHT, z: 2, fov: 72 };
    expect(glidePose(a, b, 0, newCinePose())).toMatchObject({ x: 0, y: 20, z: 30, fov: 50 });
    const end = glidePose(a, b, 1, newCinePose());
    for (const k of ['x', 'y', 'z', 'fov'] as const) expect(end[k]).toBeCloseTo(b[k], 9);
    expect(glidePose(a, b, 0.1, newCinePose()).x).toBeLessThan(0.4); // eased in
    expect(GLIDE_S).toBe(1);
  });
});

describe('the screensaver', () => {
  it('starts after ten minutes without input', () => {
    expect(SCREENSAVER.idleMs).toBe(600_000);
    expect(idleDue(0, 599_999)).toBe(false);
    expect(idleDue(0, 600_000)).toBe(true);
  });
  it('only while you are on foot and not busy', () => {
    const ok = { started: true, overlay: false, travel: false, photo: false, firstPerson: true, paddle: false };
    expect(mayIdle(ok)).toBe(true);
    for (const k of ['overlay', 'travel', 'photo', 'paddle'] as const) expect(mayIdle({ ...ok, [k]: true })).toBe(false);
    expect(mayIdle({ ...ok, started: false })).toBe(false);
    expect(mayIdle({ ...ok, firstPerson: false })).toBe(false);
  });
  it('orbits inside the floor, under the ceiling, looking at the middle', () => {
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const p = screensaverPose(a, 60, newCinePose());
      expect(Math.abs(p.x)).toBeLessThan(HALF_W - 2);
      expect(Math.abs(p.z)).toBeLessThan(HALF_D - 2);
      expect(p.y).toBeLessThan(3.6);
      expect(p.pitch).toBeLessThan(0);
      // facing the middle: the look direction points back towards the origin
      const fx = -Math.sin(p.yaw);
      const fz = -Math.cos(p.yaw);
      expect(fx * -p.x + fz * -p.z).toBeGreaterThan(0);
    }
  });
  it('starts on your side of the room', () => {
    const a = screensaverStart(10, -6);
    const p = screensaverPose(a, 60, newCinePose());
    expect(Math.sign(p.x)).toBe(1);
    expect(Math.sign(p.z)).toBe(-1);
  });
});

describe('the elevator ride', () => {
  it('closes the doors, rides a while longer for more storeys, then opens', () => {
    const one = rideTiming(0, 1, 5, false);
    const five = rideTiming(0, 5, 5, false);
    expect(one.closeMs).toBe(RIDE.closeMs);
    expect(one.rideMs).toBe(RIDE.minRideMs);
    expect(five.rideMs).toBeGreaterThan(one.rideMs);
    expect(rideTiming(0, 40, 40, false).rideMs).toBe(RIDE.maxRideMs);
    expect(rideTiming(ROOF, 0, 3, false).rideMs).toBe(rideTiming(0, ROOF, 3, false).rideMs);
  });
  it('is a plain fade with reduced motion', () => {
    expect(rideTiming(0, 5, 5, true)).toEqual({ closeMs: RIDE.reducedCloseMs, rideMs: 0, openMs: RIDE.reducedOpenMs });
  });
  it('counts the storeys on the indicator, G to R', () => {
    expect(rideCounter(0, 3, 3, 0)).toBe('G');
    expect(rideCounter(0, 3, 3, 0.5)).toMatch(/^[12]$/);
    expect(rideCounter(0, 3, 3, 1)).toBe('3');
    expect(rideCounter(2, ROOF, 3, 1)).toBe('R');
    expect(rideCounter(ROOF, 0, 3, 0)).toBe('R');
    expect(storeyLabel(0, 3)).toBe('G');
    expect(storeyLabel(4, 3)).toBe('R');
  });
});
