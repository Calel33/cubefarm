import { useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useStore, type Agent } from '../../store';
import { ding } from '../../ui/sfx';
import { HURRY_SPEED, isFree, nextWaypoint } from '../errands';
import type { Gesture } from '../body';
import { Character } from '../Character';
import { HALF_D } from '../layout';
import { bodyState, placeBody, say, seatBody, setBody, setHandFood } from '../people';
import { CABIN, DOORS_SECONDS } from '../socials';
import type { Pt } from '../toys/roombaBrain';
import { findPath, WALK_SPEED, walkways } from '../walkways';
import { endLunch, lunchStage, lunchVisits, planLunch, startLunch, updateLunch } from './lunchOut';
import { EAT_SPOTS, INSIDE, TRUCK_LINE, walkAcross, walkIn, walkOut, type LunchSpot } from './plaza';
import { streetWalkers } from './streetState';
import { dishAt, MENU } from './streetRules';
import { useStreetOp, useStreetReport } from './streetOps';

// The lunch crowd (lunchOut.ts): someone out for lunch steps out of the lobby's elevator, walks across the lobby and out
// of the west door, queues at the food truck's hatch, takes their lunch to the park or a bench on the avenue and eats
// it, and when their time's up (or work comes in) walks back in and takes the elevator up. While you're in the lobby,
// now and then someone free comes down on their own, two at most at once. Their bodies are people.ts's, like
// everyone's; this only drives them, and each one out on the plaza opens the doors for themselves (streetWalkers).

const NORTH = 0; // body headings: 0 faces −z
const LIFT: Pt = { x: 0, z: HALF_D - 1 };
/** Seconds between rolls for someone coming down while you're here, the chance per roll, and their ride. */
const ROLL = { every: 8, chance: 0.12, ride: 2.5 };
const ALREADY_OUT = 3000; // ms: a visit that started this long before you got here is already eating
const ORDER = { reach: 1.4, wait: 2.6 };

type Stage = 'riding' | 'doors' | 'out' | 'order' | 'wait' | 'carry' | 'eat' | 'back';

interface Walker {
  id: string;
  line: LunchSpot;
  eat: LunchSpot;
  stage: Stage;
  t: number;
  path: Pt[];
  wp: number;
  hurry: boolean;
  waited: number;
  bite: number;
  door: Pt;
}

function Luncher({ agent }: { agent: Agent }) {
  return (
    <group position={[CABIN.x, 0, CABIN.z]}>
      <Character agent={agent} />
    </group>
  );
}

