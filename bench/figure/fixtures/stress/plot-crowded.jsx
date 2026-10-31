export default function () {
  const bars = Array.from({ length: 40 }, (_, i) => <Region top={Math.sin(i / 6) + 1.2} from={i / 4} to={(i + 1) / 4} />);
  return (
    <Plot id="p" x={[0, 10]} y={[-2, 4]} xLabel="time since the start of the experiment (s)" yLabel="amplitude (arbitrary units)">
      {bars}
      <Fn id="a" f={x => Math.sin(x)} label="sin x" />
      <Fn id="b" f={x => Math.cos(x)} label="cos x" tag="new" />
      <Fn id="c" f={x => Math.sin(x) + 0.05} label="sin x + 0.05" tag="dim" />
      <Fn id="d" f={x => x / 3} label="x / 3" />
      <Fn id="e" f={x => Math.exp(-x / 3) * 3} label="3e^{-x/3}" tag="good" />
      <Fn id="f" f={x => -Math.exp(-x / 3) * 1.5} label="damped" tag="bad" />
      <Points pts={[[1, 1], [1.1, 1.05], [1.2, 1.1], [5, 2], [9, -1]]} label="samples" />
      <Label at={[1.05, 1.2]} text="crowded label one" />
      <Label at={[1.1, 1.15]} text="crowded label two" />
    </Plot>
  );
}
