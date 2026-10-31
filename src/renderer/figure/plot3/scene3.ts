import { LIMITS, type Plot3Model, type Point3, type Tag, type View } from '@/renderer/figure/FigureData';
import type { Rgb } from '@/renderer/figure/figureTex';
import { formatFigure } from '@/renderer/figure/formatFigure';
import { isPlain } from '@/renderer/figure/figureText';
import { niceTicks, tickText } from '@/renderer/figure/plot/plotMath';

export type Xy = [number, number];
export interface Size { width: number; height: number }
/** The height colour map, low to high; read from the theme by the chart. */
export interface Colours { ramp: readonly Rgb[] }

export interface Face { pts: Xy[]; fill: string; dim: boolean }
/** A text's estimated box in pixels, top left and size. */
export interface TextBox { x: number; y: number; w: number; h: number }
/** `text` is empty when the label would collide with another and only the tick mark is drawn. */
export interface Tick { at: Xy; to: Xy; text: string; textAt: Xy; anchor: Anchor; box: TextBox }
export type Anchor = 'start' | 'middle' | 'end';
export type Overlay = { tag?: Tag; label?: string } & (
  | { kind: 'line'; points: Xy[] }
  | { kind: 'arrow'; points: [Xy, Xy] }
  | { kind: 'dot'; at: Xy }
  | { kind: 'note'; at: Xy; text: string }
);

/** What one frame of a 3D Plot draws, in screen pixels: faces in paint order, the box's back edges, ticks and titles, then overlays. */
export interface Scene3 {
  faces: Face[];
  box: [Xy, Xy][];
  /** The edge each axis carries its ticks on, from its low end to its high end. */
  axes: { axis: 'x' | 'y' | 'z'; from: Xy; to: Xy }[];
  ticks: Tick[];
  titles: { at: Xy; text: string; anchor: Anchor; box: TextBox }[];
  overlays: Overlay[];
}

/** A face in box coordinates: each axis runs over `[-L/2, L/2]` for its side length L. */
export interface MeshFace { v: Point3[]; centroid: Point3; fill: string; dim: boolean }
/** `grid`, for a Plot whose one surface is a graph, holds each cell's face (row-major, -1 for a hole), so faces paint in grid order. */
export interface Mesh { faces: MeshFace[]; grid: { n: number; cells: Int32Array } | null }

const MARGIN = { side: 56, top: 12, bottom: 28 };
/** A box without `equal` is a little lower than wide, as plotting tools draw it, so it fills a landscape frame. */
const Z_SIDE = 0.75;
const TICK_PX = 12;
const TITLE_PX = 13;
const CIRCLE_POINTS = 96;
const rad = (degrees: number): number => (degrees * Math.PI) / 180;

/** Each axis's side of the box: 1, or with `equal` its span over the longest span. */
function sides(model: Plot3Model): Point3 {
  const spans = [model.x, model.y, model.z].map(([lo, hi]) => hi - lo);
  if (!model.equal) return [1, 1, Z_SIDE];
  const longest = Math.max(...spans);
  return [spans[0] / longest, spans[1] / longest, spans[2] / longest];
}

/** Data coordinates to box coordinates. */
function toBox(model: Plot3Model): (p: Point3) => Point3 {
  const L = sides(model);
  const ranges = [model.x, model.y, model.z];
  return (p) => [0, 1, 2].map((k) => ((p[k] - ranges[k][0]) / (ranges[k][1] - ranges[k][0]) - 0.5) * L[k]) as unknown as Point3;
}

/** The direction the viewer looks in, in box coordinates; a larger dot product with it is farther away. */
function forward({ azimuth, elevation }: View): Point3 {
  const a = rad(azimuth);
  const e = rad(elevation);
  return [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), -Math.sin(e)];
}

/**
 * Box coordinates to screen pixels: orthographic, z up, turned by the azimuth and tilted by the elevation. The scale fits
 * the box at every angle, so turning it never zooms.
 */
