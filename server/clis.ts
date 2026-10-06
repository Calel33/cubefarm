import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { run } from './exec.ts';
import type { AgentCli, CliView, EffortLevel } from '../shared/types.ts';

// The coding-agent CLIs an agent can run in its terminal, how to find them on this machine, and how to start one on
// a task. Claude Code is fully wired in: its hooks report every tool call to the office.
// The others start on the same prompt and report only when a turn ends (Codex's notify program, an OpenCode plugin);
// the office shows their task instead of their tool calls.

export interface CliDef {
  id: AgentCli;
  label: string;
  command: string;
  integrated: boolean;
}

export const CLIS: CliDef[] = [
  { id: 'claude', label: 'Claude Code', command: 'claude', integrated: true },
  { id: 'codex', label: 'Codex', command: 'codex', integrated: false },
  { id: 'opencode', label: 'OpenCode', command: 'opencode', integrated: false },
];

export const isCli = (v: unknown): v is AgentCli => CLIS.some((c) => c.id === v);
export const cliLabel = (id: AgentCli) => CLIS.find((c) => c.id === id)?.label ?? id;

// ---------- finding a CLI ----------

const WIN = process.platform === 'win32';

/** The executable suffixes for this platform: on Windows only .exe/.cmd/.bat/.com, never an extensionless sh shim. */
const extsFor = (env: NodeJS.ProcessEnv) => (WIN ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter((e) => /^\.(exe|cmd|bat|com)$/i.test(e)) : ['']);

/** The first executable named `name` in these directories, or null. */
function findIn(dirs: string[], name: string, env: NodeJS.ProcessEnv): string | null {
  for (const dir of dirs) {
    for (const ext of extsFor(env)) {
      const file = path.join(dir, name + ext.toLowerCase());
      try {
        const st = fs.statSync(file);
        if (st.isFile() && (WIN || (st.mode & 0o111) !== 0)) return file;
      } catch {
        // not here
      }
    }
  }
  return null;
}

/** The executable for a command name on PATH. */
export function resolveCommand(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  return findIn((env[key] ?? '').split(path.delimiter).filter(Boolean), name, env);
}

/**
 * Directories a coding CLI is often installed into but which may not be on the office's PATH: a bun global install
 * (~/.bun/bin), an npm global prefix (~/AppData/Roaming/npm on Windows), ~/.local/bin and similar. The office
 * inherits the environment of whatever started it, which isn't always the shell a manager installs CLIs from.
 */
function candidateDirs(env: NodeJS.ProcessEnv): string[] {
  const home = env.USERPROFILE || env.HOME || '';
  const appData = env.APPDATA || '';
  const localAppData = env.LOCALAPPDATA || '';
  const dirs = WIN
    ? [
        home && path.join(home, '.bun', 'bin'),
        home && path.join(home, '.local', 'bin'),
        home && path.join(home, '.opencode', 'bin'),
        home && path.join(home, '.codex', 'bin'),
        localAppData && path.join(localAppData, 'bun', 'bin'),
        localAppData && path.join(localAppData, 'Programs', 'opencode'),
        appData && path.join(appData, 'npm'),
      ]
    : [home && path.join(home, '.bun', 'bin'), home && path.join(home, '.local', 'bin'), home && path.join(home, '.opencode', 'bin'), '/usr/local/bin', '/opt/homebrew/bin'];
  return dirs.filter((d): d is string => !!d);
}

/**
 * The executable for a coding CLI: `CUBEFARM_<NAME>_PATH` if set, else PATH, else the common install directories
 * above. The override lets a manager point at a specific build (several versions, or an off-PATH install);
 * `CUBEFARM_OPENCODE_PATH`, `CUBEFARM_CLAUDE_PATH`, `CUBEFARM_CODEX_PATH`.
 */
export function resolveCli(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const override = env[`CUBEFARM_${name.toUpperCase()}_PATH`];
  if (override) {
    try {
      if (fs.statSync(override).isFile()) return override;
    } catch {
      // the override is wrong: fall through to the normal search
    }
  }
  return resolveCommand(name, env) ?? findIn(candidateDirs(env), name, env);
}

/**
 * npm installs Windows CLIs as .cmd shims. Running one puts every argument through cmd.exe, which expands %VARS% and
 * trips over quotes in a prompt, so run what the shim runs instead: the package's .exe, or node on its script.
 */
