import type { Layer, PlotModel, Point } from '@/renderer/figure/plot/PlotChart';

/** A plot whose vertical range is fixed, so a change of it can be animated too. */
export type ResolvedModel = PlotModel & { y: [number, number] };

/** The category names when the x axis is a list of them, null when it is a numeric range. */
export const categoriesOf = (x: PlotModel['x']): string[] | null => (typeof x[0] === 'string' ? (x as string[]) : null);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function sameShape(a: ResolvedModel, b: ResolvedModel): boolean {
  const aCats = categoriesOf(a.x);
  const bCats = categoriesOf(b.x);
  if (!aCats !== !bCats || (aCats && aCats.join('\u0000') !== bCats!.join('\u0000'))) return false;
  if (a.layers.length !== b.layers.length) return false;
  return a.layers.every((layer, i) => {
    const other = b.layers[i];
    if (layer.kind !== other.kind) return false;
    if (layer.kind === 'area' && other.kind === 'area') return layer.points.length === other.points.length && layer.lower?.length === other.lower?.length;
    if (layer.kind === 'line' && other.kind === 'line') return layer.points.length === other.points.length;
    if (layer.kind === 'bars' && other.kind === 'bars') return layer.values.length === other.values.length;
    if (layer.kind === 'rule' && other.kind === 'rule') return layer.axis === other.axis;
    return true;
  });
}

function mixPoints(a: Point[], b: Point[], t: number): Point[] {
  return b.map((p, i): Point => {
    const q = a[i];
    return [Number.isFinite(q[0]) && Number.isFinite(p[0]) ? lerp(q[0], p[0], t) : p[0], q[1] !== null && p[1] !== null ? lerp(q[1], p[1], t) : p[1]];
  });
}

function mixLayer(a: Layer, b: Layer, t: number): Layer {
  if (a.kind === 'line' && b.kind === 'line') return { ...b, points: mixPoints(a.points, b.points, t) };
  if (a.kind === 'area' && b.kind === 'area') {
    const bound = (p?: number, q?: number) => (p !== undefined && q !== undefined ? lerp(p, q, t) : q);
    return { ...b, points: mixPoints(a.points, b.points, t), base: lerp(a.base, b.base, t), lower: b.lower && a.lower && mixPoints(a.lower, b.lower, t), from: bound(a.from, b.from), to: bound(a.to, b.to) };
  }
  if (a.kind === 'bars' && b.kind === 'bars') return { ...b, values: b.values.map((v, i) => (v !== null && a.values[i] !== null ? lerp(a.values[i], v, t) : v)) };
  if (a.kind === 'dot' && b.kind === 'dot') return { ...b, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  if (a.kind === 'rule' && b.kind === 'rule') return { ...b, at: lerp(a.at, b.at, t) };
  if (a.kind === 'note' && b.kind === 'note') return { ...b, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  return b;
}

/** The plot `t` of the way from `a` to `b` (0 is `a`), or null when the two differ in shape and one must replace the other. */
export function mixModel(a: ResolvedModel, b: ResolvedModel, t: number): ResolvedModel | null {
  if (!sameShape(a, b)) return null;
  const x = categoriesOf(b.x) ? b.x : ([lerp(a.x[0] as number, b.x[0] as number, t), lerp(a.x[1] as number, b.x[1] as number, t)] as [number, number]);
  return { ...b, x, y: [lerp(a.y[0], b.y[0], t), lerp(a.y[1], b.y[1], t)], layers: b.layers.map((layer, i) => mixLayer(a.layers[i], layer, t)) };
}

/** The largest change between two plots of the same shape, as a share of the axis it moves along. */
export function modelDistance(a: ResolvedModel, b: ResolvedModel): number {
  const ySpan = Math.abs(b.y[1] - b.y[0]) || 1;
  const xSpan = categoriesOf(b.x) ? 1 : Math.abs((b.x[1] as number) - (b.x[0] as number)) || 1;
  let worst = Math.max(Math.abs(a.y[0] - b.y[0]), Math.abs(a.y[1] - b.y[1])) / ySpan;
  const see = (p: number | null, q: number | null, span: number) => {
    if (p !== null && q !== null && Number.isFinite(p) && Number.isFinite(q)) worst = Math.max(worst, Math.abs(p - q) / span);
  };
  if (typeof b.x[0] !== 'string') {
    see(a.x[0] as number, b.x[0], xSpan);
    see(a.x[1] as number, b.x[1] as number, xSpan);
  }
  b.layers.forEach((layer, i) => {
    const old = a.layers[i];
    if ((layer.kind === 'line' || layer.kind === 'area') && old.kind === layer.kind) {
      layer.points.forEach((p, k) => { see(old.points[k][0], p[0], xSpan); see(old.points[k][1], p[1], ySpan); });
      if (layer.kind === 'area') {
        const before = old as typeof layer;
        see(before.base, layer.base, ySpan);
        layer.lower?.forEach((p, k) => { see(before.lower![k][0], p[0], xSpan); see(before.lower![k][1], p[1], ySpan); });
        see(before.from ?? null, layer.from ?? null, xSpan);
        see(before.to ?? null, layer.to ?? null, xSpan);
      }
    } else if (layer.kind === 'bars' && old.kind === 'bars') layer.values.forEach((v, k) => see(old.values[k], v, ySpan));
    else if (layer.kind === 'dot' && old.kind === 'dot') { see(old.x, layer.x, xSpan); see(old.y, layer.y, ySpan); }
    else if (layer.kind === 'rule' && old.kind === 'rule') see(old.at, layer.at, layer.axis === 'x' ? xSpan : ySpan);
    else if (layer.kind === 'note' && old.kind === 'note') { see(old.x, layer.x, xSpan); see(old.y, layer.y, ySpan); }
  });
  return worst;
}
