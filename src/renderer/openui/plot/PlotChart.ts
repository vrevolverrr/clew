import { div, reducedMotion, svg } from '../dom';
import { categoriesOf, mixModel, modelDistance, type ResolvedModel, sameShape } from './mixModel';
import { barSteps, niceDomain, niceTicks, wrapLabel } from './plotMath';

export type Point = [number, number | null];

export type Layer =
  | { kind: 'line'; points: Point[]; label?: string; series?: number }
  /** `lower`, when set, replaces the flat `base` as the edge shaded against; `from` and `to` limit the shading to an x range. */
  | { kind: 'area'; points: Point[]; base: number; lower?: Point[]; from?: number; to?: number; label?: string; series?: number }
  | { kind: 'bars'; values: (number | null)[]; mode: 'bars' | 'waterfall'; label?: string; series?: number }
  | { kind: 'dot'; x: number; y: number; label?: string; series?: number }
  | { kind: 'rule'; at: number; axis: 'x' | 'y'; label?: string; series?: number }
  | { kind: 'note'; x: number; y: number; text: string };

export interface PlotModel {
  /** A range, or the names of the categories a `Bars` layer stands on. */
  x: [number, number] | string[];
  y?: [number, number];
  xLabel?: string;
  yLabel?: string;
  layers: Layer[];
}

const SERIES = 6;
const MIN_WIDTH = 260;
const FALLBACK_WIDTH = 480;
const HEIGHT = 300;
const MIN_LEFT_MARGIN = 28;
const TICK_CHAR_WIDTH = 7.5;
const TICK_GAP = 8;
const Y_TITLE_WIDTH = 20;
const MARKED_POINTS = 12;
/** How quickly a changed plot catches up with its new data, in milliseconds, and how close counts as arrived. */
const CATCH_UP_MS = 70;
const ARRIVED = 0.0015;

function swatch(kind: string, color: string): HTMLElement {
  const el = document.createElement('i');
  el.className = `clew-plot-swatch is-${kind}`;
  el.style.setProperty('--clew-swatch', color);
  return el;
}

function key(label: string, color: string, kind: string): HTMLElement {
  const item = document.createElement('span');
  item.className = 'clew-plot-key';
  item.append(swatch(kind === 'line' ? 'dot' : kind, color), label);
  return item;
}

const minus = (text: string) => text.replace('-', '−');
const tickText = (v: number) => (Math.abs(v) >= 10000 ? `${minus(String(+(v / 1000).toFixed(1)))}K` : minus(String(+v.toFixed(4))));
const readout = (v: number) => minus(String(+v.toPrecision(4)));
const seriesColor = (n: number) => `var(--clew-series-${((n - 1) % SERIES) + 1})`;

let sequence = 0;

/** Splits a line of points where the function is undefined, so a gap is not joined across. */
function runs(points: readonly Point[]): [number, number][][] {
  const out: [number, number][][] = [];
  let current: [number, number][] = [];
  for (const [x, y] of points) {
    if (y === null || !Number.isFinite(y) || !Number.isFinite(x)) {
      if (current.length) out.push(current);
      current = [];
    } else current.push([x, y]);
  }
  if (current.length) out.push(current);
  return out;
}

/** Draws a `PlotModel` as SVG at the width its element has, and again when that width changes. */
export class PlotChart {
  private readonly legend = div('clew-plot-legend');
  private readonly frame = div('clew-plot-frame');
  private readonly canvas = svg('svg', { role: 'img', class: 'clew-plot-svg' });
  private readonly tip = div('clew-plot-tip');
  private readonly observer: ResizeObserver | null;
  /** What is on screen, and the plot it is moving toward. */
  private shown: ResolvedModel | null = null;
  private target: ResolvedModel | null = null;
  private raf: number | null = null;
  private last = 0;
  private width = 0;

