// Company news on the client (#268): editions fetched once (per wording) and kept, a picture of the office for the
// Gazette, `?news=generate` for QA (prints an edition of the last day as soon as the office is connected) and
// window.__swarmNews: the editions, the radio and the all-hands as this tab sees them.
import { useEffect, useState } from 'react';
import { allHandsAt, type EditionKind, type NewsEdition } from '../../shared/news';
import { api } from './api';
import { officeNow } from './officeTime';
import { useStore } from './store';
import { radioState } from './ui/radio';

const editions = new Map<string, Promise<NewsEdition | null>>();

/** An edition, fetched once per wording (the CEO's rewrite is a new one); null when it can't be had. */
export function edition(id: string): Promise<NewsEdition | null> {
  const summary = useStore.getState().news.editions.find((e) => e.id === id);
  const key = `${id}|${summary?.writer ?? ''}|${summary?.publishedAt ?? ''}`;
  let p = editions.get(key);
  if (!p) {
    p = api.newsEdition(id).catch(() => {
      editions.delete(key);
      return null;
    });
    editions.set(key, p);
  }
  return p;
}

/** The edition `id` (null while it loads, or without an id). Follows the CEO's rewrite when it lands. */
export function useEdition(id: string | null | undefined): NewsEdition | null {
  const writer = useStore((s) => s.news.editions.find((e) => e.id === id)?.writer ?? null);
  const [e, setE] = useState<NewsEdition | null>(null);
  useEffect(() => {
    if (!id) return setE(null);
    let alive = true;
    void edition(id).then((x) => alive && setE(x));
    return () => {
      alive = false;
    };
  }, [id, writer]);
  return e && e.id === id ? e : null;
}

// ---------- a picture of the office ----------

let capture: (() => string | null) | null = null;

/** The 3D view registers how to take a picture of itself (Game.tsx). */
export const setNewsCapture = (fn: (() => string | null) | null) => void (capture = fn);

/** A JPEG data URL of the office as it looks now, or null without a 3D view. */
export function officePicture(): string | null {
  try {
    return capture?.() ?? null;
  } catch {
    return null;
  }
}

// ---------- the all-hands, as this tab shows it ----------

let shown: Record<string, unknown> | null = null;

/** The lobby's all-hands reports who's there (for the probe); null when it's not drawn here. */
export const reportAllHands = (info: Record<string, unknown> | null) => void (shown = info);

// ---------- QA ----------

function generateOnConnect() {
  if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('news') !== 'generate') return;
  const go = () => void api.newsGenerate('daily').catch(() => undefined);
  if (useStore.getState().connected) return go();
  const off = useStore.subscribe((s) => {
    if (!s.connected) return;
    off();
    go();
  });
}

if (typeof window !== 'undefined' && !Object.getOwnPropertyDescriptor(window, '__swarmNews')) {
  generateOnConnect();
  Object.defineProperty(window, '__swarmNews', {
    value: {
      /** The newest editions (summaries), and the one the CEO is rewriting. */
      editions: () => useStore.getState().news.editions,
      writing: () => useStore.getState().news.writing,
      /** One edition in full. */
      read: (id: string) => api.newsEdition(id),
      /** Prints an edition of the last day (or week) now. */
      generate: (kind: EditionKind = 'daily') => api.newsGenerate(kind),
      /** The radio: what's playing and every bulletin played in this tab (fresh: ElevenLabs made it for that play). */
      radio: () => radioState(),
      /** The all-hands: the server's, where it is now, and who this tab shows in the lobby. */
      allHands: () => {
        const a = useStore.getState().news.allHands;
        return a ? { ...a, ...allHandsAt(a, officeNow()), lobby: shown } : null;
      },
      startAllHands: () => api.allHands('start'),
      stopAllHands: () => api.allHands('stop'),
    },
  });
}
