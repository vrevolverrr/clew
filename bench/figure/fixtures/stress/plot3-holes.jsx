export default function () {
  return (
    <Column>
      <Plot id="none" x={[-1, 1]} y={[-1, 1]}><Fn id="a" f={(x, y) => NaN} /></Plot>
      <Plot id="checker" x={[-1, 1]} y={[-1, 1]}><Fn id="b" f={(x, y) => (Math.floor(x * 10) + Math.floor(y * 10)) % 2 ? NaN : x * y} /></Plot>
      <Plot id="one" x={[-1, 1]} y={[-1, 1]} z={[0, 2]}><Fn id="c" f={(x, y) => Math.abs(x) < 0.05 && Math.abs(y) < 0.05 ? 1 : NaN} /></Plot>
    </Column>
  );
}
