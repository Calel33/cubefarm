// The Cubefarm Gazette (#268): an edition as a newspaper (masthead, the lead story with a picture of the office,
// columns of stories, the MVP, the numbers and what's coming up) and its back issues. The picture is photo mode's
// latest shot in this tab, else a snapshot of the 3D view taken as the paper opens.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { NewsSummary } from '../../../shared/news';
import { api } from '../api';
import { officePicture, useEdition } from '../news';
import { useGallery } from '../photo/gallery';
import { useStore } from '../store';
import { Panel } from './Panel';
import { playBulletin, radioPlaying, radioVersion, subscribeRadio } from './radio';

const when = (ms: number) => new Date(ms).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function Gazette({ id }: { id?: string }) {
  const company = useStore((s) => s.settings.companyName) || 'cubefarm';
  const latest = useStore((s) => s.news.editions);
  const writing = useStore((s) => s.news.writing);
  const [list, setList] = useState<NewsSummary[]>(latest);
  const [picked, setPicked] = useState<string | null>(id ?? null);
  const current = picked ?? list[0]?.id ?? latest[0]?.id ?? null;
  const e = useEdition(current);
  const shot = useGallery((s) => [...s.items].reverse().find((i) => i.kind === 'shot')?.url ?? null);
  const [snap] = useState(() => officePicture());
  const picture = shot ?? snap;
  useSyncExternalStore(subscribeRadio, radioVersion);
  const playing = radioPlaying();

  // Back issues: the snapshot has the newest few, the office has them all.
  useEffect(() => {
    let alive = true;
    void api
      .newsList()
      .then((l) => alive && setList(l))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [latest]);

  const [lead, ...rest] = e?.stories ?? [];
  const numbers = useMemo(
    () =>
      e
        ? [
            ['Merged', e.numbers.merged],
            ['QA passes', e.numbers.qaPassed],
            ['Sent back', e.numbers.qaFailed],
            ['Issues filed', e.numbers.filed],
            ['Issues closed', e.numbers.closed],
            ['Hires', e.numbers.hires],
            ['Needed a human', e.numbers.needsHuman],
            ['Coins earned', e.numbers.coins],
          ]
        : [],
    [e],
  );
  const print = (kind: 'daily' | 'weekly') => void api.newsGenerate(kind).then((s) => setPicked(s.id)).catch(() => undefined);

  return (
    <Panel title={`📰 The ${company} Gazette`} wide className="gazette-panel">
      <div className="gazette">
        <div className="gazette-paper" aria-live="polite">
          {!e ? (
            <p className="muted">{list.length || latest.length ? 'Fetching the paper…' : 'No editions yet. The first comes out at 7 tomorrow morning, or print one now below.'}</p>
          ) : (
            <article>
              <header className="gz-masthead">
                <div className="gz-ears">
                  <span>{e.kind === 'weekly' ? 'Weekly edition' : 'Daily edition'}</span>
                  <span>{e.writer === 'ceo' ? 'Edited by the CEO' : writing === e.id ? 'The CEO is editing…' : 'From the newswire'}</span>
                </div>
                <h1>The {company} Gazette</h1>
                <div className="gz-dateline">
                  <span>{e.dateline}</span>
                  <span>Published {when(e.publishedAt)}</span>
                </div>
              </header>
              <h2 className="gz-headline">{e.headline}</h2>
              <p className="gz-standfirst">{e.standfirst}</p>
              <div className="gz-lead">
                <figure className="gz-photo">
                  {picture ? <img src={picture} alt="The office today" /> : <div className="gz-photo-empty">📷</div>}
                  <figcaption>{shot ? 'Photo: the manager, with photo mode' : 'The office, as the paper went to press'}</figcaption>
                </figure>
                {lead && (
                  <section className="gz-story gz-story-lead">
                    <div className="gz-section">{lead.section}</div>
                    <h3>{lead.headline}</h3>
                    <p>{lead.body}</p>
                  </section>
                )}
              </div>
              <div className="gz-columns">
                {rest.map((s, i) => (
                  <section className="gz-story" key={i}>
                    <div className="gz-section">{s.section}</div>
                    <h3>{s.headline}</h3>
                    <p>{s.body}</p>
                  </section>
                ))}
              </div>
              <div className="gz-boxes">
                <section className="gz-box">
                  <h4>⭐ MVP</h4>
                  {e.mvp ? (
                    <p>
                      <b>{e.mvp.name}</b>
                      {e.mvp.floor ? ` · floor ${e.mvp.floor}` : ''}: {e.mvp.why}
                    </p>
                  ) : (
                    <p className="muted">No one this time: a quiet spell.</p>
                  )}
                </section>
                <section className="gz-box">
                  <h4>By the numbers</h4>
                  <table className="gz-numbers">
                    <tbody>
                      {numbers.map(([k, v]) => (
                        <tr key={k}>
                          <td>{k}</td>
                          <td>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
                <section className="gz-box">
                  <h4>Coming up</h4>
                  {e.comingUp.length ? (
                    <ul>
                      {e.comingUp.map((c) => (
                        <li key={`${c.floor}-${c.number}`}>
                          Floor {c.floor} · #{c.number} {c.title}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">The backlog is clear.</p>
                  )}
                </section>
              </div>
            </article>
          )}
        </div>
        <aside className="gazette-side">
          <div className="row wrap">
            <button className="btn btn-small" disabled={!e} onClick={() => void playBulletin('manual')}>
              {playing ? '⏹ Stop the radio' : '📻 Hear it on the radio'}
            </button>
          </div>
          <h4>Back issues</h4>
          <ul className="gz-back">
            {list.map((s) => (
              <li key={s.id}>
                <button className={`gz-issue ${s.id === current ? 'on' : ''}`} onClick={() => setPicked(s.id)} aria-current={s.id === current}>
                  <span className="gz-issue-date">
                    {s.kind === 'weekly' ? '📅 ' : ''}
                    {s.dateline}
                  </span>
                  <span className="gz-issue-head">{s.headline}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="row wrap">
            <button className="btn btn-small" onClick={() => print('daily')}>
              🖨 Print today's so far
            </button>
            <button className="btn btn-small" onClick={() => print('weekly')}>
              🖨 Print this week's
            </button>
          </div>
        </aside>
      </div>
    </Panel>
  );
}
