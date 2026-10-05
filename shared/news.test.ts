import { describe, expect, it } from 'vitest';
import {
  allHandsAt,
  allHandsDue,
  allHandsLength,
  applyWriting,
  bulletinDue,
  bulletinText,
  chooseMvp,
  dueEditions,
  editionId,
  expired,
  extraEdition,
  fallbackEdition,
  fragment,
  GATHER_S,
  groupStories,
  isEditionId,
  MAX_SLIDES,
  MAX_STORIES,
  MIN_STORIES,
  numbersOf,
  parseWriting,
  pickAttendees,
  SLIDE_S,
  slidesOf,
  themeWord,
  type NewsItem,
} from './news.ts';

// Local times, so the tests hold in any time zone. 5 October 2026 is a Monday.
const at = (d: number, h = 0, m = 0) => new Date(2026, 9, d, h, m).getTime();
const SEP28 = new Date(2026, 8, 28).getTime();

const merge = (floor: number, pr: number, title: string, who = 'Ada', t = at(4, 11)): NewsItem => ({ at: t, kind: 'merged', floor, repoId: `r${floor}`, repo: `app${floor}`, pr, title, who, whoId: who.toLowerCase() });

describe('the schedule', () => {
  it('prints yesterday’s daily from 7 am, not before', () => {
    const weeklyOut = (id: string) => id.startsWith('weekly');
    expect(dueEditions(at(6, 6, 59), weeklyOut)).toEqual([]);
    const due = dueEditions(at(6, 7), weeklyOut);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ id: 'daily-2026-10-05', kind: 'daily', from: at(5), to: at(6) });
    expect(dueEditions(at(6, 9), (id) => id === 'daily-2026-10-05' || weeklyOut(id))).toEqual([]);
  });

  it('prints last week’s weekly on Monday from 7 am, and keeps it due all week until it is out', () => {
    const monday = dueEditions(at(5, 7, 30), () => false);
    expect(monday.map((e) => e.id).sort()).toEqual(['daily-2026-10-04', 'weekly-2026-09-28']);
    expect(monday.find((e) => e.kind === 'weekly')).toMatchObject({ from: SEP28, to: at(5) });
    expect(dueEditions(at(8, 12), (id) => id.startsWith('daily')).map((e) => e.id)).toEqual(['weekly-2026-09-28']);
    expect(dueEditions(at(5, 6), () => false)).toEqual([]);
  });

  it('names editions and recognises their ids', () => {
    expect(editionId('daily', at(4, 13))).toBe('daily-2026-10-04');
    const x = extraEdition('daily', at(5, 14, 5));
    expect(x.id).toBe('daily-2026-10-05-x1405');
    expect(x.to - x.from).toBe(24 * 3600_000);
    expect(isEditionId(x.id)).toBe(true);
    expect(isEditionId('weekly-2026-09-28')).toBe(true);
    expect(isEditionId('../secrets')).toBe(false);
  });

  it('keeps editions for 60 days', () => {
    expect(expired(at(1), at(1) + 59 * 86_400_000)).toBe(false);
    expect(expired(at(1), at(1) + 61 * 86_400_000)).toBe(true);
  });

  it('reads the bulletin from 9 until noon on the day the edition came out, once', () => {
    const daily = { id: 'daily-2026-10-05', publishedAt: at(6, 7) };
    expect(bulletinDue(at(6, 8, 59), daily, null)).toBe(false);
    expect(bulletinDue(at(6, 9), daily, null)).toBe(true);
    expect(bulletinDue(at(6, 9, 30), daily, daily.id)).toBe(false);
    expect(bulletinDue(at(6, 12), daily, null)).toBe(false);
    expect(bulletinDue(at(7, 9, 30), daily, null)).toBe(false);
    expect(bulletinDue(at(6, 10), null, null)).toBe(false);
  });

  it('holds the all-hands on Monday from 10 until noon, once, with this week’s weekly out', () => {
    const weekly = { publishedAt: at(5, 7) };
    expect(allHandsDue(at(5, 9, 59), null, weekly)).toBe(false);
    expect(allHandsDue(at(5, 10), null, weekly)).toBe(true);
    expect(allHandsDue(at(5, 10, 30), at(5, 10), weekly)).toBe(false);
    expect(allHandsDue(at(5, 10), at(4, 10), weekly)).toBe(true);
    expect(allHandsDue(at(6, 10), null, weekly)).toBe(false); // Tuesday
    expect(allHandsDue(at(5, 10), null, { publishedAt: at(1) })).toBe(false); // last week's paper
    expect(allHandsDue(at(5, 10), null, null)).toBe(false);
  });
});

