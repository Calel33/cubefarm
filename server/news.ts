// The news desk (#268): the office's news log, the Cubefarm Gazette's editions on disk and the all-hands. The swarm
// notes what happens (newsFromLedger, issueChanges); at 7 am the desk prints yesterday's daily, and on Monday last
// week's weekly (shared/news.ts decides when and writes the template edition). The template edition is out at once,
// so nothing waits on a model; when usage is normal the CEO gets a short job to rewrite its words (written()).
// Kept in <SWARM_HOME>/news (demo-news for the demo): log.json (the items, 60 days) and one <id>.json per edition,
// written to a temp file and renamed. Editions older than 60 days go at startup and on the hourly check.
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  allHandsDue,
  allHandsLength,
  applyWriting,
  dueEditions,
  expired,
  extraEdition,
  fallbackEdition,
  isEditionId,
  NEWS_KEEP_DAYS,
  pickAttendees,
  slidesOf,
  summaryOf,
  type AllHandsView,
  type ComingUp,
  type EditionKind,
  type EditionSpec,
  type NewsEdition,
  type NewsItem,
  type NewsSummary,
  type NewsView,
} from '../shared/news.ts';
import { achievementDef } from '../shared/progress.ts';
import type { IssueInfo } from '../shared/types.ts';
import { HttpError } from './httpError.ts';
import type { Effects, LedgerEvent } from './ledger.ts';

const DAY_MS = 24 * 60 * 60_000;
/** The log keeps at most this many items, newest last. */
export const LOG_MAX = 5000;
/** The snapshot lists this many editions; the Gazette asks for the rest. */
export const VIEW_EDITIONS = 12;
const CHECK_MS = 60_000;
const SAVE_MS = 5_000;

// ---------- what the swarm notes ----------

export interface NewsLookup {
  agent(id: string): { name: string; floor: number | null; title: string } | null;
  /** A floor by repo id or full name. */
  floor(repo: string): { floor: number; repoId: string; repo: string } | null;
}

/** The news in a ledger event that changed something (the ledger is idempotent, so each counts once). */
export function newsFromLedger(ev: LedgerEvent, fx: Pick<Effects, 'reward' | 'unlocked'>, look: NewsLookup, now: number): NewsItem[] {
  const out: NewsItem[] = [];
  const where = (repo: string) => {
    const f = look.floor(repo);
    return f ? { floor: f.floor, repoId: f.repoId, repo: f.repo } : { floor: null };
  };
  const person = (id: string | null) => (id ? look.agent(id) : null);
  switch (ev.kind) {
    case 'merged': {
      const a = person(ev.author);
      out.push({ at: ev.at, kind: 'merged', ...where(ev.repoId), pr: ev.pr, title: ev.title, ...(a ? { who: a.name, whoId: ev.author! } : {}) });
      break;
    }
    case 'qa': {
      const t = person(ev.tester);
      const a = person(ev.author);
      out.push({ at: ev.at, kind: 'qa', ...where(ev.repoId), pr: ev.pr, pass: ev.pass, ...(t ? { who: t.name, whoId: ev.tester! } : {}), ...(a ? { author: a.name } : {}) });
      break;
    }
    case 'needs-human':
      out.push({ at: now, kind: 'needs-human', ...where(ev.repoId), pr: ev.pr });
      break;
    case 'full-house':
      out.push({ at: ev.at, kind: 'full-house', ...where(ev.repoName), detail: `${ev.people} people` });
      break;
  }
  if (fx.reward && fx.reward.coins > 0) out.push({ at: now, kind: 'coins', ...where(fx.reward.repoId), pr: fx.reward.prNumber, coins: fx.reward.coins });
  for (const u of fx.unlocked) {
    const def = achievementDef(u.id);
    out.push({ at: u.at || now, kind: 'achievement', floor: null, detail: def ? `${def.icon} ${def.name}` : u.id, title: u.detail });
  }
  return out;
}

/** Issues a sync found new (filed) or gone from the open list (closed) since the last one. */
export function issueChanges(before: readonly Pick<IssueInfo, 'number' | 'title'>[], after: readonly Pick<IssueInfo, 'number' | 'title'>[]) {
  const was = new Set(before.map((i) => i.number));
  const now = new Set(after.map((i) => i.number));
  return { filed: after.filter((i) => !was.has(i.number)), closed: before.filter((i) => !now.has(i.number)) };
}

// ---------- the desk ----------

