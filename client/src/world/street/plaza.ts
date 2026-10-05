// The plaza round the building at street level (#264), as plain numbers: our own block of the city (outside/cityLayout.ts
// paves it) from the building's walls out to the kerb. The west side is the front: the lobby's west door opens onto an
// avenue with benches, trees in planters and the building's name; north of it the food truck, south of it the newsstand
// and the pocket park (grass, a tree to sit under, a fountain, pigeons). The bus stops on the east pavement. Street lamps
// all round. Pure (no three.js): Street.tsx draws it, Game.tsx adds its colliders to the lobby's, and the tests check
// that the walks people take out here are clear. Units and axes as in layout.ts; -z is north.

import { CITY } from '../outside/cityLayout';
import { BALCONY, BALCONY_OUT, HALF_D, HALF_W, SIDE_OPENINGS, WALL_T, type Rect, rect } from '../layout';
import type { Pt } from '../toys/roombaBrain';

/** Our block: paving to |x| halfX, |z| halfZ, then a pavement out to the kerb, where the road starts. */
export const PLAZA = {
  halfX: CITY.homeHalfX,
  halfZ: CITY.homeHalfZ,
  kerbX: CITY.homeHalfX + CITY.pavement,
  kerbZ: CITY.homeHalfZ + CITY.pavement,
};

/** Where people walk by on the pavement all round our block, nearer the kerb than the plaza. */
export const PAVEMENT = { x: PLAZA.kerbX - 0.8, z: PLAZA.kerbZ - 0.8 };

/** The lobby's west and east doors, from outside: the doorway's middle (in the wall) and a step out onto the patio. */
export const DOORS = {
  west: { x: -(HALF_W + WALL_T / 2), z: SIDE_OPENINGS.lobby.west.door },
  east: { x: HALF_W + WALL_T / 2, z: SIDE_OPENINGS.lobby.east.door },
};
/** Just inside each door (in the lobby), where people walking out head for first. */
export const INSIDE = { west: { x: -HALF_W + 0.9, z: DOORS.west.z }, east: { x: HALF_W - 0.9, z: DOORS.east.z } };

/** Away from the building's walls and its patios, x: the strip people walk along outside the west patio. */
const LANE_X = -(BALCONY_OUT + 1);

// ---------- what stands out here ----------

/** The food truck, parked on the plaza north of the avenue, its serving hatch on its east side facing the building. */
export const TRUCK = { x: -24.5, z: -16, w: 2.4, l: 5.6, h: 3.1, hatchZ: -15.6, hatchY: 1.35 };
/** Where you stand to order (facing west, at the hatch). */
export const ORDER_SPOT = { x: TRUCK.x + TRUCK.w / 2 + 1.0, z: TRUCK.hatchZ };

/** The newsstand: a booth south of the avenue, its headline board facing north. */
export const KIOSK = { x: -22, z: 13.6, w: 1.8, d: 1.6, h: 2.5 };

/** The building's name, in big letters on a low wall by the avenue, facing the street and the door. */
export const NAME_SIGN = { x: -24, z: -4.2, len: 6.4, t: 0.7, h: 1.25 };

/** The pocket park in the south-west corner: grass, a big tree to sit under, a fountain, a bench and the pigeons. */
export const PARK = { minX: -27.5, maxX: -7, minZ: 16.5, maxZ: 25.2 };
export const FOUNTAIN = { x: -12.2, z: 20.8, r: 1.75, rim: 0.5, jet: 1.5 };
export const BIG_TREE = { x: -22.6, z: 21, trunk: 0.38, crown: 3.4 };
/** Sitting under the tree: your back to its trunk, looking east across the park to the fountain. */
export const TREE_SEAT = { x: BIG_TREE.x + BIG_TREE.trunk + 0.45, z: BIG_TREE.z, eye: 1.0, exit: { x: BIG_TREE.x + 1.6, z: BIG_TREE.z } };
/** Where the pigeons peck about, between the tree and the fountain. */
export const PIGEON_HOME = { x: -17, z: 19.6, r: 1.6 };

