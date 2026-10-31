A Taylor polynomial approximates a curve near a chosen point. For $\sin x$ around $0$, each new term improves the approximation near $0$:

$$
T_n(x)=\sum_{k=0}^{n-1}\frac{(-1)^k x^{2k+1}}{(2k+1)!}
$$

Here, $n$ is the number of terms. For example, at $x=1$, the first term gives $1$, while the first three give about $0.84167$; $\sin(1)\approx0.84147$. Use the slider to add terms and compare the polynomial with $\sin x$. The approximation is best near $0$.

```figure
export const params = {
  terms: { label: 'Terms', min: 1, max: 6, step: 1, value: 3 }
};

function taylorSin(x, n) {
  let term = x;
  let sum = term;
  for (let k = 0; k < n - 1; k++) {
    term *= -(x * x) / ((2 * k + 2) * (2 * k + 3));
    sum += term;
  }
  return sum;
}

export default function ({ terms }) {
  const steps = Array.from({ length: terms }, (_, i) => ({
    n: i + 1,
    text: i === 0
      ? 'Start with the first term, $x$.'
      : `Add the next term to make a ${i + 1}-term polynomial.`
  }));

  return (
    <Figure
      steps={steps}
      caption={step => step.text}
      title="Taylor polynomials for sin x"
      render={step => (
        <Plot id="sin-plot" x={[-6, 6]} y={[-3, 3]} xLabel="x" yLabel="y">
          <Fn id="sine" f={x => Math.sin(x)} from={-6} to={6} label="sin x" />
          <Fn id="polynomial" f={x => taylorSin(x, step.n)} from={-6} to={6} label={`T_${step.n}(x)`} tag="active" />
        </Plot>
      )}
    />
  );
}
```

