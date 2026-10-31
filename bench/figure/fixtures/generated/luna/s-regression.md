The least-squares line is the line that minimizes the sum of the squared vertical gaps between the data points and the line. For these points, it is

$$
\hat y = 1.2143 + 0.9524x
$$

Each residual is the observed $y$ minus the line’s predicted $\hat y$. The vertical segments show those residuals; segments below the points are negative, and those above are positive.

```figure
export default function () {
  const points = [[1, 2], [2, 3], [3, 5], [4, 4], [5, 6], [6, 8], [7, 7], [8, 9]];
  const fit = x => 17 / 14 + (20 / 21) * x;
  return (
    <Plot id="least-squares" x={[0, 9]} y={[0, 10]} xLabel="x" yLabel="y">
      <Fn id="line" f={fit} from={0} to={9} label="Least-squares line" />
      {points.map(([x, y]) => (
        <Segment id={`residual-${x}`} from={[x, fit(x)]} to={[x, y]} label={`Residual at x = ${x}`} />
      ))}
      <Points id="observations" pts={points} label="Observed points" />
    </Plot>
  );
}
```