/** The bus stop at the east edge of the plaza: a shelter with its back to the building, where the bus pulls in. */
export const BUS_STOP = { x: PLAZA.halfX + 0.3, z: -4, len: 3.6, depth: 1.3, h: 2.4 };
/** Where a passenger steps down off the bus, onto the pavement. */
export const BUS_STEP = { x: PLAZA.kerbX - 0.5, z: BUS_STOP.z + 3.2 };

/** A bench: centre, length along `along`, facing (a walkways-style facing: 0 east, π/2 south, π west, -π/2 north). */
export interface Bench {
  x: number;
  z: number;
  along: 'x' | 'z';
  facing: number;
}
export const BENCH = { l: 1.8, w: 0.6, h: 0.85 };

const EAST = 0;
const SOUTH = Math.PI / 2;
const WEST = Math.PI;
const NORTH = -Math.PI / 2;

export const BENCHES: Bench[] = [
  { x: -24.6, z: 7.3, along: 'x', facing: NORTH }, // either side of the avenue, facing it
  { x: -24.6, z: 1.7, along: 'x', facing: SOUTH },
  { x: -17.5, z: 24.4, along: 'x', facing: NORTH }, // in the park, looking at the fountain
  { x: 24, z: -10.5, along: 'x', facing: SOUTH }, // the east plaza
  { x: 24, z: 12.5, along: 'x', facing: NORTH },
  { x: -6, z: -22.4, along: 'x', facing: SOUTH }, // the north plaza
  { x: 8, z: -22.4, along: 'x', facing: SOUTH },
];

/** Square planters with a little tree in each. */
export const TREE_PLANTERS: Pt[] = [
  { x: -21.6, z: 8.2 },
  { x: -27.6, z: 8.2 },
  { x: -21.6, z: 0.8 },
  { x: -27.6, z: 0.8 },
  { x: 21.5, z: -6.5 },
  { x: 21.5, z: 7.5 },
  { x: 26.5, z: 19 },
  { x: -14, z: -19.5 },
  { x: 0, z: -19.5 },
  { x: 14, z: -19.5 },
  { x: 8, z: 20.5 },
  { x: 18, z: 20.5 },
];
export const PLANTER = { w: 1.4, h: 0.55 };

/** Street lamps round the plaza, a little in from the pavement. */
export const LAMPS: Pt[] = [
  ...[-21, -9, 11, 21].map((z) => ({ x: -PLAZA.halfX + 0.8, z })),
  ...[-21, -12, 5, 16].map((z) => ({ x: PLAZA.halfX - 0.8, z })),
  ...[-20, -6, 6, 20].map((x) => ({ x, z: -PLAZA.halfZ + 0.8 })),
  ...[-2, 10, 22].map((x) => ({ x, z: PLAZA.halfZ - 0.8 })),
  { x: -7.6, z: 18 },
];
export const LAMP = { h: 3.8, r: 0.08 };

/** Where puddles gather in the rain (centre and radii). */
export const PUDDLES: { x: number; z: number; rx: number; rz: number }[] = [
  { x: -21.5, z: -9.5, rx: 1.4, rz: 0.8 },
  { x: -27, z: 12.5, rx: 1.1, rz: 0.7 },
  { x: -10, z: -23.5, rx: 1.6, rz: 0.9 },
  { x: 11, z: -16, rx: 1.2, rz: 0.7 },
  { x: 26, z: 2, rx: 0.9, rz: 1.4 },
  { x: 4, z: 22.5, rx: 1.5, rz: 0.8 },
  { x: -3.5, z: -16, rx: 0.8, rz: 0.6 },
];

// ---------- the zebra crossings ----------

/**
 * The crossings people walk over, across the west road at our block's north and south corners (the city's ground paints
 * the stripes there): from our kerb to the far one along x at z, a light on a pole at each end.
 */
