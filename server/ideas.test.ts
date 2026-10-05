import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PullInfo } from '../shared/types.ts';
import type { OfficeTools } from './ceo.ts';
import { IDEA_QUIET_MS } from './config.ts';
import { createDemoBackend } from './demo.ts';
import { HttpError } from './httpError.ts';
import { Swarm } from './swarm.ts';

// The idea wall (#269) through the swarm on the demo backend: pinning, the CEO's tools, one review per burst, shipping.
interface Inside {
  ensureCeo(interrupted: unknown[]): void;
  officeTools(): OfficeTools;
  maybeIdeaReview(): void;
  shipIdeas(): void;
  state: { ceo: { queue: { kind: string; ideas?: boolean }[] } };
  repoRt: Map<string, { pulls: PullInfo[] }>;
}

async function office() {
  const swarm = new Swarm(createDemoBackend());
  const repo = await swarm.connectRepo('demo-co/pixel-todo');
  const inside = swarm as unknown as Inside;
  inside.ensureCeo([]);
  return { swarm, repo, inside, tools: inside.officeTools() };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('the idea wall', () => {
  it('pins ideas with their floor, kind, where and pinner, and refuses empty ones or unknown floors', async () => {
    const { swarm, repo } = await office();
    const idea = await swarm.pinIdea({ text: '  The whiteboard should glow when CI is red  ', kind: 'polish', floor: repo.floor, where: 'looking at the whiteboard on floor 1', by: 'Leon', color: '#3A86FF' });
    expect(idea).toMatchObject({ text: 'The whiteboard should glow when CI is red', kind: 'polish', floor: repo.floor, where: 'looking at the whiteboard on floor 1', by: 'Leon', color: '#3a86ff', status: 'new', shot: false });
    expect(swarm.snapshot().ideas?.map((i) => i.id)).toEqual([idea.id]);
    expect((await swarm.pinIdea({ text: 'Company-wide', kind: 'nonsense', floor: 0 })).kind).toBe('feature');
    await expect(swarm.pinIdea({ text: '   ' })).rejects.toThrow(HttpError);
    await expect(swarm.pinIdea({ text: 'x', floor: 9 })).rejects.toThrow(/no floor 9/);
    await expect(swarm.pinIdea({ text: 'x', shot: 'data:text/html;base64,AAAA' })).rejects.toThrow(/picture/);
  });

  it('turns a burst of ideas into one CEO review after the quiet period', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { swarm, repo, inside } = await office();
    for (const text of ['One', 'Two', 'Three']) await swarm.pinIdea({ text, floor: repo.floor });
    inside.maybeIdeaReview();
    expect(inside.state.ceo.queue.filter((j) => j.kind === 'review')).toHaveLength(0);
    vi.setSystemTime(Date.now() + IDEA_QUIET_MS + 1000);
    inside.maybeIdeaReview();
    inside.maybeIdeaReview();
    expect(inside.state.ceo.queue.filter((j) => j.kind === 'review')).toEqual([expect.objectContaining({ ideas: true })]);
    expect(swarm.snapshot().ceo.queue.map((j) => j.label)).toContain('Reading the idea wall');
  });

  it("lets the CEO list, plan, decline and ship ideas through the office tools", async () => {
    const { swarm, repo, inside, tools } = await office();
    const a = await swarm.pinIdea({ text: 'Confetti on merge', floor: repo.floor });
    const b = await swarm.pinIdea({ text: 'More confetti', floor: repo.floor });
    const c = await swarm.pinIdea({ text: 'A pony', kind: 'question', floor: 0 });

    const listed = JSON.parse(await tools.call('list_ideas', {})) as { ideas: { id: string; status: string }[] };
    expect(listed.ideas.map((i) => [i.id, i.status])).toEqual([
      [a.id, 'new'],
      [b.id, 'new'],
      [c.id, 'new'],
    ]);
    expect(swarm.snapshot().ideas?.map((i) => i.status)).toEqual(['seen', 'seen', 'seen']);

    expect(await tools.call('update_idea', { id: a.id, status: 'planned', note: 'soon' })).toMatch(/Refused: .*file it first/);
    expect(await tools.call('update_idea', { id: a.id, status: 'planned', issue: 999, note: 'x' })).toMatch(/Refused: There is no issue #999/);
    const filed = await tools.call('file_issue', { floor: repo.floor, title: 'Merge confetti', body: 'From the idea wall' });
    const n = Number(filed.match(/#(\d+)/)![1]);
    for (const id of [a.id, b.id]) expect(await tools.call('update_idea', { id, status: 'planned', issue: n, note: `Grouped into #${n}.` })).toMatch(/is planned/);
    expect(await tools.call('update_idea', { id: c.id, status: 'declined', note: '' })).toMatch(/Refused: Say why/);
    expect(await tools.call('update_idea', { id: c.id, status: 'declined', note: 'No ponies in the office.' })).toMatch(/is declined/);

    // the issue's PR merges: both planned cards ship with it
    const rt = inside.repoRt.get(repo.id)!;
    rt.pulls = [...rt.pulls, { number: 77, state: 'MERGED', closesIssues: [n] } as PullInfo];
    inside.shipIdeas();
    const after = swarm.snapshot().ideas!;
    expect(after.map((i) => [i.status, i.pr])).toEqual([
      ['shipped', 77],
      ['shipped', 77],
      ['declined', null],
    ]);
    expect(after[2].note).toBe('No ponies in the office.');
    expect(await tools.call('list_ideas', {})).toBe('No open ideas on the wall.');
  });
});
