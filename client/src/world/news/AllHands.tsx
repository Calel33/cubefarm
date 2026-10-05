// The weekly all-hands (#268). The server says when it started, which edition and who was idle (attendees); the
// timeline (gathering, slides, applause, back to work) is shared/news.ts's allHandsAt. In the lobby the attendees step
// out of the elevator and stand in rows facing a big screen in front of mission control, the CEO presents beside it
// (a bubble per slide, read aloud while voice is on), everyone claps and they go back up. On their floors the
// attendees walk to the elevator and are away until it's over; busy people stay at their desks and watch on the
// floor's app monitor, which shows the slides meanwhile (useAllHandsSlide). Everything moved is put back when it ends.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { allHandsAt, slidesOf, type AllHandsPhase, type AllHandsView, type Slide } from '../../../../shared/news';
import { CEO_ID } from '../../../../shared/types';
import { reportAllHands, useEdition } from '../../news';
import { officeNow } from '../../officeTime';
import { useRenderPaused } from '../../perf';
import { qaKey, useStore, type Agent } from '../../store';
import { noise } from '../../ui/sfx';
import { speakLine } from '../../ui/voicePlayback';
import { qaShotUrl } from '../../ui/channels';
import { Character } from '../Character';
import { NameTag } from '../Desk';
import { homeSpotId, isFree } from '../errands';
import { useCanvasTexture } from '../interact';
import { HALF_D, MISSION } from '../layout';
import { bodyState, claimBody, isHidden, placeBody, say, seatBody, setHidden } from '../people';
import { PARKED } from '../ritualSchedule';
import { CABIN } from '../socials';
import { Performer, type Cue } from '../stage';
import { Box } from '../Toon';
import { spot, standable, walkways, type Walkways } from '../walkways';
import { drawSlide } from './drawNews';

// walkways.ts facings
const NORTH = -Math.PI / 2;
const SOUTH = Math.PI / 2;
/** The big screen, standing in front of mission control's middle column. */
const SCREEN = { x: MISSION.x, z: -HALF_D + 1.5, y: 1.95, w: 3.4, h: 1.9 };
const PRESENT_AT = { x: SCREEN.x + SCREEN.w / 2 + 0.7, z: SCREEN.z + 0.9 };
const PX = [1280, 720] as const;

/** The audience's places: rows facing the screen, those a person can stand on. */
function audienceSpots(w: Walkways) {
  const out: { x: number; z: number }[] = [];
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 6; i++) {
      const x = SCREEN.x - 2.5 + i + (row % 2) * 0.5;
      const z = SCREEN.z + 3 + row * 1.1;
      if (standable(w, x, z)) out.push({ x, z });
    }
  }
  return out;
}

/** The all-hands' phase and slide now, refreshed twice a second (never in the render loop). */
function usePhase(ah: AllHandsView | null) {
  const [at, setAt] = useState(() => (ah ? allHandsAt(ah, officeNow()) : null));
  useEffect(() => {
    if (!ah) return setAt(null);
    const tick = () =>
      setAt((prev) => {
        const next = allHandsAt(ah, officeNow());
        return prev && prev.phase === next.phase && prev.slide === next.slide ? prev : next;
      });
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [ah]);
  return at;
}

function useSlides(ah: AllHandsView | null): Slide[] {
  const e = useEdition(ah?.edition);
  const company = useStore((s) => s.settings.companyName);
  return useMemo(() => (e ? slidesOf(e, company) : []), [e, company]);
}

/** A QA screenshot of the slide's PR, when the office still has one. */
function useShot(slide: Slide | undefined) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const rec = useStore((s) => (slide?.shot ? s.qa[qaKey(slide.shot.repoId, slide.shot.pr)] : undefined));
  const url = slide?.shot && rec?.shots?.length ? qaShotUrl(slide.shot.repoId, slide.shot.pr, 0, rec.updatedAt) : null;
  useEffect(() => {
    setImg(null);
    if (!url) return;
    let alive = true;
    const i = new Image();
    i.onload = () => alive && setImg(i);
    i.src = url;
    return () => {
      alive = false;
      i.onload = null;
    };
  }, [url]);
  return img;
}

