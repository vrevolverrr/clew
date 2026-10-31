export const params = {
  a: { label: 'Amplitude of the first component', min: 0, max: 5, step: 0.1, value: 1 },
  b: { label: 'Frequency', min: 1, max: 20, step: 1, value: 3, unit: 'Hz' },
  c: { label: 'Phase', min: -180, max: 180, step: 5, value: 0, unit: '°' },
  d: { label: 'Damping', min: 0, max: 2, step: 0.05, value: 0.2 },
  e: { label: 'Offset', min: -3, max: 3, step: 0.5, value: 0 },
  f: { label: 'Noise', min: 0, max: 1, step: 0.1, value: 0 },
  shape: { label: 'Waveform', options: ['sine', 'square', 'triangle', 'sawtooth'], value: 'sine' },
  name: { label: 'Series name', value: 'signal', text: true },
};

export default function ({ a, b, c, d, e, shape, name }) {
  const wave = x => {
    const t = b * x + c / 180 * Math.PI;
    const s = shape === 'sine' ? Math.sin(t) : shape === 'square' ? Math.sign(Math.sin(t)) : shape === 'triangle' ? 2 / Math.PI * Math.asin(Math.sin(t)) : 2 * ((t / (2 * Math.PI)) % 1) - 1;
    return a * Math.exp(-d * x) * s + e;
  };
  return (
    <Column>
      <Plot id="p" x={[0, 4]} y={[-8, 8]} xLabel="t (s)" yLabel={name}>
        <Fn id="w" f={wave} label={name} />
      </Plot>
      <Row>
        <Node id="amp" label={a.toFixed(1)} sub="amplitude" />
        <Node id="freq" label={b + ' Hz'} sub="frequency" />
        <Node id="off" label={String(e)} sub="offset" />
      </Row>
    </Column>
  );
}
