export default function () {
  return (
    <Plot id="p" x={[-1, 1]} y={[-1, 1]} xLabel="x" yLabel="y" zLabel="z">
      <Fn id="s" f={(x, y) => 3} />
    </Plot>
  );
}
