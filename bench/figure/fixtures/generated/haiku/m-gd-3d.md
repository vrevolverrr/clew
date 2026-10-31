Gradient descent moves a point downhill. Each step subtracts the gradient, scaled by the learning rate $\eta$:

$$\mathbf{p}_{k+1} = \mathbf{p}_k - \eta\,\nabla f(\mathbf{p}_k)$$

For $f = x^2 + 3y^2$, the gradient is $\nabla f = (2x,\ 6y)$, so each coordinate shrinks on its own:

$$x_{k+1} = (1 - 2\eta)\,x_k$$

$$y_{k+1} = (1 - 6\eta)\,y_k$$

Use the sliders to change $\eta$ and the number of steps.

```figure
export const params = {
  eta: { label: 'Learning rate η', min: 0.01, max: 0.3, step: 0.01, value: 0.1 },
  n: { label: 'Steps', min: 1, max: 20, step: 1, value: 8 }
};

export default function ({ eta, n }) {
  const its = [{ k: 0, x: 2.5, y: 1.5 }];
  for (let k = 1; k <= n; k++) {
    const p = its[k - 1];
    its.push({ k, x: p.x - eta * 2 * p.x, y: p.y - eta * 6 * p.y });
  }
  const steps = its.map(q => ({ ...q, z: q.x * q.x + 3 * q.y * q.y }));
  const fmt = v => v.toFixed(3);

  return (
    <Figure
      steps={steps}
      heading={s => `Iterate ${s.k}`}
      caption={s => String.raw`$x = ${fmt(s.x)}$, $y = ${fmt(s.y)}$, so $z = ${fmt(s.z)}$`}
      render={(s, i) => (
        <Row gap="lg" align="start">
          <Plot id="plot" x={[-3, 3]} y={[-3, 3]} z={[0, 20]} xLabel="x" yLabel="y" zLabel="z">
            <Fn id="surf" f={(x, y) => x * x + 3 * y * y} label="$z = x^2 + 3y^2$" />
            <Shape pts={steps.slice(0, i + 1).map(q => [q.x, q.y, q.z])} />
            <Points pts={[[s.x, s.y, s.z]]} tag="active" />
          </Plot>
          <Table
            id="tbl"
            title="Iterates"
            columns={['k', 'x', 'y', 'z']}
            rowIds={steps.slice(0, i + 1).map(q => `r${q.k}`)}
            rows={steps.slice(0, i + 1).map(q => [q.k, fmt(q.x), fmt(q.y), fmt(q.z)])}
            tags={{ [`r${s.k}`]: 'active' }}
          />
        </Row>
      )}
    />
  );
}
```

Worked example at $\eta = 0.1$ from $(2.5, 1.5)$: the gradient is $(5, 9)$, so the new point is $(2.5 - 0.5,\ 1.5 - 0.9) = (2.0,\ 0.6)$. The height falls from $z = 13$ to $z = 5.08$.

The $y$ coordinate is multiplied by $|1 - 6\eta|$ each step. It converges only when $\eta < 1/3$. The slider stops at 0.3. Near 0.3, $y$ changes sign each step but still shrinks.

Not checked: I did not render the figure. The surface is cut at $z = 20$, so the rim above that height is not shown. The run has a fixed step count and no stopping rule.