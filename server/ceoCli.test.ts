import { describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo.ts';
import { Swarm } from './swarm.ts';
import { CEO_ID } from '../shared/types.ts';

// Any agent, the CEO included, runs any installed coding agent: the office used to ignore a CEO's coding-agent pick.
describe("the CEO's coding agent", () => {
  it('starts on Claude Code and accepts a switch to OpenCode, with the model kept', async () => {
    const swarm = new Swarm(createDemoBackend());
    (swarm as unknown as { ensureCeo(interrupted: unknown[]): void }).ensureCeo([]);
    const state = (swarm as unknown as { state: { agents: Array<{ id: string; cli: string; model: string }> } }).state;
    const ceo = () => state.agents.find((a) => a.id === CEO_ID)!;

    expect(ceo().cli).toBe('claude');
    // Before the fix the server ignored this for the CEO and it stayed 'claude'.
    swarm.updateAgent(CEO_ID, { cli: 'opencode' });
    expect(ceo().cli).toBe('opencode');

    swarm.updateAgent(CEO_ID, { model: 'cinf/deepseek-v4-flash' });
    expect(ceo().model).toBe('cinf/deepseek-v4-flash');
    // A model that suits the CEO is not dropped when the coding agent changes.
    swarm.updateAgent(CEO_ID, { cli: 'claude' });
    expect(ceo().cli).toBe('claude');
    expect(ceo().model).toBe('cinf/deepseek-v4-flash');
  });
});