export function unwrapCmdShim(shimPath: string, text: string): { file: string; args: string[] } | null {
  const line = text.split(/\r?\n/).find((l) => /%\*\s*$/.test(l));
  if (!line) return null;
  const dir = path.dirname(shimPath);
  const targets = [...line.matchAll(/"%dp0%\\([^"]+)"/g)].map((m) => path.join(dir, m[1]));
  const target = targets[targets.length - 1];
  if (!target) return null;
  if (/\.exe$/i.test(target)) return { file: target, args: [] };
  if (!/\.[cm]?js$/i.test(target)) return null;
  const between = line.slice(line.indexOf('"%_prog%"') + '"%_prog%"'.length, line.lastIndexOf(`"%dp0%\\`));
  const nodeFlags = line.includes('"%_prog%"') ? between.trim().split(/\s+/).filter((f) => f.startsWith('--')) : [];
  const localNode = path.join(dir, 'node.exe');
  return { file: fs.existsSync(localNode) ? localNode : process.execPath, args: [...nodeFlags, target] };
}

/**
 * The Claude Code the Agent SDK ships as a per-platform package (the one `cubefarm login` signs in with), so the
 * terminal runtime works without Claude Code installed, on the version the office was tested with. Same lookup as
 * the SDK's own and bin/cubefarm.js.
 */
let bundled: string | null | undefined;

function bundledClaude(): string | null {
  if (bundled !== undefined) return bundled;
  bundled = null;
  let sdk: string;
  try {
    sdk = createRequire(import.meta.url).resolve('@anthropic-ai/claude-agent-sdk');
  } catch {
    return null;
  }
  const { platform, arch } = process;
  // Only Linux needs the report (glibc or musl). On Windows it walks every native handle, and with pseudo-consoles
  // closing on other threads that takes the whole office down.
  const report = platform === 'linux' ? (process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined) : undefined;
  const musl = platform === 'linux' && !report?.header?.glibcVersionRuntime;
  const targets = platform === 'linux' ? (musl ? [`linux-${arch}-musl`, `linux-${arch}`] : [`linux-${arch}`, `linux-${arch}-musl`]) : [`${platform}-${arch}`];
  for (const target of targets) {
    try {
      bundled = createRequire(sdk).resolve(`@anthropic-ai/claude-agent-sdk-${target}/claude${WIN ? '.exe' : ''}`);
      return bundled;
    } catch {
      // not installed for this target
    }
  }
  return null;
}

/** How to start a CLI: the program and the arguments that come before the office's own. */
export function commandFor(id: AgentCli): { file: string; args: string[] } | null {
  const bundled = id === 'claude' ? bundledClaude() : null;
  if (bundled) return { file: bundled, args: [] };
  const def = CLIS.find((c) => c.id === id);
  const found = def && resolveCli(def.command);
  if (!found) return null;
  if (WIN && /\.(cmd|bat)$/i.test(found)) {
    try {
      return unwrapCmdShim(found, fs.readFileSync(found, 'utf8')) ?? { file: found, args: [] };
    } catch {
      return { file: found, args: [] };
    }
  }
  return { file: found, args: [] };
}

/**
 * The models a CLI can run, for the office's model fields. Best effort: no CLI, an old version, no network or no
 * signed-in provider means no suggestions, and any name can still be typed. Currently OpenCode is the one with a
 * `models` command (`opencode models` prints `provider/model` per line).
 */
