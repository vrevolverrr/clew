The **shear force diagram** shows how internal shear changes along the beam; the **bending moment diagram** shows the beam’s internal bending moment. For a simply supported 6 m beam with a 12 kN point load, moving the load changes the support reactions and both diagrams.

Let $a$ be the load’s distance from the left support. The reactions are:

$$R_A = 12\frac{6-a}{6}, \qquad R_B = 12\frac{a}{6}$$

Using positive shear upward on the left face, the shear is $R_A$ before the load and drops by 12 kN at the load. The bending moment is zero at both supports and reaches its maximum directly under the load:

$$M_{\max} = R_A a = R_B(6-a)$$

For example, with the load at $a=3$ m, each support reaction is 6 kN. Shear is +6 kN to the load, then −6 kN after it; the maximum moment is $6 \times 3 = 18$ kN·m.

Move the slider to see the diagrams and reactions update.

```figure
export const params = {
  a: { label: 'Load position from left support', min: 0, max: 6, step: 0.1, value: 3, unit: 'm' }
};

export default function ({ a }) {
  const L = 6;
  const P = 12;
  const RA = P * (L - a) / L;
  const RB = P * a / L;
  const Mmax = RA * a;

  return (
    <Column gap="md">
      <Row gap="md" align="start">
        <Plot id="shear" x={[0, L]} y={[-P, P]} xLabel="Distance along beam (m)" yLabel="Shear V (kN)">
          <Shape id="shear-line" pts={[[0, RA], [a, RA], [a, RA - P], [L, RA - P]]} label="Shear force" />
        </Plot>
        <Plot id="moment" x={[0, L]} y={[0, 18]} xLabel="Distance along beam (m)" yLabel="Moment M (kN·m)">
          <Shape id="moment-line" pts={[[0, 0], [a, Mmax], [L, 0]]} label="Bending moment" />
          <Circle id="moment-peak" at={[a, Mmax]} r={0.08} label="Maximum moment" />
        </Plot>
      </Row>
      <Row gap="md" align="center">
        <Node id="left-reaction" label={`${RA} kN`} sub="Left reaction, R_A" />
        <Node id="right-reaction" label={`${RB} kN`} sub="Right reaction, R_B" />
        <Node id="peak-moment" label={`${Mmax} kN·m`} sub="Maximum moment under load" />
      </Row>
    </Column>
  );
}
```

