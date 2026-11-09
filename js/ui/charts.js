// A small SVG line chart for the weight trend, waist and exercise history (Charts.kt).

import { html } from '../../vendor/preact-htm.js';
import { Fmt } from '../domain.js';

const W = 340;
const H = 180;
const PAD = { l: 34, r: 8, t: 10, b: 22 };

function niceTicks(min, max, count = 4) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

/**
 * series: [{ points: [{ x: epochDay, y }], cls: 'avg' | 'dot', line?: boolean, dots?: boolean }]
 * band: { min, max } (a target range), xMin/xMax to fix the date range.
 */
export function LineChart({ series, band, xMin, xMax, label }) {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  if (band) ys.push(band.min, band.max);
  const x0 = xMin ?? Math.min(...xs);
  const x1 = Math.max(xMax ?? Math.max(...xs), x0 + 1);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];
  const sx = (x) => PAD.l + ((x - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
  const sy = (y) => H - PAD.b - ((y - y0) / (y1 - y0 || 1)) * (H - PAD.t - PAD.b);
  const xLabels = [x0, Math.round((x0 + x1) / 2), x1];
  const decimals = y1 - y0 < 5 ? 1 : 0;
  return html`<svg class="chart" viewBox=${`0 0 ${W} ${H}`} role="img" aria-label=${label ?? 'Chart'}>
    ${ticks.map((t) => html`<line class="grid" x1=${PAD.l} x2=${W - PAD.r} y1=${sy(t)} y2=${sy(t)} />
      <text x=${PAD.l - 5} y=${sy(t) + 3} text-anchor="end">${Fmt.num(t, decimals)}</text>`)}
    ${band && html`<rect class="band" x=${PAD.l} width=${W - PAD.l - PAD.r} y=${sy(band.max)} height=${Math.max(1, sy(band.min) - sy(band.max))} />
      <line class="band-line" x1=${PAD.l} x2=${W - PAD.r} y1=${sy(band.max)} y2=${sy(band.max)} />`}
    ${xLabels.map((x, i) => html`<text x=${sx(x)} y=${H - 6} text-anchor=${i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>${Fmt.shortDate(x)}</text>`)}
    ${series.map((s) => {
      const pts = [...s.points].sort((a, b) => a.x - b.x);
      const path = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
      const last = pts[pts.length - 1];
      return html`<g>
        ${s.line !== false && pts.length > 1 && html`<path class=${s.cls ?? 'avg'} d=${path} />`}
        ${s.dots && pts.map((p) => html`<circle class="dot" cx=${sx(p.x)} cy=${sy(p.y)} r="2.6" />`)}
        ${s.line !== false && last && html`<circle class="last" cx=${sx(last.x)} cy=${sy(last.y)} r="4" />`}
      </g>`;
    })}
  </svg>`;
}
