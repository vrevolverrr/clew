import type { Point } from '@/renderer/figure/FigureData';

const unit = (from: Point, to: Point): [number, number] => {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  return [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
};

const degrees = (v: readonly [number, number]): number => (Math.atan2(v[1], v[0]) * 180) / Math.PI;

/** The arc of the smaller angle at `at` between the rays towards `from` and `to`, counter-clockwise from `start` to `end`, with its label outside the arc on the bisector. */
export function angleMark(at: Point, from: Point, to: Point, radius: number): { start: number; end: number; radius: number; label: Point } {
  let start = degrees(unit(at, from));
  let end = degrees(unit(at, to));
  if ((((end - start) % 360) + 360) % 360 > 180) [start, end] = [end, start];
  if (end < start) end += 360;
  const middle = (((start + end) / 2) * Math.PI) / 180;
  const out = radius * 1.7;
  return { start, end, radius, label: [at[0] + out * Math.cos(middle), at[1] + out * Math.sin(middle)] };
}

/** The three outer corners of the square mark at `at`. */
export function rightAngleMark(at: Point, from: Point, to: Point, size: number): [Point, Point, Point] {
  const u = unit(at, from);
  const v = unit(at, to);
  return [
    [at[0] + u[0] * size, at[1] + u[1] * size],
    [at[0] + (u[0] + v[0]) * size, at[1] + (u[1] + v[1]) * size],
    [at[0] + v[0] * size, at[1] + v[1] * size],
  ];
}

/** `n` short marks across the middle of segment a–b, perpendicular to it and `gap` apart. */
export function tickMarks(a: Point, b: Point, n: number, length: number, gap: number): [Point, Point][] {
  const u = unit(a, b);
  const normal = [-u[1], u[0]];
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return Array.from({ length: n }, (_, i) => {
    const shift = (i - (n - 1) / 2) * gap;
    const c = [mid[0] + u[0] * shift, mid[1] + u[1] * shift];
    return [[c[0] - (normal[0] * length) / 2, c[1] - (normal[1] * length) / 2], [c[0] + (normal[0] * length) / 2, c[1] + (normal[1] * length) / 2]];
  });
}

/** A measured length: a line parallel to from–to, `offset` to its left, with a bar at each end and a label beyond the line's middle. */
export function dimensionMark(from: Point, to: Point, offset: number): { line: [Point, Point]; bars: [[Point, Point], [Point, Point]]; label: Point } {
  const u = unit(from, to);
  const normal: Point = [-u[1], u[0]];
  const shift = (p: Point, by: number): Point => [p[0] + normal[0] * by, p[1] + normal[1] * by];
  const line: [Point, Point] = [shift(from, offset), shift(to, offset)];
  const bar = offset * 0.4;
  return {
    line,
    bars: [[shift(from, offset - bar), shift(from, offset + bar)], [shift(to, offset - bar), shift(to, offset + bar)]],
    label: shift([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], offset * 1.9),
  };
}
