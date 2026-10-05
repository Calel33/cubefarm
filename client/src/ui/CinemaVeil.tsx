import { useCinema } from '../world/camera/cinema';

// Over the view while the cinema has the camera (world/camera/cinema.ts): the dark veil its reduced-motion fades use,
// "any key skips" during the intro, and the away screensaver's "any key to come back".

export function CinemaVeil() {
  const phase = useCinema((s) => s.phase);
  const motion = useCinema((s) => s.motion);
  const veil = useCinema((s) => s.veil);
  return (
    <>
      <div className={`cine-veil ${veil ? 'cine-veil-on' : ''}`} aria-hidden="true" />
      {phase === 'intro' && motion === 'flyover' && <div className="cine-hint">Press any key to skip</div>}
      {phase === 'screensaver' && <div className="cine-hint">Away · press any key to come back</div>}
    </>
  );
}
