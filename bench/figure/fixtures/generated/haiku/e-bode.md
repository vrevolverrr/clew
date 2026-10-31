A low-pass filter passes slow changes and reduces fast ones. A Bode plot shows this by plotting gain and phase shift against frequency. Frequency uses a log scale so a wide range fits on one axis. The cutoff $f_c$ is the frequency where the gain drops to $-3$ dB, half the power.

A first-order low-pass filter has this transfer function, the ratio of output to input at angular frequency $\omega$, with $\omega_c = 2\pi f_c$:

$$H(j\omega)=\frac{1}{1+j\omega/\omega_c}$$

The gain and phase follow from $H$, with $f$ in Hz:

$$|H|_{\text{dB}}=-10\log_{10}\!\left(1+\left(\frac{f}{f_c}\right)^2\right)$$

$$\angle H=-\arctan\!\left(\frac{f}{f_c}\right)$$

**Example:** take $f_c = 100$ Hz and test $f = 1000$ Hz, one decade above the cutoff:

$$|H|_{\text{dB}}=-10\log_{10}(101)\approx-20.0\ \text{dB}$$

$$\angle H=-\arctan(10)\approx-84.3^\circ$$

Drag the slider to change $f_c$. The curves move with it.

```figure
export const params = { fc: { label: 'Cutoff frequency', min: 10, max: 1000, step: 10, value: 100, unit: 'Hz' } };

export default function ({ fc }) {
  const lc = Math.log10(fc);   // cutoff on the log axis
  const mag = x => -10 * Math.log10(1 + Math.pow(10, 2 * (x - lc)));
  const phase = x => -Math.atan(Math.pow(10, x - lc)) * 180 / Math.PI;
  return (
    <Column gap="md">
      <Panel title="Magnitude">
        <Plot id="mag" x={[-1, 4]} y={[-60, 5]} xLabel="$\log_{10} f$ (Hz)" yLabel="$|H|$ (dB)">
          <Fn id="mag-curve" f={mag} from={-1} to={4} label="$|H|$" />
          <Shape id="asym" pts={[[-1, 0], [lc, 0], [4, -20 * (4 - lc)]]} label="asymptote" />
          <Segment id="cut" from={[lc, -60]} to={[lc, 5]} label="$f_c$" />
          <Points pts={[[lc, -3]]} label="$-3$ dB" />
        </Plot>
      </Panel>
      <Panel title="Phase">
        <Plot id="phase" x={[-1, 4]} y={[-100, 5]} xLabel="$\log_{10} f$ (Hz)" yLabel="$\angle H$ (°)">
          <Fn id="phase-curve" f={phase} from={-1} to={4} label="$\angle H$" />
          <Segment from={[lc, -100]} to={[lc, 5]} />
          <Points pts={[[lc, -45]]} label="$-45°$" />
        </Plot>
      </Panel>
    </Column>
  );
}
```

At $f_c$ the gain is $-3$ dB and the phase is $-45^\circ$. Above $f_c$ the gain falls 20 dB per decade. The solid curve is exact; the dashed-style asymptote line is the straight-line approximation.

The model ignores source and load loading and stray component effects, so a real filter differs at high frequency.

Not checked: the figure only draws in the host app, so I did not see the rendered plot. The asymptote is a plain line, not dashed.