// window.__swarmFloorStyle (#265): the office floor on screen's style and layout, for QA and Playwright, and a preview
// of any look in this tab only (floorLook.ts's override; nothing is saved).

import { cleanFloorLook, FLOOR_LAYOUTS, FLOOR_STYLES, isFloorLayout, isFloorStyle } from '../../../shared/floorLook';
import { repoOnFloor, useStore } from '../store';
import { useLookOverride, type LookOverride } from './floorLook';
import { LAYOUTS, officeAnchors, officeLook, STYLE_FLOOR } from './layout';

/** window.__swarmFloorStyle: the office floor on screen's style and layout, and a local preview for QA. */
const probe = {
  get now() {
    const s = useStore.getState();
    const repo = s.floor > 0 ? repoOnFloor(s.repos, s.floor) : null;
    const look = officeLook();
    return {
      floor: s.floor,
      repoId: repo?.id ?? null,
      saved: repo ? cleanFloorLook(repo) : null,
      override: useLookOverride.getState().over,
      style: repo ? look.style : null,
      layout: repo ? look.layout : null,
      surface: repo ? STYLE_FLOOR[look.style] : null,
      desks: repo ? LAYOUTS[look.layout].desks.map((d) => ({ x: d.x, z: d.z, rotY: d.rotY })) : [],
      anchors: Object.keys(officeAnchors()),
    };
  },
  styles: FLOOR_STYLES,
  layouts: FLOOR_LAYOUTS,
  /** Shows every office floor in a style and/or layout in this tab only (nothing is saved); preview({}) stops. */
  preview(over: LookOverride) {
    useLookOverride.setState({ over: { ...(isFloorStyle(over.style) ? { style: over.style } : {}), ...(isFloorLayout(over.layout) ? { layout: over.layout } : {}) } });
    return probe.now;
  },
};

if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__swarmFloorStyle = probe;
