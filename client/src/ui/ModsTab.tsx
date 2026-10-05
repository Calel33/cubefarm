// The console's Mods page (docs/mods.md): the mods folder (its path, to open yourself: the office never opens it),
// Reload mods, copying the example mod in, and each mod with its switch, the errors that kept it out, and a gallery of
// what it adds. A mod theme can be tried on from here (Settings → Themes forces it).
import { useState } from 'react';
import { modDatesLabel, type ModKind, type ModView } from '../../../shared/mods';
import { DEFAULT_THEME_SETTINGS } from '../../../shared/themes';
import { api } from '../api';
import { useStore } from '../store';

const KIND_LABEL: Record<ModKind, string> = { props: '🗿 props', posters: '🖼️ posters', songs: '🎵 songs', themes: '🎉 themes' };
const DOCS = 'https://github.com/leonvanzyl/cubefarm/blob/main/docs/mods.md';

function Gallery({ mod }: { mod: ModView }) {
  const themes = useStore((s) => s.settings.themes) ?? DEFAULT_THEME_SETTINGS;
  const tryTheme = (key: string | null) => void api.updateSettings({ themes: { ...themes, mode: (key ?? 'auto') as typeof themes.mode } }).catch(() => undefined);
  return (
    <div className="mod-gallery" aria-label={`What ${mod.name} adds`}>
      {mod.posters.map((p) => (
        <div key={p.key} className="mod-item">
          <img src={p.image} alt={p.name} loading="lazy" />
          <b>{p.name}</b>
          <span className="muted small">
            poster · {p.width}×{p.height} m{p.place.length ? '' : ' · for its theme'}
          </span>
        </div>
      ))}
      {mod.props.map((p) => (
        <div key={p.key} className="mod-item">
          <span className="mod-item-icon" aria-hidden>
            {p.icon}
          </span>
          <b>{p.name}</b>
          <span className="muted small">
            {p.model ? `3D model · ${p.height} m` : `${p.shapes?.length ?? 0} shapes`}
            {p.place.length ? '' : ' · for its theme'}
          </span>
        </div>
      ))}
      {mod.songs.map((s) => (
        <div key={s.key} className="mod-item">
          <span className="mod-item-icon" aria-hidden>
            🎵
          </span>
          <b>{s.title}</b>
          <span className="muted small">
            {s.song.artist} · jukebox, {s.station === 'focus' ? 'Focus and All' : 'All'}
          </span>
        </div>
      ))}
      {mod.themes.map((t) => {
        const on = themes.mode === t.key;
        return (
          <div key={t.key} className="mod-item">
            <span className="mod-item-icon" aria-hidden>
              {t.emoji}
            </span>
            <b>{t.name}</b>
            <span className="muted small">theme · {modDatesLabel(t.dates)}</span>
            {mod.enabled && mod.ok && (
              <button className="btn btn-small" onClick={() => tryTheme(on ? null : t.key)}>
                {on ? 'Back to by date' : 'Turn it on'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ModCard({ mod }: { mod: ModView }) {
  const [busy, setBusy] = useState(false);
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      await api.setModEnabled(mod.id, on);
    } catch {
      // api toasted it
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`card ${mod.ok && mod.enabled ? '' : 'mod-off'}`}>
      <div className="row">
        <h3 className="grow">
          {mod.name} <span className="chip mod-badge">mod</span>
        </h3>
        {mod.ok ? (
          <label className="toggle">
            <input type="checkbox" checked={mod.enabled} disabled={busy} onChange={(e) => void toggle(e.target.checked)} />
            <span>{mod.enabled ? 'On' : 'Off'}</span>
          </label>
        ) : (
          <span className="pill pill-bad">Skipped</span>
        )}
      </div>
      <div className="muted small">
        <code>{mod.id}</code>
        {mod.version && ` · v${mod.version}`}
        {mod.author && ` · by ${mod.author}`}
        {mod.kinds.length > 0 && ` · ${mod.kinds.map((k) => KIND_LABEL[k]).join(', ')}`}
      </div>
      {mod.description && <p className="small">{mod.description}</p>}
      {!mod.ok && (
        <>
          <p className="small">This mod wasn't loaded. Fix these in its folder, then press Reload mods:</p>
          <ul className="mod-errors">
            {mod.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </>
      )}
      {mod.ok && <Gallery mod={mod} />}
    </div>
  );
}

export function ModsTab() {
  const mods = useStore((s) => s.mods);
  const [busy, setBusy] = useState<'reload' | 'example' | null>(null);
  const run = async (what: 'reload' | 'example') => {
    setBusy(what);
    try {
      const v = what === 'reload' ? await api.reloadMods() : await api.installExampleMod();
      const ok = v.mods.filter((m) => m.ok).length;
      const bad = v.mods.length - ok;
      useStore.getState().pushToast(bad ? 'info' : 'success', `🧩 ${ok} mod${ok === 1 ? '' : 's'} loaded${bad ? `, ${bad} skipped: see why below` : ''}`);
    } catch {
      // api toasted it
    } finally {
      setBusy(null);
    }
  };
  const copyPath = () => void navigator.clipboard?.writeText(mods.dir).catch(() => undefined);
  return (
    <div className="tab-grid">
      <div className="card">
        <h3>🧩 Mods</h3>
        <p className="muted small">
          Make the office yours: your own posters, props and statues, jukebox songs and themes, from a folder of pictures, models and a <code>mod.json</code>. Only data and pictures are read, never code. See{' '}
          <a href={DOCS} target="_blank" rel="noreferrer">
            how to make a mod
          </a>
          .
        </p>
        <div className="field">Your mods folder (open it yourself; the office never does)</div>
        <div className="row">
          <code className="grow" style={{ wordBreak: 'break-all' }}>
            {mods.dir || '…'}
          </code>
          <button className="btn btn-small" onClick={copyPath} disabled={!mods.dir}>
            📋 Copy
          </button>
        </div>
        <p className="muted small">Put each mod in its own folder in there, then press Reload mods.</p>
        <div className="row">
          <button className="btn btn-small btn-good" disabled={busy !== null} onClick={() => void run('reload')}>
            {busy === 'reload' ? '…' : '🔄 Reload mods'}
          </button>
          {mods.example && (
            <button className="btn btn-small" disabled={busy !== null} onClick={() => void run('example')}>
              {busy === 'example' ? '…' : `📦 Copy the example mod (${mods.example}) in`}
            </button>
          )}
        </div>
        {mods.errors.length > 0 && (
          <ul className="mod-errors">
            {mods.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        {mods.mods.length === 0 && <p className="muted small">No mods yet.{mods.example ? ' Copy the example in to see one, then change it to make it yours.' : ''}</p>}
      </div>
      {mods.mods.map((m) => (
        <ModCard key={m.id} mod={m} />
      ))}
    </div>
  );
}
