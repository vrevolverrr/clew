export default function () {
  const f = (x, y) => (x + y > 0 ? 1.7e308 : -1.7e308) * Math.abs(x * y) + 0.5 * x;
  return (
    <Column>
      <Plot id="given" x={[-1, 1]} y={[-1, 1]} z={[-2, 2]}><Fn id="a" f={f} /></Plot>
      <Plot id="fitted" x={[-1, 1]} y={[-1, 1]}><Fn id="b" f={(x, y) => x > 0 ? 1.7e308 : -1.7e308} /></Plot>
    </Column>
  );
}
