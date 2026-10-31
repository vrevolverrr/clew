The **central limit theorem** says that averages of independent samples from the same population become approximately normally distributed as the sample size grows, even when the population itself is skewed. This requires the population to have a finite mean and variance.

$$\bar X_n \approx N\left(\mu,\frac{\sigma^2}{n}\right)$$

Here, $\bar X_n$ is the sample mean for samples of size $n$, and $\mu$ and $\sigma$ are the population mean and standard deviation. For an exponential population with $\mu=\sigma=1$, samples of size $25$ have sample means centered near $1$, with standard deviation $1/\sqrt{25}=0.2$.

The slider compares that skewed exponential population with the exact distribution of its sample means and the normal approximation.

```figure
export const params = {
  n: { label: 'Sample size', min: 1, max: 30, step: 1, value: 1 }
};

export default function ({ n }) {
  let logFactorial = 0;
  for (let k = 2; k < n; k++) logFactorial += Math.log(k);

  const exactMeanDensity = x => {
    if (x < 0) return 0;
    if (x === 0) return n === 1 ? 1 : 0;
    return Math.exp(Math.log(n) + (n - 1) * Math.log(n * x) - n * x - logFactorial);
  };

  const normalApproximation = x =>
    Math.sqrt(n / (2 * Math.PI)) * Math.exp(-0.5 * n * (x - 1) ** 2);

  return (
    <Row gap="md" align="start">
      <Plot id="population-plot" x={[-0.5, 3.5]} y={[0, 1.1]} xLabel="Population value" yLabel="Density">
        <Fn id="population-density" f={x => x < 0 ? 0 : Math.exp(-x)} from={-0.5} to={3.5} label="Exponential population" />
      </Plot>
      <Plot id="means-plot" x={[-0.5, 3.5]} y={[0, 2.5]} xLabel="Sample mean" yLabel="Density">
        <Fn id="exact-mean-density" f={exactMeanDensity} from={-0.5} to={3.5} label="Exact sample means" />
        <Fn id="normal-approximation" f={normalApproximation} from={-0.5} to={3.5} label="Normal approximation" />
      </Plot>
    </Row>
  );
}
```

