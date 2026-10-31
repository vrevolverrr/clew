A second-order system has two storage elements, such as a mass and a spring, or an inductor and a capacitor. When its input jumps, the output rises to a new value and may overshoot and ring first. The **damping ratio** $\zeta$ sets how fast that ringing dies out.

For the underdamped case ($0 \le \zeta < 1$), the unit step response is:

$$y(t) = 1 - e^{-\zeta\omega_n t}\left(\cos \omega_d t + \frac{\zeta}{\sqrt{1-\zeta^2}}\sin \omega_d t\right)$$

$$\omega_d = \omega_n\sqrt{1-\zeta^2}$$

Here $y(t)$ is the output as a fraction of its final value, $\omega_n$ is the natural frequency, and $\omega_d$ is the damped frequency. The figure plots time as $\omega_n t$, so you do not need to choose $\omega_n$.

**Example:** for $\zeta = 0.3$, $\omega_d/\omega_n = \sqrt{1-0.09} \approx 0.954$. The overshoot is

$$M_p = e^{-\zeta\pi/\sqrt{1-\zeta^2}} = e^{-0.988} \approx 0.372$$

So the output peaks at 1.37, which is 37% above its final value, at $\omega_n t = \pi/0.954 \approx 3.29$.

The damping ratio sorts the response into four regimes:

- $\zeta = 0$: undamped, the output rings forever.
- $0 < \zeta < 1$: underdamped, the output overshoots, then settles.
- $\zeta = 1$: critically damped, the fastest rise with no overshoot.
- $\zeta > 1$: overdamped, no overshoot, but slow.

This is the ideal model. Real systems add delays and extra poles that this curve does not show.

```figure
export const params = { zeta: { label: 'Damping ratio $\\zeta$', min: 0, max: 2, step: 0.05, value: 0.3 } };

export default function ({ zeta }) {
  const z = zeta;
  const critical = Math.abs(z - 1) < 1e-9;
  const regime = critical ? 'critically damped' : z < 1 ? (z === 0 ? 'undamped' : 'underdamped') : 'overdamped';
  let y;
  if (critical) {
    y = t => 1 - Math.exp(-t) * (1 + t);
  } else if (z < 1) {
    const wd = Math.sqrt(1 - z * z);
    y = t => 1 - Math.exp(-z * t) * (Math.cos(wd * t) + (z / wd) * Math.sin(wd * t));
  } else {
    const r = Math.sqrt(z * z - 1);
    const s1 = -z + r;
    const s2 = -z - r;
    y = t => 1 + (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s1 - s2);
  }
  const mp = z < 1 ? Math.exp(-z * Math.PI / Math.sqrt(1 - z * z)) : 0;

  return (
    <Panel title="Unit step response of a second-order system">
      <Column gap="md">
        <Plot id="plot" x={[0, 10]} y={[-0.2, 2]} xLabel="$\omega_n t$" yLabel="$y(t)$">
          <Fn id="resp" f={y} from={0} to={10} label="response" />
          <Fn id="final" f={() => 1} from={0} to={10} label="final value" />
        </Plot>
        <Row gap="md">
          <Node id="mp" label={`${(mp * 100).toFixed(1)}%`} sub="overshoot" />
          <Node id="regime" label={regime} sub="regime" />
        </Row>
      </Column>
    </Panel>
  );
}
```

Move the $\zeta$ slider to compare the regimes. Overshoot and regime update with the curve.

Skipped: the figure does not model delays or extra poles. Not checked: the figure has not been run in the app.