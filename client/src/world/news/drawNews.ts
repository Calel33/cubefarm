// Canvas drawings for company news (#268): the folded Gazette's front page, the reception desk's headline strip and
// an all-hands slide (the lobby's big screen and every floor's app monitor).
import type { Slide } from '../../../../shared/news';
import { roundRect, SANS, wrap } from '../draw';

const SERIF = 'Georgia, "Times New Roman", serif';
const INK = '#1d1d1d';

/** The top of the folded paper on a table: masthead, headline and a few ruled "columns". */
export function drawPaper(ctx: CanvasRenderingContext2D, w: number, h: number, company: string, headline: string) {
  ctx.fillStyle = '#f4eedf';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `700 ${Math.round(h * 0.11)}px ${SERIF}`;
  ctx.fillText(`The ${company} Gazette`, w / 2, h * 0.04, w * 0.94);
  ctx.fillRect(w * 0.04, h * 0.18, w * 0.92, 3);
  ctx.fillRect(w * 0.04, h * 0.195, w * 0.92, 1.5);
  ctx.textAlign = 'left';
  ctx.font = `700 ${Math.round(h * 0.085)}px ${SERIF}`;
  const lines = wrap(ctx, headline || 'Hot off the press', w * 0.92, 2);
  lines.forEach((l, i) => ctx.fillText(l, w * 0.04, h * (0.24 + i * 0.1)));
  // the photo and the columns of small print
  const top = h * (0.27 + lines.length * 0.1);
  ctx.fillStyle = '#b9b2a0';
  ctx.fillRect(w * 0.04, top, w * 0.4, h * 0.94 - top);
  ctx.fillStyle = '#8f887a';
  for (let c = 0; c < 2; c++) {
    for (let y = top; y < h * 0.93; y += h * 0.045) ctx.fillRect(w * (0.48 + c * 0.25), y, w * 0.22, h * 0.018);
  }
}

/** The strip on the front of the reception desk: today's headline. */
export function drawHeadlineStrip(ctx: CanvasRenderingContext2D, w: number, h: number, headline: string | null) {
  ctx.fillStyle = '#1d1d1d';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffd166';
  ctx.font = `700 ${Math.round(h * 0.5)}px ${SANS}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('📰 TODAY', h * 0.3, h / 2);
  const x = h * 0.3 + ctx.measureText('📰 TODAY').width + h * 0.4;
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 ${Math.round(h * 0.46)}px ${SERIF}`;
  ctx.fillText(wrap(ctx, headline ?? 'The first edition is on its way', w - x - h * 0.3, 1)[0] ?? '', x, h / 2);
}

export interface SlideDraw {
  slide: Slide | null;
  index: number;
  count: number;
  company: string;
  /** "Gathering in the lobby…" before the first slide, or null. */
  note: string | null;
  img: HTMLImageElement | null;
}

/** One all-hands slide, 16:9. */
export function drawSlide(ctx: CanvasRenderingContext2D, w: number, h: number, d: SlideDraw) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#2b2d42');
  g.addColorStop(1, '#4a2c6b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const pad = w * 0.05;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd166';
  ctx.font = `700 ${Math.round(h * 0.045)}px ${SANS}`;
  ctx.fillText(`📣 ${d.company} all-hands`, pad, pad * 0.6);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  if (d.slide && !d.note) ctx.fillText(`${d.index + 1} / ${d.count}`, w - pad, pad * 0.6);
  ctx.textAlign = 'left';
  if (!d.slide || d.note) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.round(h * 0.1)}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText(d.note ?? 'Starting soon', w / 2, h * 0.42);
    ctx.textAlign = 'left';
    return;
  }
  const textW = d.img ? w * 0.5 : w - pad * 2;
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(h * 0.075)}px ${SANS}`;
  const title = wrap(ctx, d.slide.title, textW, 3);
  title.forEach((l, i) => ctx.fillText(l, pad, h * 0.17 + i * h * 0.09));
  let y = h * 0.2 + title.length * h * 0.09;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = `500 ${Math.round(h * 0.047)}px ${SANS}`;
  for (const line of d.slide.lines) {
    for (const l of wrap(ctx, line, textW, 4)) {
      if (y > h * 0.9) break;
      ctx.fillText(l, pad, y);
      y += h * 0.062;
    }
    y += h * 0.02;
  }
  if (d.img) {
    const iw = w * 0.38;
    const ih = Math.min(h * 0.62, (iw * d.img.naturalHeight) / Math.max(1, d.img.naturalWidth));
    const x = w - pad - iw;
    roundRect(ctx, x - 6, h * 0.2 - 6, iw + 12, ih + 12, 10);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.drawImage(d.img, x, h * 0.2, iw, ih);
  }
}
