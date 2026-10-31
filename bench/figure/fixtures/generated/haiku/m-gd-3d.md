Gradient descent moves each point a small step against the slope. The learning rate $\eta$ sets the step size. The gradient $\nabla f$ points uphill, so each update subtracts it:

$$\nabla f(x, y) = (2x,\; 6y)$$

$$(x_{k+1}, y_{k+1}) = (x_k, y_k) - \eta\,\nabla f(x_k, y_k)$$

Here $k$ is the step number and $\eta$ is the learning rate. For this surface, each coordinate shrinks on its own: $x_{k+1} = (1 - 2\eta)\,x_k$ and $y_{k+1} = (1 - 6\eta)\,y_k$.

Worked example at $\eta = 0.1$ from $(2.5, 1.5)$: the gradient is $(5, 9)$. So $x_1 = 2.5 - 0.1 \cdot 5 = 2.0$ and $y_1 = 1.5 - 0.1 \cdot 9 = 0.6$. Here $f$ falls from 13 to 5.08.

```figure
export const params = {
  eta: { label: 'Learning rate η', min: 0.01, max: 0.33, step: 0.01, value: 0.1 },
  n: { label: 'Steps', min: 1, max: 20, step: 1, value: 8 }
};

const f = (x, y) => x * x + 3 * y * y;
const view = { azimuth: 30, elevation: 25, zScale: 6 / 36 };

export default function ({ eta, n }) {
  // Gradient descent: x <- x - eta * 2x, y <- y - eta * 6y
  const its = [{ x: 2.5, y: 1.5 }];
  for (let k = 0; k < n; k++) {
    const p = its[k];
    its.push({ x: p.x - eta * 2 * p.x, y: p.y - eta * 6 * p.y });
  }
  const path = its.map(p => project([p.x, p.y, f(p.x, p.y)], view));
  const wires = surface(f, [-3, 3], [-3, 3], { n: 12, ...view });
  const all = wires.flat().concat(path);
  const minX = Math.min(...all.map(p => p[0]));
  const maxX = Math.max(...all.map(p => p[0]));
  const minY = Math.min(...all.map(p => p[1]));
  const maxY = Math.max(...all.map(p => p[1]));
  const m = 0.3;
  const sh = p => [p[0] - minX + m, p[1] - minY + m];
  const W = maxX - minX + 2 * m;
  const H = maxY - minY + 2 * m;
  const dot = 0.04 * Math.max(W, H);
  const wiresS = wires.map(w => w.map(sh));
  const trail = path.map(sh);
  const steps = its.map((p, k) => ({ k, x: p.x, y: p.y, z: f(p.x, p.y) }));

  return (
    <Figure
      title="Gradient descent on $z = x^2 + 3y^2$"
      steps={steps}
      heading={step => (step.k === 0 ? 'Start' : 'Update ' + step.k)}
      caption={step => `Step ${step.k}: $x = ${step.x.toFixed(4)}$, $y = ${step.y.toFixed(4)}$, $f = ${step.z.toFixed(4)}$`}
      render={step => (
        <Row gap="lg" align="start">
          <Diagram id="surface" width={W} height={H}>
            {wiresS.map((w, j) => <Shape id={'w' + j} pts={w} tag="dim" />)}
            <Shape id="trail" pts={trail.slice(0, step.k + 1)} tag="done" />
            <Circle id="now" at={trail[step.k]} r={dot} tag="active" />
          </Diagram>
          <Column gap="md">
            <Node id="xy" label={`(${step.x.toFixed(4)}, ${step.y.toFixed(4)})`} sub="x, y" />
            <Node id="fz" label={step.z.toFixed(4)} sub="f(x, y)" />
            <Table
              id="iters"
              title="Iterates"
              columns={['k', 'x', 'y', 'f']}
              rows={its.map((p, j) => [j, p.x, p.y, f(p.x, p.y)])}
              rowIds={its.map((p, j) => 'r' + j)}
              tags={{ ['r' + step.k]: 'active' }}
            />
          </Column>
        </Row>
      )}
    />
  );
}
```

Use the sliders to change $\eta$ and the number of steps. The path converges only when $0 < \eta < 1/3$, and the slider stops at 0.33. Above $1/3$, the factor $1 - 6\eta$ is below $-1$, so $y$ grows each step and the path leaves the surface. At $\eta = 1/6$, $y$ reaches 0 in one step.

Not checked: I did not render the figure, so the layout and the shift that places the path inside the Diagram are verified by reading only. Risk: if the host does not place the Diagram origin at its lower left corner, the surface and path will sit offset from each other.