A level curve connects points where $f$ has the same value. The gradient points toward the steepest increase and is perpendicular to the level curve.

$$
f(x,y)=c
$$

$$
\nabla f(x,y)=(2x,-2y)
$$

The figure shows levels $c=-4,0,4$ and gradients at three points.

```figure
export default function () {
  const t = Array.from({ length: 61 }, (_, i) => -1.3 + i * 2.6 / 60);
  const s = Array.from({ length: 61 }, (_, i) => -4 + i * 8 / 60);
  return (
    <Plot id="levels" x={[-4, 4]} y={[-4, 4]} xLabel="x" yLabel="y">
      <Shape id="positive-right" pts={t.map(v => [2 * Math.cosh(v), 2 * Math.sinh(v)])} label="$c=4$" />
      <Shape id="positive-left" pts={t.map(v => [-2 * Math.cosh(v), 2 * Math.sinh(v)])} label="$c=4$" />
      <Shape id="negative-top" pts={t.map(v => [2 * Math.sinh(v), 2 * Math.cosh(v)])} label="$c=-4$" />
      <Shape id="negative-bottom" pts={t.map(v => [2 * Math.sinh(v), -2 * Math.cosh(v)])} label="$c=-4$" />
      <Shape id="zero-up" pts={s.map(v => [v, v])} label="$c=0$" />
      <Shape id="zero-down" pts={s.map(v => [v, -v])} label="$c=0$" />
      <Vector from={[1, 0]} to={[3, 0]} label="$\\nabla f(1,0)$" />
      <Vector from={[0, 1]} to={[0, -1]} label="$\\nabla f(0,1)$" />
      <Vector from={[1, 1]} to={[3, -1]} label="$\\nabla f(1,1)$" />
    </Plot>
  );
}
```

