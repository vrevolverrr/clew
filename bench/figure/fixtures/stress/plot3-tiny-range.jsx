export default function () {
  return (
    <Plot id="p" x={[0, 1e-12]} y={[0, 1e-12]} xLabel="x" yLabel="y" zLabel="z">
      <Fn id="s" f={(x, y) => (x + y) * 1e12} />
    </Plot>
  );
}
