// Company news (#268), the pure part: what the office noted happening (NewsItem) turned into the Cubefarm Gazette's
// editions, a daily one at 7 am for the day before and a weekly one on Monday at 7 am. Stories grouped by floor and
// theme, the MVP, the numbers and what's coming up; the template writer that needs no model (the CEO may rewrite
// its words, applyWriting); the radio's bulletin; and the weekly all-hands' slides and timeline. Shared by the server,
// which publishes editions, and the client, which reads, plays and presents them.

export const NEWS_KEEP_DAYS = 60;
/** Editions come out at this local hour: the daily for the day before, the weekly on Mondays for the week before. */
export const PUBLISH_HOUR = 7;
/** The radio reads the morning bulletin at 9 (until noon, for a tab opened later). */
export const RADIO_HOUR = 9;
/** The Monday all-hands gathers at 10 (until noon). */
export const ALL_HANDS_HOUR = 10;
export const MAX_STORIES = 6;
export const MIN_STORIES = 3;
/** The most people who come down to the lobby; anyone else watches on their floor's monitor. */
export const MAX_ATTENDEES = 18;

const DAY_MS = 24 * 60 * 60_000;

export type EditionKind = 'daily' | 'weekly';
export type NewsItemKind = 'merged' | 'qa' | 'filed' | 'closed' | 'hired' | 'needs-human' | 'achievement' | 'coins' | 'pong' | 'full-house';

/** One thing the office noted, kept for the editions (server/news.ts's log). */
export interface NewsItem {
  at: number;
  kind: NewsItemKind;
  /** The floor's number (null: the whole office), its repo id and short name. */
  floor: number | null;
  repoId?: string;
  repo?: string;
  /** Who did it: the author of a merge, the tester of a QA round, the new hire, the ping-pong winner. */
  who?: string;
  whoId?: string;
  /** A QA round's PR author. */
  author?: string;
  pr?: number;
  issue?: number;
  title?: string;
  pass?: boolean;
  coins?: number;
  /** An achievement's name, a ping-pong score ("11–7 over Ada"), a hire's job title. */
  detail?: string;
}

export interface NewsStory {
  /** 'Floor 2', 'QA lab', 'People', 'Paperwork', 'Office'. */
  section: string;
  floor: number | null;
  headline: string;
  body: string;
  /** The PRs it's about, for a picture (QA's screenshots). */
  prs: { repoId: string; pr: number }[];
}

export interface NewsMvp {
  name: string;
  agentId: string | null;
  floor: number | null;
  why: string;
}

export interface NewsNumbers {
  merged: number;
  qaPassed: number;
  qaFailed: number;
  filed: number;
  closed: number;
  hires: number;
  needsHuman: number;
  achievements: number;
  coins: number;
}

/** An open issue for "coming up". */
export interface ComingUp {
  floor: number;
  repo: string;
  number: number;
  title: string;
}

export interface NewsEdition {
  id: string;
  kind: EditionKind;
  /** The time it covers (epoch ms). */
  from: number;
  to: number;
  /** "Sunday 4 October", "Week of 28 September". */
  dateline: string;
  publishedAt: number;
  /** Who wrote the words: the CEO's short session, or the template (no model). */
  writer: 'ceo' | 'template';
  headline: string;
  standfirst: string;
  stories: NewsStory[];
  mvp: NewsMvp | null;
  numbers: NewsNumbers;
  comingUp: ComingUp[];
  /** Next week's focus (the weekly's last slide): one line per floor with work waiting. */
  focus: string[];
}

/** An edition in the list of back issues. */
export interface NewsSummary {
  id: string;
  kind: EditionKind;
  headline: string;
  dateline: string;
  publishedAt: number;
  writer: NewsEdition['writer'];
}

/** The all-hands in the lobby: when it started, the edition presented and who came down for it. */
export interface AllHandsView {
  id: number;
  edition: string;
  startedAt: number;
  /** Idle people when it started (busy ones watch from their desks). */
  attendees: string[];
  why: 'monday' | 'manager';
  slides: number;
}

/** The snapshot's news: the newest editions, the CEO writing one (its id), and the all-hands if one is on. */
export interface NewsView {
  editions: NewsSummary[];
  writing: string | null;
  allHands: AllHandsView | null;
}

export const emptyNews = (): NewsView => ({ editions: [], writing: null, allHands: null });

