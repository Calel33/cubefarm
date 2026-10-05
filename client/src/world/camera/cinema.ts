// The cinematic camera: the start screen's orbit round the tower, the intro on Enter (the flyover to reception, the
// repeat visit's glide, or a fade with reduced motion) and the away screensaver after ten idle minutes. While it holds
// the camera, Player.tsx stands still and CinemaCamera.tsx (inside the Canvas) calls stepCinema once a frame. Module state,
// so a frame re-renders nothing; useCinema is the React side. The paths are pure, in cinemaPaths.ts.
// window.__swarmCinema is the probe: the state, skip(), idle() and wake().

import type * as THREE from 'three';
import { create } from 'zustand';
import { repoOnFloor, useStore } from '../../store';
import { getA11y, reduceMotion } from '../../ui/a11y';
import { photoActive } from '../../photo/gate';
import { isConfirmOpen } from '../../ui/Confirm';
import { pad } from '../gamepad';
import { effectiveTier, useGfx } from '../gfx/useGraphics';
import { EYE_HEIGHT, ROOF } from '../layout';
import { newOrbit, orbitPose } from './cameraMath';
import {
  FADE_S,
  GLIDE_S,
  ORBIT_TIER,
  RECEPTION_SPOT,
  SCREENSAVER,
  cardFraming,
  copyCinePose,
  flightPose,
  flyoverFlight,
  glidePose,
  idleDue,
  introPlan,
  mayIdle,
  newCinePose,
  pointAt,
  distanceAt,
  screensaverPose,
  screensaverStart,
  startFov,
  startOrbit,
  type CinePose,
  type Flight,
  type IntroPlan,
} from './cinemaPaths';
import { cameraMode, homeSpot, playerAt, rigOwnsCamera } from './rig';
import { windowsShown } from './StartWindows';

export type CinemaPhase = 'start' | 'intro' | 'idle-in' | 'screensaver' | 'idle-out' | 'off';

// ---------- the last visit ----------

const VISIT_KEY = 'cubefarm:visited';

