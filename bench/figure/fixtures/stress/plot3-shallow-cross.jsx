export default function () {
  return (
    <Plot id="p" x={[-1, 1]} y={[-1, 1]} z={[-0.1, 0.1]} xLabel="x" yLabel="y" zLabel="z">
      <Fn id="up" f={(x, y) => 0.03 * x} />
      <Fn id="down" f={(x, y) => -0.03 * x} />
    </Plot>
  );
}
