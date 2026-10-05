// What the 3D office lends the idea wall's pin dialog: the "where" line and a picture of the view. The 3D office
// registers both when it loads (world/ideaWhere.ts, world/ViewGrab.tsx); pocket mode never loads it, so there they're
// simply absent and the dialog leaves them out.

let where: (() => string) | null = null;
let grab: (() => string | null) | null = null;

export function provideWhere(fn: (() => string) | null) {
  where = fn;
}

export function provideViewGrab(fn: (() => string | null) | null) {
  grab = fn;
}

/** Where the manager is now ("looking at the whiteboard on floor 2"), or null outside the 3D office. */
export const ideaWhere = () => where?.() ?? null;

/** A JPEG data URL of the current view, or null when there's no 3D view (or it can't be read). */
export function ideaViewShot(): string | null {
  try {
    return grab?.() ?? null;
  } catch {
    return null;
  }
}
