// The phone's secrets tab (#266), there once you've found a duck or an egg: the duck counter, every duck found or
// still hiding (with hints to unlock), the easter eggs, and "Reset hunt".

import { DUCKS, DUCKS_TO_OPEN, canHint, duckCount, hintsLeft } from '../world/secrets/ducks';
import { EGGS } from '../world/secrets/eggs';
import { resetHunt, revealHint, useSecrets } from '../world/secrets/secretsState';
import { confirmDialog } from './Confirm';

const PLACE = { lobby: 'Lobby', office: 'Office floors', roof: 'Roof' } as const;

export function SecretsTab() {
  const found = useSecrets((s) => s.found);
  const hinted = useSecrets((s) => s.hinted);
  const eggs = useSecrets((s) => s.eggs);
  const open = useSecrets((s) => s.open);
  const left = hintsLeft(found, hinted);
  const all = found.length === DUCKS.length;
  const reset = () =>
    void confirmDialog({ icon: '🦆', title: 'Reset the duck hunt?', body: 'Every duck goes back to its hiding place and the shelf empties.', confirm: 'Reset hunt' }).then((ok) => ok && resetHunt());
  return (
    <div className="phone-scroll secrets-tab">
      <div className="tiles">
        <div className="tile">
          <div className="tile-value">{duckCount(found)}</div>
          <div className="tile-label">rubber ducks</div>
        </div>
        <div className="tile">
          <div className="tile-value">🥚 {eggs.length} / {EGGS.length}</div>
          <div className="tile-label">easter eggs</div>
        </div>
      </div>
      {all ? (
        <p className="secrets-cheer">🏆 All {DUCKS.length} ducks found! They're lined up on the shelf in the secret room.</p>
      ) : (
        <p className="muted small">
          {open ? 'The bookshelf in the manager’s office is open: found ducks wait on the shelf inside.' : `Find ${DUCKS_TO_OPEN} and something clicks in the manager's office…`} Hints left: {left}.
        </p>
      )}
      {(['lobby', 'office', 'roof'] as const).map((place) => (
        <div key={place}>
          <h3 className="phone-h">{PLACE[place]}</h3>
          <ul className="secrets-list">
            {DUCKS.map((d, i) =>
              d.place !== place ? null : found.includes(d.id) ? (
                <li key={d.id}>
                  <span aria-hidden>🦆</span> {d.name}
                </li>
              ) : (
                <li key={d.id} className="muted">
                  <span aria-hidden>❔</span> Duck #{i + 1}
                  {hinted.includes(d.id) ? (
                    <span className="secrets-hint"> · {d.hint}</span>
                  ) : (
                    <button className="btn btn-small" disabled={!canHint(found, hinted, d.id)} onClick={() => revealHint(d.id)}>
                      💡 Hint
                    </button>
                  )}
                </li>
              ),
            )}
          </ul>
        </div>
      ))}
      <h3 className="phone-h">Easter eggs</h3>
      <ul className="secrets-list">
        {EGGS.map((e) => (
          <li key={e.id} className={eggs.includes(e.id) ? '' : 'muted'}>
            {eggs.includes(e.id) ? `🥚 ${e.name}` : '🔒 ???'}
          </li>
        ))}
      </ul>
      <button className="btn" onClick={reset} disabled={!found.length}>
        Reset hunt
      </button>
    </div>
  );
}