export function projection(model: Plot3Model, view: View, size: Size): (p: Point3) => Xy {
  const [lx, ly, lz] = sides(model);
  const flat = Math.hypot(lx, ly) / 2;
  const whole = Math.hypot(lx, ly, lz) / 2;
  const width = Math.max(1, size.width - 2 * MARGIN.side);
  const height = Math.max(1, size.height - MARGIN.top - MARGIN.bottom);
  const scale = Math.min(width / (2 * flat), height / (2 * whole));
  const cx = size.width / 2;
  const cy = MARGIN.top + height / 2;
  const a = rad(view.azimuth);
  const e = rad(view.elevation);
  const [ca, sa, ce, se] = [Math.cos(a), Math.sin(a), Math.cos(e), Math.sin(e)];
  return ([x, y, z]) => [cx + scale * (x * ca - y * sa), cy - scale * (z * ce + (x * sa + y * ca) * se)];
}

function colourAt(ramp: readonly Rgb[], t: number): string {
  if (!ramp.length) return 'rgb(128, 128, 128)';
  const at = Math.max(0, Math.min(1, t)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(at));
  if (i < 0) return `rgb(${ramp[0].join(', ')})`;
  const f = at - i;
  return `rgb(${[0, 1, 2].map((k) => Math.round(ramp[i][k] + (ramp[i + 1][k] - ramp[i][k]) * f)).join(', ')})`;
}

/** Clips a polygon to the box, one face of the box at a time. */
function clip(polygon: Point3[], L: Point3): Point3[] {
  let out = polygon;
  for (let k = 0; k < 3 && out.length; k += 1) {
    for (const sign of [-1, 1]) {
      const limit = (sign * L[k]) / 2;
      const inside = (p: Point3): boolean => sign * p[k] <= sign * limit + 1e-9;
      const next: Point3[] = [];
      out.forEach((p, i) => {
        const q = out[(i + 1) % out.length];
        if (inside(p)) next.push(p);
        if (inside(p) !== inside(q)) {
          const t = (limit - p[k]) / (q[k] - p[k]);
          const cut = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
          // Interpolated between huge values (1e307), the cut misses the plane by the values' rounding error; it lies on it.
          cut[k] = limit;
          next.push(cut as unknown as Point3);
        }
      });
      out = next;
    }
  }
  return out;
}

const meshes = new WeakMap<Plot3Model, { colours: Colours; mesh: Mesh }>();

/** The model's surfaces as faces in box coordinates, clipped and coloured by height. Kept per model, since it does not depend on the view. */
export function meshOf(model: Plot3Model, colours: Colours): Mesh {
  const kept = meshes.get(model);
  if (kept?.colours === colours) return kept.mesh;
  const L = sides(model);
  const box = toBox(model);
  const n = LIMITS.surfaceCells;
  const side = n + 1;
  const faces: MeshFace[] = [];
  const surfaces = model.children.filter((layer) => layer.type === 'Fn');
  const graph = surfaces.length === 1 && 'zs' in surfaces[0];
  const cells = new Int32Array(n * n).fill(-1);
  for (const surface of surfaces) {
    // Each sample in box coordinates, row by row; four faces share each.
    const vertices = Array.from({ length: side * side }, (_, at): Point3 | null => {
      const [i, j] = [at % side, Math.floor(at / side)];
      if ('zs' in surface) {
        const z = surface.zs[at];
        return z === null ? null : box([surface.x[0] + ((surface.x[1] - surface.x[0]) * i) / n, surface.y[0] + ((surface.y[1] - surface.y[0]) * j) / n, z]);
      }
      const p = surface.pts[at];
      return p === null ? null : box(p);
    });
    const dim = surface.tag === 'dim';
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        const at = j * side + i;
        const corners = [vertices[at], vertices[at + 1], vertices[at + side + 1], vertices[at + side]];
        if (corners.some((c) => c === null)) continue;
        const quad = corners as Point3[];
        const outside = quad.some((p) => p.some((c, k) => Math.abs(c) > L[k] / 2 + 1e-9));
        const v = outside ? clip(quad, L) : quad;
        if (v.length < 3) continue;
        const centroid = [0, 1, 2].map((k) => v.reduce((sum, p) => sum + p[k], 0) / v.length) as unknown as Point3;
        if (graph) cells[j * n + i] = faces.length;
        faces.push({ v, centroid, fill: colourAt(colours.ramp, centroid[2] / L[2] + 0.5), dim });
      }
    }
  }
  const mesh: Mesh = { faces, grid: graph ? { n, cells } : null };
  meshes.set(model, { colours, mesh });
  return mesh;
}

/**
 * The order to paint faces in, far to near. One graph is a height field: walking its grid from the far corner, along the
 * axis the view runs closer to first, never paints a face over one in front of it. Anything else sorts by centroid depth.
 */
