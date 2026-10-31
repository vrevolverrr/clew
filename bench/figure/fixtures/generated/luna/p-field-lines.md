Electric field lines leave the positive charge and end at the equal-sized negative charge. The arrows show the field’s direction.

```figure
export default function () {
  const arcs = [-2.7, -1.9, -1.1, 0, 1.1, 1.9, 2.7];
  const point = (t, bulge) => [2 + 8 * t, 4 + bulge * Math.sin(Math.PI * t)];
  return (
    <Diagram id="dipole" width={12} height={8}>
      {arcs.map((bulge, i) => {
        const pts = Array.from({ length: 61 }, (_, j) => point(j / 60, bulge));
        const from = point(0.57, bulge);
        const to = point(0.64, bulge);
        return (
          <>
            <Shape id={`line-${i}`} pts={pts} />
            <Vector from={from} to={to} label={i === 3 ? "E" : undefined} />
          </>
        );
      })}
      <Circle id="positive" at={[2, 4]} r={0.34} label="+q" />
      <Circle id="negative" at={[10, 4]} r={0.34} label="−q" />
    </Diagram>
  );
}
```

