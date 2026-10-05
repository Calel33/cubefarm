// The console's Team chemistry tab (#267): a floor's relationship graph (shared/relations.ts) drawn as everyone round a
// circle, friendships in green and rivalries in orange, thicker the stronger, the strongest pairs highlighted and
// listed, with what grew them lately. The lists say in words what the drawing shows.
import { useState } from 'react';
import { FRIEND_AT, RIVAL_AT, strength, strongest, type InteractionKind } from '../../../shared/relations';
import { agentsOnRepo, repoOnFloor, useStore } from '../store';

const FRIEND = '#2f9e44';
const RIVAL = '#f08c00';
const SIZE = 420;
const RING = 150;

const WHY: Record<InteractionKind, string> = {
  'qa-pass': 'passed QA together on',
  fix: 'teamed up to fix',
  'fix-swap': 'traded fixes on',
  chat: 'chatted by the',
  pong: 'played ping-pong',
  'close-pong': 'had a close game',
};

function ago(at: number, now: number) {
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 60) return m <= 1 ? 'just now' : `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

export function ChemistryTab() {
  const repos = useStore((s) => s.repos);
  const here = useStore((s) => repoOnFloor(s.repos, s.floor)?.id);
  const [picked, setPicked] = useState<string | null>(null);
  const repoId = picked ?? here ?? repos[0]?.id;
  const social = useStore((s) => (repoId ? s.social[repoId] : undefined));
  const agents = useStore((s) => s.agents);
  if (!repos.length || !repoId) return <p className="muted">Connect a repo first: chemistry needs a team.</p>;
  const now = Date.now();
  const team = agentsOnRepo(agents, repoId);
  const at = new Map(team.map((a, i) => [a.id, { x: SIZE / 2 + Math.cos((i / team.length) * Math.PI * 2 - Math.PI / 2) * RING, y: SIZE / 2 + Math.sin((i / team.length) * Math.PI * 2 - Math.PI / 2) * RING }]));
  const top = strongest(social, now, 3);
  const isTop = (a: string, b: string, kind: 'friend' | 'rival') => top.some((p) => p.a === a && p.b === b && p.kind === kind);
  const name = (id: string) => agents[id]?.name ?? 'someone who left';
  const edges = (social?.bonds ?? []).flatMap((b) => {
    const p = at.get(b.a);
    const q = at.get(b.b);
    if (!p || !q) return [];
    const s = strength(b, now);
    const out: { key: string; kind: 'friend' | 'rival'; v: number; p: typeof p; q: typeof q; top: boolean }[] = [];
    // the two kinds side by side when a pair is both
    if (s.friend >= 1) out.push({ key: `${b.a}-${b.b}-f`, kind: 'friend', v: s.friend, p, q, top: isTop(b.a, b.b, 'friend') });
    if (s.rival >= 1) out.push({ key: `${b.a}-${b.b}-r`, kind: 'rival', v: s.rival, p, q, top: isTop(b.a, b.b, 'rival') });
    return out;
  });
  const offset = (e: (typeof edges)[number]) => {
    const dx = e.q.x - e.p.x;
    const dy = e.q.y - e.p.y;
    const d = Math.hypot(dx, dy) || 1;
    const k = e.kind === 'friend' ? -3 : 3;
    return { x: (-dy / d) * k, y: (dx / d) * k };
  };
  const recent = [...(social?.recent ?? [])].reverse().slice(0, 8);
  return (
    <div className="card">
      <div className="row wrap">
        <b className="grow">💞 Team chemistry</b>
        <label className="row small">
          <span>Floor</span>
          <select value={repoId} onChange={(e) => setPicked(e.target.value)}>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.floor} · {r.fullName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">Friendships grow from work done together (a QA pass, fixing someone's PR), chats and ping-pong; friendly rivalries from close games and fixes that go back and forth. Both fade without contact.</p>
      <div className="chemistry">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Relationships on this floor: ${top.length ? top.map((p) => `${name(p.a)} and ${name(p.b)} ${p.kind === 'friend' ? 'are friends' : 'are rivals'}`).join('; ') : 'none yet'}`}>
          {edges.map((e) => {
            const o = offset(e);
            const strong = e.kind === 'friend' ? e.v >= FRIEND_AT : e.v >= RIVAL_AT;
            return (
              <line
                key={e.key}
                x1={e.p.x + o.x}
                y1={e.p.y + o.y}
                x2={e.q.x + o.x}
                y2={e.q.y + o.y}
                stroke={e.kind === 'friend' ? FRIEND : RIVAL}
                strokeWidth={1.5 + (e.v / 100) * 9 + (e.top ? 2 : 0)}
                strokeOpacity={strong ? 0.9 : 0.35}
                strokeDasharray={e.kind === 'rival' ? '10 6' : undefined}
                strokeLinecap="round"
              />
            );
          })}
          {team.map((a) => {
            const p = at.get(a.id)!;
            const star = top.some((t) => t.a === a.id || t.b === a.id);
            return (
              <g key={a.id} transform={`translate(${p.x} ${p.y})`}>
                <circle r={star ? 21 : 18} fill={a.color} stroke="#1f1d2b" strokeWidth={star ? 4 : 2.5} />
                <text textAnchor="middle" dy="0.35em" fontSize="15" fontWeight="700" fill="#fff" stroke="#1f1d2b" strokeWidth="0.6">
                  {a.role === 'qa' ? '🔍' : a.name.slice(0, 1)}
                </text>
                <text textAnchor="middle" y={p.y > SIZE / 2 ? 38 : -28} fontSize="13" fontWeight="600" fill="#1f1d2b">
                  {a.name}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="chemistry-side">
          <div className="chemistry-legend small">
            <span>
              <span className="chemistry-key" style={{ background: FRIEND }} />
              Friends
            </span>
            <span>
              <span className="chemistry-key" style={{ background: `repeating-linear-gradient(90deg, ${RIVAL} 0 8px, transparent 8px 12px)` }} />
              Rivals
            </span>
            <span className="muted">Thicker is stronger</span>
          </div>
          <h4>Strongest pairs</h4>
          {top.length ? (
            <ol className="chemistry-pairs">
              {top.map((p) => (
                <li key={`${p.a}-${p.b}-${p.kind}`}>
                  {p.kind === 'friend' ? '💚' : '🔥'} {name(p.a)} & {name(p.b)} <span className="muted small">· {p.kind === 'friend' ? 'friends' : 'rivals'} ({Math.round(p.value)})</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted small">No friendships or rivalries yet. Give them some PRs to work on together.</p>
          )}
          <h4>Lately</h4>
          {recent.length ? (
            <ul className="chemistry-recent">
              {recent.map((r, i) => (
                <li key={`${r.at}-${i}`}>
                  {r.rival > 0 ? '🔥' : '💚'} {name(r.a)} and {name(r.b)} {WHY[r.kind] ?? 'met'} {r.kind === 'chat' ? r.note || 'cooler' : r.note} <span className="muted small">· {ago(r.at, now)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Nothing yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
