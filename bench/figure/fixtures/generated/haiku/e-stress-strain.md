```figure
const pts = [];
const seg = (e0, s0, e1, s1, n) => {
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([e0 + (e1 - e0) * t, s0 + (s1 - s0) * t]);
  }
};
seg(0, 0, 0.125, 250, 8);       // elastic, O to A
seg(0.125, 250, 0.15, 280, 4);  // rise to upper yield, B
seg(0.15, 280, 0.2, 250, 4);    // drop to lower yield, C
seg(0.2, 250, 2, 250, 8);       // yield plateau, C to D
for (let i = 1; i <= 24; i++) { // strain hardening, D to E
  const t = i / 24;
  pts.push([2 + 13 * t, 250 + 180 * (2 * t - t * t)]);
}
for (let i = 1; i <= 16; i++) { // necking, E to F
  const e = 15 + 10 * (i / 16);
  const u = (e - 15) / 10;
  pts.push([e, 430 - 60 * u * u]);
}

export default function () {
  return (
    <Row gap="lg" align="center">
      <Plot id="plot" x={[0, 30]} y={[0, 500]} xLabel="Strain $\varepsilon$ (%)" yLabel="Stress $\sigma$ (MPa)">
        <Shape id="curve" pts={pts} />
        <Points id="pA" pts={[[0.125, 250]]} label="A" />
        <Points id="pB" pts={[[0.15, 280]]} label="B" />
        <Points id="pC" pts={[[0.2, 250]]} label="C" />
        <Points id="pD" pts={[[2, 250]]} label="D" />
        <Points id="pE" pts={[[15, 430]]} label="E" />
        <Points id="pF" pts={[[25, 370]]} label="F" />
      </Plot>
      <Table
        id="keys"
        columns={['Point', 'Meaning', 'Strain $\\varepsilon$ (%)', 'Stress $\\sigma$ (MPa)']}
        rows={[
          ['O', 'Origin, unloaded', '0', '0'],
          ['A', 'Proportional (elastic) limit', '0.125', '250'],
          ['B', 'Upper yield point', '0.15', '280'],
          ['C', 'Lower yield point', '0.2', '250'],
          ['D', 'Start of strain hardening', '2', '250'],
          ['E', 'Ultimate tensile strength', '15', '430'],
          ['F', 'Fracture', '25', '370']
        ]}
        rowIds={['O', 'A', 'B', 'C', 'D', 'E', 'F']}
      />
    </Row>
  );
}
```

Between O and A the stress is proportional to strain, $\sigma = E\varepsilon$, with $E \approx 200$ GPa. The yield plateau from C to D is the defining feature of mild steel: stress holds near 250 MPa while strain grows. After D the metal hardens and stress rises to the peak at E. Past E the bar necks, and the engineering stress falls until fracture at F.

The strain axis runs to 30%, so the elastic part (under 0.2%) looks nearly vertical. Values are typical textbook numbers; real grades vary.

Not checked: measured data for a specific steel grade. Risk: none for this drawing, but do not use these values for design.