export const summaryOf = (e: NewsEdition): NewsSummary => ({ id: e.id, kind: e.kind, headline: e.headline, dateline: e.dateline, publishedAt: e.publishedAt, writer: e.writer });

// ---------- the schedule ----------

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** Local midnight `days` days after the day of `ms` (DST-safe). */
const midnight = (ms: number, days = 0) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
};
/** Local `hour` o'clock on the day of `ms`. */
const atHour = (ms: number, hour: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour).getTime();
};
/** Local midnight of the Monday that starts the week of `ms`. */
const mondayOf = (ms: number) => midnight(ms, -((new Date(ms).getDay() + 6) % 7));

export const editionId = (kind: EditionKind, from: number) => `${kind}-${dayKey(from)}`;
const ID = /^(daily|weekly)-\d{4}-\d{2}-\d{2}(-x\d{4})?$/;
export const isEditionId = (id: string) => ID.test(id);

export function dateline(kind: EditionKind, from: number): string {
  const d = new Date(from);
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  return kind === 'weekly' ? `Week of ${day}` : `${d.toLocaleDateString('en-GB', { weekday: 'long' })} ${day}`;
}

export interface EditionSpec {
  id: string;
  kind: EditionKind;
  from: number;
  to: number;
}

/** The editions due at `now` that aren't out yet: yesterday's daily from 7 am, last week's weekly from Monday 7 am. */
export function dueEditions(now: number, have: (id: string) => boolean): EditionSpec[] {
  const out: EditionSpec[] = [];
  if (now >= atHour(now, PUBLISH_HOUR)) {
    const from = midnight(now, -1);
    const daily = { id: editionId('daily', from), kind: 'daily' as const, from, to: midnight(now) };
    if (!have(daily.id)) out.push(daily);
  }
  const monday = mondayOf(now);
  if (now >= atHour(monday, PUBLISH_HOUR)) {
    const from = midnight(monday, -7);
    const weekly = { id: editionId('weekly', from), kind: 'weekly' as const, from, to: monday };
    if (!have(weekly.id)) out.push(weekly);
  }
  return out;
}

/** An edition printed on demand (the console, `?news=generate`): the last day or week up to now, its own id. */
export function extraEdition(kind: EditionKind, now: number): EditionSpec {
  const d = new Date(now);
  return { id: `${kind}-${dayKey(now)}-x${pad(d.getHours())}${pad(d.getMinutes())}`, kind, from: now - (kind === 'weekly' ? 7 : 1) * DAY_MS, to: now };
}

/** Editions older than the retention (by when they were published) go. */
export const expired = (publishedAt: number, now: number, keepDays = NEWS_KEEP_DAYS) => now - publishedAt > keepDays * DAY_MS;

/** Should the radio read `daily` now? From 9 until noon on the day it came out, once per edition per browser. */
export function bulletinDue(now: number, daily: Pick<NewsSummary, 'id' | 'publishedAt'> | null, played: string | null): boolean {
  if (!daily || played === daily.id) return false;
  if (dayKey(daily.publishedAt) !== dayKey(now)) return false;
  return now >= atHour(now, RADIO_HOUR) && now < atHour(now, 12);
}

/** Is it time for Monday's all-hands? Monday from 10 until noon, once that day, with a weekly edition out. */
export function allHandsDue(now: number, lastHeld: number | null, weekly: Pick<NewsSummary, 'publishedAt'> | null): boolean {
  if (!weekly || new Date(now).getDay() !== 1) return false;
  if (lastHeld !== null && dayKey(lastHeld) === dayKey(now)) return false;
  return now >= atHour(now, ALL_HANDS_HOUR) && now < atHour(now, 12) && weekly.publishedAt >= mondayOf(now);
}

// ---------- the stories ----------

const STOP = new Set(
  'a an and the to of for in on at by with from into onto over under up down out off is are be as it its this that these those add adds added make makes made use uses fix fixes fixed update updates updated improve improves new more less when while after before so can not no our your their all any one two three via per them then than also just only now issue pr support show shows let lets keep keeps get gets set sets turn turns'.split(
    ' ',
  ),
);
const LEAD = /^(add|adds|added|fix|fixes|fixed|make|makes|update|updates|improve|improves|implement|implements|build|builds|create|creates|introduce|introduces|support|show|shows|let|lets|give|gives|turn|refactor|polish|feat|feature|chore)\b[:\s]*/i;