function loadVisit(): number | null {
  try {
    const v = Number(localStorage.getItem(VISIT_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function saveVisit(at: number) {
  try {
    localStorage.setItem(VISIT_KEY, String(at));
  } catch {
    // storage may be unavailable (private mode): every visit is the first of the day
  }
}

// The first visit of the day ends at reception, so the start screen already shows the tower from the lobby's floor.
const boot = typeof window === 'undefined' ? null : introPlan({ lastVisit: loadVisit(), now: Date.now(), skipIntro: getA11y().skipIntro, reduced: false });
if (boot?.dest === 'reception' && useStore.getState().floor !== 0) useStore.setState({ floor: 0 });

// ---------- state ----------

interface Saved {
  px: number;
  py: number;
  pz: number;
  rx: number;
  ry: number;
  rz: number;
  fov: number;
  near: number;
}

const cine = {
  phase: (typeof window === 'undefined' ? 'off' : 'start') as CinemaPhase,
  /** Seconds into the phase. */
  t: 0,
  /** How far round the start orbit has turned, radians. */
  orbit: 0,
  plan: null as IntroPlan | null,
  flight: null as Flight | null,
  duration: 0,
  from: newCinePose(),
  to: newCinePose(),
  pose: newCinePose(),
  /** Where you were when the screensaver took over: put back exactly. */
  saved: null as Saved | null,
  /** The screensaver's angle round its ellipse. */
  angle: 0,
  lastInput: typeof performance === 'undefined' ? 0 : performance.now(),
  lastPad: -Infinity,
  /** Reduced motion: the moment (seconds into the phase) a fade cuts to its destination; done after FADE_S. */
  cutDone: false,
  aspect: 16 / 9,
  fovKey: '',
  fov: 50,
  /** QA: the intro held still this many seconds in (probe.hold). */
  hold: null as number | null,
};

const orbit = newOrbit();
let camera: THREE.PerspectiveCamera | null = null;

interface CinemaView {
  phase: CinemaPhase;
  /** The intro running (or about to): what kind. */
  motion: IntroPlan['motion'] | null;
  /** A reduced-motion fade has the screen dark. */
  veil: boolean;
}

export const useCinema = create<CinemaView>(() => ({ phase: cine.phase, motion: null, veil: false }));

function setPhase(phase: CinemaPhase) {
  cine.phase = phase;
  cine.t = 0;
  cine.cutDone = false;
  useCinema.setState({ phase, motion: phase === 'intro' ? (cine.plan?.motion ?? null) : null, veil: false });
}

const setVeil = (veil: boolean) => useCinema.getState().veil !== veil && useCinema.setState({ veil });

/** Whether the cinema has the camera: Player.tsx stands still and ignores the mouse and keys meanwhile. */
export const cinemaOwnsCamera = () => cine.phase !== 'off';
/** Whether the screensaver is up (or on its way in or out). */
export const cinemaAway = () => cine.phase === 'idle-in' || cine.phase === 'screensaver' || cine.phase === 'idle-out';

/** CinemaCamera.tsx hands over the camera. */
export function bindCinemaCamera(c: THREE.PerspectiveCamera | null) {
  camera = c;
}

// ---------- the player ----------

type PlaceFn = (x: number, z: number, yaw: number, pitch: number) => void;
let placePlayer: PlaceFn | null = null;

/** Player.tsx: how to stand the player somewhere (the flyover ends at reception). */
export function bindPlayer(fn: PlaceFn | null) {
  placePlayer = fn;
}

const firstFov = () => getA11y().fov;
const topFloor = () => useStore.getState().repos.reduce((m, r) => Math.max(m, r.floor), 0);

function applyPose(c: THREE.PerspectiveCamera, p: CinePose) {
  c.position.set(p.x, p.y, p.z);
  c.rotation.set(p.pitch, p.yaw, p.roll, 'YXZ');
  if (Math.abs(c.fov - p.fov) > 1e-4 || Math.abs(c.near - p.near) > 1e-5) {
    c.fov = p.fov;
    c.near = p.near;
    c.updateProjectionMatrix();
  }
}

function restoreLens(c: THREE.PerspectiveCamera) {
  if (c.fov === firstFov() && c.near === 0.05) return;
  c.fov = firstFov();
  c.near = 0.05;
  c.updateProjectionMatrix();
}

// ---------- the start orbit ----------

function orbitTier() {
  return ORBIT_TIER[effectiveTier(useGfx.getState())];
}

/** The start screen's card sits on the left from this width up (styles.css, .start). */
const WIDE_PX = 1100;

function startPose(out: CinePose) {
  const floor = useStore.getState().floor;
  const top = topFloor();
  const wide = window.innerWidth >= WIDE_PX;
  const key = `${floor}:${top}:${cine.aspect.toFixed(3)}:${wide}`;
  if (key !== cine.fovKey) {
    cine.fovKey = key;
    cine.fov = startFov(floor, top, cardFraming(0, cine.aspect, wide).fitAspect);
  }
  startOrbit(floor, top, cine.orbit, cine.fov, orbit);
  orbitPose(orbit, out);
  out.yaw += cardFraming(cine.fov, cine.aspect, wide).yaw;
  out.roll = 0;
  return out;
}

// ---------- the intro ----------

/** Where the intro ends: reception (the lobby, first visit of the day) or where Player.tsx put you back. */
function introDestination(plan: IntroPlan, out: CinePose) {
  const s = useStore.getState();
  out.fov = firstFov();
  out.near = 0.05;
  out.roll = 0;
  out.y = EYE_HEIGHT;
  if (plan.dest === 'reception' && s.floor === 0) {
    out.x = RECEPTION_SPOT.x;
    out.z = RECEPTION_SPOT.z;
    out.yaw = RECEPTION_SPOT.yaw;
    out.pitch = RECEPTION_SPOT.pitch;
  } else {
    // where Player.tsx stood you on arriving: a reload's remembered spot, or the elevator
    const home = homeSpot();
    out.x = home.x;
    out.z = home.z;
    out.yaw = home.yaw;
    out.pitch = home.pitch;
  }
  return out;
}

/** Enter was pressed: play the intro. */
export function beginIntro(now = Date.now()) {
  if (cine.phase !== 'start') return;
  const plan = introPlan({ lastVisit: loadVisit(), now, skipIntro: getA11y().skipIntro, reduced: reduceMotion() });
  saveVisit(now);
  // the flyover only goes to the lobby; anywhere else it's the glide
  if (plan.dest === 'reception' && useStore.getState().floor !== 0) plan.dest = 'saved';
  if (plan.motion === 'flyover' && plan.dest !== 'reception') plan.motion = 'glide';
  cine.plan = plan;
  copyCinePose(cine.pose, cine.from);
  introDestination(plan, cine.to);
  if (plan.motion === 'flyover') {
    cine.flight = flyoverFlight(cine.from, { x: orbit.fx, y: orbit.fy, z: orbit.fz }, cine.to.fov);
    cine.duration = cine.flight.duration;
  } else {
    cine.flight = null;
    cine.duration = plan.motion === 'glide' ? GLIDE_S : FADE_S;
  }
  setPhase('intro');
  if (plan.motion === 'fade') setVeil(true);
}

/** Ends the intro now: you're standing at its end with the controls. */
export function finishIntro() {
  if (cine.phase !== 'intro') return;
  const to = cine.to;
  copyCinePose(to, cine.pose);
  placePlayer?.(to.x, to.z, to.yaw, to.pitch);
  if (camera) {
    camera.position.set(to.x, EYE_HEIGHT, to.z);
    camera.rotation.set(to.pitch, to.yaw, 0, 'YXZ');
    restoreLens(camera);
  }
  cine.flight = null;
  cine.lastInput = performance.now();
  cine.hold = null;
  setPhase('off');
}

const doorScout = { x: 0, y: 0, z: 0 };

function stepIntro(dt: number, out: CinePose) {
  cine.t = cine.hold ?? cine.t + dt;
  const plan = cine.plan!;
  if (plan.motion === 'flyover' && cine.flight) {
    flightPose(cine.flight, Math.min(cine.t, cine.duration), out);
    // the side door senses a "player" a few metres ahead of the camera, so it's open before the camera gets there,
    // and the camera itself once it's through
    const d = distanceAt(cine.flight.knots, cine.t);
    pointAt(cine.flight.path, Math.min(d + 3, Math.max(d, cine.flight.door + 0.8)), doorScout);
    playerAt.x = doorScout.x;
    playerAt.z = doorScout.z;
  } else if (plan.motion === 'glide') glidePose(cine.from, cine.to, Math.min(1, cine.t / cine.duration), out);
  else {
    // fade: dark, cut, then light again
    if (!cine.cutDone && cine.t >= FADE_S * 0.45) {
      cine.cutDone = true;
      setVeil(false);
    }
    copyCinePose(cine.cutDone ? cine.to : cine.from, out);
  }
  if (cine.t >= cine.duration) {
    applyPose(camera!, out);
    finishIntro();
    return false;
  }
  return true;
}

// ---------- the screensaver ----------

function idleAllowed() {
  const s = useStore.getState();
  return mayIdle({
    started: s.started,
    overlay: !!s.overlay || isConfirmOpen(),
    travel: !!s.travel,
    photo: photoActive(),
    firstPerson: cameraMode() === 'first' && !rigOwnsCamera(),
    paddle: s.held?.kind === 'paddle',
  });
}

/** Starts the away screensaver now (if you're on foot and free); false when it can't. */
export function startIdle() {
  if (cine.phase !== 'off' || !camera || !idleAllowed()) return false;
  const c = camera;
  cine.saved = { px: c.position.x, py: c.position.y, pz: c.position.z, rx: c.rotation.x, ry: c.rotation.y, rz: c.rotation.z, fov: c.fov, near: c.near };
  cine.from = { x: c.position.x, y: c.position.y, z: c.position.z, yaw: c.rotation.y, pitch: c.rotation.x, roll: c.rotation.z, fov: c.fov, near: c.near };
  cine.angle = screensaverStart(c.position.x, c.position.z);
  setPhase('idle-in');
  if (reduceMotion()) setVeil(true);
  return true;
}

/** Any input while away: back to exactly where you were. */
export function wake() {
  if (cine.phase !== 'idle-in' && cine.phase !== 'screensaver') return;
  copyCinePose(cine.pose, cine.from);
  setPhase('idle-out');
  if (reduceMotion()) setVeil(true);
}

function finishIdle() {
  const c = camera;
  const v = cine.saved;
  if (c && v) {
    c.position.set(v.px, v.py, v.pz);
    c.rotation.set(v.rx, v.ry, v.rz, 'YXZ');
    if (c.fov !== v.fov || c.near !== v.near) {
      c.fov = v.fov;
      c.near = v.near;
      c.updateProjectionMatrix();
    }
  }
  cine.saved = null;
  cine.lastInput = performance.now();
  setPhase('off');
}

const savedPose = newCinePose();

function stepIdle(dt: number, out: CinePose) {
  cine.t += dt;
  const reduced = reduceMotion();
  // the orbit (still with reduced motion: a wide view of the room)
  if (!reduced) cine.angle += (dt * Math.PI * 2) / SCREENSAVER.period;
  const fov = Math.max(60, firstFov());
  if (cine.phase === 'idle-in') {
    screensaverPose(cine.angle, fov, cine.to);
    if (reduced) {
      if (cine.t >= FADE_S * 0.45 && !cine.cutDone) {
        cine.cutDone = true;
        setVeil(false);
      }
      copyCinePose(cine.cutDone ? cine.to : cine.from, out);
      if (cine.t >= FADE_S) setPhase('screensaver');
    } else {
      glidePose(cine.from, cine.to, Math.min(1, cine.t / SCREENSAVER.drift), out);
      if (cine.t >= SCREENSAVER.drift) setPhase('screensaver');
    }
  } else if (cine.phase === 'screensaver') {
    screensaverPose(cine.angle, fov, out);
    if (!idleAllowed()) wake();
  } else {
    const v = cine.saved!;
    Object.assign(savedPose, { x: v.px, y: v.py, z: v.pz, yaw: v.ry, pitch: v.rx, roll: v.rz, fov: v.fov, near: v.near });
    const back = reduced ? FADE_S : SCREENSAVER.back;
    if (reduced) {
      if (cine.t >= FADE_S * 0.45 && !cine.cutDone) {
        cine.cutDone = true;
        setVeil(false);
      }
      copyCinePose(cine.cutDone ? savedPose : cine.from, out);
    } else glidePose(cine.from, savedPose, Math.min(1, cine.t / back), out);
    if (cine.t >= back) {
      finishIdle();
      return false;
    }
  }
  return true;
}

// ---------- input ----------

/** Any key, click, wheel or touch (CinemaCamera.tsx): skips the intro, ends the screensaver, resets the idle clock. */
export function noteInput(kind: 'key' | 'press' | 'move') {
  cine.lastInput = performance.now();
  if (cine.phase === 'intro' && kind !== 'move') finishIntro();
  else if (cine.phase === 'idle-in' || cine.phase === 'screensaver') wake();
}

// ---------- every frame ----------

/** One frame (CinemaCamera.tsx): `aspect` is the view's. */
export function stepCinema(dt: number, aspect: number) {
  cine.aspect = aspect;
  const c = camera;
  if (!c) return;
  if (pad.usedAt > cine.lastPad) {
    cine.lastPad = pad.usedAt;
    noteInput('press');
  }
  if (cine.phase === 'off') {
    if (idleDue(cine.lastInput, performance.now()) && !startIdle()) cine.lastInput = performance.now();
    if (cine.phase === 'off') return;
  }
  const out = cine.pose;
  if (cine.phase === 'start') {
    if (useStore.getState().started) {
      beginIntro();
      return stepCinema(dt, aspect);
    }
    if (!reduceMotion()) cine.orbit += dt * orbitTier().speed;
    startPose(out);
  } else if (cine.phase === 'intro') {
    if (!stepIntro(dt, out)) return;
  } else if (!stepIdle(dt, out)) return;
  applyPose(c, out);
}

// ---------- the probe ----------

const round = (n: number) => Math.round(n * 100) / 100;

const probe = {
  state: () => ({
    phase: cine.phase,
    plan: cine.plan ? { ...cine.plan } : null,
    t: round(cine.t),
    duration: round(cine.duration),
    side: cine.flight?.side ?? null,
    pose: { x: round(cine.pose.x), y: round(cine.pose.y), z: round(cine.pose.z), yaw: round(cine.pose.yaw), pitch: round(cine.pose.pitch), roll: round(cine.pose.roll), fov: round(cine.pose.fov) },
    saved: cine.saved ? { x: cine.saved.px, y: cine.saved.py, z: cine.saved.pz, yaw: cine.saved.ry, pitch: cine.saved.rx } : null,
    /** The camera itself, unrounded: after the screensaver it's back exactly where `saved` was. */
    camera: camera ? { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: camera.rotation.y, pitch: camera.rotation.x, roll: camera.rotation.z } : null,
    idleForMs: Math.round(performance.now() - cine.lastInput),
    idleAfterMs: SCREENSAVER.idleMs,
    lastVisit: loadVisit(),
    tier: effectiveTier(useGfx.getState()),
    /** The tower's lit windows and the silhouettes in them, while the start screen and the intro show it. */
    windows: cine.phase === 'start' || cine.phase === 'intro' ? JSON.parse(JSON.stringify(windowsShown)) : null,
    reduced: reduceMotion(),
  }),
  /** Ends the intro at once (as any key does). */
  skip: finishIntro,
  /** Holds the intro still `t` seconds in, for a look or a screenshot (null lets it run on). */
  hold(t: number | null) {
    cine.hold = t === null ? null : Math.max(0, Math.min(t, cine.duration - 0.001));
  },
  /** Acts as if ten minutes passed without input: the screensaver starts (false when it can't right now). */
  idle: startIdle,
  /** Any input: back from the screensaver. */
  wake,
  /** Takes the elevator to `floor` (0 the lobby, -1 the roof), to see the ride. */
  ride: (floor: number) => useStore.getState().goToFloor(floor),
  /** Forgets the last visit, so the next load is the first of the day (the flyover). */
  forgetVisit() {
    try {
      localStorage.removeItem(VISIT_KEY);
    } catch {
      // nothing saved
    }
  },
  /** The floor the start orbit is round, for checking the tower is in view. */
  floor: () => {
    const s = useStore.getState();
    return s.floor === ROOF ? 'roof' : s.floor === 0 ? 'lobby' : (repoOnFloor(s.repos, s.floor)?.fullName ?? s.floor);
  },
};

if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__swarmCinema = probe;
