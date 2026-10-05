// window.__swarmSecrets (#266): the secrets for QA and Playwright, without pointer lock. Reads return fresh snapshots:
// the ducks (where each hides, and whether this browser found it), the room, the eggs, the polaroids. The methods do
// what the keys and clicks would.

import { useStore } from '../../store';
import { DUCKS, DUCKS_TO_OPEN, hintsLeft } from './ducks';
import { CEO_CLICKS, isEggId, type Moment } from './eggs';
import { discoOn, eggFound, findDuck, pullBook, resetHunt, revealHint, snapMoment, spillMug, startDisco, stopDisco, useSecrets } from './secretsState';
import { saidHello } from './actions';
import { inSecretRoom } from './room';
import { playerAt } from '../camera/rig';
import { CEO_ID } from '../../../../shared/types';

function snapshot() {
  const s = useSecrets.getState();
  return {
    found: [...s.found],
    count: s.found.length,
    total: DUCKS.length,
    ducks: DUCKS.map((d) => ({ id: d.id, place: d.place, x: d.x, y: d.y, z: d.z, name: d.name, hint: d.hint, found: s.found.includes(d.id), hinted: s.hinted.includes(d.id) })),
    hintsLeft: hintsLeft(s.found, s.hinted),
    room: { open: s.open, opensAt: DUCKS_TO_OPEN, inside: useStore.getState().floor === 0 && inSecretRoom(playerAt.x, playerAt.z) },
    eggs: [...s.eggs],
    disco: s.disco && discoOn(performance.now()),
    spill: s.spill,
    pi: s.pi,
    polaroids: s.polaroids.map((p) => ({ moment: p.moment, at: p.at, caption: p.caption, photo: !!p.image })),
    fact: s.fact,
  };
}

const api = {
  /** Picks up a duck by id, as E on it would (wherever you are). */
  find: (id: string) => findDuck(id),
  /** Every duck at once. */
  findAll: () => DUCKS.forEach((d) => findDuck(d.id)),
  reset: () => resetHunt(),
  hint: (id: string) => revealHint(id),
  /** Pulls the odd book: opens (or shuts) the bookshelf. */
  book: () => pullBook(),
  konami: () => startDisco(),
  stopDisco: () => stopDisco(),
  coffee: () => spillMug(),
  /** Says hi to the CEO `n` times (default ten): the last one waves back. */
  ceo: (n = CEO_CLICKS) => {
    for (let i = 0; i < n; i++) saidHello(CEO_ID, performance.now() + i);
  },
  /** Marks an egg found (the gong's, say, without a good throw). */
  egg: (id: string) => isEggId(id) && eggFound(id),
  snap: (moment: Moment = 'first-merge') => snapMoment(moment, Date.now()),
  /** Clears this browser's polaroids. */
  clearPolaroids: () => {
    useSecrets.setState({ polaroids: [] });
    try {
      localStorage.removeItem('cubefarm:polaroids');
    } catch {
      // no storage
    }
  },
};
if (typeof window !== 'undefined' && !Object.getOwnPropertyDescriptor(window, '__swarmSecrets')) {
  Object.defineProperty(window, '__swarmSecrets', { get: () => Object.assign(snapshot(), api), enumerable: false, configurable: false });
}
