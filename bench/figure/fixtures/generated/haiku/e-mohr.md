Centre $C = 30$ MPa, radius $R = 58.3$ MPa.

$$R=\sqrt{\left(\frac{\sigma_x-\sigma_y}{2}\right)^2+\tau_{xy}^2}=\sqrt{50^2+30^2}=58.3\ \text{MPa}$$

```figure
const sx = 80, sy = -20, t = 30;
const C = (sx + sy) / 2;
const R = Math.sqrt(((sx - sy) / 2) ** 2 + t ** 2);
const s1 = C + R, s2 = C - R;
const f = v => v.toFixed(1);

export default function () {
  return (
    <Plot id="mohr" x={[-40, 100]} y={[-70, 70]} xLabel="$\sigma$ (MPa)" yLabel="$\tau$ (MPa)">
      <Circle id="circle" at={[C, 0]} r={R} />
      <Segment id="xy" from={[sx, t]} to={[sy, -t]} />
      <Points id="X" pts={[[sx, t]]} label={`X (${sx}, ${t})`} />
      <Points id="Y" pts={[[sy, -t]]} label={`Y (${sy}, ${-t})`} />
      <Points id="C" pts={[[C, 0]]} label={`C (${C}, 0)`} />
      <Points id="A" pts={[[s1, 0]]} label={`$\\sigma_1 = ${f(s1)}$`} />
      <Points id="B" pts={[[s2, 0]]} label={`$\\sigma_2 = ${f(s2)}$`} />
      <Points id="M" pts={[[C, R]]} label={`$\\tau_{max} = ${f(R)}$`} />
    </Plot>
  );
}
```

- $\sigma_1 = C + R = 88.3$ MPa
- $\sigma_2 = C - R = -28.3$ MPa
- $\tau_{max} = R = 58.3$ MPa, on planes with normal stress $30$ MPa
- $\tan 2\theta_p = \dfrac{2\tau_{xy}}{\sigma_x-\sigma_y} = 0.6$, so $\theta_p = 15.5^\circ$ counterclockwise from the x-face to the $\sigma_1$ plane
- Max shear plane: $\theta_s = \theta_p - 45^\circ = 29.5^\circ$ clockwise from the x-face

X and Y are the ends of a diameter. On the circle, the arc from X clockwise to A ($\sigma_1$) is $2\theta_p \approx 31^\circ$.

Not checked: the plot uses τ up with X = (σx, τxy). Texts that plot τ down reverse the rotation direction on the circle. The stress values do not change.