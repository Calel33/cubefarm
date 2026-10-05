// What E (or a click) does on a secret (#266), and the eggs that ride on other actions: the CEO's hellos.

import { CEO_ID } from '../../../../shared/types';
import { useStore, type Focus } from '../../store';
import { say } from '../people';
import { hitGong } from '../gongState';
import { ceoHello, ceoLine, COMMENTARY, gongShot } from './eggs';
import { eggFound, findDuck, nextFact, pullBook, useSecrets, waveBack } from './secretsState';

type SecretAction = Extract<Focus['action'], { kind: 'secret' }>;

export function secretAction(a: SecretAction) {
  const s = useStore.getState();
  if (a.op === 'duck' && a.id) findDuck(a.id);
  else if (a.op === 'book') pullBook();
  // the arcade is the phone's games on a big screen: the phone opens on them (a panel, so what you hold drops)
  else if (a.op === 'arcade') s.openOverlay({ kind: 'phone', tab: 'games' });
  else if (a.op === 'plaque') {
    nextFact();
    s.pushToast('info', `💡 ${COMMENTARY[useSecrets.getState().fact % COMMENTARY.length]}`);
  } else if (a.op === 'grave' && a.id) s.pushToast('info', `🪦 ${a.id}`);
}

let hellos: number[] = [];
let waved = 0;
/** Someone said hi to an agent (Chatter's greet went through): the CEO's tenth hello in a row gets a wave and a line. */
export function saidHello(agentId: string, now = performance.now()) {
  if (agentId !== CEO_ID) return;
  const r = ceoHello(hellos, now);
  hellos = r.times;
  if (!r.wave) return;
  waveBack(CEO_ID, 4);
  say(CEO_ID, ceoLine(waved++), 5);
  eggFound('ceo');
}

/** A thrown ball that hit something: on the gong's disc it rings it (on an office floor; elsewhere there's no gong). */
export function ballOnGong(p: { x: number; y: number; z: number }, r: number, moved: number) {
  if (!gongShot(p, r, moved)) return;
  if (hitGong() !== 'absent') eggFound('gong');
}
