export default function () {
  return (
    <Plot id="p" x={[-1, 1]} y={[-1, 1]} z={[0, 1]}>
      <Fn id="a" f={(x, y) => 0.5} />
      <Fn id="b" f={(x, y) => 0.5 + 1e-9} tag="dim" />
    </Plot>
  );
}