export interface Crossing {
  id: 'nw' | 'sw';
  z: number;
  /** Our kerb and the far one (x). */
  near: number;
  far: number;
  /** The road's centreline it crosses (x), for which cars to wait for. */
  road: number;
}
const WEST_ROAD = -(CITY.homeHalfX + CITY.roadHalf + CITY.pavement);
export const CROSSINGS: Crossing[] = (['nw', 'sw'] as const).map((id) => ({
  id,
  z: (id === 'nw' ? -1 : 1) * PAVEMENT.z,
  near: -PLAZA.kerbX,
  far: WEST_ROAD - CITY.roadHalf,
  road: WEST_ROAD,
}));

/** A crossing light's pole: on the corner of the pavement at our kerb (or the far one), just short of the stripes. */
export function crossingPole(c: Crossing, end: 'near' | 'far'): Pt {
  return { x: end === 'near' ? c.near + 0.25 : c.far - 0.25, z: c.z - Math.sign(c.z) * 1.65 };
}

// ---------- colliders ----------

/** Beyond the kerb all round: the road. You stay on the plaza and its pavements. */
export function kerbRects(): Rect[] {
  const big = 200;
  const { kerbX: X, kerbZ: Z } = PLAZA;
  return [
    { minX: -big, maxX: -X, minZ: -big, maxZ: big },
    { minX: X, maxX: big, minZ: -big, maxZ: big },
    { minX: -X, maxX: X, minZ: -big, maxZ: -Z },
    { minX: -X, maxX: X, minZ: Z, maxZ: big },
  ];
}

export function benchRect(b: Bench): Rect {
  return b.along === 'x' ? rect(b.x, b.z, BENCH.l, BENCH.w, BENCH.h) : rect(b.x, b.z, BENCH.w, BENCH.l, BENCH.h);
}

/** Everything solid out here: the props, the fountain's basin, the tree, the lamps and the bus shelter's back and bench. */
export function plazaProps(): Rect[] {
  const s = BUS_STOP;
  const back = s.x - s.depth / 2;
  return [
    rect(TRUCK.x, TRUCK.z, TRUCK.w, TRUCK.l, TRUCK.h),
    rect(KIOSK.x, KIOSK.z, KIOSK.w, KIOSK.d, KIOSK.h),
    rect(NAME_SIGN.x, NAME_SIGN.z, NAME_SIGN.t, NAME_SIGN.len, NAME_SIGN.h),
    rect(FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.r * 2, FOUNTAIN.r * 2, FOUNTAIN.rim),
    rect(BIG_TREE.x, BIG_TREE.z, BIG_TREE.trunk * 2, BIG_TREE.trunk * 2),
    ...BENCHES.map(benchRect),
    ...TREE_PLANTERS.map((p) => rect(p.x, p.z, PLANTER.w, PLANTER.w, PLANTER.h)),
    ...LAMPS.map((p) => rect(p.x, p.z, 0.3, 0.3, LAMP.h)),
    { minX: back - 0.06, maxX: back + 0.06, minZ: s.z - s.len / 2, maxZ: s.z + s.len / 2, h: s.h },
    rect(back + 0.4, s.z, 0.45, s.len - 0.6, 0.5),
    ...CROSSINGS.map((c) => rect(crossingPole(c, 'near').x, crossingPole(c, 'near').z, 0.2, 0.2, 2.6)), // the crossing lights' poles on our kerb
  ];
}

/** The plaza's colliders, added to the lobby's (Game.tsx): its props and the kerb. */
export function plazaColliders(): Rect[] {
  return [...plazaProps(), ...kerbRects()];
}

// ---------- where you are ----------

/** Out of the building, its patios and the elevator's shaft: out on the plaza. */
export function onPlaza(x: number, z: number) {
  if (Math.abs(x) > PLAZA.kerbX || Math.abs(z) > PLAZA.kerbZ) return false;
  const patio = Math.abs(x) <= BALCONY_OUT && z >= BALCONY.minZ && z <= BALCONY.maxZ;
  return !patio && (Math.abs(x) > HALF_W + WALL_T || Math.abs(z) > HALF_D + WALL_T);
}

