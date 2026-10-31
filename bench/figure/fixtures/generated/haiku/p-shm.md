A mass on a spring swings back and forth, and its position, velocity and energy repeat in a cycle. The time for one full cycle is the period $T$.

For an ideal spring (Hooke's law, no friction), the position is a cosine:

$$x(t) = A\cos(\omega t)$$

Here $x$ is the displacement from equilibrium (m), $A$ is the amplitude (m), and $t$ is time (s). The angular frequency $\omega$ (rad/s) and the period $T$ (s) depend only on the mass $m$ (kg) and the spring constant $k$ (N/m):

$$\omega = \sqrt{\frac{k}{m}}$$

$$T = \frac{2\pi}{\omega}$$

Velocity is $v = -A\omega\sin(\omega t)$. The energy has two forms, kinetic $KE = \tfrac{1}{2}mv^2$ and potential (stored in the spring) $PE = \tfrac{1}{2}kx^2$.

Worked example with $m = 0.5$ kg, $k = 20$ N/m, $A = 0.1$ m:

- $\omega = \sqrt{20/0.5} = 6.32$ rad/s
- $T = 2\pi/6.32 = 0.993$ s
- $v_{\max} = A\omega = 0.1 \times 6.32 = 0.632$ m/s
- Total energy $E = \tfrac{1}{2}kA^2 = \tfrac{1}{2}(20)(0.1)^2 = 0.1$ J

The figure steps through one period in quarter-period jumps. Position and velocity are a quarter period out of step: when $x$ is at its peak, $v$ is zero. KE and PE each peak twice per period, and their sum stays at $E$. The sliders change $m$, $k$ and $A$.

Friction shrinks the amplitude over time, and past the elastic limit a real spring no longer follows Hooke's law.

```figure
export const params = {
  m: { label: 'Mass (kg)', min: 0.1, max: 2, step: 0.1, value: 0.5 },
  k: { label: 'Spring constant (N/m)', min: 5, max: 50, step: 1, value: 20 },
  A: { label: 'Amplitude (m)', min: 0.05, max: 0.2, step: 0.01, value: 0.1 }
};

const fmt = n => Number(n.toFixed(3));

export default function ({ m, k, A }) {
  const w = Math.sqrt(k / m);                  // angular frequency (rad/s)
  const T = 2 * Math.PI / w;                   // period (s)
  const x = t => A * Math.cos(w * t);          // position (m)
  const v = t => -A * w * Math.sin(w * t);     // velocity (m/s)
  const ke = t => 0.5 * m * v(t) * v(t);       // kinetic energy (J)
  const pe = t => 0.5 * k * x(t) * x(t);       // potential energy (J)
  const E = 0.5 * k * A * A;                   // total energy (J)

  const names = ['Start at maximum extension', 'Pass equilibrium', 'Maximum compression', 'Pass equilibrium', 'One full period'];
  const steps = [0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
    const t = frac * T;
    return {
      t,
      name: names[i],
      text: `$x = ${fmt(x(t))}$ m, $v = ${fmt(v(t))}$ m/s, $KE = ${fmt(ke(t))}$ J, $PE = ${fmt(pe(t))}$ J.`
    };
  });

  return (
    <Figure steps={steps} heading={st => st.name} caption={st => st.text} render={st => (
      <Column gap="md">
        <Panel title="Position">
          <Plot id="pos" x={[0, T]} xLabel="t (s)" yLabel="x (m)">
            <Fn id="x-curve" f={x} from={0} to={T} label="x(t)" />
            <Points pts={[[st.t, x(st.t)]]} tag="active" />
          </Plot>
        </Panel>
        <Panel title="Velocity">
          <Plot id="vel" x={[0, T]} xLabel="t (s)" yLabel="v (m/s)">
            <Fn id="v-curve" f={v} from={0} to={T} label="v(t)" />
            <Points pts={[[st.t, v(st.t)]]} tag="active" />
          </Plot>
        </Panel>
        <Panel title="Energy (J)">
          <Plot id="energy" x={[0, T]} xLabel="t (s)" yLabel="E (J)">
            <Fn id="ke-curve" f={ke} from={0} to={T} label="KE" />
            <Fn id="pe-curve" f={pe} from={0} to={T} label="PE" />
            <Fn id="e-total" f={() => E} from={0} to={T} label="Total" />
            <Points pts={[[st.t, ke(st.t)]]} tag="active" />
            <Points pts={[[st.t, pe(st.t)]]} tag="active" />
          </Plot>
        </Panel>
      </Column>
    )} />
  );
}
```