/** What a screen shows during the all-hands (null when there's none): for the lobby's screen and the app monitors. */
export function useAllHandsSlide() {
  const ah = useStore((s) => s.news.allHands);
  const at = usePhase(ah);
  const slides = useSlides(ah);
  const company = useStore((s) => s.settings.companyName) || 'cubefarm';
  const slide = at ? slides[at.slide] : undefined;
  const img = useShot(at?.phase === 'presenting' ? slide : undefined);
  if (!ah || !at || at.phase === 'over') return null;
  const note = at.phase === 'gathering' ? 'Gathering in the lobby…' : at.phase === 'dispersing' ? 'Back to work! 👏' : null;
  return { slide: slide ?? null, index: at.slide, count: slides.length, company, note, img, key: `${ah.id}:${at.phase}:${at.slide}:${slides.length}:${img ? 1 : 0}` };
}

/** Clapping: short bursts of noise from the crowd. */
function applause(at: { x: number; z: number }) {
  for (let i = 0; i < 26; i++) {
    noise({ name: 'applause', group: 'alerts', pos: { x: at.x + (Math.random() - 0.5) * 4, y: 1.3, z: at.z + Math.random() * 3 }, at: Math.random() * 3.2, dur: 0.05, peak: 0.08, filter: 'bandpass', freq: 1400 + Math.random() * 1600, q: 1.2 });
  }
}

// ---------- the lobby ----------

class LobbyShow {
  readonly w = walkways('lobby');
  private ps = new Map<string, Performer>();
  private started = false;
  private ceo: Performer | null = null;
  phase: AllHandsPhase = 'gathering';
  readonly spots: { x: number; z: number }[];
  /** Attendees here, in their spot order. */
  readonly people: string[];

  constructor(ah: AllHandsView, agents: Record<string, Agent>) {
    this.spots = audienceSpots(this.w);
    this.people = ah.attendees.filter((id) => agents[id]).slice(0, this.spots.length);
  }

  /** Who arrives when (seconds into the gathering), and whether they're there already when you walk in. */
  begin(t: number) {
    this.started = true;
    const lift = spot(this.w, 'elevator')!;
    this.people.forEach((id, i) => {
      const s = this.spots[i];
      const arrive = 2 + i * 1.1;
      const late = t > arrive + 14;
      const cues: Cue[] = late
        ? [{ run: () => setHidden(id, false) }, { place: s, face: NORTH }]
        : [{ run: () => setHidden(id, true) }, { place: { x: PARKED.x, z: PARKED.z } }, { hold: Math.max(0, arrive - t) }, { run: () => setHidden(id, false) }, { place: CABIN, face: NORTH }, { walk: lift, straight: true }, { walk: s, face: NORTH }];
      cues.push(
        { until: () => this.phase === 'applause', face: NORTH },
        { until: () => this.phase === 'dispersing' || this.phase === 'over', face: NORTH, gesture: 'clap' },
        { hold: (i % 6) * 0.5 },
        { walk: lift },
        { walk: CABIN, straight: true },
        { run: () => this.park(id) },
      );
      this.ps.set(id, new Performer(id, this.w, cues));
    });
    // The CEO presents if they're at their desk (not out on a walk round the floors).
    if (!isHidden(CEO_ID) && useStore.getState().agents[CEO_ID]) {
      claimBody(CEO_ID);
      const desk = spot(this.w, 'ceo');
      this.ceo = new Performer(CEO_ID, this.w, [
        t > 20 ? { place: PRESENT_AT, face: SOUTH } : { walk: PRESENT_AT, face: SOUTH },
        { until: () => this.phase === 'applause' || this.phase === 'dispersing' || this.phase === 'over', face: SOUTH, gesture: 'talk' },
        { until: () => this.phase === 'dispersing' || this.phase === 'over', face: SOUTH, gesture: 'clap' },
        ...(desk ? [{ walk: desk, face: desk.facing }] : []),
        { run: () => seatBody(CEO_ID) },
      ]);
    }
  }

