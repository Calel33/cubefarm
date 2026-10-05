import { describe, expect, it } from 'vitest';
import { canMove, ideasReviewAt, ideaUpdate, IDEA_QUIET_MS, lookingAt, newestNew, shippedBy, trimIdeas, wallIdeas, whereText, type IdeaLink, type IdeaStatus } from './ideas';

const link = (number: number, repoId = 'o/r', floor = 2): IdeaLink => ({ repoId, floor, number });
const idea = (status: IdeaStatus, links: IdeaLink[] = [], note = '') => ({ id: 'idea-1', status, links, note });
const refusal = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (err) {
    return (err as Error).message;
  }
};

describe('status transitions', () => {
  it('goes new → seen → planned → shipped, and declined before shipping', () => {
    expect(canMove('new', 'seen')).toBe(true);
    expect(canMove('seen', 'planned')).toBe(true);
    expect(canMove('planned', 'shipped')).toBe(true);
    expect(canMove('new', 'declined')).toBe(true);
    expect(canMove('planned', 'declined')).toBe(true);
    expect(canMove('declined', 'planned')).toBe(true);
    expect(canMove('shipped', 'declined')).toBe(false);
    expect(canMove('seen', 'new')).toBe(false);
  });

  it('plans with an issue, and adds more issues to a planned idea', () => {
    expect(ideaUpdate(idea('seen'), 'planned', 'Filed as #12.', link(12))).toEqual({ status: 'planned', links: [link(12)], note: 'Filed as #12.' });
    expect(ideaUpdate(idea('planned', [link(12)], 'a'), 'planned', '', link(13)).links).toEqual([link(12), link(13)]);
  });

  it('refuses in words the CEO can act on', () => {
    expect(refusal(() => ideaUpdate(idea('seen'), 'planned', 'soon', null))).toMatch(/file it first/);
    expect(refusal(() => ideaUpdate(idea('seen'), 'declined', '  ', null))).toMatch(/Say why/);
    expect(refusal(() => ideaUpdate(idea('shipped', [link(1)]), 'declined', 'no', null))).toMatch(/is shipped.*finished/);
    expect(refusal(() => ideaUpdate(idea('seen'), 'seen', 'x', null))).toMatch(/already seen/);
    expect(refusal(() => ideaUpdate(idea('planned', [link(12)]), 'planned', '', link(12)))).toMatch(/already planned/);
  });

  it('keeps the old note when none is given and the links when declined', () => {
    expect(ideaUpdate(idea('planned', [link(3)], 'Filed as #3.'), 'shipped', '', null)).toEqual({ status: 'shipped', links: [link(3)], note: 'Filed as #3.' });
    expect(ideaUpdate(idea('planned', [link(3)]), 'declined', 'Superseded.', null).links).toEqual([link(3)]);
  });
});

describe('burst batching', () => {
  const at = (status: IdeaStatus, t: number) => ({ status, at: t });

  it('waits a quiet period after the newest new idea', () => {
    expect(ideasReviewAt([at('new', 1000), at('new', 61_000)], 0)).toBe(61_000 + IDEA_QUIET_MS);
  });

  it('a burst becomes one review: handed ideas are not due again', () => {
    const ideas = [at('new', 1000), at('new', 2000), at('new', 3000)];
    expect(newestNew(ideas)).toBe(3000);
    expect(ideasReviewAt(ideas, newestNew(ideas))).toBeNull();
    expect(ideasReviewAt([...ideas, at('new', 9000)], 3000)).toBe(9000 + IDEA_QUIET_MS);
  });

  it('ignores ideas the CEO has already seen', () => {
    expect(ideasReviewAt([at('seen', 5000), at('planned', 6000)], 0)).toBeNull();
  });
});

describe('shipping', () => {
  it('ships once a merged PR closes every linked issue, naming the latest', () => {
    const closers: Record<number, number> = { 12: 40, 13: 44 };
    expect(shippedBy(idea('planned', [link(12), link(13)]), (l) => closers[l.number] ?? null)).toBe(44);
    expect(shippedBy(idea('planned', [link(12), link(14)]), (l) => closers[l.number] ?? null)).toBeNull();
    expect(shippedBy(idea('seen'), () => 1)).toBeNull();
    expect(shippedBy(idea('declined', [link(12)]), () => 1)).toBeNull();
  });
});

describe('where the manager was', () => {
  it('says what they looked at, or where they stood', () => {
    expect(whereText(2, 'the whiteboard', 'the QA lab')).toBe('looking at the whiteboard on floor 2');
    expect(whereText(0, 'the jukebox', null)).toBe('in the lobby, looking at the jukebox');
    expect(whereText(3, null, 'the QA lab')).toBe('in the QA lab on floor 3');
    expect(whereText(0, null, "the CEO's office")).toBe("in the lobby, in the CEO's office");
    expect(whereText(-1, null, null)).toBe('on the roof');
    expect(whereText(4, null, null)).toBe('on floor 4');
  });

  it('names what the crosshair was on', () => {
    expect(lookingAt('kanban')).toBe('the whiteboard');
    expect(lookingAt('terminal', { name: 'Ada' })).toBe("Ada's desk");
    expect(lookingAt('card', { number: 12, pr: true })).toBe('PR #12 on the whiteboard');
    expect(lookingAt('somethingNew')).toBeNull();
  });
});

describe('keeping and showing ideas', () => {
  it('drops the oldest finished ideas first', () => {
    const ideas = [
      { id: 'a', status: 'shipped' as const, at: 1 },
      { id: 'b', status: 'new' as const, at: 2 },
      { id: 'c', status: 'declined' as const, at: 3 },
      { id: 'd', status: 'planned' as const, at: 4 },
    ];
    expect(trimIdeas(ideas, 3).map((i) => i.id)).toEqual(['b', 'c', 'd']);
    expect(trimIdeas(ideas, 2).map((i) => i.id)).toEqual(['b', 'd']);
  });

  it('the lobby shows every floor, a floor its own, open ideas first', () => {
    const ideas = [
      { floor: 2, status: 'shipped' as const, at: 9 },
      { floor: 2, status: 'new' as const, at: 1 },
      { floor: 3, status: 'new' as const, at: 5 },
      { floor: 0, status: 'planned' as const, at: 3 },
    ];
    expect(wallIdeas(ideas, 2, 6).map((i) => i.at)).toEqual([1, 9]);
    expect(wallIdeas(ideas, 0, 3).map((i) => i.at)).toEqual([5, 3, 1]);
  });
});
