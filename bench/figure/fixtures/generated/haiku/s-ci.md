Each bar is a 95% confidence interval from one random sample of 25 values. The vertical line is the true mean, $\mu = 50$. A bar that does not reach the line is a miss.

$$\bar{x} \pm 1.96\,\frac{\sigma}{\sqrt{n}}$$

Here $\bar{x}$ is the sample mean, $\sigma = 10$ is the known population standard deviation, and $n = 25$ is the sample size. The half-width is $1.96 \cdot 10 / \sqrt{25} = 3.92$. Each sample gives a different $\bar{x}$, so each bar sits in a different place.

```figure
export const params = { seed: { label: 'Seed', min: 1, max: 99, step: 1, value: 7 } };

export default function ({ seed }) {
  const MU = 50, SIGMA = 10, N = 25, K = 20, Z = 1.96;
  const half = Z * SIGMA / Math.sqrt(N);
  let s = seed;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const normal = () => Math.sqrt(-2 * Math.log(rand())) * Math.cos(2 * Math.PI * rand());
  const cis = [];
  for (let i = 1; i <= K; i++) {
    let sum = 0;
    for (let j = 0; j < N; j++) sum += MU + SIGMA * normal();
    const xbar = sum / N;
    const lo = xbar - half, hi = xbar + half;
    cis.push({ i, lo, hi, miss: lo > MU || hi < MU });
  }
  const misses = cis.filter(c => c.miss).length;
  return (
    <Column gap="md">
      <Plot id="plot" x={[36, 64]} y={[0, K + 1]} xLabel="$\bar{x}$ and 95% interval" yLabel="Sample">
        {cis.map(c => <Shape id={'ci' + c.i} pts={[[c.lo, c.i], [c.hi, c.i]]} {...(c.miss ? { tag: 'bad' } : {})} />)}
        <Shape id="mu" pts={[[MU, 0], [MU, K + 1]]} label="$\mu = 50$" />
      </Plot>
      <Text>{String.raw`${misses} of ${K} intervals miss $\mu = 50$.`}</Text>
    </Column>
  );
}
```

Not checked: this is one seeded draw, not a long simulation. Over many draws, the miss rate settles near 5%. Change Seed to redraw the 20 samples.