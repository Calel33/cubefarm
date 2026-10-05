import { useState } from 'react';
import { DEFAULT_NAME } from '../../../shared/presence';
import { floorName, IDEA_KIND_ICON, IDEA_KINDS, IDEA_STATUS_ICON, IDEA_STATUS_LABEL, IDEA_TEXT_MAX, type IdeaKind, type IdeaView } from '../../../shared/ideas';
import { api } from '../api';
import { ideaViewShot, ideaWhere } from '../ideaContext';
import { useStore } from '../store';
import { useProfile } from '../world/presence/profile';
import { MicButton } from './MicButton';
import { closeOverlay, Panel } from './Panel';

// The idea wall's panels (#269): pinning an idea (from a wall, the phone or pocket mode), one idea's story, and the
// list of ideas the phone and pocket mode show. No 3D here: the "where" and the picture come through ideaContext.ts.

const KIND_LABEL: Record<IdeaKind, string> = { feature: 'Feature', bug: 'Bug', polish: 'Polish', question: 'Question' };

/** Who pins: the profile's name if it was set, else the office's name for the manager. */
function usePinner() {
  const profile = useProfile();
  const manager = useStore((s) => s.settings.managerName || s.user || 'Manager');
  return { by: profile.name && profile.name !== DEFAULT_NAME ? profile.name : manager, color: profile.color };
}

/** The pin form. `floor`: the wall's floor (0: company-wide); `onDone` after pinning or cancelling. */
export function IdeaForm({ floor: wallFloor, onDone }: { floor: number; onDone: (pinned: IdeaView | null) => void }) {
  const repos = useStore((s) => s.repos);
  const here = useStore((s) => s.floor);
  const { by, color } = usePinner();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<IdeaKind>('feature');
  const [floor, setFloor] = useState(() => (wallFloor > 0 ? wallFloor : here > 0 && repos.some((r) => r.floor === here) ? here : 0));
  // taken as the form opens: the panel isn't part of the 3D view, so the picture is what you were looking at
  const [where] = useState(() => ideaWhere());
  const [shot] = useState(() => ideaViewShot());
  const [withWhere, setWithWhere] = useState(!!where);
  const [withShot, setWithShot] = useState(!!shot);
  const [busy, setBusy] = useState(false);

  const pin = async (words = text) => {
    if (!words.trim() || busy) return;
    setBusy(true);
    try {
      const idea = await api.pinIdea({ text: words.trim(), kind, floor, where: withWhere ? where : null, by, color, shot: withShot ? shot : null });
      useStore.getState().pushToast('success', `📌 Pinned on ${floor ? `floor ${floor}'s` : "the lobby's"} idea wall. The CEO reads new ideas after a few quiet minutes.`);
      onDone(idea);
    } catch {
      setBusy(false); // the error is a toast already
    }
  };

  return (
    <form
      className="idea-form"
      onSubmit={(e) => {
        e.preventDefault();
        void pin();
      }}
    >
      <label className="idea-field">
        <span className="muted small">Your idea</span>
        <textarea
          className="idea-text"
          rows={4}
          maxLength={IDEA_TEXT_MAX}
          autoFocus
          placeholder="The whiteboard should… · It would be hilarious if…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void pin();
            }
          }}
        />
      </label>
      <div className="row wrap idea-choices">
        <label className="idea-field">
          <span className="muted small">For</span>
          <select value={floor} onChange={(e) => setFloor(Number(e.target.value))} aria-label="Which floor the idea is for">
            <option value={0}>🏢 The whole company</option>
            {repos.map((r) => (
              <option key={r.id} value={r.floor}>
                {r.floor === here ? '📍 ' : ''}Floor {r.floor} · {r.fullName.split('/')[1] ?? r.fullName}
              </option>
            ))}
          </select>
        </label>
        <div className="idea-field" role="radiogroup" aria-label="Kind of idea">
          <span className="muted small">Kind</span>
          <div className="row wrap">
            {IDEA_KINDS.map((k) => (
              <label key={k} className={`idea-kind ${kind === k ? 'idea-kind-on' : ''}`}>
                <input type="radio" name="idea-kind" checked={kind === k} onChange={() => setKind(k)} /> {IDEA_KIND_ICON[k]} {KIND_LABEL[k]}
              </label>
            ))}
          </div>
        </div>
      </div>
      {where && (
        <label className="toggle small">
          <input type="checkbox" checked={withWhere} onChange={(e) => setWithWhere(e.target.checked)} /> 📍 Where: {where}
        </label>
      )}
      {shot && (
        <label className="toggle small idea-shot-toggle">
          <input type="checkbox" checked={withShot} onChange={(e) => setWithShot(e.target.checked)} /> 📷 Attach a picture of my view
          <img className="idea-shot-thumb" src={shot} alt="Your view as you opened this" />
        </label>
      )}
      <div className="row idea-actions">
        <MicButton kind="console" value={text} onChange={setText} onSend={(t) => void pin(t)} disabled={busy} />
        <button type="button" className="btn btn-small" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button type="submit" className="btn" disabled={busy || !text.trim()}>
          📌 Pin it
        </button>
      </div>
    </form>
  );
}

