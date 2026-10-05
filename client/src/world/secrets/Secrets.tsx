// The secrets' watcher inside the canvas (#266): the typed easter eggs (the Konami code anywhere, "coffee" on the
// manager's console), π o'clock, the polaroid camera and the moments it snaps, and disco mode's lazy chunk.

import { lazy, Suspense, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useStore } from '../../store';
import { officeNow } from '../../officeTime';
import { onMerge } from '../confetti';
import { onGongParty } from '../gongState';
import { runningEvents } from '../events/eventsState';
import { advance, isPiTime, KONAMI, SPILL_WORD } from './eggs';
import { eggFound, setPolaroidCamera, snapMoment, spillMug, startDisco, useSecrets } from './secretsState';
import './probe';

const Disco = lazy(() => import('./Disco'));

const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

export function Secrets({ kind }: { kind: 'office' | 'lobby' | 'roof' }) {
  const { gl, scene, camera } = useThree();
  const disco = useSecrets((s) => s.disco);

  // the typed eggs: never while typing into a box, so a title or a message can't set one off
  useEffect(() => {
    let konami = 0;
    let coffee = 0;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.repeat) return;
      konami = advance(KONAMI, konami, e.key);
      if (konami === KONAMI.length) {
        konami = 0;
        startDisco();
      }
      if (useStore.getState().overlay?.kind !== 'manager') {
        coffee = 0;
        return;
      }
      coffee = advance(SPILL_WORD, coffee, e.key);
      if (coffee === SPILL_WORD.length) {
        coffee = 0;
        spillMug();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // π o'clock (the time-lapse's time while it plays), and the egg for being on a floor with a whiteboard then
  useEffect(() => {
    const check = () => {
      const pi = isPiTime(officeNow());
      if (pi !== useSecrets.getState().pi) useSecrets.setState({ pi });
      if (pi && kind === 'office' && !useStore.getState().replaying) eggFound('pi');
    };
    check();
    const t = setInterval(check, 5000);
    return () => clearInterval(t);
  }, [kind]);

  // the polaroid camera: one extra render of the view, copied small before the frame is gone
  useEffect(() => {
    setPolaroidCamera((w, h) => {
      gl.render(scene, camera);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      const src = gl.domElement;
      // the middle of the view at the photo's 4:3
      const sw = Math.min(src.width, (src.height * w) / h);
      const sh = (sw * h) / w;
      ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.72);
    });
    return () => setPolaroidCamera(null);
  }, [gl, scene, camera]);

  // memorable moments: the day's first merge, a gong party, the kaiju (once a visit)
  useEffect(() => {
    const live = () => !useStore.getState().replaying;
    const offMerge = onMerge(() => live() && snapMoment('first-merge'));
    const offGong = onGongParty(() => live() && setTimeout(() => snapMoment('gong-run'), 600));
    let kaiju = -1;
    const t = setInterval(() => {
      const run = runningEvents().find((r) => r.id === 'kaiju');
      if (run && run.key !== kaiju && run.t > 6 && live()) {
        kaiju = run.key;
        snapMoment('kaiju');
      }
    }, 2000);
    return () => {
      offMerge();
      offGong();
      clearInterval(t);
    };
  }, []);

  return disco ? (
    <Suspense fallback={null}>
      <Disco kind={kind} />
    </Suspense>
  ) : null;
}
