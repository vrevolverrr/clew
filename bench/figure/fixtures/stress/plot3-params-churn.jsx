export const params = {
  a: { label: 'Amplitude', min: 0, max: 2, step: 0.1, value: 1 },
  b: { label: 'x frequency', min: 0.5, max: 4, step: 0.5, value: 1 },
  c: { label: 'y frequency', min: 0.5, max: 4, step: 0.5, value: 1 },
  d: { label: 'Tilt x', min: -1, max: 1, step: 0.1, value: 0 },
  e: { label: 'Tilt y', min: -1, max: 1, step: 0.1, value: 0 },
  h: { label: 'Hole radius', min: 0, max: 2, step: 0.1, value: 0 },
  s: { label: 'Shift', min: -1, max: 1, step: 0.1, value: 0 },
  n: { label: 'Path points', min: 2, max: 40, step: 1, value: 10 },
};

export default function ({ a, b, c, d, e, h, s, n }) {
  const f = (x, y) => (x * x + y * y < h * h ? NaN : a * Math.sin(b * x) * Math.cos(c * y) + d * x + e * y + s);
  const path = Array.from({ length: n }, (_, i) => { const t = -3 + (6 * i) / (n - 1); return [t, t / 2, f(t, t / 2)]; }).filter(p => Number.isFinite(p[2]));
  return (
    <Plot id="p" x={[-3, 3]} y={[-3, 3]} z={[-5, 5]} xLabel="x" yLabel="y" zLabel="z">
      <Fn id="s" f={f} tag="dim" />
      <Shape id="path" pts={path} tag="active" />
    </Plot>
  );
}
