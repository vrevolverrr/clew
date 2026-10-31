Assume the mass starts at its furthest point, so its initial velocity is zero. Over one period, its position and velocity follow cosine and negative sine curves. The spring’s potential energy is greatest at the ends of the motion; kinetic energy is greatest as the mass passes equilibrium.

For an ideal spring with amplitude $A$, mass $m$, spring constant $k$, and angular frequency $\omega=\sqrt{k/m}$:

$$
x(t)=A\cos(\omega t)
$$

$$
v(t)=-\omega A\sin(\omega t)
$$

$$
U(t)=\frac12 kx(t)^2,\qquad K(t)=\frac12 mv(t)^2
$$

The period is $T=2\pi/\omega$. In the figure, position and velocity are scaled by their maximum magnitudes, and energy by the constant total energy $E=\frac12 kA^2$.

```figure
export default function () {
  return (
    <Plot id="motion" x={[0, 2 * Math.PI]} y={[-1.1, 1.1]}
      xLabel="Phase $\\omega t$" yLabel="Normalized value">
      <Fn id="position" f={q => Math.cos(q)} from={0} to={2 * Math.PI} label="$x/A$" />
      <Fn id="velocity" f={q => -Math.sin(q)} from={0} to={2 * Math.PI} label="$v/(\\omega A)$" />
      <Fn id="potential" f={q => Math.cos(q) ** 2} from={0} to={2 * Math.PI} label="$U/E$" />
      <Fn id="kinetic" f={q => Math.sin(q) ** 2} from={0} to={2 * Math.PI} label="$K/E$" />
    </Plot>
  );
}
```