describe('the stories', () => {
  it('turns titles into short phrases', () => {
    expect(fragment('Add rain to the sky (#12)')).toBe('rain to the sky');
    expect(fragment('feat(ui): Dark mode for settings')).toBe('dark mode for settings');
    expect(fragment('Weather: a kaiju in the fog')).toBe('a kaiju in the fog');
    expect(fragment('Fix the login redirect loop when the session expires overnight', 30).endsWith('…')).toBe(true);
  });

  it('finds the word that ties a floor’s merges together', () => {
    expect(themeWord(['Weather: rain', 'Weather: storms', 'Weather: a kaiju'])).toBe('weather');
    expect(themeWord(['Dark mode for settings', 'Dark mode for charts', 'Fix login'])).toBe('dark');
    expect(themeWord(['Add rain', 'Fix login'])).toBeNull();
  });

  it('groups merges by floor and theme, busiest floor first', () => {
    const items = [merge(2, 10, 'Weather: rain'), merge(2, 11, 'Weather: storms'), merge(2, 12, 'Weather: a kaiju'), merge(1, 5, 'Fix the login redirect')];
    const stories = groupStories(items);
    expect(stories[0].headline).toBe('Floor 2 got weather: rain, storms and a kaiju');
    expect(stories[0].prs).toEqual([10, 11, 12].map((pr) => ({ repoId: 'r2', pr })));
    expect(stories[1].headline).toBe('Floor 1 shipped the login redirect');
    expect(stories.length).toBeGreaterThanOrEqual(MIN_STORIES);
  });

  it('adds QA, people and paperwork, and never more than six stories', () => {
    const items: NewsItem[] = [
      ...[1, 2, 3, 4, 5].map((f) => merge(f, f, `Thing ${f}`)),
      { at: at(4, 9), kind: 'qa', floor: 1, pr: 1, pass: true, who: 'Quinn' },
      { at: at(4, 9), kind: 'qa', floor: 1, pr: 2, pass: false, who: 'Quinn' },
      { at: at(4, 9), kind: 'hired', floor: 1, who: 'Bea', detail: 'Frontend Developer' },
      { at: at(4, 9), kind: 'filed', floor: 1, issue: 7, title: 'Empty states' },
    ];
    const stories = groupStories(items);
    expect(stories).toHaveLength(MAX_STORIES);
    expect(stories.filter((s) => s.floor !== null)).toHaveLength(4);
    expect(stories.map((s) => s.section)).toContain('QA lab');
    expect(stories.find((s) => s.section === 'QA lab')!.headline).toBe('QA passed 1 of 2 rounds');
  });

  it('fills a quiet day up to three stories', () => {
    const stories = groupStories([], [{ floor: 1, repo: 'app', number: 4, title: 'Add a search box' }], 'Acme');
    expect(stories).toHaveLength(3);
    expect(stories[0].headline).toBe('A quiet one at the office');
    expect(stories[1].headline).toBe('Next on the board: a search box');
  });
});

describe('the MVP and the numbers', () => {
  it('picks whoever merged most, then tested most, ties by name', () => {
    const items: NewsItem[] = [merge(1, 1, 'a', 'Bea'), merge(1, 2, 'b', 'Ada'), merge(1, 3, 'c', 'Bea'), { at: 1, kind: 'qa', floor: 1, pr: 1, pass: true, who: 'Quinn', whoId: 'quinn' }];
    expect(chooseMvp(items)).toMatchObject({ name: 'Bea', agentId: 'bea', why: '2 merges' });
    expect(chooseMvp([merge(1, 1, 'a', 'Bea'), merge(1, 2, 'b', 'Ada')])?.name).toBe('Ada');
    expect(chooseMvp([{ at: 1, kind: 'qa', floor: 1, pr: 1, pass: true, who: 'Quinn', whoId: 'q' }])?.why).toBe('1 QA round tested');
    expect(chooseMvp([])).toBeNull();
  });

  it('counts what happened', () => {
    const n = numbersOf([merge(1, 1, 'a'), { at: 1, kind: 'qa', floor: 1, pass: false }, { at: 1, kind: 'coins', floor: 1, coins: 12 }, { at: 1, kind: 'coins', floor: 1, coins: 3 }]);
    expect(n).toMatchObject({ merged: 1, qaPassed: 0, qaFailed: 1, coins: 15 });
  });
});

