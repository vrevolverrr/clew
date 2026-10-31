Using positive shear upward, the two stress points are $(80,30)$ and $(-20,-30)$ MPa. Their midpoint is the circle’s center, and the radius is the distance from that center to either point:

$$
C=\left(\frac{\sigma_x+\sigma_y}{2},0\right)=(30,0)\text{ MPa}
$$

$$
R=\sqrt{\left(\frac{\sigma_x-\sigma_y}{2}\right)^2+\tau_{xy}^2}
=\sqrt{50^2+30^2}\approx58.31\text{ MPa}
$$

```figure
const c = 30;
const r = Math.sqrt(50 * 50 + 30 * 30);

export default function () {
  return (
    <Plot id="mohr" x={[-40, 100]} y={[-70, 70]} xLabel="Normal stress, σ (MPa)" yLabel="Shear stress, τ (MPa)">
      <Fn id="upper" f={x => Math.sqrt(Math.max(0, r * r - (x - c) * (x - c)))} from={c - r} to={c + r} label="Mohr's circle" />
      <Fn id="lower" f={x => -Math.sqrt(Math.max(0, r * r - (x - c) * (x - c)))} from={c - r} to={c + r} />
      <Points id="xface" pts={[[80, 30]]} label="x-face (80, 30)" />
      <Points id="yface" pts={[[-20, -30]]} label="y-face (−20, −30)" />
      <Points id="center" pts={[[30, 0]]} label="center (30, 0)" />
      <Points id="principal" pts={[[c + r, 0], [c - r, 0]]} label="principal stresses" />
    </Plot>
  );
}
```

The principal stresses are approximately $88.31$ MPa and $-28.31$ MPa.

