A has one outlier (40). B and C have none. A's median is higher than B's, and C sits highest overall.

```figure
const groups = [
  { name: 'A', x: 1, min: 12, q1: 16, med: 19, q3: 23.5, max: 25, out: [40] },
  { name: 'B', x: 2, min: 8, q1: 10.5, med: 14.5, q3: 15.5, max: 18, out: [] },
  { name: 'C', x: 3, min: 20, q1: 22, med: 25, q3: 28, max: 31, out: [] },
];
const w = 0.3;

export default function () {
  const layers = groups.flatMap(g => [
    <Shape id={`box-${g.name}`} pts={[[g.x - w, g.q1], [g.x + w, g.q1], [g.x + w, g.q3], [g.x - w, g.q3]]} closed />,
    <Segment id={`med-${g.name}`} from={[g.x - w, g.med]} to={[g.x + w, g.med]} />,
    <Segment id={`lo-${g.name}`} from={[g.x, g.min]} to={[g.x, g.q1]} />,
    <Segment id={`hi-${g.name}`} from={[g.x, g.q3]} to={[g.x, g.max]} />,
    <Segment id={`mincap-${g.name}`} from={[g.x - w / 2, g.min]} to={[g.x + w / 2, g.min]} />,
    <Segment id={`maxcap-${g.name}`} from={[g.x - w / 2, g.max]} to={[g.x + w / 2, g.max]} />,
    <Label at={[g.x, 2]} text={g.name} />,
    ...g.out.map(v => <Points id={`out-${g.name}-${v}`} pts={[[g.x, v]]} />),
  ]);
  return <Plot id="box" x={[0.4, 3.6]} y={[0, 45]} xLabel="Group" yLabel="Value">{layers}</Plot>;
}
```

| Group | Min | Q1 | Median | Q3 | Max | Outliers |
|---|---|---|---|---|---|---|
| A | 12 | 16 | 19 | 23.5 | 25 | 40 |
| B | 8 | 10.5 | 14.5 | 15.5 | 18 | none |
| C | 20 | 22 | 25 | 28 | 31 | none |

Method: quartiles are medians of the lower and upper halves. Whiskers reach the furthest value inside 1.5 × IQR. A's upper fence is 23.5 + 11.25 = 34.75, so 40 is an outlier.