import { useEffect } from 'react';
import { useRenderPaused } from '../../perf';
import { useStore } from '../../store';
import { outsideHearing } from '../../ui/outsideMix';
import { listenerAt } from '../../ui/sfx';
import { fountainLevel, stopFountain } from '../../ui/streetSfx';
import { playerAt } from '../camera/rig';
import { doorOpen } from '../doors';
import { leavePerch, perch } from '../perch';
import { FoodTruck } from './FoodTruck';
import { HeldFood } from './HeldFood';
import { LunchPeople } from './LunchPeople';
import { Park } from './Park';
import { Passersby } from './Passersby';
import { FOUNTAIN, inPark, onPlaza } from './plaza';
import { PlazaProps } from './PlazaProps';
import { mountStreet } from './streetState';
import { runStreetOp, streetReport, useStreetOp, useStreetReport } from './streetOps';

// Street level (#264): the plaza round the lobby, out of its west and east doors (plaza.ts has the layout, Game.tsx adds
// its colliders to the lobby's). The building's name by the avenue, a food truck with a rotating menu, the newsstand
// with the day's headline, a pocket park with a tree to sit under, a fountain and pigeons, the bus stop, street lamps
// that come on at dusk and puddles in the rain, people walking by and the lunch crowd from upstairs. Its code is its own
// chunk, mounted only while you're in the lobby (the city round it, outside/City.tsx, is everyone's). The rain, snow and
// the time of day are the office's own (weather/, sky/), so they fall on the plaza like everywhere else.

const FOUNTAIN_AT = { x: FOUNTAIN.x, y: 1.2, z: FOUNTAIN.z };
const TICK_MS = 150;

/** The fountain's splash: heard through the lobby's doors like the rest of the outside, and quiet behind a panel. */
function StreetSounds() {
  const paused = useRenderPaused();
  const away = useStore((s) => s.travel !== null || s.overlay !== null);
  useEffect(() => {
    const quiet = paused || away;
    const tick = () => {
      const ear = listenerAt();
      const h = outsideHearing('lobby', ear.x, ear.z, { west: doorOpen('west'), east: doorOpen('east') });
      const level = quiet || document.hidden ? 0 : h.level;
      fountainLevel(FOUNTAIN_AT, level, h.clarity);
    };
    tick();
    const t = setInterval(tick, TICK_MS);
    return () => clearInterval(t);
  }, [paused, away]);
  useEffect(() => stopFountain, []);
  return null;
}

export default function Street() {
  // E on the street's things goes to the part that owns it; the probe gets every part's report.
  useEffect(() => mountStreet(runStreetOp, streetReport), []);
  // Leaving the lobby stands you up from under the tree (the elevator already took your lunch).
  useEffect(
    () => () => {
      if (perch()?.id === 'street-tree') leavePerch();
    },
    [],
  );
  useStreetOp('read', () => {
    const headline = streetReport().headline;
    if (typeof headline === 'string') useStore.getState().pushToast('info', `📰 ${headline}`);
  });
  useStreetReport('player', () => ({ x: Math.round(playerAt.x * 10) / 10, z: Math.round(playerAt.z * 10) / 10, onPlaza: onPlaza(playerAt.x, playerAt.z), inPark: inPark(playerAt.x, playerAt.z), sitting: perch()?.id === 'street-tree' }));

  return (
    <group>
      <PlazaProps />
      <FoodTruck />
      <Park />
      <Passersby />
      <LunchPeople />
      <HeldFood />
      <StreetSounds />
    </group>
  );
}