describe('the template writer', () => {
  const input = {
    id: 'daily-2026-10-04',
    kind: 'daily' as const,
    from: at(4),
    to: at(5),
    items: [merge(2, 10, 'Weather: rain'), merge(2, 11, 'Weather: storms'), merge(2, 12, 'Weather: a kaiju'), merge(2, 9, 'Too early', 'Ada', at(3, 23))],
    backlog: [{ floor: 2, repo: 'app2', number: 20, title: 'Snow' }],
    company: 'Demo Co.',
    now: at(5, 7),
  };

  it('writes a whole edition from the day’s items only, with no model', () => {
    const e = fallbackEdition(input);
    expect(e.writer).toBe('template');
    expect(e.headline).toBe('Floor 2 got weather: rain, storms and a kaiju');
    expect(e.standfirst).toBe('3 PRs merged, 0 QA passes and 0 new issues yesterday.');
    expect(e.numbers.merged).toBe(3);
    expect(e.mvp?.name).toBe('Ada');
    expect(e.comingUp).toHaveLength(1);
    expect(e.focus).toEqual(['Floor 2: snow']);
    expect(e.dateline).toContain('4 October');
    expect(e.stories.length).toBeGreaterThanOrEqual(MIN_STORIES);
  });

  it('says so on a quiet day', () => {
    const e = fallbackEdition({ ...input, items: [] });
    expect(e.headline).toBe('A quiet day at Demo Co.');
    expect(e.mvp).toBeNull();
  });

  it('takes the CEO’s words story by story, keeping the facts it doesn’t touch', () => {
    const draft = fallbackEdition(input);
    const out = applyWriting(draft, { headline: '  Storm season!  ', standfirst: 'Three for floor 2.', stories: [{ headline: 'Rain, storms, kaiju', body: 'Floor 2 brought the weather.' }], mvpWhy: 'three merges' });
    expect(out?.writer).toBe('ceo');
    expect(out?.headline).toBe('Storm season!');
    expect(out?.stories[0].headline).toBe('Rain, storms, kaiju');
    expect(out?.stories[1]).toEqual(draft.stories[1]);
    expect(out?.stories[0].prs).toEqual(draft.stories[0].prs);
    expect(out?.mvp).toEqual({ ...draft.mvp, why: 'three merges' });
    expect(applyWriting(draft, { headline: 'x', stories: [] })).toBeNull();
    expect(applyWriting(draft, 'nonsense')).toBeNull();
  });

  it('finds the JSON in a session’s answer', () => {
    expect(parseWriting('Here you go:\n```json\n{"headline":"Hi"}\n```')).toEqual({ headline: 'Hi' });
    expect(parseWriting('{"headline":"Hi"} done')).toEqual({ headline: 'Hi' });
    expect(parseWriting('no json')).toBeNull();
  });

  it('makes a short bulletin for the radio', () => {
    const text = bulletinText(fallbackEdition(input), 'Morgan', 'Demo Co.');
    expect(text.startsWith('Good morning, Demo Co.! This is Morgan with the morning news.')).toBe(true);
    expect(text).toContain('Our MVP is Ada, for 3 merges.');
    expect(text).toContain('Coming up: Snow.');
    expect(text.length).toBeLessThan(900);
  });
});

describe('the all-hands', () => {
  const e = fallbackEdition({ id: 'weekly-2026-09-28', kind: 'weekly', from: SEP28, to: at(5), items: [merge(2, 10, 'Weather: rain'), merge(2, 11, 'Weather: storms')], backlog: [], company: 'Acme', now: at(5, 7) });

  it('presents the edition as slides: title, what shipped (with a picture), numbers, MVP, next week, thanks', () => {
    const slides = slidesOf(e, 'Acme');
    expect(slides[0].title).toBe('Acme all-hands');
    expect(slides[1].shot).toEqual({ repoId: 'r2', pr: 10 });
    expect(slides.map((s) => s.title)).toContain('By the numbers');
    expect(slides.map((s) => s.title)).toContain('MVP: Ada');
    expect(slides[slides.length - 1].title).toBe('Thank you, team! 👏');
    expect(slides.length).toBeLessThanOrEqual(MAX_SLIDES);
    expect(slides.every((s) => s.say.length > 0)).toBe(true);
  });

  it('runs gathering → slides → applause → back to work', () => {
    const a = { startedAt: 0, slides: 5 };
    expect(allHandsAt(a, 1000).phase).toBe('gathering');
    expect(allHandsAt(a, (GATHER_S + 0.5) * 1000)).toMatchObject({ phase: 'presenting', slide: 0 });
    expect(allHandsAt(a, (GATHER_S + SLIDE_S * 2 + 1) * 1000)).toMatchObject({ phase: 'presenting', slide: 2 });
    expect(allHandsAt(a, (GATHER_S + SLIDE_S * 5 + 1) * 1000).phase).toBe('applause');
    expect(allHandsAt(a, allHandsLength(5) - 1000).phase).toBe('dispersing');
    expect(allHandsAt(a, allHandsLength(5)).phase).toBe('over');
  });

  it('pulls only idle people, never the CEO, at most the cap', () => {
    const people = [
      { id: 'a', role: 'dev', status: 'working', floor: 1, desk: 0 },
      { id: 'b', role: 'dev', status: 'idle', floor: 2, desk: 0 },
      { id: 'c', role: 'qa', status: 'done', floor: 1, desk: 3 },
      { id: 'd', role: 'dev', status: 'preparing', floor: 1, desk: 1 },
      { id: 'ceo', role: 'ceo', status: 'idle', floor: 0, desk: 0 },
      { id: 'e', role: 'dev', status: 'error', floor: 1, desk: 2 },
    ];
    expect(pickAttendees(people)).toEqual(['c', 'b']);
    expect(pickAttendees(people, 1)).toEqual(['c']);
  });
});
