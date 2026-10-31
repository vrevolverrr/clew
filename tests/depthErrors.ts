import type { Point3, View } from '@/renderer/figure/FigureData';

/**
 * Paints the faces in `order` at a grid of sample points and compares each point's last face with the nearest face there,
 * as a depth buffer would find it. Returns the share of covered points where another face is on top.
 */
export function depthErrors(faces: readonly { v: Point3[] }[], order: readonly number[], view: View): number {
  const a = (view.azimuth * Math.PI) / 180;
  const e = (view.elevation * Math.PI) / 180;
  const right: Point3 = [Math.cos(a), -Math.sin(a), 0];
  const up: Point3 = [Math.sin(a) * Math.sin(e), Math.cos(a) * Math.sin(e), Math.cos(e)];
  const ahead: Point3 = [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), -Math.sin(e)];
  const dot = (p: Point3, q: Point3): number => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const STEPS = 140;
  // Per covered point: the depth and face last painted there, and the nearest.
  const last = new Map<number, [number, number]>();
  const nearest = new Map<number, [number, number]>();
  for (const index of order) {
    const pts = faces[index].v.map((p) => [dot(p, right), dot(p, up), dot(p, ahead)]);
    for (let t = 1; t + 1 < pts.length; t += 1) {
      const [p, q, r] = [pts[0], pts[t], pts[t + 1]];
      const det = (q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1]);
      if (Math.abs(det) < 1e-12) continue;
      const cell = (value: number): number => Math.max(0, Math.min(STEPS - 1, Math.floor(((value + 1.2) / 2.4) * STEPS)));
      for (let i = cell(Math.min(p[0], q[0], r[0])); i <= cell(Math.max(p[0], q[0], r[0])); i += 1) {
        for (let j = cell(Math.min(p[1], q[1], r[1])); j <= cell(Math.max(p[1], q[1], r[1])); j += 1) {
          const [u, v] = [(i + 0.5) / STEPS * 2.4 - 1.2, (j + 0.5) / STEPS * 2.4 - 1.2];
          const s = ((u - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (v - p[1])) / det;
          const w = ((q[0] - p[0]) * (v - p[1]) - (u - p[0]) * (q[1] - p[1])) / det;
          if (s < 0 || w < 0 || s + w > 1) continue;
          const depth = p[2] + s * (q[2] - p[2]) + w * (r[2] - p[2]);
          const key = i * STEPS + j;
          last.set(key, [depth, index]);
          if (depth < (nearest.get(key)?.[0] ?? Infinity)) nearest.set(key, [depth, index]);
        }
      }
    }
  }
  let wrong = 0;
  // A non-planar quad folding over itself is one fill on the canvas, so only another face on top is wrong.
  for (const [key, [depth, face]] of last) {
    const [near, nearFace] = nearest.get(key)!;
    if (face !== nearFace && depth > near + 1e-6) wrong += 1;
  }
  return wrong / last.size;
}