export interface NewsDeskDeps {
  dir: string;
  now?: () => number;
  company(): string;
  /** The open issues across the floors, oldest first. */
  backlog(): ComingUp[];
  /** May the CEO write the words now (usage normal, a CEO on staff)? */
  mayWrite(): boolean;
  /** Ask the CEO to rewrite an edition; their answer comes back through written() (or writeFailed()). */
  write(edition: NewsEdition): void;
  /** Everyone on staff, for the all-hands. */
  people(): { id: string; role: string; status: string; floor: number; desk: number }[];
  changed(view: NewsView): void;
  /** The demo's made-up past, for an empty log. */
  seed?(now: number): NewsItem[];
  log?(text: string): void;
}

interface LogFile {
  items: NewsItem[];
  lastAllHands: number | null;
}

export class NewsDesk {
  private items: NewsItem[] = [];
  private editions = new Map<string, NewsSummary>();
  private writing: string | null = null;
  private allHands: AllHandsView | null = null;
  private lastAllHands: number | null = null;
  private seq = 0;
  private prunedAt = 0;
  private saving: NodeJS.Timeout | null = null;
  private timer: NodeJS.Timeout | null = null;
  private ending: NodeJS.Timeout | null = null;
  private printing = new Map<string, Promise<NewsEdition>>();

  constructor(private deps: NewsDeskDeps) {}

  private now() {
    return this.deps.now?.() ?? Date.now();
  }

  async init() {
    await fs.mkdir(this.deps.dir, { recursive: true });
    const raw = await fs.readFile(this.logFile(), 'utf8').catch(() => '');
    try {
      const parsed = (raw ? JSON.parse(raw) : {}) as Partial<LogFile>;
      this.items = Array.isArray(parsed.items) ? parsed.items.filter((i) => i && typeof i.at === 'number' && typeof i.kind === 'string') : [];
      this.lastAllHands = typeof parsed.lastAllHands === 'number' ? parsed.lastAllHands : null;
    } catch {
      this.items = [];
    }
    if (this.items.length === 0 && this.deps.seed) {
      this.items = this.deps.seed(this.now());
      this.saveSoon();
    }
    for (const name of await fs.readdir(this.deps.dir).catch(() => [] as string[])) {
      const id = name.replace(/\.json$/, '');
      if (!name.endsWith('.json') || !isEditionId(id)) continue;
      const e = await this.load(id).catch(() => null);
      if (e) this.editions.set(e.id, summaryOf(e));
    }
    await this.prune();
  }

