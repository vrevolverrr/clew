Field lines show the direction a positive test charge would be pushed or pulled at each point. In the figure, they leave the positive charge and end on the negative charge.

The electric field is the force per unit charge on a small test charge $q_0$, measured in N/C: $\vec{E} = \vec{F}/q_0$. A **field line** is a curve whose tangent at every point matches $\vec{E}$ there. Lines never cross, and where they bunch together, the field is strong. For a point charge, the strength is

$$E = \frac{k\,|q|}{r^2}$$

Here $k \approx 8.99 \times 10^9\ \text{N·m}^2/\text{C}^2$ is Coulomb's constant, $|q|$ is the charge size in coulombs, and $r$ is the distance from the charge in metres.

The figure uses charges of equal size and opposite sign. Lines that miss the negative charge go off to infinity, and lines from far away end on it.

```figure
const charges = [
  { x: -1, y: 0 },   // positive charge
  { x: 1, y: 0 }     // negative charge, same size
];
const sign = [1, -1];  // +1 pushes outward, -1 pulls inward

function field(px, py) {
  let ex = 0, ey = 0;
  charges.forEach((c, i) => {
    const dx = px - c.x, dy = py - c.y;
    const r3 = Math.pow(dx * dx + dy * dy, 1.5);
    ex += sign[i] * dx / r3;
    ey += sign[i] * dy / r3;
  });
  return [ex, ey];
}

// Follow the field from (sx, sy); dir = -1 traces backwards.
// Returns the points and the index of the charge reached, or -1 if it leaves the box.
function trace(sx, sy, dir) {
  const pts = [[sx, sy]];
  let x = sx, y = sy, end = -1;
  for (let n = 0; n < 240 && end < 0; n++) {
    const [ex, ey] = field(x, y);
    const m = Math.hypot(ex, ey);
    x += dir * 0.06 * ex / m;
    y += dir * 0.06 * ey / m;
    pts.push([x, y]);
    charges.forEach((c, i) => { if (Math.hypot(x - c.x, y - c.y) < 0.15) end = i; });
    if (Math.abs(x) > 3.5 || Math.abs(y) > 3) break;
  }
  return { pts, end };
}

const N = 16;
const paths = [];
for (let i = 0; i < N; i++) {
  const a = (2 * Math.PI * i) / N;
  paths.push(trace(charges[0].x + 0.2 * Math.cos(a), charges[0].y + 0.2 * Math.sin(a), 1));
}
for (let i = 0; i < N; i++) {
  const a = (2 * Math.PI * i) / N;
  const t = trace(charges[1].x + 0.2 * Math.cos(a), charges[1].y + 0.2 * Math.sin(a), -1);
  if (t.end !== 0) paths.push(t);   // lines that reach the positive charge are already drawn
}

// One arrowhead per line, at its midpoint, pointing along the field
const arrows = paths.map(p => {
  const i = Math.floor(p.pts.length / 2);
  const [ax, ay] = p.pts[i], [bx, by] = p.pts[i + 1];
  const len = Math.hypot(bx - ax, by - ay);
  return [[ax, ay], [ax + 0.3 * (bx - ax) / len, ay + 0.3 * (by - ay) / len]];
});

export default function () {
  return (
    <Plot id="field" x={[-3.5, 3.5]} y={[-3, 3]} xLabel="x (m)" yLabel="y (m)">
      {paths.map((p, i) => <Shape id={`line-${i}`} pts={p.pts} />)}
      {arrows.map(a => <Vector from={a[0]} to={a[1]} />)}
      <Circle id="pos" at={[-1, 0]} r={0.13} />
      <Circle id="neg" at={[1, 0]} r={0.13} />
      <Label at={[-1, 0.4]} text="+q" />
      <Label at={[1, 0.4]} text="−q" />
    </Plot>
  );
}
```

**Worked example.** Put $q = 1\ \mu\text{C}$ on each charge, with the midpoint 1 m from each. Each charge alone gives

$$E = \frac{(8.99 \times 10^9)(1 \times 10^{-6})}{(1)^2} = 8.99 \times 10^3\ \text{N/C}$$

At the midpoint, both fields point from the positive charge toward the negative one. The total is $2 \times 8.99 \times 10^3 = 1.80 \times 10^4$ N/C. The lines cross the midpoint horizontally and sit close together there, which matches the strong field.

Field lines are a sketch. The number of lines you draw is a choice. Only their direction and spacing carry meaning.