  private park(id: string) {
    setHidden(id, true);
    placeBody(id, PARKED.x, PARKED.z, 0);
  }

  tick(dt: number, t: number) {
    if (!this.started) this.begin(t);
    for (const [id, p] of this.ps) if (!p.tick(dt)) this.ps.delete(id);
    if (this.ceo && !this.ceo.tick(dt)) this.ceo = null;
  }

  /** Someone who got work leaves at once. */
  callAway(id: string) {
    const p = this.ps.get(id);
    if (!p) return;
    const lift = spot(this.w, 'elevator')!;
    p.redirect(isHidden(id) ? [{ run: () => this.park(id) }] : [{ walk: lift }, { walk: CABIN, straight: true }, { run: () => this.park(id) }]);
  }

  report() {
    return {
      floor: 'lobby',
      phase: this.phase,
      attendees: this.people.length,
      inLobby: this.people.filter((id) => !isHidden(id)),
      seats: this.spots.length,
      ceoPresenting: !!this.ceo,
    };
  }

  dispose() {
    for (const id of this.people) {
      setHidden(id, false);
      seatBody(id);
    }
    if (this.ceo || bodyState(CEO_ID)?.stage !== 'seated') seatBody(CEO_ID);
  }
}

/** One of the people from upstairs, drawn from inside the elevator cabin (their "chair") while the show walks them. */
function Guest({ agent }: { agent: Agent }) {
  return (
    <group position={[CABIN.x, 0, CABIN.z]}>
      <Character agent={agent}>
        <NameTag agent={agent} />
      </Character>
    </group>
  );
}

