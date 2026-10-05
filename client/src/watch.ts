import { CEO_ID } from '../../shared/types';
import type { Watch } from '../../shared/watch';
import type { Overlay } from './store';
import { BASEMENT } from './world/layout';

// What this tab shows of the agents' terminals (shared/watch.ts), from the store: the floor it's on, the agent whose
// panel is open (the CEO's in the manager's console) and whether the workers list is out (or you're in the basement, whose
// racks blink with everyone's output). net.ts sends it on change.

export function currentWatch(s: { floor: number; overlay: Overlay | null; workersOpen: boolean }): Watch {
  const o = s.overlay;
  const agents = o?.kind === 'terminal' ? [o.agentId] : o?.kind === 'manager' ? [CEO_ID] : [];
  return { floor: s.floor, agents, workers: s.workersOpen || s.floor === BASEMENT };
}