  constructor(readonly el: HTMLElement) {
    el.classList.add('clew-plot');
    this.tip.hidden = true;
    this.frame.append(this.canvas, this.tip);
    el.append(this.legend, this.frame);
    this.observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (this.shown && this.measure() !== this.width) this.paint(this.shown, this.raf === null);
    });
    this.observer?.observe(this.frame);
  }

  /** Shows `model`. A plot of the same shape as the one on screen moves to it smoothly; any other replaces it at once. */
  render(model: PlotModel): void {
    const target: ResolvedModel = { ...model, y: model.y ?? this.yDomain(model) };
    const from = this.shown;
    this.target = target;
    if (!from || reducedMotion() || !sameShape(from, target) || modelDistance(from, target) < ARRIVED) {
      this.arrive(target);
      return;
    }
    if (this.raf === null) {
      this.last = window.performance.now();
      this.raf = window.requestAnimationFrame(this.step);
    }
  }

  destroy(): void {
    this.observer?.disconnect();
    this.stop();
    this.shown = null;
    this.target = null;
  }

  /** Moves the plot on screen a share of the way to its target. Chasing a target that keeps changing, as a slider does, stays smooth. */
  private readonly step = (now: number): void => {
    const { shown, target } = this;
    if (!shown || !target) return;
    const next = mixModel(shown, target, 1 - Math.exp(-Math.min(now - this.last, 64) / CATCH_UP_MS));
    this.last = now;
    if (!next || modelDistance(next, target) < ARRIVED) {
      this.arrive(target);
      return;
    }
    this.shown = next;
    this.paint(next, false);
    this.raf = window.requestAnimationFrame(this.step);
  };

  private arrive(target: ResolvedModel): void {
    this.stop();
    this.shown = target;
    this.paint(target, true);
  }

  private stop(): void {
    if (this.raf !== null) window.cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  private measure(): number {
    return Math.max(MIN_WIDTH, Math.floor(this.frame.clientWidth) || FALLBACK_WIDTH);
  }

  /** Draws `model` as it is. Hover is added only for a plot at rest, since it is rebuilt with every frame. */
  private paint(model: ResolvedModel, interactive: boolean): void {
    const width = this.measure();
    this.width = width;
    const narrow = width < 480;
    const cats = categoriesOf(model.x);
    const range = cats ? ([0, cats.length] as [number, number]) : (model.x as [number, number]);
    const [x0, x1] = range;
    const [y0, y1] = model.y;
    const margin = { top: 14, right: narrow ? 12 : 20, bottom: model.xLabel ? 46 : 32, left: 0 };
    // Only visible tick labels need room; interpolated range endpoints can have extra decimal places.
    const yTicks = (ph: number) => niceTicks(y0, y1, Math.max(3, Math.round(ph / 50)));
    const widest = Math.max(...yTicks(HEIGHT - margin.top - margin.bottom).map((v) => tickText(v).length));
    margin.left = Math.max(MIN_LEFT_MARGIN, Math.ceil(widest * TICK_CHAR_WIDTH) + TICK_GAP + 4) + (model.yLabel ? Y_TITLE_WIDTH : 0);
    const pw = width - margin.left - margin.right;
    // Category names wrap to their slot, or tilt when a word will not fit, so neighbours never run together.
    const labels = cats ? this.categoryLabels(cats, pw / cats.length) : null;
    if (labels) margin.bottom = labels.tilted ? 62 : 20 + 13 * Math.max(...labels.lines.map((l) => l.length));
    const ph = HEIGHT - margin.top - margin.bottom;
    const sx = (x: number) => margin.left + ((x - x0) / (x1 - x0)) * pw;
    const sy = (y: number) => margin.top + (1 - (y - y0) / (y1 - y0)) * ph;

    const root = this.canvas;
    root.replaceChildren();
    this.tip.hidden = true;
    svg('title', {}, root, model.yLabel ? `Plot of ${model.yLabel}` : 'Plot');
    for (const [name, value] of Object.entries({ viewBox: `0 0 ${width} ${HEIGHT}`, width, height: HEIGHT })) root.setAttribute(name, String(value));

    const colors = this.assignColors(model.layers);
    this.drawLegend(model, colors);

    for (const v of yTicks(ph)) {
      svg('line', { x1: margin.left, x2: margin.left + pw, y1: sy(v), y2: sy(v), class: v === 0 ? 'clew-plot-axis' : 'clew-plot-grid' }, root);
      svg('text', { x: margin.left - TICK_GAP, y: sy(v) + 4, 'text-anchor': 'end', class: 'clew-plot-tick' }, root, tickText(v));
    }
    svg('line', { x1: margin.left, x2: margin.left + pw, y1: margin.top + ph, y2: margin.top + ph, class: 'clew-plot-axis' }, root);
    if (!cats) {
      for (const v of niceTicks(x0, x1, narrow ? 4 : 7)) svg('text', { x: sx(v), y: margin.top + ph + 17, 'text-anchor': 'middle', class: 'clew-plot-tick' }, root, tickText(v));
    }
    if (model.yLabel) svg('text', { x: 0, y: 0, 'text-anchor': 'middle', transform: `translate(12 ${margin.top + ph / 2}) rotate(-90)`, class: 'clew-plot-tick clew-plot-title' }, root, model.yLabel);
    if (model.xLabel) svg('text', { x: margin.left + pw / 2, y: HEIGHT - 6, 'text-anchor': 'middle', class: 'clew-plot-tick clew-plot-title' }, root, model.xLabel);

    const clipId = `clew-plot-clip-${++sequence}`;
    // The clip leaves room for half a stroke, so a line running along an edge is not cut in half.
    svg('rect', { x: margin.left - 2, y: margin.top - 2, width: pw + 4, height: ph + 4 }, svg('clipPath', { id: clipId }, svg('defs', {}, root)));
    const data = svg('g', { 'clip-path': `url(#${clipId})` }, root);
    const path = (points: readonly [number, number][]) => 'M' + points.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join('L');

    model.layers.forEach((layer, index) => {
      const color = colors[index]!;
      if (layer.kind === 'area') {
        let target = data;
        if (layer.from !== undefined || layer.to !== undefined) {
          const left = sx(Math.max(x0, layer.from ?? x0));
          const right = sx(Math.min(x1, layer.to ?? x1));
          const id = `${clipId}-area-${index}`;
          svg('rect', { x: left, y: margin.top, width: Math.max(0, right - left), height: ph }, svg('clipPath', { id }, svg('defs', {}, root)));
          target = svg('g', { 'clip-path': `url(#${id})` }, data);
        }
        const lower = layer.lower ? runs(layer.lower).flat() : null;
        for (const run of runs(layer.points)) {
          const first = run[0]!;
          const last = run[run.length - 1]!;
          const back = lower
            ? lower.filter(([x]) => x >= first[0] && x <= last[0]).reverse()
            : [[last[0], layer.base], [first[0], layer.base]] as [number, number][];
          if (!back.length) continue;
          svg('path', { d: `${path(run)}L${path(back).slice(1)}Z`, fill: color, 'fill-opacity': 0.18, class: 'clew-plot-area' }, target);
        }
      } else if (layer.kind === 'line') {
        const defined = runs(layer.points);
        for (const run of defined) svg('path', { d: path(run), stroke: color, class: 'clew-plot-line' }, data);
        // A short line is data, not a sampled curve, so each point is marked where the data actually is.
        const points = defined.flat();
        if (points.length <= MARKED_POINTS) {
          for (const [x, y] of points) if (x >= x0 && x <= x1 && y >= y0 && y <= y1) svg('circle', { cx: sx(x), cy: sy(y), r: 3.5, fill: color, class: 'clew-plot-marker' }, root);
        }
      }
    });

    model.layers.forEach((layer, index) => {
      if (layer.kind === 'bars' && cats) this.drawBars(layer, colors[index]!, cats, labels!, { margin, pw, ph, sy });
    });

    model.layers.forEach((layer, index) => {
      const color = colors[index]!;
      if (layer.kind === 'rule') {
        const vertical = layer.axis === 'x';
        const at = vertical ? sx(layer.at) : sy(layer.at);
        svg('line', vertical ? { x1: at, x2: at, y1: margin.top, y2: margin.top + ph, stroke: color, class: 'clew-plot-rule' } : { x1: margin.left, x2: margin.left + pw, y1: at, y2: at, stroke: color, class: 'clew-plot-rule' }, root);
        if (layer.label) this.text(root, vertical ? at + 6 : margin.left + pw - 4, vertical ? margin.top + 12 : at - 6, layer.label, vertical ? 'start' : 'end', true);
      } else if (layer.kind === 'dot') {
        svg('circle', { cx: sx(layer.x), cy: sy(layer.y), r: 5, fill: color, class: 'clew-plot-dot' }, root);
        if (layer.label) this.dotLabel(root, model.layers, sx, sy, sx(layer.x), sy(layer.y), layer.label, layer.x > (x0 + x1) / 2);
      } else if (layer.kind === 'note') {
        this.text(root, sx(layer.x), sy(layer.y) - 8, layer.text, 'middle', false);
      }
    });

    if (!cats && interactive) this.addHover(model, colors, { x0, x1, y0, y1, margin, pw, ph, sx, sy });
  }

  /** Lines, areas and bars take the next series colour unless the model names one; a dot or rule defaults to the ink. */
  private assignColors(layers: readonly Layer[]): string[] {
    let next = 1;
    return layers.map((layer) => {
      if (layer.kind === 'note') return 'var(--text-normal)';
      if (layer.series !== undefined) return seriesColor(layer.series);
      if (layer.kind === 'dot') return 'var(--text-normal)';
      if (layer.kind === 'rule') return 'var(--text-muted)';
      return seriesColor(next++);
    });
  }

  private drawLegend({ layers, yLabel }: PlotModel, colors: readonly string[]): void {
    this.legend.replaceChildren();
    const seen = new Set<string>();
    layers.forEach((layer, index) => {
      // A dot or a rule writes its label on the plot, so only layers with a swatch to explain are listed.
      if (layer.kind === 'note' || layer.kind === 'dot' || layer.kind === 'rule' || !layer.label || seen.has(layer.label)) return;
      if (layer.kind === 'bars' && layer.mode === 'waterfall') return;
      seen.add(layer.label);
      this.legend.append(key(layer.label, colors[index]!, layer.kind));
    });
    if (layers.some((layer) => layer.kind === 'bars' && layer.mode === 'waterfall')) {
      for (const [label, color] of [['Total', 'var(--clew-series-1)'], ['Increase', 'var(--color-green)'], ['Decrease', 'var(--color-red)']] as const) {
        this.legend.append(key(label, color, 'bars'));
      }
    }
    // A single entry the y-axis title already names only repeats it.
    const only = this.legend.childElementCount === 1 ? this.legend.textContent!.toLowerCase() : null;
    if (only && yLabel?.toLowerCase().includes(only)) this.legend.replaceChildren();
  }

  /** Labels a dot in the first corner around it that no line crosses, starting on the side with more room. */
  private dotLabel(root: Element, layers: readonly Layer[], sx: (x: number) => number, sy: (y: number) => number, cx: number, cy: number, label: string, pastMiddle: boolean): void {
    const width = label.length * TICK_CHAR_WIDTH;
    const lines = layers.flatMap((l) => (l.kind === 'line' || l.kind === 'area' ? runs(l.points).map((run) => run.map(([x, y]) => [sx(x), sy(y)] as const)) : []));
    const crossed = (left: number, top: number) => lines.some((run) => run.some(([x, y], i) => {
      const [px, py] = run[i - 1] ?? [x, y];
      // Samples along each segment, so a steep stretch between two points still counts.
      for (let t = 0; t <= 1; t += 0.25) {
        const qx = px + (x - px) * t;
        const qy = py + (y - py) * t;
        if (qx >= left - 2 && qx <= left + width + 2 && qy >= top - 2 && qy <= top + 16) return true;
      }
      return false;
    }));
    const corners = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([h, v]) => [pastMiddle ? h : -h, v] as const);
    const [h, v] = corners.find(([h, v]) => !crossed(h < 0 ? cx - 10 - width : cx + 10, v < 0 ? cy - 21 : cy + 6)) ?? corners[0];
    this.text(root, cx + h * 10, v < 0 ? cy - 9 : cy + 18, label, h < 0 ? 'end' : 'start', true);
  }

  private text(parent: Element, x: number, y: number, text: string, anchor: 'start' | 'middle' | 'end', strong: boolean): void {
    svg('text', { x, y, 'text-anchor': anchor, class: `clew-plot-label${strong ? ' is-strong' : ''}` }, parent, text);
  }

  private yDomain(model: PlotModel): [number, number] {
    const categories = categoriesOf(model.x) !== null;
    let low = Infinity;
    let high = -Infinity;
    const see = (v: number | null | undefined) => {
      if (v == null || !Number.isFinite(v) || Math.abs(v) > 1e9) return;
      low = Math.min(low, v);
      high = Math.max(high, v);
    };
    for (const layer of model.layers) {
      if (layer.kind === 'line') layer.points.forEach((p) => see(p[1]));
      else if (layer.kind === 'area') { layer.points.forEach((p) => see(p[1])); layer.lower?.forEach((p) => see(p[1])); if (!layer.lower) see(layer.base); }
      else if (layer.kind === 'bars') { for (const step of barSteps(layer.values, layer.mode)) { see(step.from); see(step.to); } see(0); }
      else if (layer.kind === 'dot') see(layer.y);
      else if (layer.kind === 'rule' && layer.axis === 'y') see(layer.at);
      else if (layer.kind === 'note' && !categories) see(layer.y);
    }
    if (!Number.isFinite(low)) return [0, 1];
    const pad = (high - low) * 0.08;
    // Data that never goes below zero keeps zero as the floor, so a baseline does not float above the axis.
    return niceDomain(low >= 0 ? 0 : low - pad, high <= 0 ? 0 : high + pad);
  }

  private categoryLabels(cats: string[], band: number): { lines: string[][]; tilted: boolean } {
    const wrapped = cats.map((name) => wrapLabel(name, Math.max(4, Math.floor(band / 5.8))));
    const tilted = wrapped.some((w) => !w.fits);
    return { tilted, lines: tilted ? cats.map((name) => [name.length > 14 ? `${name.slice(0, 13)}…` : name]) : wrapped.map((w) => w.lines) };
  }

  private drawBars(layer: Extract<Layer, { kind: 'bars' }>, color: string, cats: string[], labels: { lines: string[][]; tilted: boolean }, g: { margin: { top: number; left: number }; pw: number; ph: number; sy: (y: number) => number }): void {
    const steps = barSteps(layer.values, layer.mode).slice(0, cats.length);
    const band = g.pw / cats.length;
    const barWidth = Math.min(28, band * 0.6);
    const centre = (i: number) => g.margin.left + band * (i + 0.5);
    const root = this.canvas;
    const fill = (kind: string) => (kind === 'up' ? 'var(--color-green)' : kind === 'down' ? 'var(--color-red)' : layer.mode === 'waterfall' ? 'var(--clew-series-1)' : color);

    if (layer.mode === 'waterfall') {
      steps.forEach((step, i) => {
        if (i === steps.length - 1) return;
        const level = step.to;
        svg('line', { x1: centre(i) + barWidth / 2, x2: centre(i + 1) - barWidth / 2, y1: g.sy(level), y2: g.sy(level), class: 'clew-plot-grid' }, root);
      });
    }
    steps.forEach((step, i) => {
      const top = g.sy(Math.max(step.from, step.to));
      const bottom = g.sy(Math.min(step.from, step.to));
      svg('rect', { x: centre(i) - barWidth / 2, y: top, width: barWidth, height: Math.max(1.5, bottom - top), rx: 2, fill: fill(step.kind), class: 'clew-plot-bar', 'data-from': step.from, 'data-to': step.to }, root);
      const shown = step.kind === 'up' ? `+${readout(step.value)}` : readout(step.value);
      const above = step.to >= step.from;
      this.text(root, centre(i), above ? top - 6 : bottom + 15, shown, 'middle', true);
      const name = cats[i]!;
      labels.lines[i]!.forEach((line, k) => {
        const y = g.margin.top + g.ph + 16 + k * 13;
        svg('text', labels.tilted
          ? { x: centre(i) + 4, y: y - 4, 'text-anchor': 'end', transform: `rotate(-35 ${centre(i) + 4} ${y - 4})`, class: 'clew-plot-tick' }
          : { x: centre(i), y, 'text-anchor': 'middle', class: 'clew-plot-tick' }, root, line);
      });

      const hit = svg('rect', { x: centre(i) - band / 2, y: g.margin.top, width: band, height: g.ph, class: 'clew-plot-hit' }, root);
      const show = (e: Event) => this.showTip((e as PointerEvent).clientX, (e as PointerEvent).clientY, name, [[color, layer.label ?? '', shown]]);
      hit.addEventListener('pointerenter', show);
      hit.addEventListener('pointermove', show);
      hit.addEventListener('pointerleave', () => { this.tip.hidden = true; });
    });
  }

  private addHover(
    model: PlotModel,
    colors: readonly string[],
    g: { x0: number; x1: number; y0: number; y1: number; margin: { top: number; left: number }; pw: number; ph: number; sx: (x: number) => number; sy: (y: number) => number },
  ): void {
    const lines = model.layers.flatMap((layer, index) => (layer.kind === 'line' && layer.label ? [{ layer, color: colors[index]! }] : []));
    if (!lines.length) return;
    const root = this.canvas;
    const cross = svg('line', { y1: g.margin.top, y2: g.margin.top + g.ph, class: 'clew-plot-cross', visibility: 'hidden' }, root);
    const dots = lines.map(({ color }) => svg('circle', { r: 5, fill: color, class: 'clew-plot-dot', visibility: 'hidden' }, root));
    const overlay = svg('rect', { x: g.margin.left, y: g.margin.top, width: g.pw, height: g.ph, class: 'clew-plot-hit' }, root);
    const hide = () => {
      cross.setAttribute('visibility', 'hidden');
      dots.forEach((dot) => dot.setAttribute('visibility', 'hidden'));
      this.tip.hidden = true;
    };
    overlay.addEventListener('pointermove', (event) => {
      const e = event as PointerEvent;
      const at = g.x0 + ((e.clientX - this.canvas.getBoundingClientRect().left - g.margin.left) / g.pw) * (g.x1 - g.x0);
      let anchor: number | null = null;
      const rows: [string, string, string][] = [];
      lines.forEach(({ layer, color }, i) => {
        const near = nearest(layer.points, at);
        if (!near) { dots[i]!.setAttribute('visibility', 'hidden'); return; }
        anchor ??= near[0];
        const inside = near[1] !== null && Number.isFinite(near[1]) && near[1] >= g.y0 && near[1] <= g.y1;
        dots[i]!.setAttribute('visibility', inside ? 'visible' : 'hidden');
        if (near[1] !== null && Number.isFinite(near[1])) { dots[i]!.setAttribute('cx', String(g.sx(near[0]))); dots[i]!.setAttribute('cy', String(g.sy(near[1]))); }
        rows.push([color, layer.label!, near[1] === null || !Number.isFinite(near[1]) ? '—' : readout(near[1])]);
      });
      if (anchor === null) return hide();
      cross.setAttribute('x1', String(g.sx(anchor)));
      cross.setAttribute('x2', String(g.sx(anchor)));
      cross.setAttribute('visibility', 'visible');
      this.showTip(e.clientX, e.clientY, readout(anchor), rows);
    });
    overlay.addEventListener('pointerleave', hide);
  }

  private showTip(clientX: number, clientY: number, heading: string, rows: [string, string, string][]): void {
    const tip = this.tip;
    tip.replaceChildren();
    const head = document.createElement('div');
    head.className = 'clew-plot-tip-head';
    head.textContent = heading;
    tip.append(head);
    for (const [color, label, value] of rows) {
      const row = document.createElement('div');
      const strong = document.createElement('b');
      strong.textContent = value;
      row.append(swatch('dot', color), label ? `${label}: ` : '', strong);
      tip.append(row);
    }
    tip.hidden = false;
    const frame = this.frame.getBoundingClientRect();
    let left = clientX - frame.left + 14;
    let top = clientY - frame.top + 14;
    if (left + tip.offsetWidth > this.frame.clientWidth) left = clientX - frame.left - tip.offsetWidth - 14;
    if (top + tip.offsetHeight > HEIGHT) top = clientY - frame.top - tip.offsetHeight - 14;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${Math.max(0, top)}px`;
  }
}

/** The point whose x is closest to `at`; the points run left to right. */
function nearest(points: readonly Point[], at: number): Point | null {
  if (!points.length) return null;
  let low = 0;
  let high = points.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (points[middle]![0] < at) low = middle;
    else high = middle;
  }
  return Math.abs(points[low]![0] - at) <= Math.abs(points[high]![0] - at) ? points[low]! : points[high]!;
}
