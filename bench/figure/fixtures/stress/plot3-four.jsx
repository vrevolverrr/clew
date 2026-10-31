export default function () {
  return (
    <Plot id="p" x={[-3, 3]} y={[-3, 3]} z={[-2, 2]}>
      <Fn id="wave" f={(x, y) => Math.sin(x) * Math.cos(y)} label="sin x cos y" />
      <Fn id="plane" f={(x, y) => 0.3 * x - 0.2 * y} label="plane" />
      <Fn id="pole" f={(x, y) => 1 / (x * x + y * y)} />
      <Fn id="cap" f={(x, y) => x * x + y * y > 4 ? NaN : Math.sqrt(4 - x * x - y * y) - 1} />
    </Plot>
  );
}
