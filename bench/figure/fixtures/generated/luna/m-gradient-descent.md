Gradient descent minimizes a function by repeatedly moving opposite the gradient, which points toward the steepest increase. For $f(x,y)=x^2+3y^2$, the gradient is $(2x,6y)$, so each step moves toward $(0,0)$.

$$
(x_{k+1},y_{k+1})=(x_k,y_k)-\eta(2x_k,6y_k)
$$

Here $\eta$ is the learning rate, which sets the step size. Starting at $(2.5,1.5)$ with $\eta=0.1$, the gradient is $(5,9)$, so the next point is $(2.5-0.5,\;1.5-0.9)=(2,0.6)$. Change the learning rate below to see how it affects the path. Near the upper end, the path zigzags because the $y$ coordinate overshoots zero.

```figure
export const params = {
  eta: { label: 'Learning rate', min: 0.01, max: 0.32, step: 0.01, value: 0.1 }
};

export default function ({ eta }) {
  const count = 12;
  const pts = [[2.5, 1.5]];
  for (let k = 0; k < count; k++) {
    const [x, y] = pts[k];
    pts.push([x - eta * 2 * x, y - eta * 6 * y]);
  }

  const levels = [4, 9, 16, 25];
  const contours = levels.map((level, j) => ({
    id: `contour${j}`,
    pts: Array.from({ length: 81 }, (_, i) => {
      const a = (2 * Math.PI * i) / 80;
      return [Math.sqrt(level) * Math.cos(a), Math.sqrt(level / 3) * Math.sin(a)];
    }),
    level
  }));

  const steps = Array.from({ length: count + 1 }, (_, i) => ({
    i,
    pts,
    contours,
    text: i === 0
      ? `Start at $(2.5,1.5)$. The gradient is $(5,9)$, so the first step moves down and left.`
      : `After ${i} update${i === 1 ? '' : 's'}: $(x,y)=(${pts[i][0].toFixed(3)},${pts[i][1].toFixed(3)})$.`
  }));

  return (
    <Figure steps={steps} caption={step => step.text} render={step => (
      <Plot id="descent" x={[-3, 3]} y={[-2, 2]} xLabel="x" yLabel="y">
        {step.contours.map(c => (
          <Shape id={c.id} pts={c.pts} closed label={`$f=${c.level}$`} />
        ))}
        <Shape id="path" pts={step.pts.slice(0, step.i + 1)} />
        {step.pts.map((p, j) => (
          <Circle
            id={`p${j}`}
            at={p}
            r={j === step.i ? 0.09 : 0.055}
            tag={j === step.i ? 'active' : j < step.i ? 'done' : 'dim'}
          />
        ))}
      </Plot>
    )} />
  );
}
```

For this function, learning rates between $0$ and $\frac{1}{3}$ converge to $(0,0)$. Rates near $\frac{1}{3}$ make the $y$ coordinate oscillate while shrinking.

