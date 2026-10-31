export default function () {
  const f = (x, y) => x * x + y * y;
  return (
    <Plot id="p" x={[-2, 2]} y={[-2, 2]} z={[0, 8]} xLabel="x" yLabel="y" zLabel="z">
      <Fn id="bowl" f={f} />
      <Fn id="plane" f={(x, y) => 2 * x + 2 * y - 2} tag="dim" />
      <Points id="touch" pts={[[1, 1, f(1, 1)]]} label="point of tangency" tag="active" />
    </Plot>
  );
}
