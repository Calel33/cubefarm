import { describe, expect, it } from 'vitest';
import {
  isVersionAtLeast,
  MINIMUM_VERSION,
  originPort,
  parseAllowedEmails,
  parseTunnelArgs,
  parseVersion,
  prerequisite,
  tunnelArgs,
} from './cloudflareTunnelSteps.mjs';

describe('parseTunnelArgs', () => {
  it('reads --dev and --prod', () => {
    expect(parseTunnelArgs(['--dev'])).toEqual({ mode: 'dev', help: false });
    expect(parseTunnelArgs(['--prod'])).toEqual({ mode: 'prod', help: false });
  });

  it('has no mode and no error without a flag', () => {
    expect(parseTunnelArgs([])).toEqual({ mode: null, help: false });
    expect(parseTunnelArgs(['-h'])).toEqual({ mode: null, help: true });
  });

  it('refuses both modes at once, and unknown flags', () => {
    expect(() => parseTunnelArgs(['--dev', '--prod'])).toThrow();
    expect(() => parseTunnelArgs(['--staging'])).toThrow();
  });
});

describe('parseVersion', () => {
  it('reads x.y.z from cloudflared --version output', () => {
    expect(parseVersion('cloudflared version 2026.6.1 (built 2026-06-18T06:39 UTC)')).toEqual([2026, 6, 1]);
  });

  it('is null without a version', () => {
    expect(parseVersion('not a version')).toBeNull();
    expect(parseVersion(undefined)).toBeNull();
  });
});

describe('isVersionAtLeast', () => {
  it('accepts the gate and anything newer', () => {
    expect(isVersionAtLeast([2026, 9, 3], [2026, 9, 3])).toBe(true);
    expect(isVersionAtLeast([2026, 9, 4], [2026, 9, 3])).toBe(true);
    expect(isVersionAtLeast([2027, 0, 0], [2026, 9, 3])).toBe(true);
  });

  it('refuses anything older (2026.6.1 is below the gate)', () => {
    expect(isVersionAtLeast([2026, 6, 1], [2026, 9, 3])).toBe(false);
    expect(isVersionAtLeast([2025, 12, 9], [2026, 9, 3])).toBe(false);
  });

  it('ships a floor at 2026.9.3', () => {
    expect(MINIMUM_VERSION).toBe('2026.9.3');
  });
});

describe('parseAllowedEmails', () => {
  it('trims and drops blanks', () => {
    expect(parseAllowedEmails(' you@example.com , teammate@example.com ')).toEqual(['you@example.com', 'teammate@example.com']);
  });

  it('is empty for unset, empty and blank-only lists', () => {
    expect(parseAllowedEmails(undefined)).toEqual([]);
    expect(parseAllowedEmails('')).toEqual([]);
    expect(parseAllowedEmails(' , ')).toEqual([]);
  });
});

describe('originPort', () => {
  it('defaults to Vite 5317 in dev and the Node server 4317 in prod', () => {
    expect(originPort('dev', {})).toBe(5317);
    expect(originPort('prod', {})).toBe(4317);
  });

  it('honours SWARM_CLIENT_PORT and SWARM_PORT', () => {
    expect(originPort('dev', { SWARM_CLIENT_PORT: '4422' })).toBe(4422);
    expect(originPort('prod', { SWARM_PORT: '4400' })).toBe(4400);
  });

  it('falls back when the value is not a usable port', () => {
    expect(originPort('dev', { SWARM_CLIENT_PORT: 'abc' })).toBe(5317);
    expect(originPort('dev', { SWARM_CLIENT_PORT: '0' })).toBe(5317);
    expect(originPort('dev', { SWARM_CLIENT_PORT: '70000' })).toBe(5317);
    expect(originPort('prod', { SWARM_PORT: '5317.5' })).toBe(4317);
  });
});

describe('tunnelArgs', () => {
  it('tunnels the origin behind the email allow list', () => {
    expect(tunnelArgs('http://127.0.0.1:5317', ['you@example.com', 'teammate@example.com'])).toEqual([
      'tunnel',
      '--url',
      'http://127.0.0.1:5317',
      '--allowed-mail',
      'you@example.com,teammate@example.com',
    ]);
  });
});

describe('prerequisite', () => {
  it('names the app command for each mode', () => {
    expect(prerequisite('dev', 5317)).toMatch(/npm run dev.*5317/);
    expect(prerequisite('prod', 4317)).toMatch(/npm run build.*npm start.*4317/);
  });
});
