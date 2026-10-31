```figure
export const params = { angle: { label: 'Launch angle', min: 0, max: 90, step: 1, value: 45, unit: '°' } };

const v = 20;    // launch speed, m/s
const g = 9.8;   // gravity, m/s²

export default function ({ angle }) {
  const a = angle * Math.PI / 180;
  const vx = v * Math.cos(a);
  const vy = v * Math.sin(a);
  const T = 2 * vy / g;          // flight time
  const R = vx * T;              // range
  const H = vy * vy / (2 * g);   // maximum height
  const xH = vx * vy / g;        // horizontal position of the top
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const t = T * i / 60;
    pts.push([vx * t, vy * t - g * t * t / 2]);
  }
  const steps = [{ pts, T, R, H, xH }];
  return (
    <Figure
      title="Projectile launched at 20 m/s"
      steps={steps}
      caption={step => `Angle ${angle}°: range $R = ${step.R.toFixed(1)}$ m, maximum height $H = ${step.H.toFixed(1)}$ m, flight time $T = ${step.T.toFixed(2)}$ s.`}
      render={step => (
        <Plot id="axes" x={[0, 45]} y={[0, 22]} xLabel="x (m)" yLabel="y (m)">
          <Shape id="path" pts={step.pts} label="trajectory" />
          <Segment id="range" from={[0, 0]} to={[step.R, 0]} label={`R = ${step.R.toFixed(1)} m`} tag="match" />
          <Segment id="height" from={[step.xH, 0]} to={[step.xH, step.H]} label={`H = ${step.H.toFixed(1)} m`} tag="match" />
          <Points id="top" pts={[[step.xH, step.H]]} tag="match" />
        </Plot>
      )}
    />
  );
}
```

Drag the angle slider. The range (R) runs along the ground. The maximum height (H) is the vertical line to the top of the path.

Range and height, with no air drag, for launch speed $v$ and angle $\alpha$:

$$R = \frac{v^2 \sin 2\alpha}{g}$$

$$H = \frac{v^2 \sin^2 \alpha}{2g}$$

Here $g = 9.8$ m/s². At 45° the range peaks at about 40.8 m. At 90° the height peaks at about 20.4 m.

Skipped: air drag, and launch from a height above the ground. Not checked: the figure has not been rendered in the app.