/** Whether (x, z) is on the park's grass. */
export const inPark = (x: number, z: number) => x >= PARK.minX && x <= PARK.maxX && z >= PARK.minZ && z <= PARK.maxZ;

// ---------- walks out here ----------

/** Where the lunch crowd goes (lunchOut.ts): queueing at the truck's hatch, then eating in the park or on the avenue. */
export interface LunchSpot extends Pt {
  id: string;
  /** body.ts heading once there (0 faces -z). */
  heading: number;
}
const heading = (facing: number) => Math.atan2(-Math.cos(facing), -Math.sin(facing));

export const TRUCK_LINE: LunchSpot[] = [
  { id: 'truck-0', x: ORDER_SPOT.x + 0.2, z: TRUCK.hatchZ - 1.1, heading: heading(WEST) },
  { id: 'truck-1', x: ORDER_SPOT.x + 0.2, z: TRUCK.hatchZ + 1.2, heading: heading(WEST) },
];
export const EAT_SPOTS: LunchSpot[] = [
  { id: 'fountain-w', x: FOUNTAIN.x - FOUNTAIN.r - 0.75, z: FOUNTAIN.z, heading: heading(EAST) },
  { id: 'fountain-n', x: FOUNTAIN.x, z: FOUNTAIN.z - FOUNTAIN.r - 0.75, heading: heading(SOUTH) },
  { id: 'park-bench', x: -17.5, z: 23.4, heading: heading(NORTH) },
  { id: 'avenue', x: -24.6, z: 6.2, heading: heading(NORTH) },
];

/** The strip outside the west patio, with a stop level with the door, and its ends by the truck and by the park. */
const LANE = { door: { x: LANE_X, z: DOORS.west.z }, north: { x: LANE_X, z: TRUCK.hatchZ }, south: { x: LANE_X, z: PARK.minZ + 1.2 } };

/** The lane's stop nearest a spot: its north end for the truck, its south end for the park, else level with the door. */
const laneFor = (p: Pt) => (p.z < LANE.door.z - 3 ? LANE.north : p.z > LANE.door.z + 3 ? LANE.south : LANE.door);

/** From just inside the west door out to a spot: through the door, along the lane outside the patio, and on. */
export function walkOut(to: Pt): Pt[] {
  const out: Pt[] = [{ x: DOORS.west.x - 0.9, z: DOORS.west.z }, LANE.door];
  const lane = laneFor(to);
  if (lane !== LANE.door) out.push(lane);
  out.push({ x: to.x, z: to.z });
  return out;
}

/** From one spot out here to another (the truck to the park), by the lane. */
export function walkAcross(from: Pt, to: Pt): Pt[] {
  const a = laneFor(from);
  const b = laneFor(to);
  return a === b ? [a, { x: to.x, z: to.z }] : [a, b, { x: to.x, z: to.z }];
}

/** And back: the same way, ending just inside the west door. */
export function walkIn(from: Pt): Pt[] {
  return [...walkOut(from).reverse().slice(1), INSIDE.west];
}

/** A passenger off the bus, to the east door and in. */
export function busWalkIn(): Pt[] {
  return [
    { x: BUS_STEP.x - 1, z: BUS_STEP.z },
    { x: BALCONY_OUT + 1.2, z: DOORS.east.z },
    { x: DOORS.east.x + 0.9, z: DOORS.east.z },
    INSIDE.east,
  ];
}

/** Every walk the plaza's people take, as legs, for the tests (and the probe) to check they're clear. */
export function plazaWalks(): Pt[][] {
  const spots = [...TRUCK_LINE, ...EAT_SPOTS, ORDER_SPOT];
  const across = TRUCK_LINE.flatMap((t) => EAT_SPOTS.map((e) => [t, ...walkAcross(t, e)]));
  return [...spots.map((s) => [DOORS.west, ...walkOut(s)]), ...spots.map((s) => [s, ...walkIn(s)]), ...across, [BUS_STEP, ...busWalkIn()]];
}
