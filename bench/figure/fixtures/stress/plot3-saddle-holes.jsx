export default function () {
  return (
    <Plot id="p" x={[-2, 2]} y={[-2, 2]} z={[-2, 2]} xLabel="$x$" yLabel="$y$" zLabel="$z$">
      <Fn id="saddle" f={(x, y) => x * x - y * y} tag="dim" />
      <Fn id="pole" f={(x, y) => x * x + y * y < 0.3 ? NaN : 1 / (x * x + y * y)} />
      <Points id="o" pts={[[0, 0, 0]]} label="saddle point" tag="active" />
    </Plot>
  );
}
