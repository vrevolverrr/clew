A production possibilities frontier (PPF) shows the maximum combinations of two goods an economy can produce with its resources. As production shifts toward one good, the resources used may be less suited to it, so each extra unit can cost more of the other good.

For this example, let the frontier be:

$$Y = 100 - X^2$$

At $X=2$, the economy can make $Y=96$. Raising $X$ from 2 to 3 lowers $Y$ from 96 to 91, a cost of 5 units. Later, raising $X$ from 6 to 7 lowers $Y$ from 64 to 51, a cost of 13 units. The same extra unit of $X$ costs more $Y$ as production moves along the frontier.

```figure
export default function () {
  return (
    <Plot id="ppf" x={[0, 10]} y={[0, 100]} xLabel="Good X" yLabel="Good Y">
      <Fn id="frontier" f={x => 100 - x * x} from={0} to={10} label="PPF" />
      <Points pts={[[2, 96]]} label="(2, 96)" />
      <Points pts={[[3, 91]]} label="(3, 91)" />
      <Points pts={[[6, 64]]} label="(6, 64)" />
      <Points pts={[[7, 51]]} label="(7, 51)" />
    </Plot>
  );
}
```

