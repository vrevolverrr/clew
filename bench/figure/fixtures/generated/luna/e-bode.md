A first-order low-pass filter passes low frequencies and attenuates high ones. Its Bode plot shows gain in decibels and phase shift against logarithmic frequency. At the cutoff frequency $f_c$, the gain is about $-3$ dB and the phase shift is $-45^\circ$.

For a filter with unity gain at low frequencies, the magnitude and phase are:

$$
|H(f)|_{\mathrm{dB}}=-10\log_{10}\left(1+\left(\frac{f}{f_c}\right)^2\right)
$$

$$
\phi(f)=-\arctan\left(\frac{f}{f_c}\right)
$$

For example, when $f=f_c=100$ Hz, the magnitude is $-10\log_{10}(2)\approx-3.01$ dB and the phase is $-\arctan(1)=-45^\circ$. Change the cutoff frequency in the figure to see both curves shift.

```figure
export const params = {
  fc: { label: 'Cutoff frequency', min: 10, max: 10000, step: 10, value: 100, unit: 'Hz' }
};

export default function ({ fc }) {
  const center = Math.log10(fc);
  const cutoffDb = -10 * Math.log10(2);
  const phase = x => -Math.atan(Math.pow(10, x) / fc) * 180 / Math.PI;

  return (
    <Column gap="md">
      <Plot id="magnitude" x={[center - 2, center + 2]} y={[-40, 5]}
        xLabel="log₁₀ frequency (Hz)" yLabel="Magnitude (dB)">
        <Fn id="gain" f={x => -10 * Math.log10(1 + Math.pow(Math.pow(10, x) / fc, 2))}
          from={center - 2} to={center + 2} label="Magnitude" />
        <Points id="gain-cutoff" pts={[[center, cutoffDb]]} label="fc" />
      </Plot>
      <Plot id="phase-plot" x={[center - 2, center + 2]} y={[-100, 10]}
        xLabel="log₁₀ frequency (Hz)" yLabel="Phase (degrees)">
        <Fn id="phase-curve" f={phase} from={center - 2} to={center + 2} label="Phase" />
        <Points id="phase-cutoff" pts={[[center, -45]]} label="fc" />
      </Plot>
    </Column>
  );
}
```

