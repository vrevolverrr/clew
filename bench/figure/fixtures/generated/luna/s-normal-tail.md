The shaded right tail is about 5% of the total area under the standard normal curve.

```figure
export default function () {
  return (
    <Plot id="normal" x={[-4, 4]} y={[0, 0.42]} xLabel="z" yLabel="Density">
      <Fn id="curve" f={z => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI)} from={-4} to={4} label="Standard normal" />
      <Region top="curve" from={1.645} to={4} label="$P(Z>1.645)$" tag="active" />
      <Shape pts={[[1.645, 0], [1.645, 0.103]]} label="1.645" tag="active" />
    </Plot>
  );
}
```

$$P(Z>1.645)\approx 0.05$$

