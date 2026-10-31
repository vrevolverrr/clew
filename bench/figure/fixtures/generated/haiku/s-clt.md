The central limit theorem says that averages of many independent values form a bell curve, even when the values themselves do not. This lets you use normal-based tests and intervals without knowing the population's shape.

Precisely: if $X_1, \dots, X_n$ are independent and identically distributed, with mean $\mu$ and finite variance $\sigma^2$, then for large $n$ the sample mean is approximately normal:

$$\bar X \approx N\!\left(\mu,\ \frac{\sigma^2}{n}\right)$$

Here $\mu$ is the population mean, $\sigma$ is its standard deviation, and $n$ is the sample size. The spread of the means, $\sigma/\sqrt{n}$, is called the standard error. Drag the slider to change $n$. The bars are 1,000 simulated sample means. The curve is the normal approximation.

```figure
export const params = { n: { label: 'Sample size n', min: 1, max: 50, step: 1, value: 2 } };

const M = 1000;   // number of sample means drawn
const BINS = 40;  // histogram bars
const pdf = x => Math.exp(-x);   // population: exponential, rate 1, mean 1, sd 1

export default function ({ n }) {
  // seeded generator: the same n always gives the same picture
  let seed = 12345;
  const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return (seed + 0.5) / 4294967296; };

  const means = [];
  for (let k = 0; k < M; k++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += -Math.log(rand());
    means.push(sum / n);
  }
  const mean = means.reduce((a, b) => a + b, 0) / M;
  const sd = Math.sqrt(means.reduce((a, b) => a + (b - mean) ** 2, 0) / M);

  const se = 1 / Math.sqrt(n);   // theory: sd of the sample mean is sigma / sqrt(n)
  const lo = Math.max(0, 1 - 4 * se), hi = 1 + 4 * se;
  const w = (hi - lo) / BINS;
  const counts = new Array(BINS).fill(0);
  for (const m of means) {
    if (m < lo || m >= hi) continue;
    counts[Math.min(BINS - 1, Math.floor((m - lo) / w))]++;
  }
  const bars = counts.map((c, i) => (
    <Region key={i} top={c / (M * w)} from={lo + i * w} to={lo + (i + 1) * w} />
  ));
  const normal = x => Math.exp(-((x - 1) ** 2) / (2 * se * se)) / (se * Math.sqrt(2 * Math.PI));

  return (
    <Panel title="Sample means from an exponential population">
      <Column gap="md">
        <Row gap="lg" align="center">
          <Plot id="pop" x={[0, 4]} y={[0, 1]} xLabel="x" yLabel="density">
            <Fn id="pdf" f={pdf} from={0} to={4} label="Population" />
          </Plot>
          <Plot id="means" x={[lo, hi]} xLabel="sample mean" yLabel="density">
            {bars}
            <Fn id="normal" f={normal} from={lo} to={hi} label="Normal curve" />
          </Plot>
        </Row>
        <Row gap="md" align="start">
          <Node id="mu" label={mean.toFixed(3)} sub="mean of means (theory 1)" />
          <Node id="sd" label={sd.toFixed(3)} sub={`spread (theory ${se.toFixed(3)})`} />
        </Row>
      </Column>
    </Panel>
  );
}
```

The population here is exponential with rate 1, so $\mu = 1$ and $\sigma = 1$. It is strongly right-skewed: most values are small, and a few are large. Take $n = 25$:

1. Standard error: $\sigma/\sqrt{n} = 1/\sqrt{25} = 0.2$.
2. Find the chance that the mean of 25 values exceeds 1.4.
3. Convert to a z-score: $z = (1.4 - 1)/0.2 = 2$.
4. Read the normal table: $P(\bar X > 1.4) \approx P(Z > 2) \approx 0.023$.

The approximation is rough at small $n$. At $n = 4$, the normal curve gives about 0.023 for the mean exceeding 2, but the exact value is about 0.042. Move the slider down to 4 and compare the bars with the curve.

Not checked: I did not render or run the figure, so the slider and layout are unverified. Risk: the bar heights are densities, so they match the normal curve only if the bin width and sample count are right.