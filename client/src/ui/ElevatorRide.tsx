import { useEffect, useState, type CSSProperties } from 'react';
import { create } from 'zustand';
import { repoOnFloor, useStore } from '../store';
import { useA11y } from './a11y';
import { reducesMotion } from './a11yPrefs';
import { floorName, rideCounter, rideTiming, storeyOf, type RideTiming } from '../world/camera/cinemaPaths';

// The elevator ride, over the view: the car's doors slide shut, a short look up (or down) the shaft through the doors'
// window with the floor indicator counting, a chime (world/Game.tsx plays it), and the doors slide open onto the new
// floor in a soft wash of light. Reduced motion is a plain fade with the floor's name. Game.tsx's Travel times it
// (beginRide); the timings and the counter are pure, in cinemaPaths.ts.

interface Ride {
  from: number;
  to: number;
  top: number;
  timing: RideTiming;
  /** performance.now() when the doors started closing. */
  at: number;
}

export const useRide = create<{ ride: Ride | null }>(() => ({ ride: null }));

/** A ride from `from` to `to` starts: how long each part takes. */
export function beginRide(from: number, to: number, top: number, reduced: boolean): RideTiming {
  const timing = rideTiming(from, to, top, reduced);
  useRide.setState({ ride: { from, to, top, timing, at: performance.now() } });
  return timing;
}

export function ElevatorRide() {
  const travel = useStore((s) => s.travel);
  const ride = useRide((s) => s.ride);
  const reduced = useA11y((s) => reducesMotion(s.prefs.reduceMotion, s.systemReduced));
  const name = useStore((s) => {
    const to = s.travel?.to;
    if (to === undefined) return '';
    const repo = to > 0 ? repoOnFloor(s.repos, to) : null;
    return repo ? `${floorName(to)} · ${repo.fullName.split('/').pop()}` : floorName(to);
  });
  const [count, setCount] = useState('');

  // the indicator counts storey by storey through the shaft view
  useEffect(() => {
    if (!ride || !travel || travel.phase !== 'closing' || reduced) return;
    let raf = 0;
    const tick = () => {
      const p = (performance.now() - ride.at - ride.timing.closeMs) / Math.max(1, ride.timing.rideMs);
      setCount(rideCounter(ride.from, ride.to, ride.top, Math.min(1, Math.max(0, p))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [ride, travel, reduced]);

  if (reduced || !ride) {
    return (
      <div className={`fade ${travel?.phase === 'closing' ? 'fade-in' : ''}`}>
        {travel && <div className="fade-label">{name}</div>}
      </div>
    );
  }
  if (!travel) return null;
  const up = storeyOf(ride.to, ride.top) > storeyOf(ride.from, ride.top);
  const vars = { '--ride-close': `${ride.timing.closeMs}ms`, '--ride-open': `${ride.timing.openMs}ms`, '--ride-shaft': `${ride.timing.rideMs}ms` } as CSSProperties;
  return (
    <div className={`ride ride-${travel.phase} ${up ? 'ride-up' : 'ride-down'}`} style={vars} aria-hidden="true">
      <div className="ride-door ride-door-l" />
      <div className="ride-door ride-door-r" />
      <div className="ride-window">
        <div className="ride-shaft" />
      </div>
      <div className="ride-panel">
        <span className="ride-arrow">{up ? '▲' : '▼'}</span>
        <span className="ride-count">{travel.phase === 'opening' ? rideCounter(ride.from, ride.to, ride.top, 1) : count}</span>
      </div>
      <div className="ride-name">{name}</div>
      <div className="ride-light" />
    </div>
  );
}
