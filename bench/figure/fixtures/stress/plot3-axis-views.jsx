export default function () {
  const views = [[0, 25], [90, 25], [180, 25], [270, 25], [30, 89], [30, 0]];
  return <Figure steps={views} caption={step => 'azimuth ' + step[0] + ', elevation ' + step[1]} render={step => (
    <Plot id="p" x={[-2, 2]} y={[-1, 1]} z={[-1, 1]} xLabel="x axis" yLabel="y axis" zLabel="z axis" view={{ azimuth: step[0], elevation: step[1] }}>
      <Fn id="s" f={(x, y) => Math.sin(2 * x) * y} />
    </Plot>
  )} />;
}
