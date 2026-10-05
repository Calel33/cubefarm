import { useState } from 'react';
import { FLOOR_LAYOUTS, FLOOR_STYLES, LAYOUT_INFO, STYLE_INFO, cleanFloorLook, type FloorLayout, type FloorStyle } from '../../../shared/floorLook';
import type { RepoView } from '../../../shared/types';
import { api } from '../api';
import { STYLE_LOOKS } from '../world/floorStyles';
import { APP_SCREEN, BOARD, FLOOR_W, FLOOR_D, HALF_D, HALF_W, LAYOUTS, QA_LAB, STYLE_FEATURE, officeAnchors, type Rect } from '../world/layout';

// Floor settings → Style & layout (#265): pick a floor's interior style and desk layout. A choice is saved at once, so
// every tab (and the floor itself, if you're on it) changes straight away; the plan beside them previews whatever you
// point at before you pick it.

const PX = 7; // plan pixels per metre
const W = FLOOR_W * PX;
const H = FLOOR_D * PX;
const X = (x: number) => (x + HALF_W) * PX;
const Z = (z: number) => (z + HALF_D) * PX;

function Box({ r, fill, stroke = 'none' }: { r: Rect; fill: string; stroke?: string }) {
  return <rect x={X(r.minX)} y={Z(r.minZ)} width={(r.maxX - r.minX) * PX} height={(r.maxZ - r.minZ) * PX} fill={fill} stroke={stroke} strokeWidth={1} />;
}

/** A top-down plan of a floor in a style and layout: walls, rugs, desks with their chairs, the QA lab and the anchors. */
export function FloorPlan({ style, layout, accent }: { style: FloorStyle; layout: FloorLayout; accent: string }) {
  const s = STYLE_LOOKS[style];
  const plan = LAYOUTS[layout];
  const anchors = officeAnchors();
  const ink = '#1f1d2b';
  return (
    <svg className="floor-plan" viewBox={`-6 -6 ${W + 12} ${H + 12}`} role="img" aria-label={`${STYLE_INFO[style].name}, ${LAYOUT_INFO[layout].name}: a plan of the floor`}>
      <rect x={-5} y={-5} width={W + 10} height={H + 10} rx={4} fill={s.wallPattern === 'brick' ? s.wall : s.trim === '#ffffff' ? '#c9c2b4' : s.trim} />
      <rect x={0} y={0} width={W} height={H} fill={s.floor} />
      {plan.rugs.map((r, i) => (
        <Box key={i} r={r} fill={accent} />
      ))}
      {Object.entries(anchors).map(([name, r]) => (
        <Box key={name} r={r} fill={s.wall} stroke={ink} />
      ))}
      <Box r={{ minX: -BOARD.w / 2, maxX: BOARD.w / 2, minZ: -HALF_D, maxZ: -HALF_D + 0.35 }} fill="#ffffff" stroke={ink} />
      <Box r={{ minX: APP_SCREEN.x - APP_SCREEN.w / 2, maxX: APP_SCREEN.x + APP_SCREEN.w / 2, minZ: -HALF_D, maxZ: -HALF_D + 0.3 }} fill="#3a86ff" stroke={ink} />
      {style !== 'classic' && <Box r={{ minX: STYLE_FEATURE.x - STYLE_FEATURE.w / 2, maxX: STYLE_FEATURE.x + STYLE_FEATURE.w / 2, minZ: -HALF_D, maxZ: -HALF_D + STYLE_FEATURE.d }} fill={s.trim} stroke={ink} />}
      {plan.partitions.map((r, i) => (
        <Box key={i} r={{ ...r, minX: r.minX - 0.04, maxX: r.maxX + 0.04, minZ: r.minZ - 0.04, maxZ: r.maxZ + 0.04 }} fill="#8d99ae" />
      ))}
      {plan.desks.map((d, i) => {
        const chair = d.rotY === 0 ? 0.8 : -0.8;
        return (
          <g key={i}>
            <rect x={X(d.x - 0.95)} y={Z(d.z - 0.475)} width={1.9 * PX} height={0.95 * PX} fill="#c8a27a" stroke={ink} strokeWidth={1} />
            <circle cx={X(d.x)} cy={Z(d.z + chair)} r={0.3 * PX} fill={accent} stroke={ink} strokeWidth={1} />
          </g>
        );
      })}
      {QA_LAB.stations.map((z) => (
        <g key={z}>
          <rect x={X(QA_LAB.x - 0.475)} y={Z(z - 0.95)} width={0.95 * PX} height={1.9 * PX} fill="#e7e1d6" stroke={ink} strokeWidth={1} />
          <circle cx={X(QA_LAB.x - 0.8)} cy={Z(z)} r={0.3 * PX} fill="#ff9f68" stroke={ink} strokeWidth={1} />
        </g>
      ))}
      <rect x={X(-1.2)} y={H - 2} width={2.4 * PX} height={6} fill="#adb5bd" />
    </svg>
  );
}