/** E on an idea wall: pin an idea there. */
export function PinIdea({ floor }: { floor: number }) {
  return (
    <Panel title={`💡 Pin an idea · ${floor ? `floor ${floor}` : 'lobby'}`} accent="#c9a26b">
      <IdeaForm floor={floor} onDone={() => closeOverlay()} />
    </Panel>
  );
}

const when = (at: number) => new Date(at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });

/** The status chip on a card or a row: 📌 planned #12, 🎉 shipped in #40, 🚫 declined. */
export function ideaChip(i: IdeaView): string {
  if (i.status === 'planned') return `${IDEA_STATUS_ICON.planned} Planned ${i.links.map((l) => `#${l.number}`).join(' ')}`;
  if (i.status === 'shipped') return `${IDEA_STATUS_ICON.shipped} Shipped${i.pr ? ` in #${i.pr}` : ''}`;
  return `${IDEA_STATUS_ICON[i.status]} ${IDEA_STATUS_LABEL[i.status]}`;
}

/** An idea's story: who pinned it and when, where, the CEO's note, its issues or PR, and the picture. */
export function IdeaStoryBody({ idea, showText = true }: { idea: IdeaView; showText?: boolean }) {
  const repos = useStore((s) => s.repos);
  const ceo = useStore((s) => s.agents.ceo?.name ?? 'The CEO');
  const url = (repoId: string) => repos.find((r) => r.id === repoId)?.url ?? null;
  const prRepo = idea.links[0]?.repoId;
  return (
    <div className={`idea-story idea-${idea.status}`}>
      {showText && (
        <p className="idea-story-text" style={{ borderColor: idea.color }}>
          {IDEA_KIND_ICON[idea.kind]} {idea.text}
        </p>
      )}
      <p className="small">
        <span className={`idea-chip idea-chip-${idea.status}`}>{ideaChip(idea)}</span> · {idea.floor ? `for ${floorName(idea.floor)}` : 'company-wide'}
      </p>
      <p className="muted small">
        Pinned by <b style={{ color: idea.color }}>{idea.by}</b> · {when(idea.at)}
        {idea.where ? ` · ${idea.where}` : ''}
      </p>
      {idea.note && (
        <p className="idea-note">
          <b>{ceo}:</b> {idea.note}
        </p>
      )}
      {(idea.links.length > 0 || idea.pr) && (
        <p className="small row wrap">
          {idea.links.map((l) => {
            const u = url(l.repoId);
            return u ? (
              <a key={`${l.repoId}#${l.number}`} href={`${u}/issues/${l.number}`} target="_blank" rel="noreferrer">
                Issue #{l.number} · floor {l.floor}
              </a>
            ) : (
              <span key={`${l.repoId}#${l.number}`}>
                Issue #{l.number} · floor {l.floor}
              </span>
            );
          })}
          {idea.pr && prRepo && url(prRepo) && (
            <a href={`${url(prRepo)}/pull/${idea.pr}`} target="_blank" rel="noreferrer">
              🎉 PR #{idea.pr}
            </a>
          )}
        </p>
      )}
      {idea.shot && <img className="idea-shot" src={`/api/ideas/${encodeURIComponent(idea.id)}/shot`} alt="What the manager was looking at" loading="lazy" />}
    </div>
  );
}

/** E on a card: its story. */
export function IdeaStory({ id }: { id: string }) {
  const idea = useStore((s) => s.ideas.find((i) => i.id === id));
  return (
    <Panel title="💡 An idea's story" accent={idea?.color ?? '#c9a26b'}>
      {idea ? <IdeaStoryBody idea={idea} /> : <p className="muted">That idea is no longer on the wall.</p>}
    </Panel>
  );
}

/** Every idea, newest first, a tap to read its story, and pinning a new one: the phone's Ideas tab and pocket mode's. */
export function IdeasList() {
  const ideas = useStore((s) => s.ideas);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const list = [...ideas].reverse();
  return (
    <div className="ideas-list">
      {adding ? (
        <IdeaForm floor={0} onDone={() => setAdding(false)} />
      ) : (
        <button className="btn ideas-add" onClick={() => setAdding(true)}>
          💡 Pin an idea
        </button>
      )}
      {list.length === 0 && !adding && <p className="muted small">No ideas yet. Pin one here, or press E at an idea wall: a corkboard in the lobby and on every floor.</p>}
      <ul className="ideas-rows">
        {list.map((i) => (
          <li key={i.id} className={`ideas-row idea-${i.status}`} style={{ borderColor: i.color }}>
            <button className="ideas-row-head" aria-expanded={open === i.id} onClick={() => setOpen(open === i.id ? null : i.id)}>
              <span className="ideas-row-text">
                {IDEA_KIND_ICON[i.kind]} {i.text}
              </span>
              <span className={`idea-chip idea-chip-${i.status}`}>{ideaChip(i)}</span>
            </button>
            {open === i.id && <IdeaStoryBody idea={i} showText={false} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
