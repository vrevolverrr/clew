// One sharp spike on a flat floor, which the flattened check flags on purpose.
// expect: flattened
export default function () {
  return (
    <Plot id="p" x={[-1, 1]} y={[-1, 1]} z={[0, 1]} view={{ azimuth: 30, elevation: 5 }} zLabel="height">
      <Fn id="spike" f={(x, y) => 1 / (1 + 400 * (x * x + y * y))} />
    </Plot>
  );
}
