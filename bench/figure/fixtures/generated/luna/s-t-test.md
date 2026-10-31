A one-sample t-test checks whether a sample gives enough evidence that its population mean differs from a proposed value. Here, the sample is 4 units above the null mean, but we need to compare that gap with the uncertainty in the sample.

$$
SE = \frac{s}{\sqrt{n}}
$$

$SE$ is the standard error, $s$ is the sample standard deviation, and $n$ is the sample size.

$$
t = \frac{\bar{x} - \mu_0}{SE}
$$

Here, $\bar{x}$ is the sample mean and $\mu_0$ is the null mean. With $n=16$, $s=8$, $\bar{x}=52$, and $\mu_0=48$:

$$
SE = \frac{8}{\sqrt{16}} = 2
$$

$$
t = \frac{52 - 48}{2} = 2
$$

The degrees of freedom are $n-1=15$. For a two-sided test at the 5% level, the critical values are about $-2.131$ and $2.131$. Since $t=2$ falls between them, **we fail to reject $H_0$**. The two-sided p-value is about $0.064$, just above $0.05$.

So, this sample does not provide enough evidence at the 5% level that $\mu$ differs from 48. This test assumes independent observations and, with this small sample, a roughly normal population.

```figure
const steps = [
  { a: 'active', b: 'dim', c: 'dim', d: 'dim', text: 'Start with the sample and null values.' },
  { a: 'done', b: 'active', c: 'dim', d: 'dim', text: 'Compute the standard error: $8/\\sqrt{16}=2$.' },
  { a: 'done', b: 'done', c: 'active', d: 'dim', text: 'Standardize the mean difference: $t=(52-48)/2=2$.' },
  { a: 'done', b: 'done', c: 'done', d: 'active', text: 'Compare $t=2$ with the critical value $2.131$; do not reject $H_0$.' }
];

export default function () {
  return <Figure steps={steps} caption={step => step.text} render={step => (
    <Row gap="md" align="center">
      <Node id="sample" label="n = 16, x̄ = 52" sub="s = 8" tag={step.a} />
      <Node id="se" label="SE = 2" sub="s / √n" tag={step.b} />
      <Node id="stat" label="t = 2" sub="15 degrees of freedom" tag={step.c} />
      <Node id="result" label="Do not reject H₀" sub="p ≈ 0.064" tag={step.d} />
    </Row>
  )} />;
}
```

