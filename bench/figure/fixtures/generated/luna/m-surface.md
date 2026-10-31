```figure
const mesh = surface((x, y) => Math.sin(x) * Math.cos(y), [-Math.PI, Math.PI], [-Math.PI, Math.PI], {
  n: 18,
  azimuth: 35,
  elevation: 28
});
const origin = project([0, 0, 0]);
const xEnd = project([Math.PI, 0, 0]);
const yEnd = project([0, Math.PI, 0]);
const zEnd = project([0, 0, 1.2]);

export default function () {
  return (
    <Diagram id="surface" width={8} height={6}>
      {mesh.map((pts, i) => <Shape id={`mesh${i}`} pts={pts} />)}
      <Vector from={origin} to={xEnd} label="x" />
      <Vector from={origin} to={yEnd} label="y" />
      <Vector from={origin} to={zEnd} label="z" />
    </Diagram>
  );
}
```

