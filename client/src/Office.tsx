// The 3D office and everything drawn over it. Loaded on its own (App.tsx), so pocket mode never downloads the 3D world.
import { lazy, Suspense, useEffect } from 'react';
import { StatsReadout, statsEnabled } from './perf';
import { installPhoto, usePhotoGate } from './photo/gate';
import { Game } from './world/Game';
import { CinemaVeil } from './ui/CinemaVeil';
import { HUD } from './ui/HUD';
import { ReplayBar } from './ui/TimeLapse';
import { Overlays } from './ui/Overlays';
import { StartScreen } from './ui/StartScreen';
import { Tutorial } from './ui/Tutorial';
import { useCinema } from './world/camera/cinema';

// Photo mode's panel loads the first time it's opened; the HUD and the tutorial hide while it's on.
const PhotoPanel = lazy(() => import('./photo/PhotoPanel'));

export default function Office() {
  const photo = usePhotoGate((s) => s.active);
  // the tutorial waits for the intro's flight to land (world/camera/cinema.ts)
  const flying = useCinema((s) => s.phase === 'intro');
  useEffect(installPhoto, []);
  return (
    <>
      <Game />
      {photo ? (
        <Suspense fallback={null}>
          <PhotoPanel />
        </Suspense>
      ) : (
        <HUD />
      )}
      <ReplayBar />
      <Overlays />
      {!photo && !flying && <Tutorial />}
      <CinemaVeil />
      <StartScreen />
      {statsEnabled && <StatsReadout />}
    </>
  );
}
