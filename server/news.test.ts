import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NewsEdition, NewsItem, NewsView } from '../shared/news.ts';
import { issueChanges, NewsDesk, newsFromLedger, type NewsDeskDeps, type NewsLookup } from './news.ts';

const look: NewsLookup = {
  agent: (id) => ({ ada: { name: 'Ada', floor: 2, title: 'Frontend' }, quinn: { name: 'Quinn', floor: 2, title: 'QA' } })[id] ?? null,
  floor: (repo) => (repo === 'r2' || repo === 'demo/app' ? { floor: 2, repoId: 'r2', repo: 'app' } : null),
};
const noFx = { reward: null, unlocked: [] };

describe('what the swarm notes', () => {
  it('turns ledger events into news items', () => {
    expect(newsFromLedger({ kind: 'merged', repoId: 'r2', repoName: 'demo/app', pr: 7, title: 'Add rain', author: 'ada', at: 5 }, noFx, look, 9)).toEqual([
      { at: 5, kind: 'merged', floor: 2, repoId: 'r2', repo: 'app', pr: 7, title: 'Add rain', who: 'Ada', whoId: 'ada' },
    ]);
    expect(newsFromLedger({ kind: 'qa', repoId: 'r2', pr: 7, round: 1, pass: false, tester: 'quinn', author: 'ada', at: 3 }, noFx, look, 9)[0]).toMatchObject({ kind: 'qa', pass: false, who: 'Quinn', author: 'Ada' });
    expect(newsFromLedger({ kind: 'needs-human', repoId: 'r2', pr: 7 }, noFx, look, 9)[0]).toMatchObject({ kind: 'needs-human', at: 9, floor: 2 });
    expect(newsFromLedger({ kind: 'full-house', repoName: 'demo/app', people: 5, at: 4 }, noFx, look, 9)[0]).toMatchObject({ kind: 'full-house', floor: 2, detail: '5 people' });
    expect(newsFromLedger({ kind: 'tick', at: 1 }, noFx, look, 9)).toEqual([]);
  });

  it('notes coins and achievements from what the event changed', () => {
    const fx = { reward: { repoId: 'r2', prNumber: 7, agentId: 'ada', coins: 15, reasons: [] }, unlocked: [{ id: 'first-merge' as never, at: 4, detail: 'PR #7' }] };
    const items = newsFromLedger({ kind: 'merged', repoId: 'r2', repoName: 'demo/app', pr: 7, title: 'Add rain', author: null, at: 5 }, fx, look, 9);
    expect(items.map((i) => i.kind)).toEqual(['merged', 'coins', 'achievement']);
    expect(items[0].who).toBeUndefined();
    expect(items[1]).toMatchObject({ coins: 15, pr: 7 });
  });

  it('tells filed issues from closed ones between two syncs', () => {
    const { filed, closed } = issueChanges(
      [
        { number: 1, title: 'a' },
        { number: 2, title: 'b' },
      ],
      [
        { number: 2, title: 'b' },
        { number: 3, title: 'c' },
      ],
    );
    expect(filed.map((i) => i.number)).toEqual([3]);
    expect(closed.map((i) => i.number)).toEqual([1]);
  });
});

