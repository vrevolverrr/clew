A typical mild steel curve rises linearly at first, shows a yield plateau, then rises to its maximum stress before falling as necking begins. The sketch is schematic, not to scale.

```figure
export default function () {
  return (
    <Plot id="curve" x={[0, 0.35]} y={[0, 600]} xLabel="Strain (%)" yLabel="Stress (MPa)">
      <Shape id="steel-curve" pts={[
        [0, 0], [0.04, 180], [0.08, 360], [0.10, 420],
        [0.105, 455], [0.115, 400], [0.16, 400], [0.24, 500],
        [0.29, 570], [0.32, 540], [0.34, 480]
      ]} />
      <Points id="key-points" pts={[
        [0.08, 360], [0.10, 420], [0.105, 455], [0.115, 400],
        [0.16, 400], [0.29, 570], [0.34, 480]
      ]} />
      <Label at={[0.08, 360]} text="Proportional limit" />
      <Label at={[0.10, 420]} text="Elastic limit" />
      <Label at={[0.105, 455]} text="Upper yield point" />
      <Label at={[0.14, 430]} text="Lower yield / plateau" />
      <Label at={[0.29, 570]} text="Ultimate tensile strength" />
      <Label at={[0.34, 480]} text="Fracture" />
      <Label at={[0.22, 465]} text="Strain hardening" />
      <Label at={[0.32, 520]} text="Necking" />
    </Plot>
  );
}
```

