import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { bindCinemaCamera, noteInput, stepCinema, useCinema } from './cinema';
import { StartWindows } from './StartWindows';

// Inside the Canvas, after the player and the rig so it has the last word on the camera: hands the camera to the
// cinema (cinema.ts), steps it every frame, and turns any key, click, wheel or touch into its input (skipping the intro,
// waking from the screensaver, resetting the idle clock). The lit windows show only while the tower is on screen.

export function CinemaCamera() {
  const camera = useThree((s) => s.camera);
  const phase = useCinema((s) => s.phase);

  useEffect(() => {
    bindCinemaCamera(camera as THREE.PerspectiveCamera);
    return () => bindCinemaCamera(null);
  }, [camera]);

  useEffect(() => {
    const key = () => noteInput('key');
    const press = () => noteInput('press');
    const move = () => noteInput('move');
    // capture, so the intro is over before the player's own handlers see the key
    window.addEventListener('keydown', key, true);
    window.addEventListener('mousedown', press, true);
    window.addEventListener('wheel', press, { passive: true });
    window.addEventListener('touchstart', press, { passive: true });
    window.addEventListener('mousemove', move, { passive: true });
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('mousedown', press, true);
      window.removeEventListener('wheel', press);
      window.removeEventListener('touchstart', press);
      window.removeEventListener('mousemove', move);
    };
  }, []);

  useFrame(({ size }, dt) => stepCinema(Math.min(dt, 0.05), size.width / Math.max(1, size.height)));

  return phase === 'start' || phase === 'intro' ? <StartWindows /> : null;
}