describe('the news desk', () => {
  let dir: string;
  let now: number;
  let views: NewsView[];
  let asked: NewsEdition[];
  let may: boolean;
  const day = (d: number, h = 0) => new Date(2026, 9, d, h).getTime();

  const deps = (extra: Partial<NewsDeskDeps> = {}): NewsDeskDeps => ({
    dir,
    now: () => now,
    company: () => 'Demo Co.',
    backlog: () => [{ floor: 2, repo: 'app', number: 20, title: 'Snow' }],
    mayWrite: () => may,
    write: (e) => asked.push(e),
    people: () => [
      { id: 'ada', role: 'dev', status: 'idle', floor: 2, desk: 0 },
      { id: 'bob', role: 'dev', status: 'working', floor: 2, desk: 1 },
    ],
    changed: (v) => views.push(v),
    ...extra,
  });
  const merged = (pr: number, at: number): NewsItem => ({ at, kind: 'merged', floor: 2, repoId: 'r2', repo: 'app', pr, title: `Weather: thing ${pr}`, who: 'Ada', whoId: 'ada' });

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cubefarm-news-'));
    now = day(6, 8); // Tuesday 8 am
    views = [];
    asked = [];
    may = true;
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 3 });
  });

  it('prints yesterday’s edition from the template at once, then asks the CEO for words', async () => {
    const desk = new NewsDesk(deps());
    await desk.init();
    desk.note(merged(1, day(5, 10)), merged(2, day(5, 11)), merged(3, day(4, 11)));
    await desk.check();
    const ids = desk.list().map((e) => e.id);
    expect(ids).toContain('daily-2026-10-05');
    const e = await desk.read('daily-2026-10-05');
    expect(e.writer).toBe('template');
    expect(e.numbers.merged).toBe(2);
    expect(asked.map((x) => x.id)).toContain('daily-2026-10-05');
    expect(desk.view().writing).not.toBeNull();
    await desk.check(); // nothing new is due
    expect(desk.list()).toHaveLength(ids.length);
    await desk.stop();
  });

  it('takes the CEO’s rewrite, and keeps the template when the answer doesn’t fit', async () => {
    const desk = new NewsDesk(deps());
    await desk.init();
    desk.note(merged(1, day(5, 10)));
    const s = await desk.generate('daily');
    expect(await desk.written(s.id, { headline: 'Extra! Rain!', standfirst: 'x', stories: [{ headline: 'h', body: 'b' }] })).toBe(true);
    expect((await desk.read(s.id)).writer).toBe('ceo');
    expect(desk.list()[0].headline).toBe('Extra! Rain!');
    expect(desk.view().writing).toBeNull();
    expect(await desk.written(s.id, 'garbage')).toBe(false);
    expect((await desk.read(s.id)).headline).toBe('Extra! Rain!');
    await desk.stop();
  });

  it('writes with the template alone while usage is paused or pacing', async () => {
    may = false;
    const desk = new NewsDesk(deps());
    await desk.init();
    const s = await desk.generate('weekly');
    expect(s.writer).toBe('template');
    expect(asked).toEqual([]);
    expect(desk.view().writing).toBeNull();
    await desk.stop();
  });

  it('keeps the log and editions across a restart, and drops what’s older than 60 days', async () => {
    const desk = new NewsDesk(deps());
    await desk.init();
    desk.note(merged(1, day(5, 10)), merged(2, now - 70 * 86_400_000));
    await desk.generate('daily');
    await desk.stop();
    now += 61 * 86_400_000;
    const again = new NewsDesk(deps());
    await again.init();
    expect(again.list()).toEqual([]);
    expect(again.logged()).toEqual([]);
    expect((await fs.readdir(dir)).filter((f) => f !== 'log.json')).toEqual([]);
    await again.stop();
  });

  it('seeds an empty demo log once, at start', async () => {
    const desk = new NewsDesk(deps({ seed: (t) => [merged(9, t - 86_400_000)] }));
    await desk.init();
    desk.start();
    await new Promise((r) => setTimeout(r, 20));
    expect(desk.logged().some((i) => i.pr === 9)).toBe(true);
    await desk.stop();
    const again = new NewsDesk(deps({ seed: () => [merged(10, 0)] }));
    await again.init();
    again.start();
    await new Promise((r) => setTimeout(r, 20));
    expect(again.logged().some((i) => i.pr === 10)).toBe(false);
    await again.stop();
  });

  it('refuses unknown editions', async () => {
    const desk = new NewsDesk(deps());
    await desk.init();
    await expect(desk.read('../log')).rejects.toThrow(/No edition/);
    await expect(desk.read('daily-2020-01-01')).rejects.toThrow(/No edition/);
    await desk.stop();
  });

  it('gathers only the idle for the all-hands, once at a time, and ends it', async () => {
    const desk = new NewsDesk(deps());
    await desk.init();
    const v = await desk.startAllHands('manager');
    expect(v.allHands).toMatchObject({ attendees: ['ada'], why: 'manager' });
    expect(v.allHands!.slides).toBeGreaterThan(3);
    expect(desk.list().some((e) => e.kind === 'weekly')).toBe(true); // printed one to present
    await expect(desk.startAllHands('manager')).rejects.toThrow(/already/);
    expect(desk.endAllHands().allHands).toBeNull();
    await desk.stop();
  });
});
