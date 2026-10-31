$P(Z > 1.645) \approx 0.05$. The shaded area is the right tail beyond $z = 1.645$.

```figure
const phi = z => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);

export default function () {
  return (
    <Plot id="plot" x={[-4, 4]} y={[0, 0.45]} xLabel="z" yLabel="φ(z)">
      <Fn id="pdf" f={phi} from={-4} to={4} label="φ(z)" />
      <Region top="pdf" base={0} from={1.645} to={4} />
      <Segment from={[1.645, 0]} to={[1.645, 0.4]} label="z = 1.645" />
      <Label at={[2.2, 0.15]} text={"$P(Z > 1.645) \\approx 0.05$"} />
    </Plot>
  );
}
```

$$P(Z > 1.645) = 1 - \Phi(1.645) \approx 0.0500$$

Not checked: I did not run code to get the value. It comes from the standard normal table, and the exact value is 0.04998.