export function FloorLookSettings({ repo }: { repo: RepoView }) {
  const saved = cleanFloorLook(repo);
  const [hover, setHover] = useState<{ style?: FloorStyle; layout?: FloorLayout }>({});
  const style = hover.style ?? saved.style;
  const layout = hover.layout ?? saved.layout;
  const pick = (p: { style?: FloorStyle; layout?: FloorLayout }) => void api.updateRepo(repo.id, p).catch(() => undefined);
  return (
    <div className="floor-look">
      <FloorPlan style={style} layout={layout} accent={repo.color} />
      <div className="floor-look-picks">
        <div className="muted small">Style</div>
        <div className="floor-look-row" role="radiogroup" aria-label={`Floor ${repo.floor} style`} onMouseLeave={() => setHover((h) => ({ ...h, style: undefined }))}>
          {FLOOR_STYLES.map((id) => {
            const s = STYLE_LOOKS[id];
            return (
              <button
                key={id}
                role="radio"
                aria-checked={saved.style === id}
                className={`floor-look-choice${saved.style === id ? ' on' : ''}`}
                title={STYLE_INFO[id].blurb}
                onMouseEnter={() => setHover((h) => ({ ...h, style: id }))}
                onFocus={() => setHover((h) => ({ ...h, style: id }))}
                onBlur={() => setHover((h) => ({ ...h, style: undefined }))}
                onClick={() => pick({ style: id })}
              >
                <span className="swatch" aria-hidden style={{ background: `linear-gradient(135deg, ${s.wall} 0 50%, ${s.floor} 50% 100%)`, borderColor: s.trim === '#ffffff' ? repo.color : s.trim }} />
                {STYLE_INFO[id].emoji} {STYLE_INFO[id].name}
              </button>
            );
          })}
        </div>
        <div className="muted small">Layout</div>
        <div className="floor-look-row" role="radiogroup" aria-label={`Floor ${repo.floor} layout`} onMouseLeave={() => setHover((h) => ({ ...h, layout: undefined }))}>
          {FLOOR_LAYOUTS.map((id) => (
            <button
              key={id}
              role="radio"
              aria-checked={saved.layout === id}
              className={`floor-look-choice${saved.layout === id ? ' on' : ''}`}
              title={LAYOUT_INFO[id].blurb}
              onMouseEnter={() => setHover((h) => ({ ...h, layout: id }))}
              onFocus={() => setHover((h) => ({ ...h, layout: id }))}
              onBlur={() => setHover((h) => ({ ...h, layout: undefined }))}
              onClick={() => pick({ layout: id })}
            >
              {LAYOUT_INFO[id].emoji} {LAYOUT_INFO[id].name}
            </button>
          ))}
        </div>
        <div className="muted small">
          {STYLE_INFO[style].blurb} · {LAYOUT_INFO[layout].blurb}
        </div>
      </div>
    </div>
  );
}
