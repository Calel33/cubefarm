// The idea wall (#269): the manager pins ideas in the office, and the CEO turns them into issues. What an idea is, how
// its status may move, when a burst of new ideas becomes one CEO review, when a planned idea has shipped, and the
// "where" line describing where the manager was. Pure, for the server, the 3D wall, the phone and pocket mode.

export type IdeaKind = 'feature' | 'bug' | 'polish' | 'question';
export const IDEA_KINDS: readonly IdeaKind[] = ['feature', 'bug', 'polish', 'question'];
export const IDEA_KIND_ICON: Record<IdeaKind, string> = { feature: '✨', bug: '🐞', polish: '💅', question: '❓' };

/** new → seen by the CEO → planned (issues linked) → shipped; or declined, with a reason, at any point before shipping. */
export type IdeaStatus = 'new' | 'seen' | 'planned' | 'shipped' | 'declined';
export const IDEA_STATUSES: readonly IdeaStatus[] = ['new', 'seen', 'planned', 'shipped', 'declined'];
export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = { new: 'New', seen: 'Seen by the CEO', planned: 'Planned', shipped: 'Shipped', declined: 'Declined' };
export const IDEA_STATUS_ICON: Record<IdeaStatus, string> = { new: '🆕', seen: '👀', planned: '📌', shipped: '🎉', declined: '🚫' };

/** An issue an idea became: the floor's repo and the issue number. */
export interface IdeaLink {
  repoId: string;
  floor: number;
  number: number;
}

export interface IdeaView {
  id: string;
  text: string;
  kind: IdeaKind;
  floor: number; // the floor it's for; 0: company-wide (the lobby's wall)
  where: string | null; // where the manager was: "looking at the whiteboard on floor 2"
  by: string; // who pinned it
  color: string; // their colour: the card's
  at: number;
  status: IdeaStatus;
  links: IdeaLink[]; // the issues it became (planned, shipped)
  pr: number | null; // the merged PR that shipped it
  note: string; // the CEO's note: what they did, or why it was declined
  updatedAt: number;
  shot: boolean; // a picture of the manager's view is attached (GET /api/ideas/:id/shot)
}

export const IDEA_TEXT_MAX = 1000;
export const IDEA_NOTE_MAX = 400;
/** Ideas the office keeps; the oldest finished ones (shipped or declined) go first. */
export const KEEP_IDEAS = 300;
/** A new idea waits this long for more before the CEO reviews them: a burst of ideas becomes one planning pass. */
export const IDEA_QUIET_MS = 5 * 60_000;

/** Where each status may go. Shipped is the end; a declined idea can be planned after all. */
const MOVES: Record<IdeaStatus, readonly IdeaStatus[]> = {
  new: ['seen', 'planned', 'declined'],
  seen: ['planned', 'declined'],
  planned: ['planned', 'shipped', 'declined'],
  shipped: [],
  declined: ['planned'],
};

export const canMove = (from: IdeaStatus, to: IdeaStatus) => MOVES[from].includes(to);

/** What update_idea changes, or why it refuses, worded for the CEO. `link`: the issue to add, already checked to exist. */
export function ideaUpdate(idea: Pick<IdeaView, 'id' | 'status' | 'links' | 'note'>, to: IdeaStatus, note: string, link: IdeaLink | null): Pick<IdeaView, 'status' | 'links' | 'note'> {
  const said = note.trim().slice(0, IDEA_NOTE_MAX);
  if (idea.status === to && to !== 'planned') throw new Error(`Idea ${idea.id} is already ${to}.`);
  if (!canMove(idea.status, to)) {
    const next = MOVES[idea.status];
    throw new Error(`Idea ${idea.id} is ${idea.status}, so it can't become ${to}.${next.length ? ` It can become: ${next.join(', ')}.` : ' It is finished.'}`);
  }
  if (to === 'new') throw new Error('An idea cannot go back to new.');
  const links = link && !idea.links.some((l) => l.repoId === link.repoId && l.number === link.number) ? [...idea.links, link] : idea.links;
  if (to === 'planned' && !links.length) throw new Error('Planned needs an issue: file it first (file_issue), then pass its number as issue.');
  if (to === 'declined' && !said) throw new Error('Say why it is declined in note: the manager reads it on the card.');
  if (to === 'planned' && idea.status === 'planned' && links === idea.links && !said) throw new Error(`Idea ${idea.id} is already planned with that issue.`);
  return { status: to, links: to === 'declined' ? idea.links : links, note: said || idea.note };
}

/**
 * When the CEO should review the new ideas: a quiet period after the newest one not yet handed to a review
 * (`handedUpTo`: the newest pinned time already handed), or null when there are none.
 */
export function ideasReviewAt(ideas: readonly Pick<IdeaView, 'status' | 'at'>[], handedUpTo: number, quietMs = IDEA_QUIET_MS): number | null {
  let newest = -Infinity;
  for (const i of ideas) if (i.status === 'new' && i.at > handedUpTo && i.at > newest) newest = i.at;
  return Number.isFinite(newest) ? newest + quietMs : null;
}

