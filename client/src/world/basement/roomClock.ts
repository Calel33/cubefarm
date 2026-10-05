// What the server room's parts share each frame: its clock (seconds, the shaders' uTime and the racks' power ramps run
// on it) and how far its lights are up (RoomLights.tsx eases it; the racks' LEDs and LCDs follow).

const T0 = performance.now();

/** The room's clock, in seconds. */
export const roomTime = () => (performance.now() - T0) / 1000;

export const room = {
  /** 1 full light, a notch down while pacing, low under the red emergency lighting. */
  level: 1,
  /** 0..1: how far the emergency lighting has come on. */
  emergency: 0,
};
