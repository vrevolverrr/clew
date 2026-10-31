Drag the **Object distance** slider to move the object. The lens has $f = 10$ cm.

```figure
export const params = {
  u: { label: 'Object distance', min: 12, max: 40, step: 1, value: 15, unit: 'cm' }
};

export default function ({ u }) {
  const f = 10;                       // focal length, cm
  const h = 5;                        // object height, cm
  const v = f * u / (u - f);          // image distance, from 1/f = 1/u + 1/v
  const hi = -h * v / u;              // image height, negative means inverted
  const I = [v, hi];
  const X = 65;                       // where the dim extensions stop
  const top = [-u, h];
  const O = [0, 0];

  return (
    <Column gap="md">
      <Plot x={[-45, 65]} y={[-30, 25]} xLabel="distance from lens (cm)" yLabel="height (cm)">
        <Segment from={[-45, 0]} to={[65, 0]} />
        <Segment from={[0, -20]} to={[0, 20]} />
        <Shape pts={[[-1, 19], [0, 20], [1, 19]]} />
        <Shape pts={[[-1, -19], [0, -20], [1, -19]]} />
        <Label at={[-10, -2]} text="$F$" />
        <Label at={[10, -2]} text="$F'$" />
        <Label at={[-20, -2]} text="$2F$" />
        <Label at={[20, -2]} text="$2F'$" />
        <Vector from={[-u, 0]} to={top} label="object" />
        <Vector from={[v, 0]} to={I} label="image" />
        <Segment from={top} to={[0, h]} />
        <Segment from={[0, h]} to={I} />
        <Segment from={I} to={along([0, h], I, X / v)} tag="dim" />
        <Segment from={top} to={O} />
        <Segment from={O} to={I} />
        <Segment from={I} to={along(O, I, X / v)} tag="dim" />
        <Segment from={top} to={[0, hi]} />
        <Segment from={[0, hi]} to={I} />
        <Segment from={I} to={[X, hi]} tag="dim" />
      </Plot>
      <Row gap="md">
        <Node label={`${v.toFixed(1)} cm`} sub="image distance v" />
        <Node label={`${(-v / u).toFixed(2)}×`} sub="magnification" />
      </Row>
    </Column>
  );
}
```

The three rays from the object tip:
- **Parallel to the axis:** bends through $F'$ on the far side.
- **Through the lens centre:** goes straight on.
- **Through $F$ on the near side:** leaves the lens parallel to the axis.

The rays meet at the image. Dim lines are extensions past the image, not real light.

Skipped: $u < f$ (virtual image), so the slider starts at 12 cm. Not checked: I have not rendered the figure, so the scaling and label placement are unverified.