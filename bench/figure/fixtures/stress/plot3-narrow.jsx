export default function () {
  const f = (x, y) => x * x - y * y;
  const path = Array.from({ length: 30 }, (_, i) => { const t = -1 + i / 14.5; return [t, 0.3 * t, f(t, 0.3 * t)]; });
  return (
    <Plot id="p" x={[-1, 1]} y={[-1, 1]} xLabel="first coordinate" yLabel="second coordinate" zLabel="value of the saddle">
      <Fn id="s" f={f} tag="dim" />
      <Shape id="path" pts={path} tag="active" label="a path across the saddle" />
    </Plot>
  );
}
