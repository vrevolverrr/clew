export default function () {
  const f = (x, y) => x * x + 3 * y * y;
  const path = [[2.5, 1.5]];
  for (let i = 0; i < 6; i++) { const [x, y] = path[path.length - 1]; path.push([x - 0.2 * 2 * x, y - 0.2 * 6 * y]); }
  return (
    <Plot id="p" x={[-3, 3]} y={[-3, 3]} xLabel="weight on the first feature (dimensionless)" yLabel="weight on the second feature (dimensionless)" zLabel="training loss over the whole data set">
      <Fn id="loss" f={f} tag="dim" label="loss surface $L(w_1, w_2)$" />
      <Shape id="gd" pts={path.map(([x, y]) => [x, y, f(x, y)])} tag="active" label="gradient descent, learning rate 0.2" />
      <Points id="start" pts={[[2.5, 1.5, f(2.5, 1.5)]]} label="start (2.5, 1.5)" />
    </Plot>
  );
}