export function paintOrder(mesh: Mesh, view: View): number[] {
  const f = forward(view);
  if (!mesh.grid) {
    const depth = mesh.faces.map((face) => face.centroid[0] * f[0] + face.centroid[1] * f[1] + face.centroid[2] * f[2]);
    return mesh.faces.map((_, i) => i).sort((p, q) => depth[q] - depth[p]);
  }
  const { n, cells } = mesh.grid;
  const walk = (farHigh: boolean): number[] => Array.from({ length: n }, (_, k) => (farHigh ? n - 1 - k : k));
  const is = walk(f[0] > 0);
  const js = walk(f[1] > 0);
  const order: number[] = [];
  const add = (i: number, j: number): void => {
    const face = cells[j * n + i];
    if (face >= 0) order.push(face);
  };
  if (Math.abs(f[0]) >= Math.abs(f[1])) for (const i of is) for (const j of js) add(i, j);
  else for (const j of js) for (const i of is) add(i, j);
  return order;
}

const CORNERS: Point3[] = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z): Point3 => [x, y, z])));
const AXES = ['x', 'y', 'z'] as const;

/**
 * A text's width in pixels at `px`, estimated from what it shows: a TeX command counts as one glyph, and braces, `$`,
 * `^`, `_` and spacing commands as none. The chart passes a measure of the rendered text once it has one.
 */
export function textWidth(text: string, px: number): number {
  const shown = text.replace(/\\(displaystyle|textstyle|left|right|[!,;: ])/g, '').replace(/\\[A-Za-z]+|\\./g, 'x').replace(/[{}$^_]/g, '');
  return shown.length * px * 0.58;
}

