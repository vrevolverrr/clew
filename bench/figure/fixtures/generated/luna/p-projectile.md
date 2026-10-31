With no air resistance and level ground, a projectile follows a curved path under gravity. Change the launch angle to see how its range and maximum height change. The figure assumes a launch speed of 20 m/s and gravity of 9.8 m/s².

```figure
export const params = {
  angle: { label: 'Launch angle', min: 15, max: 75, step: 1, value: 45, unit: '°' }
};

export default function ({ angle }) {
  const v = 20;
  const g = 9.8;
  const rad = angle * Math.PI / 180;
  const range = v * v * Math.sin(2 * rad) / g;
  const apexX = range / 2;
  const height = v * v * Math.sin(rad) ** 2 / (2 * g);
  const path = x => x * Math.tan(rad) - g * x * x / (2 * v * v * Math.cos(rad) ** 2);

  return (
    <Plot id="trajectory" x={[0, 42]} y={[0, 20]} xLabel="Distance (m)" yLabel="Height (m)">
      <Fn id="path" f={path} from={0} to={range} label="Trajectory" />
      <Segment from={[0, 0]} to={[range, 0]} label={`Range: ${range.toFixed(1)} m`} />
      <Segment from={[apexX, 0]} to={[apexX, height]} label={`Maximum height: ${height.toFixed(1)} m`} />
      <Points pts={[[0, 0], [range, 0], [apexX, height]]} />
    </Plot>
  );
}
```

