export default function () {
  const tags = ['active', 'done', 'match', 'new', 'dim', 'good', 'bad'];
  const points = Array.from({ length: 20 }, (_, i) => <Points id={'p' + i} pts={[[Math.cos(i) * 0.1, Math.sin(i) * 0.1, 0.5]]} label={'point number ' + i} tag={tags[i % 7]} />);
  const labels = Array.from({ length: 10 }, (_, i) => <Label at={[0.01 * i, 0, 0.6]} text={'crowded label ' + i} tag={tags[i % 7]} />);
  return (
    <Plot id="p" x={[-1, 1]} y={[-1, 1]} z={[-1, 1]} xLabel="x" yLabel="y" zLabel="z">
      <Fn id="a" f={(x, y) => Math.sin(3 * x) * Math.cos(3 * y)} />
      <Fn id="b" f={(x, y) => 0.5 * x} tag="dim" />
      <Fn id="c" f={(x, y) => x * y} />
      <Fn id="d" f={(x, y) => -0.5 + 0.2 * y} />
      {points}
      {labels}
    </Plot>
  );
}