export function scene3(model: Plot3Model, view: View, size: Size, colours: Colours, measure: (text: string, px: number) => number = textWidth): Scene3 {
  const L = sides(model);
  const toScreen = projection(model, view, size);
  const box = toBox(model);
  const corner = (signs: Point3): Xy => toScreen([(signs[0] * L[0]) / 2, (signs[1] * L[1]) / 2, (signs[2] * L[2]) / 2]);
  const f = forward(view);

  const mesh = meshOf(model, colours);
  const faces = paintOrder(mesh, view).map((i): Face => {
    const face = mesh.faces[i];
    return { pts: face.v.map(toScreen), fill: face.fill, dim: face.dim };
  });

  // An edge joins two corners that differ in one sign; it is a back edge when it lies on a face whose normal points away.
  const back = [0, 1, 2].map((k) => (f[k] >= 0 ? 1 : -1));
  const boxEdges: [Xy, Xy][] = [];
  for (const p of CORNERS) for (const q of CORNERS) {
    const differ = [0, 1, 2].filter((k) => p[k] !== q[k]);
    if (differ.length !== 1 || p[differ[0]] > q[differ[0]]) continue;
    if ([0, 1, 2].some((k) => k !== differ[0] && p[k] === back[k])) boxEdges.push([corner(p), corner(q)]);
  }

  const centre = toScreen([0, 0, 0]);
  const axes: Scene3['axes'] = [];
  const ticks: Tick[] = [];
  const titles: Scene3['titles'] = [];
  const labels = [model.xLabel, model.yLabel, model.zLabel];
  AXES.forEach((axis, k) => {
    // x and y carry ticks on the bottom edge lowest on screen; z on the vertical edge furthest left, the nearer of two.
    const others = [0, 1, 2].filter((m) => m !== k);
    const candidates = k < 2 ? [-1, 1].map((s) => others.map((m) => (m === 2 ? -1 : s))) : [-1, 1].flatMap((s) => [-1, 1].map((t) => [s, t]));
    const edges = candidates.map((signs) => {
      const at = (end: number): Point3 => { const p = [0, 0, 0]; p[k] = end; others.forEach((m, i) => { p[m] = signs[i]; }); return p as unknown as Point3; };
      return { from: corner(at(-1)), to: corner(at(1)), depth: others.reduce((sum, m, i) => sum + signs[i] * L[m] * f[m], 0) };
    });
    const mid = (e: { from: Xy; to: Xy }): Xy => [(e.from[0] + e.to[0]) / 2, (e.from[1] + e.to[1]) / 2];
    const best = edges.reduce((a, b) => {
      const [ma, mb] = [mid(a), mid(b)];
      const score = k < 2 ? mb[1] - ma[1] : ma[0] - mb[0];
      return score > 0.5 || (Math.abs(score) <= 0.5 && b.depth < a.depth) ? b : a;
    });
    axes.push({ axis, from: best.from, to: best.to });
    const length = Math.hypot(best.to[0] - best.from[0], best.to[1] - best.from[1]);
    if (length < 24) return;
    const along: Xy = [(best.to[0] - best.from[0]) / length, (best.to[1] - best.from[1]) / length];
    const m = mid(best);
    let out: Xy = [-along[1], along[0]];
    if (out[0] * (m[0] - centre[0]) + out[1] * (m[1] - centre[1]) < 0) out = [-out[0], -out[1]];
    const anchor: Anchor = out[0] > 0.35 ? 'start' : out[0] < -0.35 ? 'end' : 'middle';
    const [lo, hi] = [model.x, model.y, model.z][k];
    const values = niceTicks(lo, hi, Math.max(2, Math.min(6, Math.round(length / 50))));
    let widest = 0;
    for (const value of values) {
      const t = (value - lo) / (hi - lo);
      const at: Xy = [best.from[0] + (best.to[0] - best.from[0]) * t, best.from[1] + (best.to[1] - best.from[1]) * t];
      const text = tickText(value);
      widest = Math.max(widest, text.length);
      const textAt: Xy = [at[0] + out[0] * 12, at[1] + out[1] * 12 + 4];
      ticks.push({ at, to: [at[0] + out[0] * 5, at[1] + out[1] * 5], text, textAt, anchor, box: textBox(textAt, measure(text, TICK_PX), anchor, TICK_PX) });
    }
    const label = labels[k];
    if (!label) return;
    const reach = 22 + (anchor === 'middle' ? 8 : widest * 7);
    const at: Xy = [m[0] + out[0] * reach, m[1] + out[1] * reach + 4];
    titles.push({ at, text: label, anchor, box: textBox(at, measure(label, TITLE_PX), anchor, TITLE_PX) });
  });
  layoutText(titles, ticks, size, measure);

  const overlays = model.children.flatMap((layer): Overlay[] => {
    const marks = layer.tag ? { tag: layer.tag } : {};
    const label = 'label' in layer && layer.label !== undefined ? formatFigure(layer.label) : undefined;
    const lines = (points: readonly Point3[]): Overlay[] => clipLine(points.map(box), L).map((run, i) => ({ kind: 'line', points: run.map(toScreen), ...marks, ...(i === 0 && label ? { label } : {}) }));
    switch (layer.type) {
      case 'Shape':
        return layer.pts.length < 2 ? [] : lines(layer.closed ? [...layer.pts, layer.pts[0]] : layer.pts);
      case 'Segment':
        return lines([layer.from, layer.to]);
      case 'Vector': {
        const [run] = clipLine([box(layer.from), box(layer.to)], L);
        if (!run) return [];
        // The head stays only when the arrow ends inside the box.
        const kind = inBox(box(layer.to), L) ? 'arrow' : 'line';
        return [{ kind, points: [toScreen(run[0]), toScreen(run[1])], ...marks, ...(label ? { label } : {}) }];
      }
      case 'Circle': {
        const [x, y, z] = layer.at;
        return lines(Array.from({ length: CIRCLE_POINTS + 1 }, (_, i): Point3 => [x + layer.r * Math.cos((2 * Math.PI * i) / CIRCLE_POINTS), y + layer.r * Math.sin((2 * Math.PI * i) / CIRCLE_POINTS), z]));
      }
      case 'Points':
        return layer.pts.map(box).filter((at) => inBox(at, L)).map((at, i): Overlay => ({ kind: 'dot', at: toScreen(at), ...marks, ...(i === 0 && label ? { label } : {}) }));
      case 'Label': {
        const at = box(layer.at);
        return inBox(at, L) ? [{ kind: 'note', at: toScreen(at), text: formatFigure(layer.text), ...marks }] : [];
      }
      case 'Fn':
        return [];
    }
  });

  return { faces, box: boxEdges, axes, ticks, titles, overlays };
}

const SLACK = 1e-9;
const inBox = (p: Point3, L: Point3): boolean => p.every((c, k) => Math.abs(c) <= L[k] / 2 + SLACK);

