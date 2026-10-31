A one-sample t-test checks whether a sample mean is so far from a claimed value that chance alone is an unlikely explanation. Use it when you have one sample and do not know the population standard deviation $\sigma$.

The test statistic measures the gap between the sample mean and the claimed mean, in units of standard error:

$$t = \frac{\bar{x} - \mu_0}{s/\sqrt{n}}$$

Here $\bar{x}$ is the sample mean, $\mu_0$ is the mean under $H_0$, $s$ is the sample standard deviation, and $n$ is the sample size. If $H_0$ is true and the population is roughly normal, $t$ follows a t distribution with $n-1$ degrees of freedom. At two-sided level $\alpha$, reject $H_0$ when $|t| > t_{\alpha/2,\,n-1}$.

Worked example, with $n = 16$, $\bar{x} = 52$, $s = 8$, $\mu_0 = 48$:

1. Standard error: $s/\sqrt{n} = 8/\sqrt{16} = 8/4 = 2$.
2. Test statistic: $t = (52 - 48)/2 = 2.00$.
3. Degrees of freedom: $df = 16 - 1 = 15$. Critical value from a t table: $t_{0.025,\,15} = 2.131$.
4. Decision: $|2.00| < 2.131$, so do not reject $H_0$.
5. p-value: two-sided $p \approx 0.064$, which is above 0.05. Same decision.

Cross-check with a 95% confidence interval: $52 \pm 2.131 \times 2 = (47.74,\ 56.26)$. The interval contains 48, so it agrees.

```figure
function gamma(z) {
  const g = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61503916999385, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  const x = z - 1;
  let a = g[0];
  for (let i = 1; i < 9; i++) a += g[i] / (x + i);
  const t = x + 7.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}
const nu = 15;
const c = gamma((nu + 1) / 2) / (Math.sqrt(nu * Math.PI) * gamma(nu / 2));
const pdf = t => c * Math.pow(1 + t * t / nu, -(nu + 1) / 2);
const crit = 2.131;

export default function () {
  return (
    <Plot id="plot" x={[-4, 4]} y={[0, 0.45]} xLabel="t" yLabel="density">
      <Fn id="pdf" f={pdf} from={-4} to={4} label="t, df = 15" />
      <Region id="left" top="pdf" from={-4} to={-crit} label="2.5%" />
      <Region id="right" top="pdf" from={crit} to={4} label="2.5%" />
      <Segment id="obs" from={[2, 0]} to={[2, pdf(2)]} label="t = 2" />
      <Label at={[-crit, 0.03]} text="$-2.131$" />
      <Label at={[crit, 0.03]} text="$2.131$" />
    </Plot>
  );
}
```

The observed $t = 2$ falls in the unshaded middle, so it is not in the rejection regions.

Interpretation: the data do not show that $\mu$ differs from 48. They do not prove that $\mu = 48$.

The test assumes a roughly normal population. With $n = 16$, check a histogram or Q-Q plot for strong skew or outliers.

Not checked: the t critical value and the p-value are from a t table and an approximation, not software output. For an exact p-value, run a one-sample t-test in your statistics package.