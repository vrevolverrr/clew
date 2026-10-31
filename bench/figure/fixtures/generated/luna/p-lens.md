Adjust the object distance to see how the real image’s position and size change.

```figure
export const params = {
  d: { label: 'Object distance', min: 12, max: 30, step: 1, value: 20, unit: 'cm' }
};

export default function ({ d }) {
  const f = 10;
  const h = 2.5;
  const axisY = 20;
  const lensX = 35;
  const objectX = lensX - d;
  const imageDistance = f * d / (d - f);
  const imageX = lensX + imageDistance;
  const imageY = axisY - h * f / (d - f);

  return (
    <Diagram id="lens" width={105} height={40}>
      <Segment id="axis" from={[3, axisY]} to={[102, axisY]} />
      <Segment id="lens-line" from={[lensX, 14]} to={[lensX, 26]} />
      <Label at={[lensX, 27]} text="Converging lens" />

      <Circle id="focus-left" at={[lensX - f, axisY]} r={0.35} label="F" />
      <Circle id="focus-right" at={[lensX + f, axisY]} r={0.35} label="F" />

      <Vector from={[objectX, axisY]} to={[objectX, axisY + h]} label="Object" />
      <Shape id="parallel-ray" pts={[[objectX, axisY + h], [lensX, axisY + h]]} />
      <Shape id="refracted-ray" pts={[[lensX, axisY + h], [imageX, imageY]]} />
      <Shape id="central-ray" pts={[[objectX, axisY + h], [lensX, axisY], [imageX, imageY]]} />
      <Vector from={[imageX, axisY]} to={[imageX, imageY]} label="Image" />
    </Diagram>
  );
}
```

