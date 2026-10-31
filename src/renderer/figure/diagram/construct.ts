// The construction functions a figure program finds in scope, so it computes points instead of guessing them.
export type P = readonly [number, number];
export type Line = readonly [P, P];

/** Where two lines meet, or null when they are parallel. */
export function intersect([p, q]: Line, [r, s]: Line): [number, number] | null {
  const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d;
  return [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
}

/** The foot of the perpendicular from `p` to the line. */
export function foot(p: P, [a, b]: Line): [number, number] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  return [a[0] + t * dx, a[1] + t * dy];
}

/** `p` turned counter-clockwise about `about`. */
export function rotate(p: P, about: P, degrees: number): [number, number] {
  const t = (degrees * Math.PI) / 180;
  const x = p[0] - about[0];
  const y = p[1] - about[1];
  return [about[0] + x * Math.cos(t) - y * Math.sin(t), about[1] + x * Math.sin(t) + y * Math.cos(t)];
}

/** The point a + t·(b − a). */
export function along(a: P, b: P, t: number): [number, number] {
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

export function dist(a: P, b: P): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** The circle through three points, or null when they are collinear. */
export function circleThrough(a: P, b: P, c: P): { at: [number, number]; r: number } | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return null;
  const [A, B, C] = [a, b, c].map((p) => p[0] ** 2 + p[1] ** 2);
  const at: [number, number] = [
    (A * (b[1] - c[1]) + B * (c[1] - a[1]) + C * (a[1] - b[1])) / d,
    (A * (c[0] - b[0]) + B * (a[0] - c[0]) + C * (b[0] - a[0])) / d,
  ];
  return { at, r: dist(a, at) };
}
