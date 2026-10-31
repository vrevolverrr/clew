export default function () {
  const shapes = Array.from({ length: 150 }, (_, k) => <Shape id={'s' + k} pts={Array.from({ length: 256 }, (_, i) => { const t = i / 255 * 6 * Math.PI; const r = 0.2 + 0.8 * k / 150; return [r * Math.cos(t + k), r * Math.sin(t + k), (i / 255) * 0.8 + 0.1]; })} tag={k % 2 ? 'dim' : undefined} />);
  const clouds = Array.from({ length: 20 }, (_, k) => <Points id={'c' + k} pts={Array.from({ length: 2000 }, (_, i) => [Math.sin(i * 1.3 + k) * 0.9, Math.cos(i * 0.7 + k) * 0.9, ((i * 37 + k * 11) % 100) / 100])} />);
  return (
    <Plot id="p" x={[-1, 1]} y={[-1, 1]} z={[0, 1]}>
      <Fn id="floor" f={(x, y) => 0.05 * (x + y) + 0.1} />
      {shapes}
      {clouds}
    </Plot>
  );
}
