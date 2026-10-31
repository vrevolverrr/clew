export default function () {
  return (
    <Plot id="p" x={[0, 1000]} y={[0, 1000]} z={[0, 1]} equal xLabel="east (m)" yLabel="north (m)" zLabel="height (m)">
      <Fn id="s" f={(x, y) => 0.5 + 0.5 * Math.sin(x / 100) * Math.cos(y / 100)} />
    </Plot>
  );
}
