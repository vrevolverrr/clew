Drag the **Angle θ** slider (0° to 360°). The radius is 1, so the horizontal leg is cos θ and the vertical leg is sin θ. Their values appear in the cards below the plot.

```figure
export const params = { theta: { label: 'Angle θ', min: 0, max: 360, step: 1, value: 45, unit: '°' } };

const fmt = v => (Math.abs(v) < 0.0005 ? 0 : v).toFixed(3);

export default function ({ theta }) {
  const rad = theta * Math.PI / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const circle = [];
  for (let k = 0; k <= 120; k++) {
    const a = 2 * Math.PI * k / 120;
    circle.push([Math.cos(a), Math.sin(a)]);
  }
  const arc = [];
  for (let k = 0; k <= 40; k++) {
    const a = rad * k / 40;
    arc.push([0.25 * Math.cos(a), 0.25 * Math.sin(a)]);
  }
  return (
    <Column gap="md">
      <Plot id="plot" x={[-1.4, 1.4]} y={[-1.4, 1.4]} xLabel="x" yLabel="y">
        <Shape id="circle" pts={circle} closed />
        <Shape id="arc" pts={arc} />
        <Label at={[0.33 * Math.cos(rad / 2), 0.33 * Math.sin(rad / 2)]} text="θ" />
        <Segment id="radius" from={[0, 0]} to={[c, s]} label="r = 1" tag="active" />
        <Segment id="cos-len" from={[0, 0]} to={[c, 0]} label={`cos θ = ${fmt(c)}`} />
        <Segment id="sin-len" from={[c, 0]} to={[c, s]} label={`sin θ = ${fmt(s)}`} />
        <Points id="point" pts={[[c, s]]} label={`(${fmt(c)}, ${fmt(s)})`} />
      </Plot>
      <Row gap="md">
        <Node id="cos-card" label={fmt(c)} sub="cos θ" />
        <Node id="sin-card" label={fmt(s)} sub="sin θ" />
      </Row>
    </Column>
  );
}
```

Skipped: radian input, animation, and a second figure for the sign of each quadrant. Not checked: how the Plot labels sit at angles near the axes, since I could not render the figure here.