async function listModels(id: AgentCli, cmd: { file: string; args: string[] }): Promise<string[] | undefined> {
  if (id !== 'opencode') return undefined;
  const out = await run(cmd.file, [...cmd.args, 'models'], { timeoutMs: 20_000 }).catch(() => null);
  if (!out) return undefined;
  const models = [...new Set(out.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[^\s#]+\/[^\s#]+$/.test(l)))];
  return models.length ? models.slice(0, 300) : undefined;
}

/** Which CLIs this machine has, with their versions and (where the CLI can list them) their models. */
export async function detectClis(): Promise<CliView[]> {
  return Promise.all(
    CLIS.map(async (c) => {
      const cmd = commandFor(c.id);
      const version = cmd ? await run(cmd.file, [...cmd.args, '--version'], { timeoutMs: 20_000 }).catch(() => null) : null;
      const models = cmd ? await listModels(c.id, cmd) : undefined;
      return { id: c.id, label: c.label, installed: !!cmd, version: version?.split(/\r?\n/)[0].trim().slice(0, 60) || null, integrated: c.integrated, ...(models ? { models } : {}) };
    }),
  );
}

/**
 * The major version of a CLI (`opencode --version` says e.g. "opencode v2.0.21"). OpenCode 1 and 2 need different
 * plugin shapes and plugin delivery, so the office picks between them by this. Cached: the binary doesn't change
 * under a running office.
 */
const majors = new Map<AgentCli, number | null>();
export async function cliMajor(id: AgentCli): Promise<number | null> {
  if (majors.has(id)) return majors.get(id) ?? null;
  const cmd = commandFor(id);
  const out = cmd ? await run(cmd.file, [...cmd.args, '--version'], { timeoutMs: 20_000 }).catch(() => null) : null;
  const hit = /(?:^|\s)v?(\d+)\./.exec(out ?? '');
  const major = hit ? Number(hit[1]) : null;
  majors.set(id, major);
  return major;
}

// ---------- starting one on a task ----------

export interface LaunchContext {
  prompt: string;
  systemAppend: string;
  model: string; // '' = the CLI's own default
  effort: EffortLevel | '';
  resumeId?: string;
  sessionId: string; // the id the office gives a new Claude Code session
  name: string; // shown in Claude Code's prompt box and the terminal title
  role: 'dev' | 'qa' | 'ceo';
  additionalDirectories: string[];
  /** Files the office wrote for this session (settings, MCP config, instructions). */
  files: { settings: string; mcp: string | null; system: string };
  /** Where the CLI's turn-complete signal goes (Codex notify, the OpenCode plugin). */
  notify: { script: string; url: string };
  /** Codex's hook program: forwards each hook to the office (notify.url). */
  codexHook: string;
  plugin: string; // file URL of the OpenCode plugin
  /** The Playwright MCP server, when the floor tests in a browser. Claude Code gets it through its MCP config file. */
  browser: { command: string; args: string[] } | null;
  /** The office's MCP endpoint (the CEO's tools). Claude Code gets it through its MCP config file; OpenCode through config. */
  officeUrl?: string;
}

export interface Launch {
  args: string[];
  env: Record<string, string>;
}

const EFFORT_CODEX: Record<EffortLevel, string> = { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'xhigh' };

/** Codex hooks the office listens to: its steps, and Esc interrupting a turn. Turn endings come from notify. */
export const CODEX_HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Interrupt'];

/**
 * The command Codex runs for each hook. It never changes (the office's address travels in CUBEFARM_HOOK_URL), so the
 * manager trusts the hooks once in Codex's /hooks and that holds for every session. On Windows, Codex runs it through
 * PowerShell or cmd depending on its version, and a command starting with a quote fails in both: plain `node` (on the
 * PATH the office gave it) and the script in double quotes work in either. Elsewhere it goes through the shell.
 */
export function codexHookCommand(node: string, script: string, win = WIN): string {
  return win ? `node "${script}"` : [node, script].map((s) => `'${s.replaceAll("'", `'"'"'`)}'`).join(' ');
}

/**
 * Claude Code tools whose result arrives in a later turn. An office session ends with its turn, so nothing would wake
 * the agent. Background shells (run_in_background) stay: agents start dev servers with them.
 */
export const CROSS_TURN_TOOLS = ['Monitor', 'ScheduleWakeup', 'CronCreate', 'CronDelete', 'CronList', 'RemoteTrigger'];

export function launchArgs(id: AgentCli, ctx: LaunchContext): Launch {
  switch (id) {
    case 'claude': {
      const disallowed = ['AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode', ...CROSS_TURN_TOOLS, ...(ctx.role === 'ceo' ? ['Bash', 'PowerShell', 'NotebookEdit'] : [])];
      const args = [
        ...(ctx.resumeId ? ['--resume', ctx.resumeId] : ['--session-id', ctx.sessionId]),
        ...(ctx.model ? ['--model', ctx.model] : []),
        ...(ctx.effort ? ['--effort', ctx.effort] : []),
        // The office's PreToolUse hook answers every permission question (allow, or deny with an office rule).
        '--permission-mode',
        'acceptEdits',
        // On top of the manager's own setup (settings, skills, plugins, MCP servers): the office's hooks and servers.
        '--settings',
        ctx.files.settings,
        ...(ctx.files.mcp ? ['--mcp-config', ctx.files.mcp] : []),
        '--append-system-prompt-file',
        ctx.files.system,
        '--name',
        ctx.name,
        ...ctx.additionalDirectories.flatMap((d) => ['--add-dir', d]),
        '--disallowedTools',
        ...disallowed,
        '--',
        ctx.prompt,
      ];
      return { args, env: { DISABLE_AUTOUPDATER: '1' } }; // the office's own copy: agents mustn't each try to update it
    }
    case 'codex': {
      const toml = (s: string) => JSON.stringify(s); // a JSON string is a valid TOML basic string
      const args = [
        '--no-alt-screen',
        '-c',
        `notify=[${[process.execPath, ctx.notify.script, ctx.notify.url].map(toml).join(',')}]`,
        '-c',
        `developer_instructions=${toml(ctx.systemAppend)}`,
        ...(ctx.model ? ['-m', ctx.model] : []),
        ...(ctx.effort ? ['-c', `model_reasoning_effort=${toml(EFFORT_CODEX[ctx.effort])}`] : []),
        ...(ctx.browser ? ['-c', `mcp_servers.playwright={command=${toml(ctx.browser.command)},args=[${ctx.browser.args.map(toml).join(',')}]}`] : []),
        ...CODEX_HOOK_EVENTS.flatMap((e) => ['-c', `hooks.${e}=[{hooks=[{type="command",command=${toml(codexHookCommand(process.execPath, ctx.codexHook))},timeout=10}]}]`]),
        // Like the manager's own Codex, but it can't stop to ask: no approvals and no sandbox (its sandbox can't reach
        // the credential store, so git and gh fail in it).
        '--dangerously-bypass-approvals-and-sandbox',
      ];
      return { args: ctx.resumeId ? ['resume', ...args, ctx.resumeId, ctx.prompt] : [...args, '--', ctx.prompt], env: { CUBEFARM_HOOK_URL: ctx.notify.url } };
    }
    case 'opencode': {
      // The CEO may not run shell commands or edit code (it acts only through the office tools and reads repos); the
      // office's own worktrees may read linked repos and clones outside the session folder.
      const permission =
        ctx.role === 'ceo'
          ? { edit: 'deny', bash: 'deny', webfetch: 'allow', external_directory: 'allow' }
          : { edit: 'allow', bash: 'allow', webfetch: 'allow', external_directory: 'allow' };
      const mcp: Record<string, unknown> = {};
      if (ctx.officeUrl) mcp.office = { type: 'remote', url: ctx.officeUrl, enabled: true, oauth: false }; // the CEO's tools (no OAuth)
      if (ctx.browser) mcp.playwright = { type: 'local', command: [ctx.browser.command, ...ctx.browser.args], enabled: true };
      const config = {
        plugin: [ctx.plugin],
        instructions: [ctx.files.system],
        autoupdate: false, // several agents starting at once must not each reinstall it
        // OpenCode 2 dropped the top-level --model flag (only `opencode run` has it) and reads the model from
        // config instead. OpenCode 1 reads the same `model` field, so this covers both.
        ...(ctx.model ? { model: ctx.model } : {}),
        permission,
        ...(Object.keys(mcp).length ? { mcp } : {}),
      };
      // No project argument: it starts in its terminal's folder, and a desk path in its command line would make the
      // desk clean-up take it for a leftover.
      const args = [
        '--auto',
        ...(ctx.resumeId ? ['--session', ctx.resumeId] : []),
        '--prompt',
        ctx.prompt,
      ];
      return { args, env: { OPENCODE_CONFIG_CONTENT: JSON.stringify(config), CUBEFARM_NOTIFY_URL: ctx.notify.url } };
    }
  }
}

// ---------- Codex's saved threads ----------

/** Runs each key's steps one after another; one that fails doesn't hold up the next. */
export function oneAtATime() {
  const tails = new Map<string, Promise<void>>();
  return (key: string, step: () => Promise<unknown>): Promise<void> => {
    const next = (tails.get(key) ?? Promise.resolve()).then(step).then(
      () => undefined,
      () => undefined,
    );
    tails.set(key, next);
    void next.then(() => tails.get(key) === next && tails.delete(key));
    return next;
  };
}

const threadSteps = oneAtATime();

/**
 * Codex saves every terminal session where the manager's own Codex and ChatGPT apps list it with their chats. The
 * office archives its threads there once their CLI is gone (`after`), and unarchives one before resuming it: Codex
 * won't resume an archived thread. A thread's steps run in order; one with nothing to do (already archived) fails.
 */
export function codexThread(action: 'archive' | 'unarchive', id: string, after?: Promise<unknown>): Promise<void> {
  return threadSteps(id, async () => {
    await after;
    const cmd = commandFor('codex');
    if (cmd) await run(cmd.file, [...cmd.args, action, id], { timeoutMs: 30_000 });
  });
}

// ---------- prompts the office answers ----------

const TRUST_PROMPT = /Quick safety check|Do you trust the (files|contents) (in|of) this|trust this folder|allow Codex to work in this folder/i;

/**
 * The key that moves a CLI's folder-trust question toward trusting the office's own worktree: Enter when the
 * selected option says yes, Down when it says no (Claude Code selects "No, exit" first), null when there's no such
 * question on screen.
 */
export function trustKey(screen: string): 'enter' | 'down' | null {
  if (!TRUST_PROMPT.test(screen)) return null;
  const selected = screen.match(/^\s*[❯›]\s*(?:\d+\.\s*)?(.+)$/m)?.[1] ?? '';
  if (/^(yes|trust|continue|proceed)\b/i.test(selected.trim())) return 'enter';
  if (/^(no|exit|quit|cancel)\b/i.test(selected.trim())) return 'down';
  return null;
}

/**
 * Codex asks to review new hooks before it starts. They only show the office Codex's steps, so trusting them is the
 * manager's call (once, in /hooks): the office moves to "Continue without trusting" (Down) and takes it (Enter).
 */
export function hookReviewKey(screen: string): 'enter' | 'down' | null {
  if (!/Hooks need review/i.test(screen)) return null;
  const selected = screen.match(/^\s*[❯›]\s*(?:\d+\.\s*)?(.+)$/m)?.[1] ?? '';
  return /^continue without trusting/i.test(selected.trim()) ? 'enter' : 'down';
}

/**
 * Lines on screen where a CLI says it interrupted a turn (Claude Code: "Interrupted · What should Claude do
 * instead?", Codex: "Conversation interrupted"). Esc fires no hook in Claude Code, so a new one is how the office
 * knows the manager stopped the turn from the terminal.
 */
export function interruptions(screen: string): number {
  return screen.split('\n').filter((l) => /\binterrupted\b/i.test(l)).length;
}

// ---------- helper scripts the CLIs run ----------

/** Claude Code's status line: posts its data (cost, usage limits) to the office and shows the office's line. */
export const STATUSLINE_SOURCE = String.raw`// cubefarm: Claude Code's status line. Forwards the session's status to the office and prints the office's line.
const url = process.argv[2];
let body = '';
process.stdin.on('data', (c) => (body += c));
process.stdin.on('end', async () => {
  try {
    const status = JSON.parse(body);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hook_event_name: 'StatusLine', session_id: status.session_id, cost: status.cost, rate_limits: status.rate_limits }),
      signal: AbortSignal.timeout(2000),
    });
    const out = await res.json();
    process.stdout.write(String(out.statusLine ?? ''));
  } catch {
    process.stdout.write('cubefarm');
  }
});
`;

/** Codex's notify program: Codex runs it with a JSON argument when a turn completes. */
export const NOTIFY_SOURCE = String.raw`// cubefarm: Codex's notify program. Tells the office a turn is complete.
const [url, payload] = process.argv.slice(2);
let event = {};
try {
  event = JSON.parse(payload ?? '{}');
} catch {}
if (event.type === 'agent-turn-complete') {
  const input = String((event['input-messages'] ?? [])[0] ?? '').slice(0, 300);
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hook_event_name: 'TurnComplete', session_id: event['thread-id'] ?? null, last_assistant_message: event['last-assistant-message'] ?? '', input }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
}
`;

/** Codex's hook program: passes what Codex tells a hook on to the office and answers nothing, so Codex carries on as usual. */
export const CODEX_HOOK_SOURCE = String.raw`// cubefarm: Codex's hooks. Tells the office what Codex is doing; never changes what it does.
const url = process.env.CUBEFARM_HOOK_URL;
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', async () => {
  try {
    if (url) await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: Buffer.concat(chunks), signal: AbortSignal.timeout(5000) });
  } catch {}
  process.stdout.write('{}');
});
`;

/**
 * OpenCode 1 plugin: reports its session and when it goes idle (a turn is complete). Loaded from a file, which
 * OpenCode 1 accepts in the config's plugin list. OpenCode 2 uses OPENCODE_PLUGIN_V2_SOURCE instead.
 */
export const OPENCODE_PLUGIN_SOURCE = String.raw`// cubefarm: tells the office when OpenCode's session goes idle.
export default async function CubefarmPlugin({ client } = {}) {
  const url = process.env.CUBEFARM_NOTIFY_URL;
  if (!url) return {};
  let root;
  const post = (body) =>
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(3000) }).catch(() => {});
  const lastReply = async (id) => {
    try {
      const res = await client.session.messages({ path: { id } });
      const reply = (res?.data ?? []).filter((m) => m?.info?.role === 'assistant').pop();
      return (reply?.parts ?? []).filter((p) => p?.type === 'text').map((p) => p.text).join('\n').trim();
    } catch {
      return '';
    }
  };
  return {
    event: async ({ event }) => {
      const props = event?.properties ?? {};
      if (event?.type === 'session.created' && !props.info?.parentID && !root) root = props.info?.id;
      const sessionID = props.sessionID ?? props.info?.id;
      if (event?.type === 'session.idle' && (!root || sessionID === root)) {
        post({ hook_event_name: 'TurnComplete', session_id: sessionID ?? null, last_assistant_message: sessionID ? await lastReply(sessionID) : '' });
      }
      if (event?.type === 'session.error') post({ hook_event_name: 'TurnError', session_id: sessionID ?? null, error: String(props.error?.data?.message ?? props.error?.name ?? 'error') });
    },
  };
}
`;

/**
 * OpenCode 2 plugin (default-export definition with an id and a setup function — what OpenCode 2 requires; a bare
 * exported function is rejected). OpenCode 2 streams events through ctx.event.subscribe, names them differently
 * (session.execution.succeeded/failed/interrupted rather than session.idle) and carries the session id on the event
 * data. The final assistant text arrives as session.text.ended; session.text.delta accumulates it in the meantime.
 * It must be loaded from a directory (OpenCode 2 rejects a configured plugin path that points at a file).
 */
export const OPENCODE_PLUGIN_V2_SOURCE = String.raw`// cubefarm: tells the office when OpenCode 2 finishes a turn.
const url = process.env.CUBEFARM_NOTIFY_URL;
export default {
  id: 'cubefarm',
  async setup(ctx) {
    if (!url || !ctx || !ctx.event) return;
    const post = (body) =>
      fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(3000) }).catch(() => {});
    const texts = new Map();
    const done = new Set();
    const controller = new AbortController();
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          const data = (event && event.data) || {};
          const id = data.sessionID;
          const type = event && event.type;
          if (type === 'session.text.delta') {
            if (id) texts.set(id, (texts.get(id) || '') + String(data.delta || ''));
            continue;
          }
          if (type === 'session.text.ended') {
            if (id && typeof data.text === 'string') texts.set(id, data.text);
            continue;
          }
          if (type === 'session.execution.started' || type === 'session.step.started') {
            if (id) done.delete(id);
            continue;
          }
          if (type === 'session.execution.succeeded' || type === 'session.execution.failed' || type === 'session.execution.interrupted' || type === 'session.idle') {
            if (id && done.has(id)) continue;
            if (id) done.add(id);
            const text = id ? texts.get(id) || '' : '';
            if (id) texts.delete(id);
            // A failed execution must read as a failure, not a finished turn: say why, then end the turn.
            if (type === 'session.execution.failed') {
              const err = data.error || {};
              post({ hook_event_name: 'TurnError', session_id: id || null, error: String(err.message || err.name || 'the session failed') });
            }
            post({ hook_event_name: 'TurnComplete', session_id: id || null, last_assistant_message: text });
            continue;
          }
          if (type === 'session.error') {
            const err = data.error || {};
            post({ hook_event_name: 'TurnError', session_id: id || null, error: String(err.message || err.name || 'error') });
          }
        }
      } catch {
        // the office may be restarting; its next session picks the CLI up again
      }
    })();
    return () => controller.abort();
  },
};
`;
