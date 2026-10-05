// The office radio on the reception desk (#268): a jingle in the jukebox's style, then the CEO reading the morning
// bulletin (shared/news.ts bulletinText). ElevenLabs' clip comes from the office, made once per edition and cached
// there (a replay never makes a new one); otherwise the browser's own voice reads it. Both go through
// voicePlayback.ts, so the Voice slider and M hold and the jukebox ducks. E on the radio plays it (or stops it); at
// 9 am it plays by itself once per edition in this browser, only while the tab is visible and voice is on.
import { bulletinDue, bulletinText, type NewsEdition } from '../../../shared/news';
import { CEO_ID } from '../../../shared/types';
import { api } from '../api';
import { useStore } from '../store';
import { holdMusicDuck } from './music';
import { tone, type Vec3 } from './sfx';
import { playClip, speakLine, stopVoice } from './voicePlayback';

const PLAYED_KEY = 'cubefarm:radio:played';
/** Where the radio stands (the reception desk), for the jingle's place in the room. */
export const RADIO_AT: Vec3 = { x: 4.2, y: 1.25, z: -3.3 };

export interface RadioPlay {
  edition: string;
  provider: 'elevenlabs' | 'browser';
  /** ElevenLabs made the clip for this play (false: the office's cached one). */
  fresh: boolean | null;
  trigger: 'manual' | 'auto';
  at: number;
  ok: boolean;
}

const state = { playing: null as string | null, plays: [] as RadioPlay[] };
const listeners = new Set<() => void>();
let version = 0;
let stopped = false;

const changed = () => {
  version++;
  for (const fn of listeners) fn();
};

export function subscribeRadio(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
export const radioVersion = () => version;
export const radioPlaying = () => state.playing;

/** For window.__swarmNews. */
export const radioState = () => ({ playing: state.playing, played: played(), plays: state.plays.map((p) => ({ ...p })) });

function played(): string | null {
  try {
    return localStorage.getItem(PLAYED_KEY);
  } catch {
    return null;
  }
}

function markPlayed(id: string) {
  try {
    localStorage.setItem(PLAYED_KEY, id);
  } catch {
    // private window: the 9 o'clock bulletin may play again in another tab
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The station's jingle: a bright arpeggio over a bass note, like the jukebox's chiptune songs. About 1.6 s. */
function jingle() {
  const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
  notes.forEach((freq, i) => tone({ name: 'radio-jingle', group: 'voice', pos: RADIO_AT, freq, type: 'square', at: i * 0.13, dur: 0.22, peak: 0.05 }));
  tone({ name: 'radio-jingle', group: 'voice', pos: RADIO_AT, freq: 130.81, type: 'triangle', dur: 0.9, peak: 0.12 });
  tone({ name: 'radio-jingle', group: 'voice', pos: RADIO_AT, freq: 196, type: 'triangle', at: 0.78, dur: 0.8, peak: 0.12 });
}

/** The edition the radio reads: the newest daily, else the newest of any kind. */
function latest() {
  const list = useStore.getState().news.editions;
  return list.find((e) => e.kind === 'daily') ?? list[0] ?? null;
}

/** Reads the bulletin (E on the radio, or 9 am); E while it plays stops it. Resolves whether it was read through. */
export async function playBulletin(trigger: 'manual' | 'auto' = 'manual'): Promise<boolean> {
  if (state.playing) {
    stopRadio();
    return false;
  }
  const s = useStore.getState();
  const pick = latest();
  if (!pick) {
    if (trigger === 'manual') s.pushToast('info', '📻 No news yet: the first edition comes out at 7 tomorrow morning.');
    return false;
  }
  stopped = false;
  state.playing = pick.id;
  markPlayed(pick.id);
  changed();
  const unduck = holdMusicDuck();
  const voice = s.settings.voice;
  const provider = voice.provider === 'elevenlabs' ? 'elevenlabs' : 'browser';
  const play: RadioPlay = { edition: pick.id, provider, fresh: null, trigger, at: Date.now(), ok: false };
  try {
    const e: NewsEdition = await api.newsEdition(pick.id);
    jingle();
    await wait(1700);
    if (stopped) return false;
    if (provider === 'elevenlabs') {
      const res = await fetch(`/api/news/${encodeURIComponent(e.id)}/bulletin`);
      if (res.ok) {
        play.fresh = res.headers.get('X-Clip-Fresh') === '1';
        if (!stopped) play.ok = await playClip(await res.blob());
      } else if (!stopped) {
        play.provider = 'browser'; // ElevenLabs couldn't: the browser reads it instead
        play.ok = await speakLine(bulletinText(e, s.agents[CEO_ID]?.name ?? '', s.settings.companyName), '');
      }
    } else {
      play.ok = await speakLine(bulletinText(e, s.agents[CEO_ID]?.name ?? '', s.settings.companyName), voice.provider === 'browser' ? voice.voiceName : '');
    }
    return play.ok && !stopped;
  } catch {
    return false;
  } finally {
    unduck();
    state.plays.push(play);
    if (state.plays.length > 20) state.plays.shift();
    state.playing = null;
    changed();
  }
}

export function stopRadio() {
  if (!state.playing) return;
  stopped = true;
  stopVoice();
}

/** E on the radio. */
export const radioAction = () => void playBulletin('manual');

// The 9 o'clock bulletin, checked every 20 seconds: visible tab, voice on, not replaying, once per edition.
if (typeof window !== 'undefined') {
  setInterval(() => {
    const s = useStore.getState();
    if (document.visibilityState !== 'visible' || s.replaying || !s.connected || s.settings.voice.provider === 'off' || state.playing) return;
    const daily = s.news.editions.find((e) => e.kind === 'daily') ?? null;
    if (bulletinDue(Date.now(), daily, played())) void playBulletin('auto');
  }, 20_000);
}
