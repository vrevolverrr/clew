**Least-squares line:** $\hat y = \frac{17}{14} + \frac{20}{21}x \approx 1.214 + 0.952x$

$\bar x = 4.5$, $\bar y = 5.5$, $S_{xx} = 42$, $S_{xy} = 40$, so the slope is $40/42 = 20/21$. The intercept is $5.5 - \frac{20}{21}(4.5) = \frac{17}{14}$.

```figure
const pts = [[1,2],[2,3],[3,5],[4,4],[5,6],[6,8],[7,7],[8,9]];
const line = x => (51 + 40 * x) / 42;

export default function () {
  return (
    <Plot id="plot" x={[0, 9]} y={[0, 10]} xLabel="x" yLabel="y">
      <Fn id="fit" f={line} from={0.5} to={8.5} label="least-squares line" />
      <Segment from={[1,2]} to={[1,line(1)]} />
      <Segment from={[2,3]} to={[2,line(2)]} />
      <Segment from={[3,5]} to={[3,line(3)]} />
      <Segment from={[4,4]} to={[4,line(4)]} />
      <Segment from={[5,6]} to={[5,line(5)]} />
      <Segment from={[6,8]} to={[6,line(6)]} />
      <Segment from={[7,7]} to={[7,line(7)]} />
      <Segment from={[8,9]} to={[8,line(8)]} />
      <Points pts={pts} label="data" />
    </Plot>
  );
}
```

Residuals are $e = y - \hat y$, the vertical gaps in the figure:

| x | y | ŷ | residual e |
|---|---|---|---|
| 1 | 2 | 2.167 | -0.167 |
| 2 | 3 | 3.119 | -0.119 |
| 3 | 5 | 4.071 | 0.929 |
| 4 | 4 | 5.024 | -1.024 |
| 5 | 6 | 5.976 | 0.024 |
| 6 | 8 | 6.929 | 1.071 |
| 7 | 7 | 7.881 | -0.881 |
| 8 | 9 | 8.833 | 0.167 |

Checks: $\sum e = 0$, $\sum x e = 0$, $\text{SSE} = 82/21 \approx 3.905$, $R^2 \approx 0.907$.

Not checked: I did not run a software fit (numpy, Excel) to confirm the coefficients. The two zero-sum checks above confirm the arithmetic.