/** The newest pinned time among new ideas, to remember as handed once a review is queued for them. */
export const newestNew = (ideas: readonly Pick<IdeaView, 'status' | 'at'>[]) => ideas.reduce((m, i) => (i.status === 'new' && i.at > m ? i.at : m), 0);

/**
 * A planned idea has shipped once a merged pull request closes every issue it became: that PR (the latest one), or
 * null. `mergedCloser`: the merged PR that closed an issue, if the office knows of one.
 */
export function shippedBy(idea: Pick<IdeaView, 'status' | 'links'>, mergedCloser: (link: IdeaLink) => number | null): number | null {
  if (idea.status !== 'planned' || !idea.links.length) return null;
  let pr: number | null = null;
  for (const l of idea.links) {
    const n = mergedCloser(l);
    if (n == null) return null;
    pr = Math.max(pr ?? 0, n);
  }
  return pr;
}

/** Ideas to keep: every unfinished one, then the newest finished ones up to `keep` in all. */
export function trimIdeas<T extends Pick<IdeaView, 'status' | 'at'>>(ideas: readonly T[], keep = KEEP_IDEAS): T[] {
  if (ideas.length <= keep) return [...ideas];
  const done = (i: T) => i.status === 'shipped' || i.status === 'declined';
  const drop = new Set(
    ideas
      .filter(done)
      .sort((a, b) => a.at - b.at)
      .slice(0, ideas.length - keep),
  );
  return ideas.filter((i) => !drop.has(i));
}

// ---------- where the manager was ----------

/** The floor's name in a sentence: "the lobby", "the roof", "floor 2". */
export const floorName = (floor: number) => (floor === 0 ? 'the lobby' : floor < 0 ? 'the roof' : `floor ${floor}`);

/**
 * The "where" line on an idea: what the manager was looking at and where they stood. `looking`: a noun phrase ("the
 * whiteboard"), `area`: where on the floor, with its preposition ("in the QA lab"); either may be null.
 */
export function whereText(floor: number, looking: string | null, area: string | null): string {
  const on = floorName(floor);
  const at = floor === 0 ? 'in the lobby' : `on ${on}`;
  if (looking) return floor > 0 ? `looking at ${looking} on ${on}` : `${at}, looking at ${looking}`;
  if (area) return floor > 0 ? `${area} on ${on}` : `${at}, ${area}`;
  return at;
}

/** What a focus target is, as a noun phrase for the "where" line, from its action kind (and a name for desks). */
export function lookingAt(kind: string, detail?: { name?: string | null; number?: number | null; pr?: boolean }): string | null {
  switch (kind) {
    case 'terminal':
      return detail?.name ? `${detail.name}'s desk` : 'a desk';
    case 'kanban':
      return 'the whiteboard';
    case 'card':
      return detail?.number ? `${detail.pr ? 'PR' : 'issue'} #${detail.number} on the whiteboard` : 'the whiteboard';
    case 'app':
    case 'channel':
      return "the floor's app screen";
    case 'elevator':
      return 'the elevator';
    case 'manager':
      return "the manager's console";
    case 'catalogue':
      return 'the catalogue kiosk';
    case 'decor-box':
      return 'the decor box';
    case 'coffee':
      return 'the coffee machine';
    case 'jukebox':
      return 'the jukebox';
    case 'pong':
      return 'the ping-pong table';
    case 'hire':
      return 'an empty desk';
    case 'interview':
      return 'a candidate';
    case 'greet':
      return detail?.name ?? 'a teammate';
    case 'resume':
      return 'the usage meter';
    case 'trophy':
      return 'the trophy shelf';
    case 'pickup':
    case 'poke':
      return 'a toy';
    case 'roof':
      return 'the roof terrace';
    default:
      return null;
  }
}

/** Clean an idea's text: trimmed, at most IDEA_TEXT_MAX characters. */
export const cleanIdeaText = (s: unknown) => String(s ?? '').trim().slice(0, IDEA_TEXT_MAX);
export const isIdeaKind = (k: unknown): k is IdeaKind => typeof k === 'string' && (IDEA_KINDS as readonly string[]).includes(k);
export const isIdeaStatus = (k: unknown): k is IdeaStatus => typeof k === 'string' && (IDEA_STATUSES as readonly string[]).includes(k);

/** The ideas a wall shows: the lobby's every one, a floor's its own; unfinished first, newest first, at most `max`. */
export function wallIdeas<T extends Pick<IdeaView, 'floor' | 'status' | 'at'>>(ideas: readonly T[], floor: number, max: number): T[] {
  const rank = (i: T) => (i.status === 'shipped' || i.status === 'declined' ? 1 : 0);
  return ideas
    .filter((i) => floor === 0 || i.floor === floor)
    .sort((a, b) => rank(a) - rank(b) || b.at - a.at)
    .slice(0, max);
}
