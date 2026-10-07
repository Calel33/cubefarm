// Start a Cloudflare Quick Tunnel to the locally running cubefarm app (cross-platform, pure Node).
//
//   --dev    tunnel Vite on 127.0.0.1:${SWARM_CLIENT_PORT:-5317}    (start with `npm run dev`)
//   --prod   tunnel the Node server on 127.0.0.1:${SWARM_PORT:-4317} (start with `npm run build` && `npm start`)
//
// It does NOT start the app; start the app first, then run the matching alias (`npm run tunnel:dev` /
// `npm run tunnel:prod`). A Quick Tunnel is unauthenticated by default, so this helper always requires
// SWARM_TUNNEL_ALLOWED_EMAILS and always passes --allowed-mail: visitors must complete a Cloudflare
// Access one-time-PIN before reaching the office. Requires cloudflared >= 2026.9.3 (the release that
// added --allowed-mail). No credentials, named tunnel, or DNS configuration are used.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
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

const root = path.resolve(import.meta.dirname, '..');
const WIN = process.platform === 'win32';
const INSTALL_URL = 'https://github.com/cloudflare/cloudflared/releases/latest';

const HELP = `
  node scripts/cloudflare-tunnel.mjs (--dev | --prod)

    --dev    tunnel Vite on 127.0.0.1:\${SWARM_CLIENT_PORT:-5317} (the app must be running: npm run dev)
    --prod   tunnel the Node server on 127.0.0.1:\${SWARM_PORT:-4317} (npm run build, then npm start)

  Requires cloudflared >= ${MINIMUM_VERSION} and SWARM_TUNNEL_ALLOWED_EMAILS
  (comma-separated). Press Ctrl+C to stop the tunnel.
`;

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[39m` : s);
const [cyan, red, yellow, green] = [paint(36), paint(31), paint(33), paint(32)];

function banner(title) {
  const rule = '='.repeat(72);
  console.log('');
  console.log(cyan(rule));
  console.log(cyan(title));
  console.log(cyan(rule));
}

/** The cloudflared binary: ./cloudflared/ first, then PATH. Null when missing. */
function resolveCloudflared() {
  const names = WIN ? ['cloudflared.exe', 'cloudflared'] : ['cloudflared'];
  for (const name of names) {
    const local = path.join(root, 'cloudflared', name);
    if (fs.existsSync(local)) return local;
  }
  const found = spawnSync(WIN ? 'where' : 'which', ['cloudflared'], { encoding: 'utf8', windowsHide: true });
  if (found.status === 0) {
    return String(found.stdout)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? null;
  }
  return null;
}

/** The installed version as [major, minor, patch], or null when it can't be read. */
function installedVersion(binary) {
  const result = spawnSync(binary, ['--version'], { encoding: 'utf8', windowsHide: true });
  return parseVersion(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
}

/** Whether something is accepting connections on 127.0.0.1:port (500 ms, like the old PowerShell probe). */
function isListening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const finish = (listening) => {
      socket.destroy();
      resolve(listening);
    };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

let opts;
try {
  opts = parseTunnelArgs(process.argv.slice(2));
} catch (err) {
  console.error(`${err.message}${HELP}`);
  process.exit(1);
}
if (opts.help) {
  console.log(HELP);
  process.exit(0);
}
if (!opts.mode) {
  console.error(`Pick a mode: --dev or --prod${HELP}`);
  process.exit(1);
}
const { mode } = opts;

banner('cubefarm Cloudflare Quick Tunnel');

// --- resolve cloudflared -------------------------------------------------
const binary = resolveCloudflared();
if (!binary) {
  console.error(red('cloudflared was not found on PATH or in ./cloudflared.'));
  console.log('');
  console.log(`Install or upgrade cloudflared (>= ${MINIMUM_VERSION} is required):`);
  console.log('  winget install -e --id Cloudflare.cloudflared');
  console.log('  winget upgrade -e --id Cloudflare.cloudflared');
  console.log(`Manual download (add the binary to PATH): ${INSTALL_URL}`);
  console.log('Note: cloudflared does not auto-update on Windows.');
  process.exit(1);
}

// --- version gate --------------------------------------------------------
const version = installedVersion(binary);
if (!version) {
  console.error(red(`Could not determine the cloudflared version from ${binary} --version.`));
  process.exit(1);
}
const versionText = version.join('.');
if (!isVersionAtLeast(version, parseVersion(MINIMUM_VERSION))) {
  console.error(red(`cloudflared ${versionText} is too old; --allowed-mail needs >= ${MINIMUM_VERSION}.`));
  console.log('Refusing to start an unauthenticated tunnel.');
  console.log('');
  console.log('Upgrade (owner action):');
  console.log('  winget upgrade -e --id Cloudflare.cloudflared');
  console.log(`Manual download: ${INSTALL_URL}`);
  console.log('Note: cloudflared does not auto-update on Windows.');
  process.exit(1);
}

// --- allowed emails ------------------------------------------------------
const emails = parseAllowedEmails(process.env.SWARM_TUNNEL_ALLOWED_EMAILS);
if (emails.length === 0) {
  console.error(red('SWARM_TUNNEL_ALLOWED_EMAILS is empty.'));
  console.log('A protected Quick Tunnel requires an explicit allow list.');
  console.log('Set one or more comma-separated addresses, then retry:');
  console.log(WIN
    ? '  $env:SWARM_TUNNEL_ALLOWED_EMAILS = "you@example.com,teammate@example.com"'
    : "  export SWARM_TUNNEL_ALLOWED_EMAILS='you@example.com,teammate@example.com'");
  console.log('Refusing to start an unrestricted tunnel.');
  process.exit(1);
}

// --- origin --------------------------------------------------------------
const port = originPort(mode);
const origin = `http://127.0.0.1:${port}`;

console.log('');
console.log(`Mode       : ${mode}`);
console.log(`Origin     : ${origin}`);
console.log(`cloudflared: ${binary} (${versionText})`);
console.log(`Access     : Cloudflare One-Time PIN; ${emails.length} allowed address(es)`);
console.log(`Prereq     : ${prerequisite(mode, port)}`);
if (!(await isListening(port))) {
  console.log(yellow(`WARNING: nothing is listening on 127.0.0.1:${port} yet.`));
}
console.log('');
console.log(green('Starting tunnel. Watch for the https://<name>.trycloudflare.com URL below.'));
console.log(green('Press Ctrl+C to stop the tunnel.'));
console.log('');

// --- run cloudflared in the foreground -----------------------------------
const child = spawn(binary, tunnelArgs(origin, emails), { stdio: 'inherit', windowsHide: true });
let stopped = false;
const finish = (code) => {
  if (stopped) return;
  stopped = true;
  console.log('');
  console.log(cyan('Tunnel stopped.'));
  process.exit(code);
};
// Non-Windows: Ctrl+C reaches the whole process group, but forward it so cloudflared stops cleanly.
// Windows: the shared console delivers Ctrl+C to cloudflared directly.
const forward = (signal) => {
  if (WIN) return;
  try {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  } catch {
    // already gone
  }
};
process.on('SIGINT', () => forward('SIGINT'));
process.on('SIGTERM', () => forward('SIGTERM'));
child.on('error', (err) => {
  console.error(red(`cloudflared failed to start: ${err.message}`));
  finish(1);
});
child.on('close', (code, signal) => finish(code ?? (signal ? 1 : 0)));
// Last resort: no cloudflared outlives this helper.
process.on('exit', () => {
  if (child.exitCode === null && child.signalCode === null) {
    try {
      child.kill('SIGKILL');
    } catch {
      // already gone
    }
  }
});
