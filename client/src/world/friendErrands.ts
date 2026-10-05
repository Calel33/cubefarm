// The high five (#267): when someone's PR merges, their free friends on the floor walk over to their desk and high-five
// them (social.ts sends them, a few seconds after the gong). Only free people go, within the walker cap; work calls
// them straight back like any idle errand. Imported by ErrandDirector.tsx, which registers it.

import { useStore } from '../store';
import { sayLine } from './Chatter';
import { registerErrand } from './errands';
import { bodyState } from './people';
import { queueFidget } from './reactionFeed';
import { fiveDone, fiveFor, noteSocial } from './social';
import { highFive } from './traitWeights';

const NORTH = -Math.PI / 2;

registerErrand({
  name: 'highfive',
  when: () => false, // social.ts sends them when a friend's PR merges
  speed: 1.5,
  spot: [],
  // beside their friend's chair, on the other side from a visitor looking over their shoulder
  place: (a, s) => {
    const host = s.others?.find((o) => o.id === fiveFor(a.id));
    return host ? { id: `five-${host.id}`, x: host.home.x - 0.5, z: host.home.z, facing: NORTH } : null;
  },
  steps: [
    { gesture: 'none', seconds: 0.4, face: 'peer' },
    { gesture: 'wave', seconds: 1.5, face: 'peer', cue: 'five' },
    { gesture: 'cheer', seconds: 1.2, face: 'peer' },
  ],
  cue(id, cue) {
    const host = fiveFor(id);
    if (cue !== 'five' || !host) return true;
    const name = useStore.getState().agents[host]?.name ?? '';
    sayLine(id, highFive(name, Math.random()));
    const me = bodyState(id);
    if (me) queueFidget(host, 'wave', me.x, me.z); // a hand up back from the chair
    noteSocial('high-five', id, name, host);
    return true;
  },
  end: (id) => fiveDone(id),
});
