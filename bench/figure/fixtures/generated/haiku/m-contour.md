Level curves of $f(x,y)=x^2-y^2$ are hyperbolas, with the two lines $y=\pm x$ at level 0. The arrows are gradients.

```figure
const curve = (c) => {
  // the level set x² − y² = c, clipped to the box [-3, 3]²
  const t = Math.sqrt(9 - Math.abs(c));
  const u = [];
  for (let i = 0; i <= 80; i++) u.push(-t + (2 * t * i) / 80);
  if (c > 0) return [u.map(v => [Math.sqrt(c + v * v), v]), u.map(v => [-Math.sqrt(c + v * v), v])];
  return [u.map(v => [v, Math.sqrt(v * v - c)]), u.map(v => [v, -Math.sqrt(v * v - c)])];
};

export default function () {
  const levels = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
  const probes = [[1, 0], [0, 1], [2, 1], [-1, 2]];
  const k = 0.2;   // arrow length per unit of gradient
  return (
    <Plot id="plot" x={[-3, 3]} y={[-3, 3]} xLabel="x" yLabel="y">
      {levels.flatMap(c => curve(c).map((pts, j) => (
        <Shape pts={pts} label={j === 0 ? `$x^2-y^2=${c}$` : undefined} />
      )))}
      {probes.map(([x, y]) => <Points pts={[[x, y]]} label={`(${x}, ${y})`} />)}
      {probes.map(([x, y]) => <Vector from={[x, y]} to={[x + k * 2 * x, y - k * 2 * y]} label={`$\\nabla f=(${2 * x},${-2 * y})$`} />)}
    </Plot>
  );
}
```

A level curve joins every point where $f$ has the same value $c$:

$$\{(x,y) : f(x,y) = c\}$$

The gradient collects the two partial derivatives. It points in the direction in which $f$ rises fastest, and it is perpendicular to the level curve through the point:

$$\nabla f = \left(\frac{\partial f}{\partial x},\ \frac{\partial f}{\partial y}\right) = (2x,\ -2y)$$

Take $(2,1)$. Here $f = 4 - 1 = 3$, so the point lies on the level curve $c = 3$. The gradient is $\nabla f = (4, -2)$. The curve's tangent there is $(1, 2)$, found from $4\,dx - 2\,dy = 0$. Their dot product is $4\cdot 1 + (-2)\cdot 2 = 0$, so the gradient is perpendicular to the curve.

At the origin $\nabla f = (0,0)$, so no direction rises. The level curves cross there, which makes it a saddle point.