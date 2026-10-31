A production possibilities frontier (PPF) shows every mix of two goods an economy can make when all its resources are in use. Points inside the curve leave resources idle. Points outside the curve cannot be reached yet.

**Opportunity cost** is what you give up to get one more unit of a good. On a PPF, it is the amount of cloth lost to make one more tonne of food. That amount is the slope of the curve.

Opportunity cost rises when the curve bows outward. Resources are not equally suited to both goods. The best land goes to food first. Each later tonne needs land that is worse at growing food, so it costs more cloth.

The frontier in this example is

$$C = 100 - \frac{F^2}{20}$$

Here $F$ is tonnes of food and $C$ is metres of cloth. Each step below moves 10 t of food along the curve:

```figure
export default function () {
  const f = F => 100 - (F * F) / 20;   // cloth (m) left after making F tonnes of food
  const pts = [0, 10, 20, 30, 40];
  const rows = pts.map((F, i) => [
    F,
    f(F),
    i < 4 ? f(F) - f(pts[i + 1]) : null,
    i < 4 ? (f(F) - f(pts[i + 1])) / 10 : null
  ]);
  const steps = [0, 1, 2, 3].map(i => ({
    i,
    a: pts[i],
    b: pts[i + 1],
    ca: f(pts[i]),
    cb: f(pts[i + 1]),
    per: (f(pts[i]) - f(pts[i + 1])) / 10
  }));
  return (
    <Figure
      steps={steps}
      heading={s => `Move ${s.i + 1}: ${s.a} to ${s.b} t`}
      caption={s => `Food rises from ${s.a} to ${s.b} t. Cloth falls from ${s.ca} m to ${s.cb} m, so each extra tonne costs ${s.per} m of cloth on average.`}
      render={s => (
        <Row gap="lg" align="center">
          <Plot id="ppf" x={[0, 50]} y={[0, 110]} xLabel="Food (t)" yLabel="Cloth (m)">
            <Fn id="curve" f={f} from={0} to={44.7} label="PPF" />
            <Segment from={[s.a, s.ca]} to={[s.b, s.cb]} label={`${s.ca - s.cb} m`} tag="new" />
            <Points pts={[[s.a, s.ca], [s.b, s.cb]]} />
          </Plot>
          <Table
            id="tbl"
            title="Frontier points"
            columns={['Food (t)', 'Cloth (m)', 'Cloth cost of next 10 t (m)', 'Cost per tonne (m)']}
            rows={rows}
            rowIds={pts.map((_, i) => `r${i}`)}
            tags={{ [`r${s.i}`]: 'active' }}
          />
        </Row>
      )}
    />
  );
}
```

The cost of each extra 10 t of food rises from 5 m to 15 m to 25 m to 35 m of cloth. Cost per tonne rises from 0.5 m to 3.5 m. That increase is what makes the curve bow outward.

The model assumes fixed resources and fixed technology. A new technology or more resources shifts the whole curve outward.