/**
 * The parts of a polyline inside the box, as runs of points. Each segment is cut to the box (Liang–Barsky); a run ends
 * where the line leaves the box.
 */
export function clipLine(points: readonly Point3[], L: Point3): Point3[][] {
  const runs: Point3[][] = [];
  let run: Point3[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const [p, q] = [points[i - 1], points[i]];
    let t0 = 0;
    let t1 = 1;
    for (let k = 0; k < 3 && t0 <= t1; k += 1) {
      const d = q[k] - p[k];
      const [lo, hi] = [-L[k] / 2 - SLACK, L[k] / 2 + SLACK];
      if (d === 0) {
        if (p[k] < lo || p[k] > hi) t0 = 2;
        continue;
      }
      const [a, b] = [(lo - p[k]) / d, (hi - p[k]) / d];
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
    }
    if (t0 > t1) {
      if (run.length) runs.push(run);
      run = [];
      continue;
    }
    // Clamped, so a cut between huge values lands on the box and not past it by their rounding error.
    const at = (t: number): Point3 => [0, 1, 2].map((k) => Math.max(-L[k] / 2, Math.min(L[k] / 2, p[k] + (q[k] - p[k]) * t))) as unknown as Point3;
    if (!run.length || t0 > 0) {
      if (run.length) runs.push(run);
      run = [at(t0)];
    }
    run.push(at(t1));
    if (t1 < 1) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 1) runs.push(run);
  return runs.filter((r) => r.length > 1);
}

function textBox(at: Xy, w: number, anchor: Anchor, px: number): TextBox {
  return { x: anchor === 'start' ? at[0] : anchor === 'end' ? at[0] - w : at[0] - w / 2, y: at[1] - px + 2, w, h: px + 2 };
}

const overlap = (a: TextBox, b: TextBox): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function shift(title: Scene3['titles'][number], dx: number, dy: number): void {
  title.box.x += dx;
  title.box.y += dy;
  title.at[0] += dx;
  title.at[1] += dy;
}

/**
 * Keeps titles inside the frame and apart from each other, then drops the text of any tick label that would leave the
 * frame or touch a title or a tick label already kept (where two axes meet at a corner, one end label goes).
 */
function layoutText(titles: Scene3['titles'], ticks: Tick[], size: Size, measure: (text: string, px: number) => number): void {
  const inside = (title: Scene3['titles'][number]): void => {
    const { box } = title;
    const dx = box.w > size.width - 4 ? 2 - box.x : Math.max(2 - box.x, Math.min(0, size.width - 2 - (box.x + box.w)));
    const dy = Math.max(2 - box.y, Math.min(0, size.height - 2 - (box.y + box.h)));
    shift(title, dx, dy);
  };
  titles.forEach((title, i) => {
    // A plain title longer than the room on its side of the box is cut short; one with maths cannot be, and is kept whole.
    const [x] = title.at;
    const room = title.anchor === 'end' ? x - 2 : title.anchor === 'start' ? size.width - 2 - x : 2 * Math.min(x - 2, size.width - 2 - x);
    const fits = Math.max(2, Math.floor(room / (TITLE_PX * 0.58)));
    if (title.text.length > fits && isPlain(title.text)) {
      title.text = `${title.text.slice(0, Math.max(1, fits - 1)).trimEnd()}…`;
      title.box = textBox(title.at, measure(title.text, TITLE_PX), title.anchor, TITLE_PX);
    }
    inside(title);
    for (const other of titles.slice(0, i)) {
      if (!overlap(title.box, other.box)) continue;
      const down = title.box.y + title.box.h / 2 >= other.box.y + other.box.h / 2;
      shift(title, 0, down ? other.box.y + other.box.h + 1 - title.box.y : other.box.y - 1 - (title.box.y + title.box.h));
      inside(title);
    }
  });
  const kept: TextBox[] = titles.map((title) => title.box);
  // Tick labels keep a few pixels apart, so the two axis ends at a corner do not read as one number ("2 2").
  const PAD = 4;
  const padded = (box: TextBox): TextBox => ({ x: box.x - PAD, y: box.y, w: box.w + 2 * PAD, h: box.h });
  for (const tick of ticks) {
    const { box } = tick;
    const out = box.x < 0 || box.y < 0 || box.x + box.w > size.width || box.y + box.h > size.height;
    if (out || kept.some((other) => overlap(padded(box), other))) tick.text = '';
    else kept.push(box);
  }
}
