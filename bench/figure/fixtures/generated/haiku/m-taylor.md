Each added term makes the polynomial copy $\sin x$ over a wider stretch around $0$. Step through the figure to see it.

```figure
const steps = [
  { n: 1, name: '$P_1$', caption: 'One term: $P_1(x)=x$. Error at $x=1$ is $0.1585$.' },
  { n: 3, name: '$P_3$', caption: '$P_3(x)=x-\\frac{x^3}{6}$. Error at $x=1$ is $0.00814$.' },
  { n: 5, name: '$P_5$', caption: '$P_5(x)=P_3(x)+\\frac{x^5}{120}$. Error at $x=1$ is $0.000196$.' },
  { n: 7, name: '$P_7$', caption: '$P_7(x)=P_5(x)-\\frac{x^7}{5040}$. Error at $x=1$ is $2.7\\times10^{-6}$.' },
  { n: 9, name: '$P_9$', caption: '$P_9(x)=P_7(x)+\\frac{x^9}{362880}$. Error at $x=1$ is $2.5\\times10^{-8}$.' },
];

// sum of the odd-power terms of sin x up to x^n
function taylorSin(n, x) {
  let sum = 0;
  let fact = 1;
  for (let k = 0; 2 * k + 1 <= n; k++) {
    const p = 2 * k + 1;
    if (k > 0) fact *= (p - 1) * p;
    sum += (k % 2 ? -1 : 1) * Math.pow(x, p) / fact;
  }
  return sum;
}

export default function () {
  return (
    <Figure
      steps={steps}
      caption={step => step.caption}
      render={step => (
        <Plot id="plot" x={[-7, 7]} y={[-2, 2]} xLabel="x" yLabel="y">
          <Fn id="sin" f={x => Math.sin(x)} from={-7} to={7} label="sin x" />
          <Fn id="taylor" f={x => taylorSin(step.n, x)} from={-7} to={7} label={step.name} />
        </Plot>
      )}
    />
  );
}
```

A Taylor polynomial copies a curve by matching its height, slope, and bending at one point. Each new term matches one more layer of bending, so the copy stays accurate over a wider range.

For a function $f$ that is smooth at $0$, the Taylor polynomial of degree $n$ is

$$P_n(x)=\sum_{k=0}^{n}\frac{f^{(k)}(0)}{k!}\,x^k$$

Here $f^{(k)}(0)$ is the $k$-th derivative of $f$ at $0$, and $k!$ is $k$ factorial.

For $\sin x$, the derivatives at $0$ run $0, 1, 0, -1, 0, 1, \dots$. The even-order values vanish, so only odd powers remain:

$$\sin x = x-\frac{x^3}{3!}+\frac{x^5}{5!}-\cdots$$

Now test $x=1$, where $\sin 1 = 0.84147$:

- $P_1(1)=1$. Error $0.1585$.
- $P_3(1)=1-\frac{1}{6}=0.83333$. Error $0.00814$.
- $P_5(1)=0.83333+\frac{1}{120}=0.84167$. Error $0.000196$.

Each term is much smaller than the one before it, so the error drops fast.

The match holds near $0$ only. At $x=4$, $P_5(4)\approx 1.87$ while $\sin 4\approx -0.76$, so a low-degree polynomial turns away from the curve far out. Higher degrees push that region outward.

Not checked: how the figure renders in your pane. The error values were computed by hand to about four significant figures.