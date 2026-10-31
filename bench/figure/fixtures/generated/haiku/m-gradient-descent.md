Gradient descent finds the lowest point of a function by walking downhill. At each step it measures the slope and moves a short distance against it. The learning rate sets the length of each move.

For a function $f(x,y)$, the gradient $\nabla f$ points uphill. Gradient descent moves the opposite way:

$$\begin{aligned} x_{k+1} &= x_k - \eta\,\frac{\partial f}{\partial x} \\ y_{k+1} &= y_k - \eta\,\frac{\partial f}{\partial y} \end{aligned}$$

Here $\eta > 0$ is the learning rate, and the partial derivatives are taken at the current point $(x_k, y_k)$. For $f = x^2 + 3y^2$, we have $\partial f/\partial x = 2x$ and $\partial f/\partial y = 6y$. Each coordinate therefore shrinks by a fixed factor per step:

$$\begin{aligned} x_{k+1} &= (1-2\eta)\,x_k \\ y_{k+1} &= (1-6\eta)\,y_k \end{aligned}$$

Take $\eta = 0.1$ and start at $(2.5, 1.5)$. The gradient there is $(5, 9)$, so one step gives $x_1 = 2.5 - 0.1 \cdot 5 = 2.0$ and $y_1 = 1.5 - 0.1 \cdot 9 = 0.6$. The value of $f$ falls from $13$ to $5.08$.

The factors are $0.8$ for $x$ and $0.4$ for $y$. After 10 steps, $x \approx 0.268$ but $y \approx 0.00016$. The $x$ direction is the slow one, because $f$ is flatter along $x$ (curvature 2, against 6 along $y$).

Each factor must stay between $-1$ and $1$. For $y$, $|1-6\eta| < 1$ means $0 < \eta < \tfrac{1}{3}$. At $\eta = \tfrac{1}{3}$, $y$ flips sign each step without shrinking. Above it, $y$ grows and the method diverges. The best value here is $\eta = 0.25$: both factors have size $0.5$, so both coordinates halve in size per step.

Drag the learning-rate slider above the figure to test these values. The table marks the current step.

```figure
export const params = { eta: { label: 'Learning rate', min: 0.01, max: 0.4, step: 0.01, value: 0.1 } };

export default function ({ eta }) {
  const N = 8;
  const pts = [[2.5, 1.5]];
  for (let k = 0; k < N; k++) {
    const [x, y] = pts[k];
    pts.push([x - eta * 2 * x, y - eta * 6 * y]);
  }
  const ring = [];
  for (let i = 0; i <= 64; i++) {
    const t = (2 * Math.PI * i) / 64;
    ring.push([Math.sqrt(13) * Math.cos(t), Math.sqrt(13 / 3) * Math.sin(t)]);
  }
  const steps = pts.map((p, k) => ({ k, now: p, path: pts.slice(0, k + 1), f: p[0] * p[0] + 3 * p[1] * p[1] }));
  return (
    <Figure
      steps={steps}
      caption={step => `Step ${step.k} of ${N}: $x = ${step.now[0]}$, $y = ${step.now[1]}$, $f = ${step.f}$.`}
      render={step => (
        <Row gap="lg" align="center">
          <Plot id="plot" x={[-3.5, 3.5]} xLabel="x" yLabel="y">
            <Shape id="ring" pts={ring} closed label="f = 13" />
            <Shape id="path" pts={step.path} />
            <Points pts={[step.now]} label={`k = ${step.k}`} />
          </Plot>
          <Table id="table" columns={['k', 'x', 'y', 'f']} rows={pts.map((p, k) => [k, p[0], p[1], p[0] * p[0] + 3 * p[1] * p[1]])} rowIds={pts.map((_, k) => `r${k}`)} tags={{ [`r${step.k}`]: 'active' }} />
        </Row>
      )}
    />
  );
}
```