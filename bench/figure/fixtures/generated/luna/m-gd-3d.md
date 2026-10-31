I’ll show the update rule, work the first step numerically, and build a slider-controlled figure that reveals each iterate on the surface.

Gradient descent repeatedly moves downhill by subtracting the gradient, which points uphill. For this surface, the gradient is $(2x,6y)$, so the update is:

$$
(x_{k+1},y_{k+1})=(x_k,y_k)-\eta(2x_k,6y_k)
$$

Here, $(x_k,y_k)$ is the current point and $\eta$ is the learning rate. Starting at $(2.5,1.5)$ with $\eta=0.1$, the gradient is $(5,9)$, so the next point is $(2,0.6)$. Its height drops from $13$ to $5.08$.

Use the slider to change the learning rate and the figure controls to step through the iterates. Each point is plotted at height $z=x^2+3y^2$.

```figure
export const params = {
  eta: { label: 'Learning rate', min: 0.02, max: 0.32, step: 0.01, value: 0.1 }
};

export default function ({ eta }) {
  const view = { azimuth: 30, elevation: 25, zScale: 0.17 };
  const positions = [{ x: 2.5, y: 1.5 }];
  for (let i = 0; i < 10; i++) {
    const p = positions[i];
    positions.push({
      x: p.x - eta * 2 * p.x,
      y: p.y - eta * 6 * p.y
    });
  }

  const steps = positions.map((p, i) => ({
    i,
    path: positions.slice(0, i + 1).map(q =>
      project([q.x, q.y, q.x * q.x + 3 * q.y * q.y], view)
    ),
    point: project([p.x, p.y, p.x * p.x + 3 * p.y * p.y], view),
    text: i === 0
      ? `Start at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}).`
      : `Step ${i}: the iterate is (${p.x.toFixed(3)}, ${p.y.toFixed(3)}), at height ${(p.x * p.x + 3 * p.y * p.y).toFixed(3)}.`
  }));

  const mesh = surface(
    (x, y) => x * x + 3 * y * y,
    [-3, 3],
    [-3, 3],
    { n: 12, ...view }
  );

  return (
    <Figure
      title="Gradient descent on z = x² + 3y²"
      steps={steps}
      caption={step => step.text}
      render={step => (
        <Diagram id="surface" width={12} height={9}>
          {mesh.map((pts, i) => <Shape id={`mesh${i}`} pts={pts} tag="dim" />)}
          <Vector from={project([0, 0, 0], view)} to={project([3, 0, 0], view)} label="x" />
          <Vector from={project([0, 0, 0], view)} to={project([0, 3, 0], view)} label="y" />
          <Vector from={project([0, 0, 0], view)} to={project([0, 0, 30], view)} label="z" />
          <Shape id="path" pts={step.path} tag="active" />
          <Circle id="current" at={step.point} r={0.12} tag="active" />
        </Diagram>
      )}
    />
  );
}
```