  /** Starts the minute check (7 am editions, Monday's all-hands) and runs it once now. */
  start() {
    this.timer = setInterval(() => void this.check(), CHECK_MS);
    this.timer.unref?.();
    void this.check();
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.ending) clearTimeout(this.ending);
    if (this.saving) {
      clearTimeout(this.saving);
      await this.saveLog();
    }
  }

  view(): NewsView {
    return { editions: this.list().slice(0, VIEW_EDITIONS), writing: this.writing, allHands: this.allHands };
  }

  /** Every edition on disk, newest first. */
  list(): NewsSummary[] {
    return [...this.editions.values()].sort((a, b) => b.publishedAt - a.publishedAt || b.id.localeCompare(a.id));
  }

  async read(id: string): Promise<NewsEdition> {
    if (!isEditionId(id) || !this.editions.has(id)) throw new HttpError(404, `No edition ${id}`);
    return this.load(id);
  }

  /** Something happened worth reporting. */
  note(...items: NewsItem[]) {
    if (!items.length) return;
    this.items.push(...items);
    if (this.items.length > LOG_MAX) this.items.splice(0, this.items.length - LOG_MAX);
    this.saveSoon();
  }

  /** The items the log holds, oldest first (for tests and the probe). */
  logged(): readonly NewsItem[] {
    return this.items;
  }

  async check() {
    const now = this.now();
    if (now - this.prunedAt > 60 * 60_000) {
      this.prunedAt = now;
      await this.prune();
    }
    for (const spec of dueEditions(now, (id) => this.editions.has(id) || this.printing.has(id))) await this.print(spec).catch((err) => this.deps.log?.(`news: couldn't print ${spec.id}: ${(err as Error).message}`));
    const weekly = this.list().find((e) => e.kind === 'weekly') ?? null;
    if (!this.allHands && allHandsDue(now, this.lastAllHands, weekly)) await this.startAllHands('monday').catch(() => undefined);
  }

  /** The console and `?news=generate`: an edition of the last day (or week) up to now, printed now. */
  async generate(kind: unknown): Promise<NewsSummary> {
    const k: EditionKind = kind === 'weekly' ? 'weekly' : 'daily';
    const e = await this.print(extraEdition(k, this.now()));
    return summaryOf(e);
  }

  /** Prints an edition from the template (out at once), then asks the CEO for better words if usage allows. */
  private print(spec: EditionSpec, write = true): Promise<NewsEdition> {
    const busy = this.printing.get(spec.id);
    if (busy) return busy;
    const run = (async () => {
      const edition = fallbackEdition({ ...spec, items: this.items, backlog: this.deps.backlog(), company: this.deps.company(), now: this.now() });
      await this.save(edition);
      this.deps.log?.(`news: printed ${edition.id} (${edition.stories.length} stories)`);
      if (write && this.deps.mayWrite()) {
        this.writing = edition.id;
        this.deps.write(edition);
      }
      this.emit();
      return edition;
    })().finally(() => this.printing.delete(spec.id));
    this.printing.set(spec.id, run);
    return run;
  }

  /** The CEO's answer for edition `id`: its words replace the template's when they fit. */
  async written(id: string, out: unknown): Promise<boolean> {
    if (this.writing === id) this.writing = null;
    const draft = await this.read(id).catch(() => null);
    const next = draft && applyWriting(draft, out);
    if (next) await this.save(next);
    this.emit();
    return !!next;
  }

  /** The CEO couldn't write it: the template's edition stands. */
  writeFailed(id: string) {
    if (this.writing !== id) return;
    this.writing = null;
    this.emit();
  }

  // ---------- the all-hands ----------

  /** Gathers the idle people in the lobby for the CEO to present the latest weekly edition (printing one if none). */
  async startAllHands(why: AllHandsView['why']): Promise<NewsView> {
    if (this.allHands) throw new HttpError(409, 'The all-hands is already on.');
    const latest = this.list().find((e) => e.kind === 'weekly') ?? this.list()[0];
    const edition = latest ? await this.read(latest.id) : await this.print(extraEdition('weekly', this.now()), false);
    const now = this.now();
    const slides = slidesOf(edition, this.deps.company()).length;
    this.allHands = { id: ++this.seq, edition: edition.id, startedAt: now, attendees: pickAttendees(this.deps.people()), why, slides };
    this.lastAllHands = now;
    this.saveSoon();
    if (this.ending) clearTimeout(this.ending);
    this.ending = setTimeout(() => this.endAllHands(), allHandsLength(slides));
    this.ending.unref?.();
    this.deps.log?.(`news: all-hands on ${edition.id} with ${this.allHands.attendees.length} in the lobby`);
    this.emit();
    return this.view();
  }

  /** Over (on its own once everyone's back, or the manager stops it). */
  endAllHands(): NewsView {
    if (this.ending) clearTimeout(this.ending);
    this.ending = null;
    if (this.allHands) {
      this.allHands = null;
      this.emit();
    }
    return this.view();
  }

  // ---------- disk ----------

  private emit() {
    this.deps.changed(this.view());
  }

  private logFile() {
    return path.join(this.deps.dir, 'log.json');
  }

  private async load(id: string): Promise<NewsEdition> {
    return JSON.parse(await fs.readFile(path.join(this.deps.dir, `${id}.json`), 'utf8')) as NewsEdition;
  }

  private async save(e: NewsEdition) {
    await writeAtomic(path.join(this.deps.dir, `${e.id}.json`), JSON.stringify(e));
    this.editions.set(e.id, summaryOf(e));
  }

  private saveSoon() {
    if (this.saving) return;
    this.saving = setTimeout(() => {
      this.saving = null;
      void this.saveLog();
    }, SAVE_MS);
    this.saving.unref?.();
  }

  private async saveLog() {
    const body: LogFile = { items: this.items, lastAllHands: this.lastAllHands };
    await writeAtomic(this.logFile(), JSON.stringify(body)).catch((err) => this.deps.log?.(`news: couldn't save the log: ${(err as Error).message}`));
  }

  /** Editions and log items older than 60 days go. Never throws. */
  async prune() {
    const now = this.now();
    const before = this.items.length;
    this.items = this.items.filter((i) => now - i.at <= NEWS_KEEP_DAYS * DAY_MS);
    if (this.items.length !== before) this.saveSoon();
    let gone = 0;
    for (const e of [...this.editions.values()]) {
      if (!expired(e.publishedAt, now)) continue;
      await fs.rm(path.join(this.deps.dir, `${e.id}.json`), { force: true, maxRetries: 3 }).catch(() => undefined);
      this.editions.delete(e.id);
      gone++;
    }
    if (gone) this.emit();
  }
}

async function writeAtomic(file: string, body: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, body);
  await fs.rename(tmp, file);
}