export function LunchPeople() {
  const camera = useThree((s) => s.camera);
  const agents = useStore((s) => s.agents);
  const [drawn, setDrawn] = useState<string[]>([]);
  const walkers = useMemo(() => new Map<string, Walker>(), []);
  const run = useMemo(() => ({ roll: ROLL.every, mounted: Date.now(), dirty: false, served: 0 }), []);
  const lobby = useMemo(() => walkways('lobby'), []);

  // Off the lobby: their visits carry on (lunchOut.ts), but nobody here drives their bodies any more.
  useEffect(
    () => () => {
      for (const w of walkers.values()) {
        seatBody(w.id);
        setHandFood(w.id, null);
        say(w.id, null);
        const i = streetWalkers.indexOf(w.door);
        if (i >= 0) streetWalkers.splice(i, 1);
      }
      walkers.clear();
    },
    [walkers],
  );

  const comeDown = (a: Agent | undefined, seconds?: number) => {
    if (!a || !isFree(a.status) || (a.role !== 'dev' && a.role !== 'qa')) return false;
    const v = planLunch(lunchVisits(), a.id, Date.now(), Math.random(), { ride: ROLL.ride, stay: seconds });
    if (v) startLunch(v);
    return !!v;
  };
  useStreetOp('lunch', (arg) => {
    const [id, secs] = arg.split(':');
    if (!comeDown(useStore.getState().agents[id], secs ? Number(secs) : undefined)) useStore.getState().pushToast('info', '🌮 No room for them at the truck just now (or they are busy)');
  });
  useStreetReport('lunch', () =>
    [...walkers.values()].map((w) => {
      const b = bodyState(w.id);
      return { id: w.id, name: useStore.getState().agents[w.id]?.name ?? w.id, stage: w.stage, eat: w.eat.id, x: b ? Math.round(b.x * 10) / 10 : null, z: b ? Math.round(b.z * 10) / 10 : null };
    }),
  );

  const show = (w: Walker, on: boolean) => {
    run.dirty = true;
    if (on) return void walkers.set(w.id, w);
    walkers.delete(w.id);
    seatBody(w.id); // back to whatever their own floor has them doing
    setHandFood(w.id, null);
    const i = streetWalkers.indexOf(w.door);
    if (i >= 0) streetWalkers.splice(i, 1);
  };
  const lobbyPath = (from: Pt, to: Pt) => findPath(lobby, from, to) ?? [to];
  const goHome = (w: Walker, from: Pt, hurry: boolean) => {
    w.stage = 'back';
    w.hurry = hurry;
    w.path = [...walkIn(from), ...lobbyPath(INSIDE.west, LIFT), CABIN];
    w.wp = 0;
    say(w.id, null);
    if (hurry) updateLunch(w.id, { leave: Date.now() });
  };

  /** One frame along w's path; true once they're at its end and stood still. */
  const follow = (w: Walker, dt: number, gesture: Gesture, face?: number) => {
    const st = bodyState(w.id);
    if (!st) return false;
    w.wp = nextWaypoint(w.path, w.wp, st);
    const goal = w.path[w.wp];
    const last = w.wp === w.path.length - 1;
    const dx = goal.x - st.x;
    const dz = goal.z - st.z;
    const d = Math.hypot(dx, dz);
    w.door.x = st.x;
    w.door.z = st.z;
    if (last && d < 0.08 && st.speed < 0.05) return true;
    // wait a moment for the player standing right in the way, then walk on through
    const px = camera.position.x - st.x;
    const pz = camera.position.z - st.z;
    if (d > 0.3 && Math.hypot(px, pz) < 0.75 && px * dx + pz * dz > 0 && w.waited < 3) {
      w.waited += dt;
      setBody(w.id, { mode: 'standing', x: st.x, z: st.z, heading: st.heading, gesture });
      return false;
    }
    if (Math.hypot(px, pz) > 1.2) w.waited = 0;
    setBody(w.id, { mode: 'walking', x: goal.x, z: goal.z, heading: last && face !== undefined ? face : Math.atan2(-dx, -dz), speed: w.hurry ? HURRY_SPEED : WALK_SPEED, gesture });
    return false;
  };

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const now = Date.now();
    const s = useStore.getState();
    const visits = lunchVisits(now);

    for (const v of visits) {
      if (walkers.has(v.id) || !s.agents[v.id]) continue;
      const stage = lunchStage(v, now);
      if (stage === 'back') continue;
      const w: Walker = { id: v.id, line: TRUCK_LINE[v.line], eat: EAT_SPOTS[v.eat], stage: 'riding', t: 0, path: [], wp: 0, hurry: false, waited: 0, bite: 2, door: { x: CABIN.x, z: CABIN.z } };
      if (stage === 'out' && (now - v.arrive > ALREADY_OUT || now - run.mounted < 1000)) {
        // they were out here before you came down: eating already
        w.stage = 'eat';
        placeBody(v.id, w.eat.x, w.eat.z, w.eat.heading);
        setHandFood(v.id, dishAt(v.arrive));
        streetWalkers.push(w.door);
        w.door.x = w.eat.x;
        w.door.z = w.eat.z;
        run.dirty = true;
      }
      show(w, true);
    }

    for (const w of walkers.values()) {
      const a = s.agents[w.id];
      const v = visits.find((x) => x.id === w.id);
      if (!a || (!v && (w.stage === 'riding' || w.stage === 'eat'))) {
        show(w, false);
        continue;
      }
      w.t += dt;
      const st = bodyState(w.id);
      const busy = !isFree(a.status);
      const over = !v || now >= v.leave;
      switch (w.stage) {
        case 'riding':
          if (v && now >= v.arrive) {
            placeBody(w.id, CABIN.x, CABIN.z, NORTH);
            ding({ x: 0, y: 2.6, z: HALF_D });
            w.stage = 'doors';
            w.t = 0;
            run.dirty = true; // out of the elevator: drawn from now on
          }
          break;
        case 'doors':
          if (w.t < DOORS_SECONDS) break;
          w.path = [LIFT, ...lobbyPath(LIFT, INSIDE.west), ...walkOut(w.line)];
          w.wp = 0;
          w.stage = 'out';
          streetWalkers.push(w.door);
          break;
        case 'out':
          if (busy && st) goHome(w, st, true);
          else if (follow(w, dt, 'none', w.line.heading)) {
            w.stage = 'order';
            w.t = 0;
          }
          break;
        case 'order':
          setBody(w.id, { gesture: w.t < ORDER.reach ? 'talk' : 'none' });
          if (w.t > ORDER.reach) {
            w.stage = 'wait';
            w.t = 0;
          }
          break;
        case 'wait':
          if (w.t > ORDER.wait) {
            const dish = dishAt(now);
            setHandFood(w.id, dish);
            say(w.id, MENU[dish].emoji, 2.5);
            run.served++;
            w.path = walkAcross(w.line, w.eat);
            w.wp = 0;
            w.stage = 'carry';
          }
          break;
        case 'carry':
          if (busy && st) goHome(w, st, true);
          else if (follow(w, dt, 'hold', w.eat.heading)) {
            w.stage = 'eat';
            w.t = 0;
          }
          break;
        case 'eat':
          if ((over || busy) && st) {
            setHandFood(w.id, null);
            goHome(w, w.eat, busy);
            break;
          }
          // a bite now and then, looking about in between
          w.bite -= dt;
          if (w.bite <= 0) w.bite = 3 + Math.random() * 5;
          setBody(w.id, { mode: 'standing', x: w.eat.x, z: w.eat.z, heading: w.eat.heading, gesture: w.bite < 1.2 ? 'sip' : 'none' });
          break;
        case 'back':
          if (follow(w, dt, 'none')) {
            endLunch(w.id);
            show(w, false);
          }
          break;
      }
    }

    // Now and then, while you're in the lobby, someone free pops out for lunch.
    run.roll -= dt;
    if (run.roll <= 0) {
      run.roll = ROLL.every;
      const out = new Set(visits.map((v) => v.id));
      const free = Object.values(s.agents).filter((a) => !out.has(a.id) && isFree(a.status) && (a.role === 'dev' || a.role === 'qa'));
      if (free.length && Math.random() < ROLL.chance) comeDown(free[Math.floor(Math.random() * free.length)]);
    }

    if (run.dirty) {
      run.dirty = false;
      setDrawn([...walkers.values()].filter((w) => w.stage !== 'riding').map((w) => w.id));
    }
  });

  return (
    <group>
      {drawn.map((id) => {
        const a = agents[id];
        return a ? <Luncher key={id} agent={a} /> : null;
      })}
    </group>
  );
}