function BigScreen() {
  const show = useAllHandsSlide();
  const tex = useCanvasTexture(PX[0], PX[1], (ctx) => drawSlide(ctx, PX[0], PX[1], { slide: show?.slide ?? null, index: show?.index ?? 0, count: show?.count ?? 0, company: show?.company ?? '', note: show?.note ?? null, img: show?.img ?? null }), [show?.key]);
  return (
    <group position={[SCREEN.x, 0, SCREEN.z]}>
      <Box size={[0.08, SCREEN.y, 0.08]} position={[-SCREEN.w / 2 + 0.2, SCREEN.y / 2, -0.1]} color="#495057" />
      <Box size={[0.08, SCREEN.y, 0.08]} position={[SCREEN.w / 2 - 0.2, SCREEN.y / 2, -0.1]} color="#495057" />
      <Box size={[SCREEN.w + 0.12, SCREEN.h + 0.12, 0.08]} position={[0, SCREEN.y, -0.04]} color="#2b2d42" outline />
      <mesh position={[0, SCREEN.y, 0.002]}>
        <planeGeometry args={[SCREEN.w, SCREEN.h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** The all-hands in the lobby: the screen, the audience and the CEO presenting. */
export function LobbyAllHands() {
  const ah = useStore((s) => s.news.allHands);
  if (!ah || allHandsAt(ah, officeNow()).phase === 'over') return null;
  return <LobbyStage key={ah.id} ah={ah} />;
}

function LobbyStage({ ah }: { ah: AllHandsView }) {
  const agents = useStore((s) => s.agents);
  const voice = useStore((s) => s.settings.voice);
  const at = usePhase(ah);
  const slides = useSlides(ah);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one show per all-hands (keyed by its id)
  const show = useMemo(() => new LobbyShow(ah, agents), [ah.id]);
  const paused = useRenderPaused();
  const fresh = useRef(true);
  useEffect(() => {
    if (!paused) fresh.current = true;
  }, [paused]);
  useEffect(() => {
    reportAllHands(show.report());
    return () => {
      show.dispose();
      reportAllHands(null);
    };
  }, [show]);
  useFrame((_, delta) => {
    const dt = fresh.current ? 0 : Math.min(delta, 0.1);
    fresh.current = false;
    show.tick(dt, (officeNow() - ah.startedAt) / 1000);
  });
  // The phase drives the cues; each slide gets the CEO's line (a bubble, and read aloud while voice is on).
  const phase = at?.phase ?? 'gathering';
  const slide = at?.slide ?? 0;
  useEffect(() => {
    show.phase = phase;
    reportAllHands(show.report());
    if (phase === 'applause') applause({ x: SCREEN.x, z: SCREEN.z + 3 });
    if (phase === 'applause') show.people.forEach((id, i) => setTimeout(() => say(id, '👏', 3), i * 120));
  }, [phase, show]);
  useEffect(() => {
    const line = phase === 'presenting' ? slides[slide]?.say : null;
    if (!line) return;
    say(CEO_ID, line, 8);
    if (voice.provider !== 'off' && document.visibilityState === 'visible') void speakLine(line, voice.provider === 'browser' ? voice.voiceName : '');
  }, [phase, slide, slides, voice.provider, voice.voiceName]);
  // Anyone who gets work heads straight back.
  useEffect(() => {
    for (const id of show.people) if (agents[id] && !isFree(agents[id].status)) show.callAway(id);
  }, [agents, show]);
  return (
    <>
      <BigScreen />
      {show.people.map((id) => agents[id] && <Guest key={id} agent={agents[id]} />)}
    </>
  );
}

// ---------- an office floor ----------

class FloorShow {
  readonly w = walkways('office');
  private ps = new Map<string, Performer>();
  /** Away at the all-hands (or on their way). */
  readonly away = new Set<string>();
  private back = new Set<string>();

  constructor(readonly mine: string[]) {}

  tick(dt: number, phase: AllHandsPhase, t: number, agents: Agent[]) {
    const lift = spot(this.w, 'elevator')!;
    for (const id of this.mine) {
      const a = agents.find((x) => x.id === id);
      if (!a) continue;
      const returning = phase === 'dispersing' || phase === 'over' || !isFree(a.status);
      if (!this.away.has(id) && !returning && !this.back.has(id)) {
        this.away.add(id);
        claimBody(id);
        // Gone before you came: already downstairs.
        if (t > 15) this.park(id);
        else this.ps.set(id, new Performer(id, this.w, [{ hold: this.away.size * 0.6 }, { walk: lift }, { walk: CABIN, straight: true }, { run: () => this.park(id) }]));
      } else if (this.away.has(id) && returning) {
        this.away.delete(id);
        this.back.add(id);
        const home = spot(this.w, homeSpotId('office', a) ?? '');
        const fromDesk = !isHidden(id);
        this.ps.set(
          id,
          new Performer(id, this.w, [
            ...(fromDesk ? [] : [{ run: () => setHidden(id, false) }, { place: CABIN, face: NORTH }, { walk: lift, straight: true }]),
            ...(home ? [{ walk: home, face: home.facing }] : []),
            { run: () => seatBody(id) },
          ] as Cue[]),
        );
      }
    }
    for (const [id, p] of this.ps) if (!p.tick(dt)) this.ps.delete(id);
  }

  private park(id: string) {
    setHidden(id, true);
    placeBody(id, PARKED.x, PARKED.z, 0);
  }

  dispose() {
    for (const id of this.mine) {
      setHidden(id, false);
      if (this.away.has(id) || this.ps.has(id)) seatBody(id);
    }
  }
}

/** The all-hands seen from an office floor: this floor's attendees go down to the lobby and come back after. */
export function FloorAllHands({ agents }: { agents: Agent[] }) {
  const ah = useStore((s) => s.news.allHands);
  if (!ah) return null;
  return <FloorStage key={ah.id} ah={ah} agents={agents} />;
}

function FloorStage({ ah, agents }: { ah: AllHandsView; agents: Agent[] }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one per all-hands (keyed by its id)
  const show = useMemo(() => new FloorShow(ah.attendees.filter((id) => agents.some((a) => a.id === id))), [ah.id]);
  const list = useRef(agents);
  list.current = agents;
  useEffect(() => () => show.dispose(), [show]);
  useFrame((_, delta) => {
    const t = (officeNow() - ah.startedAt) / 1000;
    show.tick(Math.min(delta, 0.1), allHandsAt(ah, officeNow()).phase, t, list.current);
  });
  return null;
}


