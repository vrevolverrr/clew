export default function () {
  const f = (x, y) => Math.sin(x) * Math.cos(y);
  const path = [[2.5, 1.5]];
  for (let i = 0; i < 63; i++) { const [x, y] = path[i]; path.push([x - 0.15 * Math.cos(x) * Math.cos(y), y + 0.15 * Math.sin(x) * Math.sin(y)]); }
  const steps = path.map((_, i) => i);
  return <Figure steps={steps} caption={step => 'Iterate ' + step} render={step => (
    <Plot id="p" x={[-3, 3]} y={[-3, 3]} z={[-2, 2]}>
      <Fn id="f" f={f} tag="dim" />
      <Fn id="g" f={(x, y) => 0.2 * x - 1} />
      <Fn id="h" f={(x, y) => 1.5 - 0.1 * y * y} />
      <Fn id="k" f={(x, y) => x * x + y * y > 4 ? NaN : -1.5 + 0.1 * x * y} />
      <Shape id="path" pts={path.slice(0, step + 1).map(([x, y]) => [x, y, f(x, y)])} tag="active" />
      <Points id="now" pts={[[path[step][0], path[step][1], f(path[step][0], path[step][1])]]} tag="new" />
    </Plot>
  )} />;
}