/** A merged PR's title as a short phrase for a headline: "Add rain to the sky (#12)" → "rain to the sky". */
export function fragment(title: string, max = 40): string {
  let s = title.replace(/\s*\(#\d+\)\s*$/, '');
  // a scope first ("Weather: …", "feat(ui): …") isn't part of what shipped
  const scoped = /^[\w ()!/-]{1,24}:\s+(.+)$/.exec(s);
  if (scoped) s = scoped[1];
  s = s.replace(LEAD, '').trim();
  s = s.split(/[:;,—–]|\s-\s/)[0].trim() || s;
  if (s.length > max) s = `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
  return s ? s[0].toLowerCase() + s.slice(1) : title.trim();
}

/** The word that ties a floor's merges together (in two or more titles), if any: "weather" for rain, storms… */
export function themeWord(titles: readonly string[]): string | null {
  const count = new Map<string, number>();
  for (const t of titles) {
    const words = new Set(
      t
        .toLowerCase()
        .replace(/\(#\d+\)/g, '')
        .split(/[^a-z0-9-]+/)
        .map((w) => w.replace(/^-+|-+$/g, ''))
        .filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w)),
    );
    for (const w of words) count.set(w, (count.get(w) ?? 0) + 1);
  }
  const best = [...count].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best ? best[0] : null;
}

/** "a, b and c". */
export function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function floorStory(floor: number, merges: NewsItem[]): NewsStory {
  const titles = merges.map((m) => m.title ?? `PR #${m.pr}`);
  const theme = themeWord(titles);
  const parts = [...new Set(titles.map((t) => fragment(t)))];
  const shown = parts.slice(0, 3);
  const headline = theme
    ? `Floor ${floor} got ${theme}: ${listOf(parts.length > 3 ? [...shown.slice(0, 2), `${parts.length - 2} more`] : shown)}`
    : merges.length === 1
      ? `Floor ${floor} shipped ${shown[0]}`
      : parts.length <= 3
        ? `Floor ${floor} shipped ${listOf(shown)}`
        : `Floor ${floor} shipped ${merges.length} changes`;
  const repo = merges.find((m) => m.repo)?.repo;
  const listed = merges.slice(0, 4).map((m) => `#${m.pr} ${m.title ?? ''}${m.who ? ` (${m.who})` : ''}`.trim());
  const more = merges.length > 4 ? `, and ${merges.length - 4} more` : '';
  const authors = [...new Set(merges.map((m) => m.who).filter((w): w is string => !!w))];
  const body = `${plural(merges.length, 'pull request')} merged${repo ? ` on ${repo}` : ''}: ${listed.join('; ')}${more}.${authors.length > 1 ? ` Thanks to ${listOf(authors)}.` : ''}`;
  return { section: `Floor ${floor}`, floor, headline, body, prs: merges.filter((m) => m.repoId && m.pr).map((m) => ({ repoId: m.repoId!, pr: m.pr! })) };
}

function qaStory(items: NewsItem[]): NewsStory | null {
  const rounds = items.filter((i) => i.kind === 'qa');
  const human = items.filter((i) => i.kind === 'needs-human');
  if (!rounds.length && !human.length) return null;
  const pass = rounds.filter((r) => r.pass).length;
  const fail = rounds.length - pass;
  const testers = new Map<string, number>();
  for (const r of rounds) if (r.who) testers.set(r.who, (testers.get(r.who) ?? 0) + 1);
  const top = [...testers].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const headline = human.length
    ? `${plural(human.length, 'PR')} needed a human`
    : fail === 0
      ? `QA waved through ${plural(pass, 'PR')}`
      : `QA passed ${pass} of ${plural(rounds.length, 'round')}`;
  const bits = [
    rounds.length ? `${plural(rounds.length, 'QA round')}: ${pass} passed, ${fail} sent back for fixes.` : '',
    top ? `${top[0]} tested the most (${top[1]}).` : '',
    human.length ? `Stuck and handed to the manager: ${human.map((h) => `#${h.pr}${h.repo ? ` on ${h.repo}` : ''}`).join(', ')}.` : '',
  ];
  return { section: 'QA lab', floor: null, headline, body: bits.filter(Boolean).join(' '), prs: [] };
}

function peopleStory(items: NewsItem[]): NewsStory | null {
  const hires = items.filter((i) => i.kind === 'hired');
  const wins = items.filter((i) => i.kind === 'achievement');
  const pong = items.filter((i) => i.kind === 'pong');
  const houses = items.filter((i) => i.kind === 'full-house');
  if (!hires.length && !wins.length && !pong.length && !houses.length) return null;
  const headline = wins.length
    ? `Achievement unlocked: ${wins[0].detail ?? 'a new trophy'}`
    : hires.length
      ? `Welcome aboard, ${listOf(hires.slice(0, 3).map((h) => h.who ?? 'a new hire'))}`
      : pong.length
        ? `Ping-pong: ${pong[pong.length - 1].who ?? 'someone'} wins ${pong[pong.length - 1].detail ?? ''}`.trim()
        : `Full house on floor ${houses[0].floor ?? '?'}`;
  const bits = [
    hires.length ? `New on the team: ${listOf(hires.map((h) => `${h.who ?? 'someone'}${h.detail ? `, ${h.detail}` : ''}${h.floor ? ` (floor ${h.floor})` : ''}`))}.` : '',
    wins.length ? `Trophies for the lobby shelf: ${listOf(wins.map((w) => w.detail ?? 'an achievement'))}.` : '',
    pong.length ? `${plural(pong.length, 'ping-pong game')} played${pong.length > 1 ? `; ${pong[pong.length - 1].who ?? 'someone'} took the last one` : ''}.` : '',
    houses.length ? `Everyone was busy at once on floor ${listOf([...new Set(houses.map((h) => String(h.floor ?? '?')))])}.` : '',
  ];
  return { section: 'People', floor: null, headline, body: bits.filter(Boolean).join(' '), prs: [] };
}

function paperworkStory(items: NewsItem[]): NewsStory | null {
  const filed = items.filter((i) => i.kind === 'filed');
  const closed = items.filter((i) => i.kind === 'closed');
  if (!filed.length && !closed.length) return null;
  const headline = filed.length && closed.length ? `${plural(filed.length, 'issue')} filed, ${closed.length} closed` : filed.length ? `${plural(filed.length, 'new issue')} on the board` : `${plural(closed.length, 'issue')} closed`;
  const named = filed.slice(0, 3).map((f) => `"${f.title ?? `#${f.issue}`}"${f.floor ? ` (floor ${f.floor})` : ''}`);
  const body = [filed.length ? `Filed: ${listOf(named)}${filed.length > 3 ? `, and ${filed.length - 3} more` : ''}.` : '', closed.length ? `${plural(closed.length, 'issue')} closed as done or dropped.` : ''].filter(Boolean).join(' ');
  return { section: 'Paperwork', floor: null, headline, body, prs: [] };
}

/** Stories when there's little news, so every edition has at least three. */
function fillers(comingUp: readonly ComingUp[], company: string): NewsStory[] {
  const next = comingUp.slice(0, 3);
  return [
    { section: 'Office', floor: null, headline: 'A quiet one at the office', body: `No merges to report. The coffee machine kept ${company} going, and the jukebox kept everyone company.`, prs: [] },
    next.length
      ? { section: 'Coming up', floor: null, headline: `Next on the board: ${fragment(next[0].title, 48)}`, body: `Waiting for a free desk: ${listOf(next.map((c) => `#${c.number} ${c.title} (floor ${c.floor})`))}.`, prs: [] }
      : { section: 'Coming up', floor: null, headline: 'The backlog is clear', body: 'No open issues on any floor. A good moment for the manager to brief the CEO on what comes next.', prs: [] },
    { section: 'Office', floor: null, headline: 'Weather in the lobby: sunny, with a chance of merges', body: 'The receptionist bot reports high spirits and a well-stocked mug dispenser.', prs: [] },
  ];
}

/** The stories (3 to 6): the busiest floors first, grouped by theme, then QA, people and paperwork, then fillers. */
export function groupStories(items: readonly NewsItem[], comingUp: readonly ComingUp[] = [], company = 'cubefarm'): NewsStory[] {
  const merged = items.filter((i) => i.kind === 'merged' && i.floor !== null);
  const floors = new Map<number, NewsItem[]>();
  for (const m of merged) floors.set(m.floor!, [...(floors.get(m.floor!) ?? []), m]);
  const stories = [...floors]
    .sort((a, b) => b[1].length - a[1].length || a[0] - b[0])
    .slice(0, 4)
    .map(([floor, ms]) => floorStory(floor, ms.sort((a, b) => a.at - b.at)));
  for (const s of [qaStory([...items]), peopleStory([...items]), paperworkStory([...items])]) if (s) stories.push(s);
  for (const f of fillers(comingUp, company)) {
    if (stories.length >= MIN_STORIES) break;
    if (f.headline === 'A quiet one at the office' && merged.length) continue;
    stories.push(f);
  }
  return stories.slice(0, MAX_STORIES);
}

/** The MVP: merges count most, then QA rounds tested and trophies; ties go to the earlier name. Null without anyone. */
export function chooseMvp(items: readonly NewsItem[]): NewsMvp | null {
  const people = new Map<string, { name: string; agentId: string | null; floor: number | null; merges: number; tested: number; trophies: number; score: number }>();
  const add = (i: NewsItem, field: 'merges' | 'tested' | 'trophies', points: number) => {
    if (!i.who) return;
    const key = i.whoId ?? `name:${i.who}`;
    const p = people.get(key) ?? { name: i.who, agentId: i.whoId ?? null, floor: i.floor, merges: 0, tested: 0, trophies: 0, score: 0 };
    p[field]++;
    p.score += points;
    people.set(key, p);
  };
  for (const i of items) {
    if (i.kind === 'merged') add(i, 'merges', 3);
    else if (i.kind === 'qa') add(i, 'tested', 1);
    else if (i.kind === 'achievement' && i.whoId) add(i, 'trophies', 2);
  }
  const best = [...people.values()].sort((a, b) => b.score - a.score || b.merges - a.merges || a.name.localeCompare(b.name))[0];
  if (!best) return null;
  const why = [best.merges ? plural(best.merges, 'merge') : '', best.tested ? plural(best.tested, 'QA round') + ' tested' : '', best.trophies ? plural(best.trophies, 'trophy', 'trophies') : ''].filter(Boolean);
  return { name: best.name, agentId: best.agentId, floor: best.floor, why: listOf(why) };
}

export function numbersOf(items: readonly NewsItem[]): NewsNumbers {
  const n = (k: NewsItemKind, ok: (i: NewsItem) => boolean = () => true) => items.filter((i) => i.kind === k && ok(i)).length;
  return {
    merged: n('merged'),
    qaPassed: n('qa', (i) => !!i.pass),
    qaFailed: n('qa', (i) => !i.pass),
    filed: n('filed'),
    closed: n('closed'),
    hires: n('hired'),
    needsHuman: n('needs-human'),
    achievements: n('achievement'),
    coins: items.reduce((s, i) => s + (i.kind === 'coins' ? (i.coins ?? 0) : 0), 0),
  };
}

/** Next week's focus: per floor, how many issues wait and the first of them. */
export function focusOf(comingUp: readonly ComingUp[]): string[] {
  const floors = new Map<number, ComingUp[]>();
  for (const c of comingUp) floors.set(c.floor, [...(floors.get(c.floor) ?? []), c]);
  return [...floors]
    .sort((a, b) => a[0] - b[0])
    .slice(0, 5)
    .map(([floor, list]) => `Floor ${floor}: ${fragment(list[0].title, 48)}${list.length > 1 ? ` (+${list.length - 1} more)` : ''}`);
}

export interface EditionInput extends EditionSpec {
  items: readonly NewsItem[];
  /** The open backlog across the floors, oldest first. */
  backlog: readonly ComingUp[];
  company: string;
  now: number;
}

/** The whole edition from the template: needs no model, so it's always there first. */
export function fallbackEdition(x: EditionInput): NewsEdition {
  const items = x.items.filter((i) => i.at >= x.from && i.at < x.to).sort((a, b) => a.at - b.at);
  const comingUp = x.backlog.slice(0, 6);
  const stories = groupStories(items, comingUp, x.company);
  const numbers = numbersOf(items);
  const company = x.company.trim() || 'cubefarm';
  const when = x.kind === 'weekly' ? 'last week' : 'yesterday';
  const headline = numbers.merged ? stories[0].headline : numbers.qaPassed + numbers.qaFailed ? `QA kept busy at ${company}` : `A quiet ${x.kind === 'weekly' ? 'week' : 'day'} at ${company}`;
  const standfirst = numbers.merged || numbers.qaPassed || numbers.filed
    ? `${plural(numbers.merged, 'PR')} merged, ${plural(numbers.qaPassed, 'QA pass', 'QA passes')} and ${plural(numbers.filed, 'new issue')} ${when}.`
    : `Nothing shipped ${when}; the board is ready for whatever comes next.`;
  return {
    id: x.id,
    kind: x.kind,
    from: x.from,
    to: x.to,
    dateline: dateline(x.kind, x.from),
    publishedAt: x.now,
    writer: 'template',
    headline,
    standfirst,
    stories,
    mvp: chooseMvp(items),
    numbers,
    comingUp,
    focus: focusOf(x.backlog),
  };
}

// ---------- the CEO's words ----------

/** What the CEO's short writing session answers with. */
export const WRITING_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    standfirst: { type: 'string' },
    stories: { type: 'array', items: { type: 'object', properties: { headline: { type: 'string' }, body: { type: 'string' } }, required: ['headline', 'body'] } },
    mvpWhy: { type: 'string' },
  },
  required: ['headline', 'standfirst', 'stories'],
} as const;

/** The CEO's prompt: the template's draft to rewrite, nothing to look up. Short, since it's paid for. */
export function writingPrompt(draft: NewsEdition, company: string): string {
  const facts = {
    edition: `${draft.kind} · ${draft.dateline}`,
    headline: draft.headline,
    standfirst: draft.standfirst,
    stories: draft.stories.map((s) => ({ section: s.section, headline: s.headline, body: s.body })),
    mvp: draft.mvp,
    numbers: draft.numbers,
  };
  return [
    `Write the ${company.trim() || 'cubefarm'} Gazette's ${draft.kind} edition: a cheerful office newspaper for the manager.`,
    'Rewrite the draft below in punchy newspaper style. Keep every fact, number, name and PR number; invent nothing; use no tools.',
    `Keep the ${draft.stories.length} stories in the same order: headline under 80 characters, body under 300.`,
    'Reply with only a JSON object: {"headline","standfirst","stories":[{"headline","body"}],"mvpWhy"}.',
    '',
    JSON.stringify(facts),
  ].join('\n');
}

/** The JSON object in a session's final text (a ```json block, or the outermost braces); null when there's none. */
export function parseWriting(text: string): unknown {
  const block = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1];
  const raw = block ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '').slice(0, max);

/** The draft with the CEO's words, story by story; the draft as it was when the answer doesn't fit. */
export function applyWriting(draft: NewsEdition, out: unknown): NewsEdition | null {
  if (!out || typeof out !== 'object') return null;
  const o = out as Record<string, unknown>;
  const headline = clean(o.headline, 120);
  const stories = Array.isArray(o.stories) ? o.stories : [];
  if (headline.length < 4 || stories.length === 0) return null;
  return {
    ...draft,
    writer: 'ceo',
    headline,
    standfirst: clean(o.standfirst, 300) || draft.standfirst,
    stories: draft.stories.map((s, i) => {
      const w = (stories[i] ?? {}) as Record<string, unknown>;
      return { ...s, headline: clean(w.headline, 120) || s.headline, body: clean(w.body, 600) || s.body };
    }),
    mvp: draft.mvp && clean(o.mvpWhy, 160) ? { ...draft.mvp, why: clean(o.mvpWhy, 160) } : draft.mvp,
  };
}

// ---------- the radio ----------

const sentence = (s: string) => (/[.!?…]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** What the CEO reads on the radio: the headline, the top stories, the MVP and what's next. Under a minute. */
export function bulletinText(e: NewsEdition, ceo: string, company: string): string {
  const name = company.trim() || 'cubefarm';
  const lines = [
    `Good morning, ${name}! This is ${ceo || 'your CEO'} with the ${e.kind === 'weekly' ? 'weekly' : 'morning'} news.`,
    sentence(e.headline),
    ...e.stories.slice(1, 4).map((s) => sentence(s.headline)),
    e.mvp ? `Our MVP is ${e.mvp.name}, for ${e.mvp.why}.` : '',
    e.comingUp[0] ? `Coming up: ${sentence(e.comingUp[0].title)}` : '',
    "That's the news. Have a great day!",
  ];
  return lines.filter(Boolean).join(' ');
}

// ---------- the all-hands ----------

export interface Slide {
  title: string;
  lines: string[];
  /** A PR to show a picture of (QA's screenshot), when there is one. */
  shot?: { repoId: string; pr: number };
  /** What the CEO says over it. */
  say: string;
}

export const MAX_SLIDES = 8;

/** The weekly edition as slides: title, what shipped (with pictures), the numbers, the MVP, next week, thanks. */
export function slidesOf(e: NewsEdition, company: string): Slide[] {
  const name = company.trim() || 'cubefarm';
  const n = e.numbers;
  const shipped = e.stories.filter((s) => s.floor !== null).slice(0, 3);
  const others = e.stories.filter((s) => s.floor === null).slice(0, 1);
  const slides: Slide[] = [
    { title: `${name} all-hands`, lines: [e.dateline, e.headline], say: `Morning everyone, and welcome to the all-hands. ${sentence(e.headline)}` },
    ...shipped.map((s) => ({ title: s.headline, lines: [s.body], shot: s.prs[0], say: sentence(s.headline) })),
    ...others.map((s) => ({ title: s.headline, lines: [s.body], say: sentence(s.headline) })),
    {
      title: 'By the numbers',
      lines: [`${n.merged} merged`, `${n.qaPassed} QA passes · ${n.qaFailed} sent back`, `${n.filed} issues filed · ${n.closed} closed`, `${n.hires} hires · ${n.coins} coins earned`],
      say: `By the numbers: ${plural(n.merged, 'PR')} merged and ${plural(n.qaPassed, 'QA pass', 'QA passes')}.`,
    },
  ];
  if (e.mvp) slides.push({ title: `MVP: ${e.mvp.name}`, lines: [e.mvp.why, e.mvp.floor ? `Floor ${e.mvp.floor}` : ''].filter(Boolean), say: `And our MVP is ${e.mvp.name}, for ${e.mvp.why}. Well done!` });
  slides.push({ title: "Next week's focus", lines: e.focus.length ? e.focus : ['A clear board: time to plan the next milestone'], say: e.focus.length ? `Next up: ${sentence(e.focus[0])}` : 'Next up: a clear board, so let us plan the next milestone.' });
  slides.push({ title: 'Thank you, team! 👏', lines: ['Back to work!'], say: "That's all from me. Thank you, team!" });
  return slides.length > MAX_SLIDES ? [...slides.slice(0, MAX_SLIDES - 1), slides[slides.length - 1]] : slides;
}

/** Seconds: people gathering, each slide, the applause, and everyone heading back. */
export const GATHER_S = 25;
export const SLIDE_S = 9;
export const APPLAUSE_S = 6;
export const DISPERSE_S = 20;

export type AllHandsPhase = 'gathering' | 'presenting' | 'applause' | 'dispersing' | 'over';

export const allHandsLength = (slides: number) => (GATHER_S + slides * SLIDE_S + APPLAUSE_S + DISPERSE_S) * 1000;

/** Where an all-hands that started at `startedAt` with `slides` slides is at `now`. */
export function allHandsAt(a: Pick<AllHandsView, 'startedAt' | 'slides'>, now: number): { phase: AllHandsPhase; slide: number; t: number } {
  const t = Math.max(0, (now - a.startedAt) / 1000);
  const show = a.slides * SLIDE_S;
  if (t < GATHER_S) return { phase: 'gathering', slide: 0, t };
  if (t < GATHER_S + show) return { phase: 'presenting', slide: Math.min(a.slides - 1, Math.floor((t - GATHER_S) / SLIDE_S)), t };
  if (t < GATHER_S + show + APPLAUSE_S) return { phase: 'applause', slide: a.slides - 1, t };
  if (t < GATHER_S + show + APPLAUSE_S + DISPERSE_S) return { phase: 'dispersing', slide: a.slides - 1, t };
  return { phase: 'over', slide: a.slides - 1, t };
}

/** Who comes down: idle people (not the CEO, who presents), at most MAX_ATTENDEES, by floor then desk. */
export function pickAttendees<A extends { id: string; role: string; status: string; floor: number; desk: number }>(agents: readonly A[], max = MAX_ATTENDEES): string[] {
  return agents
    .filter((a) => a.role !== 'ceo' && (a.status === 'idle' || a.status === 'done' || a.status === 'stopped'))
    .sort((a, b) => a.floor - b.floor || a.desk - b.desk || a.id.localeCompare(b.id))
    .slice(0, max)
    .map((a) => a.id);
}
