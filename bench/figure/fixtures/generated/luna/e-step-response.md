A second-order system’s **step response** shows how its output changes after a sudden constant input. The damping ratio $\zeta$ controls whether the response oscillates, and how quickly it settles. For the standard system

$$
G(s)=\frac{\omega_n^2}{s^2+2\zeta\omega_n s+\omega_n^2}
$$

$\omega_n$ is the natural frequency. For $0 \le \zeta < 1$, its response to a unit step is

$$
y(t)=1-e^{-\zeta\omega_n t}
\left[
\cos(\omega_d t)+
\frac{\zeta}{\sqrt{1-\zeta^2}}\sin(\omega_d t)
\right],
\qquad
\omega_d=\omega_n\sqrt{1-\zeta^2}
$$

For example, with $\zeta=0.5$ and $\omega_n=1$, the response overshoots its final value by about $16.3\%$, then oscillations fade. Use the slider to see how the response changes; the plot uses $\omega_n=1$.

```figure
export const params = {
  zeta: { label: 'Damping ratio ζ', min: 0, max: 2, step: 0.05, value: 0.5 }
};

export default function ({ zeta }) {
  const response = t => {
    if (zeta < 1) {
      const wd = Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * t) *
        (Math.cos(wd * t) + zeta / wd * Math.sin(wd * t));
    }
    if (zeta === 1) return 1 - Math.exp(-t) * (1 + t);

    const root = Math.sqrt(zeta * zeta - 1);
    const r1 = -zeta + root;
    const r2 = -zeta - root;
    return 1 + (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r1 - r2);
  };

  const regime = zeta < 1 ? 'Underdamped' : zeta === 1 ? 'Critically damped' : 'Overdamped';
  const overshoot = zeta < 1
    ? `${(100 * Math.exp(-Math.PI * zeta / Math.sqrt(1 - zeta * zeta))).toFixed(1)}%`
    : '0%';

  return (
    <Column gap="md">
      <Plot id="response" x={[0, 16]} y={[-0.15, 2.2]} xLabel="Time (1/ωₙ)" yLabel="Output">
        <Fn id="step-response" f={response} from={0} to={16} label="Unit-step response" />
      </Plot>
      <Row gap="md">
        <Node id="regime" label={regime} sub="Response type" />
        <Node id="overshoot" label={overshoot} sub="Peak overshoot" />
      </Row>
    </Column>
  );
}
```

