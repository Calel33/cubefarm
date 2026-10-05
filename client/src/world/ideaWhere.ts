import { lookingAt, whereText } from '../../../shared/ideas';
import { provideWhere } from '../ideaContext';
import { useStore, type Focus } from '../store';
import { playerAt } from './camera/rig';
import { areaAt } from './ideaWallLayout';

// The idea wall's "where" (#269): what the manager last aimed at and where they stand, as a line pinned with an idea
// ("looking at the whiteboard on floor 2"). A pin dialog or the phone hides the crosshair, so the last thing aimed
// at in the past half minute stands in for it; the idea walls themselves don't count.

/** How long something aimed at still counts as what you're looking at. */
export const LOOK_MEMORY_MS = 30_000;

/** What a focus is, as a noun for the "where" line; null for the idea walls and what has no name. */
export function focusNoun(f: Focus, agentName: (id: string) => string | null): string | null {
  if (f.id.startsWith('ideas-') || f.id.startsWith('idea:')) return null;
  const a = f.action;
  if (a.kind === 'terminal' || a.kind === 'greet') return lookingAt(a.kind, { name: agentName(a.agentId) });
  if (a.kind === 'card') return lookingAt('card', { number: a.number, pr: a.pr });
  return lookingAt(a.kind);
}

let last: { noun: string; at: number } | null = null;

if (typeof window !== 'undefined') {
  provideWhere(whereNow);
  useStore.subscribe((s, prev) => {
    if (!s.focus || s.focus === prev.focus) return;
    const noun = focusNoun(s.focus, (id) => s.agents[id]?.name ?? null);
    if (noun) last = { noun, at: performance.now() };
  });
}

/** The "where" line for an idea pinned now. */
export function whereNow(): string {
  const s = useStore.getState();
  const looking = last && performance.now() - last.at < LOOK_MEMORY_MS ? last.noun : null;
  const area = s.started ? areaAt(s.floor, playerAt.x, playerAt.z) : null;
  return whereText(s.floor, looking, area);
}
