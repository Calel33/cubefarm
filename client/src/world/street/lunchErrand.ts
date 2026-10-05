// Lunch out, seen from upstairs (lunchOut.ts): an idle developer or tester walks to the elevator, steps in and rides
// down out of sight; once their lunch is over they step back out and go back to their desk. A scripted errand
// (errands.ts) that the errand director runs on the floor you're on, so it counts against that floor's walker cap;
// LunchPeople.tsx plays the same visit down on the street. Like roof/roofErrand.ts.

import { useStore } from '../../store';
import { ding } from '../../ui/sfx';
import { isFree, registerErrand, type Act, type ErrandAgent, type ErrandScript, type ErrandState } from '../errands';
import { HALF_D, ROOF } from '../layout';
import { setHidden } from '../people';
import { CABIN, DOORS_SECONDS } from '../socials';
import { endLunch, LUNCH, lunchVisit, lunchVisits, planLunch, roomForLunch, startLunch } from './lunchOut';

const NORTH = 0; // a body heading facing -z: out through the cabin's doors
const DOORS_SHUT = 0.9; // seconds stood in the cabin before the doors close on them

/** Into the cabin and down; a while later back out of it, and then the director walks them home. */
export function rideDown(id: string): ErrandScript {
  let stage: 'in' | 'doors' | 'away' | 'out' = 'in';
  let t = 0;
  const act: Act = { do: 'walk', x: CABIN.x, z: CABIN.z, heading: NORTH, gesture: 'none' };
  const doing = (d: Act['do']) => ((act.do = d), act);
  return {
    tick(me) {
      switch (stage) {
        case 'in':
          if (!me.arrived) return doing('walk');
          stage = 'doors';
          t = 0;
          return doing('stand');
        case 'doors': {
          t += me.dt;
          if (t < DOORS_SHUT) return doing('stand');
          const now = Date.now();
          const v = lunchVisit(id) ?? planLunch(lunchVisits(now), id, now, Math.random());
          if (!v) return doing('done'); // someone else went first: back out
          startLunch(v);
          setHidden(id, true);
          stage = 'away';
          return doing('stand');
        }
        case 'away': {
          const v = lunchVisit(id);
          if (v && Date.now() < v.leave + LUNCH.ride * 1000) return doing('stand');
          endLunch(id);
          setHidden(id, false);
          ding({ x: 0, y: 2.6, z: HALF_D });
          stage = 'out';
          t = 0;
          return doing('stand');
        }
        case 'out':
          t += me.dt;
          return doing(t < DOORS_SECONDS ? 'stand' : 'done');
      }
    },
    // However it ends (back up, called back to work, the floor left behind), they're in sight again. Lunch carries on
    // down on the street until it's over: follow them down and they're there.
    end() {
      setHidden(id, false);
    },
  };
}

const goesOut = (a: ErrandAgent, s: ErrandState) => (a.role === 'dev' || a.role === 'qa') && s.floor === 'office' && isFree(a.status) && s.seatedFor >= s.restless && roomForLunch(lunchVisits(), a.id, Date.now());

registerErrand({
  name: 'lunch',
  when: goesOut,
  spot: ['elevator'],
  steps: [],
  weight: LUNCH.weight,
  max: 1,
  script: (a) => (roomForLunch(lunchVisits(), a.id, Date.now()) ? rideDown(a.id) : null),
});

// Arriving on an office floor starts it fresh, everyone at their desk (ErrandDirector.tsx): nobody from there is still out.
useStore.subscribe((s, prev) => {
  if (s.floor === prev.floor || s.floor === ROOF || s.floor === 0) return;
  const repo = s.repos.find((r) => r.floor === s.floor);
  for (const v of lunchVisits()) if (repo && s.agents[v.id]?.repoId === repo.id) endLunch(v.id);
});
