// The tunnel helper's decisions, kept pure so Vitest can cover them: which mode, the cloudflared
// version gate, the allow list, and the origin/arguments for each mode. Used by cloudflare-tunnel.mjs.
import { parseArgs } from 'node:util';

/** `--dev` (tunnel Vite) or `--prod` (tunnel the Node server). Exactly one is required. */
export function parseTunnelArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      dev: { type: 'boolean', default: false },
      prod: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.dev && values.prod) throw new Error('choose either --dev or --prod, not both');
  return { mode: values.dev ? 'dev' : values.prod ? 'prod' : null, help: values.help };
}

/** The cloudflared release that added `--allowed-mail`. */
export const MINIMUM_VERSION = '2026.9.3';

/** The first x.y.z in `cloudflared --version` output as [major, minor, patch], or null. */
export function parseVersion(text) {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(String(text ?? ''));
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** True when the parsed `installed` version is at least the parsed `minimum` version. */
export function isVersionAtLeast(installed, minimum) {
  for (let i = 0; i < 3; i += 1) {
    if (installed[i] !== minimum[i]) return installed[i] > minimum[i];
  }
  return true;
}

/** Comma-separated email addresses, trimmed, blanks dropped. Empty means "refuse". */
export function parseAllowedEmails(raw) {
  return String(raw ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
}

/** The port to tunnel: dev = Vite (SWARM_CLIENT_PORT, else 5317); prod = Node server (SWARM_PORT, else 4317). */
export function originPort(mode, env = process.env) {
  const [raw, fallback] = mode === 'dev' ? [env.SWARM_CLIENT_PORT, 5317] : [env.SWARM_PORT, 4317];
  const port = Number(raw);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
}

/** What must already be running for this mode. The helper never starts the app. */
export function prerequisite(mode, port) {
  return mode === 'dev'
    ? `Run 'npm run dev' first (Vite must be listening on port ${port}).`
    : `Run 'npm run build' then 'npm start' first (Node server must be listening on port ${port}).`;
}

/** The cloudflared arguments: tunnel to `origin`, gated by the comma-joined email allow list. */
export function tunnelArgs(origin, emails) {
  return ['tunnel', '--url', origin, '--allowed-mail', emails.join(',')];
}
